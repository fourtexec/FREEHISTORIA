import {serveSite} from './site.js';
import { biography } from '../shared/person.js';
import { providerRelay } from './relay.js';
import { historyService } from './history.js';
import { roomService } from './rooms.js';
import http from 'node:http';
import {isIP} from 'node:net';
import { interpretOrder, providerOrder } from './advisor.js';
import {accountService} from './accounts.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { newGame, playTurn } from '../shared/game.js';

const catalog = JSON.parse(readFileSync(new URL('../shared/catalog.json', import.meta.url)));
const folder = resolve(process.env.DATA_DIR || 'data');
mkdirSync(folder, { recursive: true });
const db = new DatabaseSync(resolve(folder, 'campaigns.sqlite'));
db.exec(`PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY, owner TEXT NOT NULL, state TEXT NOT NULL, turn INTEGER NOT NULL, updated INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS campaigns_owner ON campaigns(owner, updated);`);
const history = historyService(db,catalog);
const accounts=accountService(db,folder);
const rooms = roomService(db, catalog, accounts);
const port = Number(process.env.API_PORT || 8787);
const origins = (process.env.ALLOWED_ORIGINS ?? 'https://fourtexec.site,http://localhost:5173,http://127.0.0.1:5173').split(',').map(s => s.trim());
const fail = (status, message) => Object.assign(new Error(message), { status });
const uuid = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

async function jsonBody(req,limit=8192) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw fail(415, 'Нужен формат application/json.');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw fail(413, 'Запрос слишком велик.');
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw Error();
    return body;
  } catch { throw fail(400, 'Некорректный JSON.'); }
}

