import {presetData} from '../shared/preset.js';
const fail=(status,message)=>Object.assign(Error(message),{status});
export function presetService(db,accounts){
  db.exec(`CREATE TABLE IF NOT EXISTS presets(id TEXT, version INTEGER, owner TEXT NOT NULL, author TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(id,version));
    CREATE TABLE IF NOT EXISTS stars(preset TEXT,owner TEXT,PRIMARY KEY(preset,owner));`);
  const latest=db.prepare('SELECT * FROM presets WHERE id=? ORDER BY version DESC LIMIT 1');
  const present=(r,owner)=>({...JSON.parse(r.data),id:r.id,version:r.version,author:r.author,mine:r.owner===owner});
  return function({id,op,method,owner,input,params}){
    if(!id && method==='GET'){
      const rows=db.prepare(`SELECT p.*,EXISTS(SELECT 1 FROM stars s WHERE s.preset=p.id AND s.owner=?) AS starred
        FROM presets p WHERE version=(SELECT MAX(v.version) FROM presets v WHERE v.id=p.id) ORDER BY updated DESC LIMIT 200`).all(owner);
      return rows.map(r=>({...present(r,owner),starred:Boolean(r.starred)}));
    }
    if(!id||!/^[0-9a-f-]{36}$/.test(id))throw fail(400,'Некорректный идентификатор сценария.');
    const prev=latest.get(id);
    if(method==='GET'&&!op){
      const version=Number(params.get('version'))||prev?.version;
      const row=db.prepare('SELECT * FROM presets WHERE id=? AND version=?').get(id,version??0);
      if(!row)throw fail(404,'Версия не найдена.');
      return present(row,owner);
    }
    if(method!=='POST')throw fail(405,'Метод не поддерживается.');
    if(!owner.startsWith('account:'))throw fail(401,'Для публикации и избранного войдите в аккаунт.');
    if(op==='star'){
      if(!prev)throw fail(404,'Сценарий не найден.');
      if(typeof input.starred!=='boolean')throw fail(400,'Укажите состояние избранного.');
      if(input.starred)db.prepare('INSERT OR IGNORE INTO stars VALUES(?,?)').run(id,owner);
      else db.prepare('DELETE FROM stars WHERE preset=? AND owner=?').run(id,owner);
      return {starred:input.starred};
    }
    if(prev && prev.owner!==owner)throw fail(403,'Обновлять сценарий может его автор.');
    if(input.version!==(prev?.version||0))throw fail(409,'Сценарий обновился. Откройте последнюю версию.');
    const data=presetData(input),v=input.version+1;
    db.prepare('INSERT INTO presets VALUES(?,?,?,?,?,?)').run(id,v,owner,accounts.profile(owner).username,JSON.stringify(data),Date.now());
    return present(latest.get(id),owner);
  };
}
