import {messageText} from '../shared/diplomacy.js';
import {intervals} from '../shared/calendar.js';
import { gameWorld } from '../shared/world.js';
import { randomBytes, randomUUID, randomInt } from 'node:crypto';
import { newGame, playTurn } from '../shared/game.js';
import {matchFilter} from './accounts.js';
import { interpretOrder, providerOrder } from './advisor.js';

const fail = (code, message) => Object.assign(new Error(message), {status: code});
const requireName = value => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 40) throw fail(400,'Введите имя игрока длиной до 40 символов.');
  return value.trim();
};

export function roomService(db, catalog, accounts,messages) {
  db.exec(`CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY, invite TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL, state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS room_players (
      room TEXT NOT NULL, owner TEXT NOT NULL, seat INTEGER NOT NULL,
      PRIMARY KEY(room,owner), UNIQUE(room,seat));
    CREATE TABLE IF NOT EXISTS match_requests(owner TEXT, request TEXT, room TEXT, PRIMARY KEY(owner,request));
    CREATE TABLE IF NOT EXISTS room_ai(room TEXT, revision INTEGER, created INTEGER, PRIMARY KEY(room,revision));
    CREATE INDEX IF NOT EXISTS my_rooms ON room_players(owner);`);
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (err) { db.exec('ROLLBACK'); throw err; }
  }
  const byId = id => db.prepare('SELECT * FROM rooms WHERE id=?').get(id);
  const seatOf = (id, owner) => db.prepare('SELECT seat FROM room_players WHERE room=? AND owner=?').get(id,owner)?.seat;
  function view(row, seat) {
    const {providerVersion,...state}=JSON.parse(row.state);
    const aiUsed=state.billing==='host'?db.prepare('SELECT COUNT(*) AS n FROM room_ai WHERE room=?').get(row.id).n:0;
    const aiSent=state.billing==='host'&&Boolean(db.prepare('SELECT 1 FROM room_ai WHERE room=? AND revision=?').get(row.id,row.revision));
    return {...state, aiUsed, aiSent, id: row.id, revision: row.revision, seat, invite: row.invite};
  }
  function update(row, state, seat, paid=false) {
    const changes = db.prepare(`UPDATE rooms SET state=?, revision=revision+1 WHERE id=? AND revision=?
      AND (? OR NOT EXISTS(SELECT 1 FROM room_ai WHERE room=rooms.id AND revision=rooms.revision AND created>?))`)
      .run(JSON.stringify(state), row.id, row.revision, Number(paid), Date.now()-65000).changes;
    if (!changes) throw fail(409,'Комната уже обновлена. Проверьте очередь хода.');
    return view(byId(row.id), seat);
  }
  function addPlayer(state, body) {
    const name = requireName(body.name);
    const game = newGame({year:state.startYear,nation:body.nation,difficulty:state.difficulty},catalog);
    if (!gameWorld(state,catalog).nations.includes(game.nation)) throw fail(400,'Выберите державу стартового года.');
    if (state.players.some(p=>p.nation===game.nation)) throw fail(409,'Эта держава уже занята.');
    state.players.push({name,nation:game.nation,treasury:game.treasury,stability:game.stability,
      influence:game.influence,relations:[],members:[]});
  }
  function requireAccount(owner){
    if(!owner.startsWith('account:'))throw fail(401,'Для новой сетевой игры войдите в аккаунт.');
  }
  function available(owner,input,random=false){
    requireAccount(owner);
    const f=matchFilter(input);
    return db.prepare(`SELECT r.id,r.invite,json_extract(state,'$.startYear') AS year,json_extract(state,'$.title') AS title,
        json_extract(state,'$.billing') AS billing,json_extract(state,'$.capacity') AS capacity,
        json_array_length(state,'$.players') AS players,json_extract(state,'$.players[0].name') AS host
      FROM rooms r WHERE json_extract(state,'$.visibility')='public' AND json_extract(state,'$.phase')='lobby'
      AND NOT EXISTS(SELECT 1 FROM room_players p WHERE p.room=r.id AND p.owner=?)
      AND year BETWEEN ? AND ? AND (?='any' OR billing=?) AND capacity-players>=?
      ORDER BY ${random?'random()':'r.rowid DESC'} LIMIT ${random?1:60}`).all(owner,f.minYear||-999999,f.maxYear||999999,f.billing,f.billing,f.seats);
  }
  function join(row,state,owner,body){
    if(state.requiresAccount||state.visibility==='public'||state.billing==='host')requireAccount(owner);
    const existing=seatOf(row.id,owner);
    if(existing!==undefined)return view(row,existing);
    if(state.phase!=='lobby'||state.players.length>=(state.capacity??Infinity))throw fail(409,'Подбор завершён или места заняты.');
    const seat=state.players.length;
    addPlayer(state,body);
    db.prepare('INSERT INTO room_players VALUES (?,?,?)').run(row.id,owner,seat);
    return update(row,state,seat);
  }
  return async function rooms({id, operation, method, owner, body, since, params}) {
    if(id==='discover' && !operation && method==='GET')return available(owner,Object.fromEntries(params));
    if(id==='match' && !operation && method==='POST')return transaction(()=>{
      requireAccount(owner);
      if(typeof body.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(body.requestId))throw fail(400,'Некорректный идентификатор поиска.');
      const prev=db.prepare('SELECT room FROM match_requests WHERE owner=? AND request=?').get(owner,body.requestId);
      if(prev)return view(byId(prev.room),seatOf(prev.room,owner));
      const [target]=available(owner,body.filters,true);
      if(!target)throw fail(404,'Пока нет свободных комнат по этим фильтрам.');
      const row=byId(target.id),state=JSON.parse(row.state);
      const nations=gameWorld(state,catalog).nations.filter(n=>!state.players.some(p=>p.nation===n));
      if(!nations.length)throw fail(409,'Свободных держав нет.');
      const result=join(row,state,owner,{name:accounts.profile(owner).username,nation:nations[randomInt(nations.length)]});
      db.prepare('INSERT INTO match_requests VALUES(?,?,?)').run(owner,body.requestId,row.id);
      return result;
    });
    if (!id && method === 'GET') {
      return db.prepare(`SELECT r.id,r.state,p.seat FROM rooms r JOIN room_players p ON p.room=r.id
        WHERE p.owner=? ORDER BY r.rowid DESC`).all(owner).map(row=>{
        const s=JSON.parse(row.state);
        return {id:row.id,title:s.title,year:s.year,phase:s.phase,nation:s.players[row.seat].nation,count:s.players.length};
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
      const visibility=body.visibility??'private',billing=body.billing??'free',capacity=body.capacity??6;
      if(!['private','public'].includes(visibility)||!['host','free'].includes(billing)||!Number.isInteger(capacity)||capacity<2||capacity>16)throw fail(400,'Проверьте параметры комнаты.');
      requireAccount(owner);
      if(gameWorld(game,catalog).nations.length<2)throw fail(400,'В этом году недостаточно держав для комнаты.');
      const aiLimit=billing==='host'?body.aiLimit:0;
      const providerVersion=billing==='host'?accounts.version(owner):null;
      if(billing==='host' && (!providerVersion||!Number.isInteger(aiLimit)||aiLimit<1||aiLimit>1000))throw fail(400,'Сохраните провайдера в аккаунте и задайте лимит от 1 до 1000 запросов.');
      const interval=body.interval??'year';
      if(!Object.hasOwn(intervals,interval))throw fail(400,'Выберите длительность раунда.');
      const state = {title:game.title,briefing:game.briefing,difficulty:game.difficulty,objective:game.objective,interval,date:game.date,requiresAccount:true,visibility,billing,capacity:Math.min(capacity,gameWorld(game,catalog).nations.length),aiLimit,providerVersion,year:game.year,startYear:game.year,mapYear:game.mapYear,mapSource:game.mapSource,
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
      if (id==='preview') return {requiresAccount:state.requiresAccount,id:row.id,phase:state.phase,startYear:state.startYear,mapYear:state.mapYear,mapSource:state.mapSource,
        nations:state.players.map(p=>p.nation),joined:existing!==undefined};
      return join(row,state,owner,body);
    });
    const seat=seatOf(id,owner);
    if (seat===undefined) throw fail(404,'Комната не найдена.');
    const row=byId(id);
    if (method==='GET' && !operation) return String(row.revision)===since ? {revision:row.revision} : view(row,seat);
    if(operation==='chat' && ['GET','POST'].includes(method)){
      const state=JSON.parse(row.state),sender=state.players[seat].nation,partner=params.get('partner');
      if(sender===partner||!state.players.some(p=>p.nation===partner))throw fail(400,'Выберите другого участника комнаты.');
      if(method==='POST')messages.append('room',id,sender,partner,messageText(body.text));
      return messages.list('room',id,sender,partner);
    }
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
    const position={...player,id:row.id,objective:state.objective,date:state.date,year:state.year,mapYear:state.mapYear,mapSource:state.mapSource,turn:state.round,history:[]};
    let ai=null;
    if(state.billing==='host'){
      const call=db.prepare('SELECT created FROM room_ai WHERE room=? AND revision=?').get(id,row.revision);
      if(call && (body.action==='order'||call.created>Date.now()-65000))throw fail(409,'ИИ-запрос этого хода уже отправлен. Дождитесь результата или выполните обычный ход.');
      if(body.action==='order'){
        if(typeof body.text!=='string'||!body.text.trim()||body.text.length>1000)throw fail(400,'Введите приказ до 1000 символов.');
        const host=db.prepare('SELECT owner FROM room_players WHERE room=? AND seat=0').get(id).owner;
        const cfg=accounts.provider(host,state.providerVersion);
        transaction(()=>{
          if(byId(id).revision!==row.revision)throw fail(409,'Ход изменился.');
          const used=db.prepare('SELECT count(*) AS n FROM room_ai WHERE room=?').get(id).n;
          if(used>=state.aiLimit)throw fail(409,'Лимит ИИ хозяина исчерпан. Доступны обычные действия.');
          const reserved=db.prepare('INSERT OR IGNORE INTO room_ai VALUES(?,?,?)').run(id,row.revision,Date.now());
          if(!reserved.changes)throw fail(409,'Этот ИИ-запрос уже отправлен.');
        });
        try{return finish(await providerOrder(cfg,position,body,catalog));}
        finally{db.prepare('UPDATE room_ai SET created=0 WHERE room=? AND revision=?').run(id,row.revision);}
      }
    }else if(body.action==='order'){
      if(state.billing==='free')throw fail(400,'Эта комната играет без ИИ.');
      ai=await interpretOrder({...position,history:state.history},body,catalog);
    }
    return finish(ai);
    function finish(ai){
      const order=ai || body;
      const orders=order.action==='plan'?order.orders:[order];
      if(!Array.isArray(orders)||orders.length>6||orders.some(item=>!item||typeof item!=='object'))throw fail(400,'Некорректный план хода.');
      for(const order of orders){
        const occupied=state.players.some(p=>p.members.includes(order.target));
        if (['unite','diplomacy'].includes(order.action) && occupied) throw fail(409,'Эта территория уже входит в союз.');
        if (order.action==='unite' && state.players.some(p=>p.nation===order.target)) throw fail(400,'Державы игроков сохраняют независимость.');
      }
      const excluded=state.players.flatMap(p=>[p.nation,...p.members]);
      const clean=orders.map(({action,target,text})=>({action,target,text}));
      const next=playTurn(position,{action:order.action,target:order.target,text:body.text,orders:clean,interval:state.interval,expectedTurn:state.round},catalog,excluded);
      for (const field of ['treasury','influence','stability','relations','members','roads','academies','invitation','achieved']) player[field]=next[field];
      for(const order of orders)if (order.action==='diplomacy') {
        const partner=state.players.find(p=>p.nation===order.target);
        if (partner) {
          const value=next.relations.find(r=>r.nation===partner.nation).value;
          partner.relations=partner.relations.filter(r=>r.nation!==player.nation).concat({nation:player.nation,value});
        }
      }
      const event=next.history[0];
      if (ai) event.text=ai.narrative+' '+event.text;
      state.history.push(...next.history.map(e=>({...e,nation:player.nation})));
      state.active=(seat+1)%state.players.length;
      if (state.active===0) {state.year=next.year;state.date=next.date;state.round++;}
      return update(row,state,seat,state.billing==='host' && Boolean(ai));
    }
  };
}