const server = http.createServer(async (req, res) => {
  const send = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data === undefined ? undefined : JSON.stringify(data));
  };
  try {
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');
    if (origin) {
      const sameSite=process.env.FREEHISTORIA_WEB==='1' && ['http://','https://'].some(scheme=>origin===scheme+req.headers.host);
      if (!sameSite && !origins.includes(origin)) throw fail(403, 'Адрес панели отсутствует в ALLOWED_ORIGINS.');
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      return send(204);
    }
    const path = new URL(req.url, 'http://localhost').pathname;
    if(process.env.FREEHISTORIA_WEB==='1' && !path.startsWith('/v1/'))return serveSite(req,res,path);
    if (path === '/v1/health' && req.method === 'GET') return send(200, { service: 'FreeHISTORIA', version: 1, freeOrders: Boolean(process.env.OLLAMA_MODEL) });
    if (path === '/v1/history' && req.method==='GET') return send(200, await history(new URL(req.url,'http://localhost').searchParams));
    const person = /^\/v1\/history\/person\/(Q[1-9]\d*)$/.exec(path);
    if(person && req.method==='GET') return send(200,await biography(person[1]));
    const peer=req.socket.remoteAddress||'local';
    const forwarded=req.headers['x-real-ip'];
    const ip=peer===process.env.TRUSTED_PROXY && typeof forwarded==='string' && isIP(forwarded)?forwarded:peer;
    if(path==='/v1/auth/challenge' && req.method==='GET')return send(200,accounts.challenge(ip));
    const auth=/^\/v1\/auth\/(register|login)$/.exec(path);
    if(auth && req.method==='POST')return send(200,await accounts.authenticate(auth[1],await jsonBody(req),ip));
    const route = /^\/v1\/campaigns(?:\/([^/]+)(\/turns)?)?$/.exec(path);
    const roomRoute = /^\/v1\/rooms(?:\/([^/]+)(?:\/(start|turns))?)?$/.exec(path);
    const relay = path==='/v1/provider' && req.method==='POST';
    const me=path==='/v1/me',logout=path==='/v1/auth/logout',personalOrder=path==='/v1/me/order';
    if (!route && !roomRoute && !relay && !me && !logout && !personalOrder) throw fail(404, 'Маршрут не найден.');
    const token=(req.headers.authorization||'').replace(/^Bearer /,'');
    if(!req.headers.authorization?.startsWith('Bearer '))throw fail(401,'Требуется вход или ключ игрока.');
    const owner=accounts.owner(token);
    if(me||logout||personalOrder){
      if(!owner.startsWith('account:'))throw fail(401,'Войдите в аккаунт.');
      if(me && req.method==='GET')return send(200,accounts.profile(owner));
      if(me && req.method==='POST')return send(200,accounts.update(owner,await jsonBody(req,32768)));
      if(logout && req.method==='POST'){accounts.logout(token);return send(200,{ok:true});}
      if(personalOrder && req.method==='POST'){
        const {game,order}=await jsonBody(req,65536);
        return send(200,await providerOrder(accounts.provider(owner),game,order,catalog));
      }
      throw fail(405,'Метод не поддерживается.');
    }
    if (relay) return send(200, await providerRelay(await jsonBody(req,131072)));
    if (roomRoute) {
      const result = await rooms({id:roomRoute[1],operation:roomRoute[2],method:req.method,owner,
        body:req.method==='POST'?await jsonBody(req):{},params:new URL(req.url,'http://localhost').searchParams,since:new URL(req.url,'http://localhost').searchParams.get('since')});
      return send(200,result);
    }
    const [, id, turns] = route;
    const load = id => db.prepare('SELECT state FROM campaigns WHERE id=? AND owner=?').get(id, owner);
    if (!id && req.method === 'GET') {
      return send(200, db.prepare(`SELECT id, json_extract(state,'$.nation') AS nation,
        json_extract(state,'$.startYear') AS startYear, json_extract(state,'$.year') AS year, turn
        FROM campaigns WHERE owner=? ORDER BY updated DESC`).all(owner));
    }
    if (!id && req.method === 'POST') {
      const body = await jsonBody(req);
      if (body.id !== undefined && (typeof body.id !== 'string' || !uuid.test(body.id))) throw fail(400, 'Некорректный идентификатор кампании.');
      const game = newGame(body, catalog, body.id);
      const existing = load(game.id);
      if (existing) return send(200, JSON.parse(existing.state));
      const inserted = db.prepare('INSERT OR IGNORE INTO campaigns VALUES (?,?,?,?,?)').run(game.id, owner, JSON.stringify(game), 0, Date.now());
      if (!inserted.changes) throw fail(409, 'Идентификатор занят.');
      return send(201, game);
    }
    if (id) {
      if (!load(id)) throw fail(404, 'Кампания не найдена.');
      if (!turns && req.method === 'GET') return send(200, JSON.parse(load(id).state));
      if (turns && req.method === 'POST') {
        const body = await jsonBody(req);
        const state = JSON.parse(load(id).state);
        if (state.turn !== body.expectedTurn) throw fail(409, 'Кампания уже обновлена. Загрузите последний ход.');
        const interpreted = body.action === 'order' ? await interpretOrder(state, body, catalog) : null;
        const next = playTurn(state, interpreted ? {...body, ...interpreted} : body, catalog);
        if (interpreted) {
          const event = next.history.at(-1);
          event.order = body.text.trim();
          event.text = interpreted.narrative + ' ' + event.text;
        }
        const saved = db.prepare('UPDATE campaigns SET state=?, turn=?, updated=? WHERE id=? AND owner=? AND turn=?')
          .run(JSON.stringify(next), next.turn, Date.now(), id, owner, body.expectedTurn);
        if (!saved.changes) throw fail(409, 'Кампания уже обновлена.');
        return send(200, next);
      }
    }
    throw fail(405, 'Метод не поддерживается.');
  } catch (err) {
    const internal = err.code && !err.status;
    if (internal) console.error(err);
    send(internal ? 500 : err.status || 400, { error: internal ? 'Внутренняя ошибка сервера.' : err.message });
  }
});
server.listen(port, process.env.API_HOST || (process.env.FREEHISTORIA_SERVER==='1'?'0.0.0.0':'127.0.0.1'), () => console.log('FreeHISTORIA API listening on port ' + server.address().port));
