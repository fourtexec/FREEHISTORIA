export function messageStore(db){
  db.exec(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY, scope TEXT NOT NULL, game TEXT NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, text TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS messages_pair ON messages(scope,game,sender,recipient,id)`);
  const insert=db.prepare('INSERT INTO messages(scope,game,sender,recipient,text) VALUES(?,?,?,?,?)');
  const list=db.prepare(`SELECT id,sender,text FROM messages WHERE scope=? AND game=?
    AND ((sender=? AND recipient=?) OR (sender=? AND recipient=?)) ORDER BY id DESC LIMIT 100`);
  return {
    append(scope,game,sender,recipient,text,reply){
      db.exec('BEGIN IMMEDIATE');
      try{
        insert.run(scope,game,sender,recipient,text);
        if(reply)insert.run(scope,game,recipient,sender,reply);
        db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}
    },
    list:(scope,game,sender,recipient)=>list.all(scope,game,sender,recipient,recipient,sender).reverse()
  };
}
