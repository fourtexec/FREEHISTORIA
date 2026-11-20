import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';

test('account sessions, single-use captcha, settings, public filters and host-only AI budget',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'fh-accounts-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const billed=[];
  const model=createServer((req,res)=>{
    billed.push(req.headers.authorization);
    setTimeout(()=>res.end(JSON.stringify({choices:[{message:{content:'{"action":"trade"}'}}]})),120);
  });
  model.listen(0,'127.0.0.1');await once(model,'listening');t.after(()=>model.close());
  const url='http://127.0.0.1:'+model.address().port+'/chat';
  const child=spawn('./start.sh',['--api-only'],{env:{...process.env,API_PORT:'0',API_HOST:'127.0.0.1',DATA_DIR:dir,PROVIDER_ENDPOINTS:url,TURNSTILE_SITE_KEY:'',TURNSTILE_SECRET_KEY:''},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null){const stopped=once(child,'exit');child.kill();await stopped;}});
  const port=await new Promise((resolve,reject)=>{child.once('exit',()=>reject(Error('API did not start')));child.stdout.on('data',b=>{const m=/port (\d+)/.exec(b);if(m)resolve(m[1]);});});
  const db=new DatabaseSync(join(dir,'campaigns.sqlite'));t.after(()=>db.close());
  async function call(path,body,token){
    const r=await fetch('http://127.0.0.1:'+port+'/v1/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
    return {status:r.status,data:await r.json()};
  }
  // Set the expected answer in the isolated test database. The production verifier still consumes it.
  async function challenge(){
    const {data:c}=await call('auth/challenge');
    assert.match(c.image,/^data:image\/png;base64,/);assert.equal(c.answer,undefined);
    const answer='58302';
    db.prepare('UPDATE captcha SET digest=? WHERE id=?').run(createHash('sha256').update(c.id+answer).digest('hex'),c.id);
    return {id:c.id,answer};
  }
  async function auth(action,username,captcha){
    return call('auth/'+action,{username,password:'test-only-password',captcha:captcha??await challenge()});
  }
  const c=await challenge();
  assert.equal((await auth('register','Host',{...c,answer:'wrong'})).status,403);
  assert.equal((await auth('register','Host',c)).status,403);
  const host=(await auth('register','Host')).data.token;
  const guest=(await auth('register','Guest')).data.token;
  const outsider=(await auth('register','Third')).data.token;
  assert.ok(host && guest && outsider);
  const provider={type:'chat',model:'example',key:'host-test-key',url};
  const filter={minYear:2025,maxYear:2026,seats:1,billing:'host'};
  const {data:profile}=await call('me',{theme:'light',storage:'local',match:filter,provider},host);
  assert.equal(profile.provider.model,'example');assert.ok(!JSON.stringify(profile).includes(provider.key));
  assert.ok(!db.prepare('SELECT provider FROM accounts WHERE login=?').get('host').provider.includes(provider.key));
  assert.equal(statSync(join(dir,'provider.key')).mode&0o777,0o600);
  const secondLogin=(await auth('login','host')).data;
  assert.deepEqual(secondLogin.profile.settings,{theme:'light',storage:'local',match:filter});
  assert.equal((await call('auth/logout',{},secondLogin.token)).status,200);
  assert.equal((await call('me',undefined,secondLogin.token)).status,401);
  await call('me',{provider:{...provider,key:'guest-test-key'}},guest);
  const opts={year:2026,nation:'Germany',name:'Host',capacity:2,billing:'host',aiLimit:1};
  assert.equal((await call('rooms',{...opts,visibility:'public'},'a'.repeat(64))).status,401);
  await call('rooms',{...opts,visibility:'private'},host);
  const room=(await call('rooms',{...opts,visibility:'public'},host)).data;
  const found=await call('rooms/discover?maxYear=2026&billing=host',undefined,guest);
  assert.deepEqual(found.data.map(r=>r.id),[room.id]);
  assert.equal((await call('rooms/discover?minYear=2027',undefined,guest)).data.length,0);
  assert.equal((await call('rooms/discover?seats=2',undefined,guest)).data.length,0);
  const match={requestId:randomUUID(),filters:filter};
  const joined=(await call('rooms/match',match,guest)).data;assert.equal(joined.id,room.id);
  assert.equal((await call('rooms/match',match,guest)).data.seat,1);
  assert.equal((await call('rooms/join',{invite:room.invite,name:'Third',nation:'Russia'},outsider)).status,409);
  const path='rooms/'+room.id;
  const start=(await call(path+'/start',{revision:joined.revision},host)).data;
  const first=(await call(path+'/turns',{revision:start.revision,action:'trade'},host)).data;
  const order={revision:first.revision,action:'order',text:'Открыть ярмарку',provider:{...provider,key:'ignored'}};
  const moves=await Promise.all([call(path+'/turns',order,guest),call(path+'/turns',order,guest)]);
  assert.deepEqual(moves.map(r=>r.status).sort(),[200,409]);assert.deepEqual(billed,['Bearer host-test-key']);
  const after=moves.find(r=>r.status===200).data;
  assert.equal(after.aiUsed,1);
  assert.equal((await call(path+'/turns',{...order,revision:after.revision},host)).status,409);
  assert.deepEqual(billed,['Bearer host-test-key']);
  assert.equal((await call(path+'/turns',{action:'trade',revision:after.revision},host)).status,200);
  assert.ok(!JSON.stringify(after).includes('test-key'));
});
