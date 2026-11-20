import { networkInterfaces } from 'node:os';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { build } from './build.js';

const port = Number(process.env.WEB_PORT || 5173);
const apiPort = Number(process.env.API_PORT || 8787);
const lan = process.argv.includes('--lan');
const addresses = ['localhost','127.0.0.1'];
if (lan) {
  for (const iface of Object.values(networkInterfaces()).flat()) {
    if (iface.family === 'IPv4' && !iface.internal) addresses.push(iface.address);
  }
}
build();
const api = spawn(process.execPath, ['api/server.js'], {stdio:'inherit', env:{...process.env,
  API_HOST: lan?'0.0.0.0':process.env.API_HOST,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? addresses.map(host=>'http://'+host+':'+port).join(',')}});
const root = resolve('dist');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.webp':'image/webp','.gz':'application/gzip','.md':'text/plain; charset=utf-8'};
const server = createServer((req,res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/config.json') {
      res.setHeader('Content-Type', 'application/json');
      const host = req.headers.host?.split(':')[0];
      return res.end(JSON.stringify({apiUrl:'http://'+(lan && host!=='localhost' && addresses.includes(host)?host:'127.0.0.1')+':'+apiPort}));
    }
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(root+sep) || !statSync(file).isFile()) throw Error();
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch { res.writeHead(404).end(); }
});
api.on('exit', code => { server.close(); process.exitCode = process.exitCode || code || 0; });
server.on('error', err => { console.error(err.message); api.kill(); process.exitCode = 1; });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { api.kill(); server.close(); });
server.listen(port, lan?'0.0.0.0':'127.0.0.1', () => console.log('Панель FreeHISTORIA: '+addresses.map(h=>'http://'+h+':'+port).join(', ')));
