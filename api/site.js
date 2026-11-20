import {createReadStream,statSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';

const root=resolve('dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.css':'text/css','.webp':'image/webp','.md':'text/plain; charset=utf-8','.gz':'application/gzip'};
export function serveSite(req,res,path){
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  if(path==='/config.json'){
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(req.method==='HEAD'?undefined:JSON.stringify({sameOrigin:true}));return;
  }
  try{
    const file=resolve(root,'.'+decodeURIComponent(path==='/'?'/index.html':path));
    if(!file.startsWith(root+sep)||!statSync(file).isFile())throw Error();
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD')res.end();else createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  }catch{res.writeHead(404).end();}
}
