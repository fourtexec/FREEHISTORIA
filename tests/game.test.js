import {worldAt} from '../shared/world.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import { randomBytes, randomUUID,createHash } from 'node:crypto';
import { newGame, mapYearFor, playTurn, scenarios } from '../shared/game.js';

const catalog = JSON.parse(readFileSync(new URL('../shared/catalog.json',import.meta.url)));
test('custom years, presets and the transition between eras', () => {
  for (const year of [-999999,-1250,-1,1,77,2032,999999]) assert.equal(newGame({year,nation:'Держава'},catalog).startYear, year);
  for (const year of [0, 2.5, '1939', 1000000, null]) assert.throws(()=>mapYearFor(year,catalog));
  for (const preset of scenarios) assert.ok(worldAt(preset.year,catalog).nations.includes(preset.nation));
  const game = newGame({year:-1,nation:'Рим'},catalog);
  assert.equal(playTurn(game,{action:'trade',expectedTurn:0},catalog).year,1);
  assert.equal(game.year,-1);
});
test('embassies, prerequisites and territorial changes', () => {
  let game = newGame({year:1804,nation:'French Consulate'},catalog);
  const target='Kingdom of Portugal';
  const advance = action => game=playTurn(game,{action,target,expectedTurn:game.turn},catalog);
  assert.throws(()=>advance('unite'));
  advance('diplomacy'); advance('diplomacy'); advance('unite');
  assert.deepEqual(game.members,[target]);
  assert.equal(game.history.at(-1).impacts.regionTransfers[0].toCode,'French Consulate');
  assert.throws(()=>advance('unite'));
});
test('API isolates owners, persists games and commits one concurrent turn', async t => {
  const folder=mkdtempSync(join(tmpdir(),'freehistoria-test-'));
  t.after(()=>rmSync(folder,{recursive:true,force:true}));
  const model=createServer((req,res)=>res.end(JSON.stringify({message:{content:JSON.stringify({action:'trade',narrative:'Открыта ярмарка.'})}})));
  model.listen(0,'127.0.0.1');
  await once(model,'listening');
  t.after(()=>model.close());
  let child;
  async function start(){
    child=spawn(process.execPath,['api/server.js'],{env:{...process.env,API_PORT:'0',API_HOST:'127.0.0.1',DATA_DIR:folder,
      OLLAMA_MODEL:'fixture',OLLAMA_URL:'http://127.0.0.1:'+model.address().port,ALLOWED_ORIGINS:'https://example.github.io'},stdio:['ignore','pipe','pipe']});
    return new Promise((resolve,reject)=>{
      child.once('exit',code=>reject(Error('API exited '+code)));
      child.stderr.on('data',chunk=>{if(!chunk.toString().includes('ExperimentalWarning'))process.stderr.write(chunk);});
      child.stdout.on('data',chunk=>{const m=/listening on port (\d+)/.exec(chunk);if(m)resolve('http://127.0.0.1:'+m[1]);});
    });
  }
  async function stop(){if(child && child.exitCode===null && !child.signalCode){const done=once(child,'exit');child.kill();await done;}}
  t.after(stop);
  let base=await start();
  const token=randomBytes(32).toString('hex');
  const call=(path,body,key=token)=>fetch(base+'/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const preflight=await fetch(base+'/v1/campaigns',{method:'OPTIONS',headers:{Origin:'https://example.github.io'}});
  assert.equal(preflight.headers.get('access-control-allow-origin'),'https://example.github.io');
  assert.equal((await fetch(base+'/v1/health',{headers:{Origin:'https://other.test'}})).status,403);
  assert.equal((await fetch(base+'/v1/campaigns')).status,401);
  assert.equal((await call('campaigns',{year:0,nation:'Рим'})).status,400);
  const input={id:randomUUID(),year:-1,nation:'Рим'};
  const created=await call('campaigns',input);assert.equal(created.status,201);
  const game=await created.json();
  assert.equal((await call('campaigns',input)).status,200);
  const path='campaigns/'+game.id;
  const otherKey=randomBytes(32).toString('hex');
  assert.equal((await call(path,undefined,otherKey)).status,404);
  const partner=worldAt(game.mapYear,catalog,game.mapSource).nations.find(n=>n!==game.nation);
  const envoy=await call(path+'/chat?partner='+encodeURIComponent(partner),{text:'Обсудим торговлю',model:true});
  assert.equal(envoy.status,200);assert.match((await envoy.json())[1].text,/ярмарка/);
  assert.deepEqual(await (await call('campaigns',undefined,otherKey)).json(),[]);
  const order={expectedTurn:0,action:'trade'};
  const attempts=await Promise.all([call(path+'/turns',order),call(path+'/turns',order)]);
  assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);
  const ai=await call(path+'/turns',{expectedTurn:1,action:'order',text:'Открыть ярмарку'});
  assert.equal(ai.status,200);assert.match((await ai.json()).history[1].text,/Открыта ярмарка/);
  // Two independent identities share the map, while only the active seat can move.
  const db=new DatabaseSync(join(folder,'campaigns.sqlite'));
  async function roomAccount(name){
    const c=await (await call('auth/challenge')).json();
    const answer='05732';
    db.prepare('UPDATE captcha SET digest=? WHERE id=?').run(createHash('sha256').update(c.id+answer).digest('hex'),c.id);
    return (await (await call('auth/register',{username:name,password:'integration-test-pass',captcha:{id:c.id,answer}})).json()).token;
  }
  const hostSession=await roomAccount('Historian'),otherSession=await roomAccount('Traveler');db.close();
  const roomCall=(path,body,key)=>call(path,body,key===otherKey?otherSession:hostSession);
  const roomBody={id:randomUUID(),name:'Айше',year:1453,nation:'Ottoman Empire'};
  const room=await (await roomCall('rooms',roomBody)).json();
  assert.equal(room.players.length,1);assert.equal(room.mapSource,'cliopatria');
  assert.equal((await (await roomCall('rooms',roomBody)).json()).id,room.id);
  const roomPath='rooms/'+room.id;
  assert.equal((await roomCall(roomPath,undefined,otherKey)).status,404);
  assert.equal((await roomCall(roomPath+'/start',{revision:0})).status,409);
  assert.equal((await roomCall('rooms/join',{...roomBody,invite:room.invite},otherKey)).status,409);
  const guest=await (await roomCall('rooms/join',{name:'Леон',invite:room.invite,nation:'Kingdom of Portugal'},otherKey)).json();
  assert.equal(guest.seat,1);assert.equal(guest.revision,1);
  assert.equal((await roomCall(roomPath+'/start',{revision:1},otherKey)).status,403);
  const started=await (await roomCall(roomPath+'/start',{revision:1})).json();
  assert.equal(started.phase,'playing');
  assert.equal((await roomCall(roomPath+'/turns',{revision:2,action:'trade'},otherKey)).status,409);
  const moves=await Promise.all([roomCall(roomPath+'/turns',{revision:2,action:'diplomacy',target:'Kingdom of Portugal'}),
    roomCall(roomPath+'/turns',{revision:2,action:'trade'})]);
  assert.deepEqual(moves.map(r=>r.status).sort(),[200,409]);
  const mid=await (await roomCall(roomPath,undefined,otherKey)).json();
  assert.equal(mid.active,1);assert.equal(mid.year,1453);
  assert.equal((await roomCall(roomPath+'/turns',{revision:3,action:'unite',target:'Ottoman Empire'},otherKey)).status,400);
  assert.equal((await roomCall(roomPath+'/turns',{revision:3,action:'reform'},otherKey)).status,200);
  const hist=await (await roomCall('history?year=1453&nation=Ottoman%20Empire&facts=1')).json();
  assert.ok(hist.records.some(r=>r.from<=1453 && r.to>=1453));
  assert.ok(hist.facts.some(r=>r.name==='Мехмед II'));
  assert.equal((await roomCall('provider',{url:'https://example.invalid/private',headers:{},body:{}})).status,403);
  for (const year of [2025,2026]) {
    const nation='Germany', guestNation='Russia';
    const history=await (await roomCall('history?year='+year+'&nation='+nation+'&facts=1')).json();
    assert.equal(history.provenance.mapDate.slice(0,4),String(year));
    assert.equal(history.records[0].qid,'Q183');
    assert.equal(history.facts.some(f=>f.qid==='Q61053' && f.kind==='governmentHead'),year===2025);
    assert.ok(history.facts.some(f=>f.kind==='head'));
    const modern=await (await roomCall('rooms',{year,nation,name:'Хозяин',interval:'week'})).json();
    const preview=await (await roomCall('rooms/preview',{invite:modern.invite},otherKey)).json();
    assert.equal(modern.mapYear,year);
    assert.equal(preview.mapSource,'modern');
    assert.equal(preview.mapYear,year);
    const second=await (await roomCall('rooms/join',{invite:modern.invite,name:'Гость',nation:guestNation},otherKey)).json();
    assert.equal(second.players.length,2);
    const modernPath='rooms/'+modern.id;
    const begun=await (await roomCall(modernPath+'/start',{revision:second.revision})).json();
    const firstMove=await (await roomCall(modernPath+'/turns',{revision:begun.revision,action:'plan',orders:[{action:'infrastructure'},{action:'trade'}]})).json();
    assert.equal(firstMove.players[0].roads,1);
    const next=await (await roomCall(modernPath+'/turns',{revision:firstMove.revision,action:'trade'},otherKey)).json();
    assert.equal(next.year,year);assert.equal(next.date,year+'-01-08');
    assert.equal(next.mapYear,year);
  }
  await stop();base=await start();
  const after=await (await roomCall(roomPath,undefined,otherKey)).json();
  assert.equal(after.round,1);assert.equal(after.year,1454);assert.equal(after.history.length,2);
  assert.equal(after.players[1].stability,69);assert.equal(after.seat,1);
  assert.deepEqual(await (await roomCall(roomPath+'?since=4')).json(),{revision:4});
  const saved=await (await call(path)).json();
  assert.equal(saved.startYear,-1);assert.equal(saved.year,2);assert.equal(saved.turn,2);
  assert.equal((await (await call('campaigns')).json()).length,1);
});
