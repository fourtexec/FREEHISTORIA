import { newGame, playTurn } from './shared/game.js';

const prefix = 'freehistoria.v1.';
const localPrefix = prefix + 'game.';
let endpoint = '';
export let freeOrders = false;
export const apiUrl = () => endpoint;
export function initStore(config) {
  endpoint = localStorage.getItem(prefix+'endpoint') ?? config.apiUrl ?? '';
}
export async function health(url = endpoint) {
  const base = new URL(url);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw Error('Введите адрес HTTP(S) без параметров и пароля.');
  if (location.protocol === 'https:' && base.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(base.hostname)) throw Error('Для этой панели нужен HTTPS-адрес сервера.');
  const clean = base.href.replace(/\/+$/, '');
  const response = await fetch(clean + '/v1/health', {signal: AbortSignal.timeout(5000)});
  const data = await response.json();
  if (!response.ok || data.service !== 'FreeHISTORIA') throw Error('Сервер FreeHISTORIA не ответил.');
  return { url: clean, freeOrders: data.freeOrders === true };
}
export async function refreshCapabilities() {
  const base = endpoint;
  const result = await health(base);
  if (base === endpoint) freeOrders = result.freeOrders;
}
export async function configure(url) {
  const server = url ? await health(url) : null;
  const next = server?.url || '';
  freeOrders = server?.freeOrders || false;
  localStorage.setItem(prefix+'endpoint', next);
  endpoint = next;
}
function token() {
  const key = prefix + 'key.' + endpoint;
  let value = localStorage.getItem(key);
  if (!value) {
    value = [...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');
    localStorage.setItem(key, value);
  }
  return value;
}
async function request(path, body, resource='campaigns') {
  let response;
  try {
    response = await fetch(endpoint + '/v1/' + resource + path, {
      method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(body?.action==='order'||resource==='provider'?65000:10000),
      headers: {Authorization:'Bearer '+token(), ...(body ? {'Content-Type':'application/json'} : {})},
      body: body ? JSON.stringify(body) : undefined
    });
  } catch { throw Error('Не удалось связаться с API. Проверьте подключение в настройках.'); }
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Ошибка API.');
  return result;
}
function save(game) {
  localStorage.setItem(localPrefix+game.id, JSON.stringify({...game, updated: Date.now()}));
  return game;
}
export async function listGames() {
  if (endpoint) return request('');
  return Object.keys(localStorage).filter(k=>k.startsWith(localPrefix))
    .map(k=>JSON.parse(localStorage.getItem(k))).sort((a,b)=>b.updated-a.updated);
}
export async function readGame(id) {
  if (endpoint) return request('/'+encodeURIComponent(id));
  const data = localStorage.getItem(localPrefix+id);
  if (!data) throw Error('Кампания не найдена.');
  return JSON.parse(data);
}
export async function createGame(input, catalog) {
  if (endpoint) return request('', input);
  return save(newGame(input, catalog, input.id));
}
export async function nextTurn(id, order, catalog) {
  if (endpoint) return request('/'+encodeURIComponent(id)+'/turns', order);
  return navigator.locks.request(localPrefix+id, async () => save(playTurn(await readGame(id), order, catalog)));
}

export function roomRequest(path='',body) {
  if (!endpoint) throw Error('Подключите общий сервер в настройках.');
  return request(path,body,'rooms');
}

export function relayRequest(body) {
  if (!endpoint) throw Error('Для этого режима подключите игровой сервер.');
  return request('',body,'provider');
}

export function requestId() {
  if(crypto.randomUUID)return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=bytes[6]&15|64;bytes[8]=bytes[8]&63|128;
  const hex=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
