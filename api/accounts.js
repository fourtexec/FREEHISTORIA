import {scrypt,createHash,randomBytes,randomUUID,timingSafeEqual,createCipheriv,createDecipheriv} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {buildPayload} from '../shared/provider.js';
import {captchaService} from './captcha.js';
import {allowedEndpoint} from './relay.js';

const derive=promisify(scrypt);
const digest=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>Object.assign(Error(message),{status});
const defaults={theme:'dark',storage:'server',match:{minYear:'',maxYear:'',billing:'any',seats:1}};

function vault(folder){
  const path=join(folder,'provider.key');
  try{writeFileSync(path,randomBytes(32),{mode:0o600,flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
  const key=readFileSync(path);
  if(key.length!==32)throw Error('Повреждён серверный ключ provider.key.');
  return {
    seal(data,id){
      const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
      cipher.setAAD(Buffer.from(id));
      const bytes=Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final()]);
      return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64');
    },
    open(value,id){
      const bytes=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
      cipher.setAAD(Buffer.from(id));cipher.setAuthTag(bytes.subarray(12,28));
      return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString());
    }
  };
}
export function matchFilter(input={}){
  const num=value=>value===''||value==null?'':Number(value);
  const x={minYear:num(input.minYear),maxYear:num(input.maxYear),seats:Number(input.seats??1),billing:input.billing??'any'};
  if([x.minYear,x.maxYear].some(v=>v!==''&&(!Number.isInteger(v)||!v||Math.abs(v)>999999)) ||
    (x.minYear!==''&&x.maxYear!==''&&x.minYear>x.maxYear) || !['any','host','free'].includes(x.billing) ||
    !Number.isInteger(x.seats)||x.seats<1||x.seats>15)throw fail(400,'Проверьте годы, оплату и количество свободных мест.');
  return x;
}
export function accountService(db,folder,captcha=captchaService(db)){
  const secrets=vault(folder);
  db.exec(`CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,login TEXT UNIQUE,username TEXT,salt TEXT,pw TEXT,settings TEXT,provider TEXT,provider_version TEXT);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,account TEXT,expires INTEGER);
    CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires);
    CREATE TABLE IF NOT EXISTS auth_limits(scope TEXT PRIMARY KEY,n INTEGER,expires INTEGER);`);
  const user=id=>db.prepare('SELECT * FROM accounts WHERE id=?').get(id);
  function limit(scope,max){
    const now=Date.now();
    db.prepare('DELETE FROM auth_limits WHERE expires<=?').run(now);
    const {n}=db.prepare('INSERT INTO auth_limits VALUES(?,1,?) ON CONFLICT(scope) DO UPDATE SET n=n+1 RETURNING n').get(scope,now+600000);
    if(n>max)throw fail(429,'Слишком много попыток. Попробуйте через 10 минут.');
  }
  function profile(id){
    const row=user(id);
    let provider=null;
    if(row.provider){
      const {key,...settings}=secrets.open(row.provider,id);
      provider=settings;
    }
    return {id,username:row.username,settings:JSON.parse(row.settings),provider};
  }
  async function authenticate(action,body,ip){
    limit('auth:'+ip,40);
    await captcha.verify(body.captcha,ip);
    const name=typeof body.username==='string'?body.username.trim().normalize('NFKC'):'';
    const password=body.password,login=name.toLowerCase();
    if(!/^[\p{L}\p{N}_-]{3,32}$/u.test(name)||typeof password!=='string'||password.length<10||password.length>128)throw fail(400,'Имя должно содержать 3–32 буквы, цифры, дефисы или подчёркивания, пароль — 10–128 символов.');
    const existing=db.prepare('SELECT * FROM accounts WHERE login=?').get(login);
    const salt=action==='login' && existing?existing.salt:randomBytes(16).toString('hex');
    const pw=await derive(password,salt,64);
    let id;
    if(action==='register'){
      id='account:'+randomUUID();
      const result=db.prepare('INSERT OR IGNORE INTO accounts VALUES(?,?,?,?,?,?,NULL,NULL)').run(id,login,name,salt,pw.toString('hex'),JSON.stringify(defaults));
      if(!result.changes)throw fail(409,'Имя уже занято.');
    }else{
      if(!existing || !timingSafeEqual(pw,Buffer.from(existing.pw,'hex')))throw fail(401,'Неверное имя или пароль.');
      id=existing.id;
    }
    const token='fh_'+randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),id,Date.now()+30*86400000);
    return {token,profile:profile(id)};
  }
  function owner(token){
    if(/^[0-9a-f]{64}$/.test(token))return digest(token);
    if(/^fh_[0-9a-f]{64}$/.test(token)){
      const session=db.prepare('SELECT account FROM sessions WHERE hash=? AND expires>?').get(digest(token),Date.now());
      if(session)return session.account;
    }
    throw fail(401,'Требуется вход в аккаунт.');
  }
  function update(id,body){
    const row=user(id),settings=JSON.parse(row.settings);
    if(body.theme!==undefined){
      if(!['dark','light','system'].includes(body.theme))throw fail(400,'Неизвестная тема.');
      settings.theme=body.theme;
    }
    if(body.storage!==undefined){
      if(!['local','server'].includes(body.storage))throw fail(400,'Неизвестное хранилище.');
      settings.storage=body.storage;
    }
    if(body.match!==undefined)settings.match=matchFilter(body.match);
    let encrypted=row.provider,version=row.provider_version;
    if(body.provider!==undefined){
      if(body.provider===null){encrypted=null;version=null;}
      else {
        const cfg={};
        for(const key of ['type','url','model','header','prefix','template','path','key'])if(typeof body.provider[key]==='string')cfg[key]=body.provider[key];
        if(!['chat','gemini','anthropic','custom'].includes(cfg.type)||!cfg.model?.trim()||!cfg.key?.trim()||cfg.key.length>4096)throw fail(400,'Укажите протокол, модель и ключ.');
        cfg.transport='relay';
        const {url}=buildPayload(cfg,'');
        if(!allowedEndpoint(url))throw fail(400,'Добавьте адрес провайдера в PROVIDER_ENDPOINTS сервера.');
        encrypted=secrets.seal(cfg,id);version=randomUUID();
      }
    }
    db.prepare('UPDATE accounts SET settings=?,provider=?,provider_version=? WHERE id=?').run(JSON.stringify(settings),encrypted,version,id);
    return profile(id);
  }
  return {owner,profile,update,authenticate,
    challenge(ip){limit('captcha:'+ip,80);return captcha.issue(ip);},
    logout(token){db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(token));},
    version(id){return user(id)?.provider_version;},
    provider(id,version){
      const row=user(id);
      if(!row?.provider || (version && row.provider_version!==version))throw fail(409,'Настройки провайдера изменились. Выберите обычное действие.');
      return secrets.open(row.provider,id);
    }
  };
}
