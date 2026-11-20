import { gameWorld } from '../shared/world.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { newGame, playTurn } from '../shared/game.js';
import { interpretOrder } from './advisor.js';

const fail = (code, message) => Object.assign(new Error(message), {status: code});
const requireName = value => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 40) throw fail(400,'Введите имя игрока длиной до 40 символов.');
  return value.trim();
};

export function roomService(db, catalog) {
  db.exec(`CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY, invite TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL, state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS room_players (
      room TEXT NOT NULL, owner TEXT NOT NULL, seat INTEGER NOT NULL,
      PRIMARY KEY(room,owner), UNIQUE(room,seat));
    CREATE INDEX IF NOT EXISTS my_rooms ON room_players(owner);`);
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (err) { db.exec('ROLLBACK'); throw err; }
  }
  const byId = id => db.prepare('SELECT * FROM rooms WHERE id=?').get(id);
  const seatOf = (id, owner) => db.prepare('SELECT seat FROM room_players WHERE room=? AND owner=?').get(id,owner)?.seat;
  function view(row, seat) {
    return {...JSON.parse(row.state), id: row.id, revision: row.revision, seat, invite: row.invite};
  }
  function update(row, state, seat) {
    const changes = db.prepare('UPDATE rooms SET state=?, revision=revision+1 WHERE id=? AND revision=?')
      .run(JSON.stringify(state), row.id, row.revision).changes;
    if (!changes) throw fail(409,'Комната уже обновлена. Проверьте очередь хода.');
    return view(byId(row.id), seat);
  }
  function addPlayer(state, body) {
    const name = requireName(body.name);
    const game = newGame({year:state.startYear,nation:body.nation},catalog);
    if (!gameWorld(state,catalog).nations.includes(game.nation)) throw fail(400,'Выберите державу стартового года.');
    if (state.players.some(p=>p.nation===game.nation)) throw fail(409,'Эта держава уже занята.');
    state.players.push({name,nation:game.nation,treasury:game.treasury,stability:game.stability,
      influence:game.influence,relations:[],members:[]});
  }
  return async function rooms({id, operation, method, owner, body, since}) {
    if (!id && method === 'GET') {
      return db.prepare(`SELECT r.id,r.state,p.seat FROM rooms r JOIN room_players p ON p.room=r.id
        WHERE p.owner=? ORDER BY r.rowid DESC`).all(owner).map(row=>{
        const s=JSON.parse(row.state);
        return {id:row.id,year:s.year,phase:s.phase,nation:s.players[row.seat].nation,count:s.players.length};
      });
    }
    if (!id && method === 'POST') return transaction(()=>{
      if(body.id!==undefined && (typeof body.id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id))) throw fail(400,'Некорректный идентификатор.');
      const id=body.id || randomUUID();
      const existing=byId(id);
      if(existing){
        if(seatOf(id,owner)!==0)throw fail(409,'Идентификатор занят.');
        return view(existing,0);
      }
      const game = newGame(body,catalog);
      const state = {year:game.year,startYear:game.year,mapYear:game.mapYear,mapSource:game.mapSource,
        phase:'lobby',round:0,active:0,players:[],history:[]};
      addPlayer(state, body);
      const invite=randomBytes(9).toString('hex');
      db.prepare('INSERT INTO rooms VALUES (?,?,0,?)').run(id,invite,JSON.stringify(state));
      db.prepare('INSERT INTO room_players VALUES (?,?,0)').run(id,owner);
      return view(byId(id),0);
    });
    if (['join','preview'].includes(id) && method==='POST' && !operation) return transaction(()=>{
      if (typeof body.invite!=='string') throw fail(400,'Введите код комнаты.');
      const row=db.prepare('SELECT * FROM rooms WHERE invite=?').get(body.invite.trim().toLowerCase());
      if (!row) throw fail(404,'Приглашение не найдено.');
      const state=JSON.parse(row.state), existing=seatOf(row.id,owner);
      if (id==='preview') return {id:row.id,phase:state.phase,startYear:state.startYear,mapYear:state.mapYear,mapSource:state.mapSource,
        nations:state.players.map(p=>p.nation),joined:existing!==undefined};
      if (existing!==undefined) return view(row,existing);
      if (state.phase!=='lobby') throw fail(409,'Игра уже началась.');
      const seat=state.players.length;
      addPlayer(state,body);
      db.prepare('INSERT INTO room_players VALUES (?,?,?)').run(row.id,owner,seat);
      return update(row,state,seat);
    });
    const seat=seatOf(id,owner);
    if (seat===undefined) throw fail(404,'Комната не найдена.');
    const row=byId(id);
    if (method==='GET' && !operation) return String(row.revision)===since ? {revision:row.revision} : view(row,seat);
    if (method!=='POST') throw fail(405,'Метод не поддерживается.');
    if (row.revision!==body.revision) throw fail(409,'Комната уже обновлена. Проверьте очередь хода.');
    const state=JSON.parse(row.state);
    if (operation==='start') {
      if (seat!==0) throw fail(403,'Игру начинает создатель комнаты.');
      if (state.phase!=='lobby' || state.players.length<2) throw fail(409,'Для старта нужны два игрока в лобби.');
      state.phase='playing';
      return update(row,state,seat);
    }
    if (operation!=='turns') throw fail(404,'Маршрут не найден.');
    if (state.phase!=='playing' || state.active!==seat) throw fail(409,'Сейчас ход другого игрока.');
    const player=state.players[seat];
    const position={...player,year:state.year,mapYear:state.mapYear,mapSource:state.mapSource,turn:state.round,history:[]};
    const ai = body.action==='order' ? await interpretOrder({...position,history:state.history},body,catalog) : null;
    const order=ai || body;
    const occupied=state.players.some(p=>p.members.includes(order.target));
    if (['unite','diplomacy'].includes(order.action) && occupied) throw fail(409,'Эта территория уже входит в союз.');
    if (order.action==='unite' && state.players.some(p=>p.nation===order.target)) throw fail(400,'Державы игроков сохраняют независимость.');
    const next=playTurn(position,{action:order.action,target:order.target,expectedTurn:state.round},catalog);
    for (const field of ['treasury','influence','stability','relations','members']) player[field]=next[field];
    if (order.action==='diplomacy') {
      const partner=state.players.find(p=>p.nation===order.target);
      if (partner) {
        const value=next.relations.find(r=>r.nation===partner.nation).value;
        partner.relations=partner.relations.filter(r=>r.nation!==player.nation).concat({nation:player.nation,value});
      }
    }
    const event=next.history[0];
    if (ai) event.text=ai.narrative+' '+event.text;
    state.history.push({...event,nation:player.nation});
    state.active=(seat+1)%state.players.length;
    if (state.active===0) {state.year=next.year;state.round++;}
    return update(row,state,seat);
  };
}
