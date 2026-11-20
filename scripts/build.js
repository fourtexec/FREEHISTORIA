import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function build(apiUrl = '') {
  if (apiUrl && !['https:', 'http:'].includes(new URL(apiUrl).protocol)) throw Error('Invalid API_URL');
  mkdirSync('dist', { recursive: true });
  cpSync('web', 'dist', { recursive: true });
  cpSync('shared', 'dist/shared', { recursive: true });
  cpSync('LICENSE', 'dist/LICENSE');
  cpSync('CREDITS.md', 'dist/CREDITS.md');
  writeFileSync('dist/config.json', JSON.stringify({ apiUrl: apiUrl.replace(/\/+$/, '') }));
  execFileSync('tar', ['-czf','dist/freehistoria-source.tar.gz','api','scripts','shared','web','tests','.github/workflows','package.json','README.md','LICENSE','CREDITS.md','.gitignore'], { stdio: 'inherit' });
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) build(process.env.API_URL);
