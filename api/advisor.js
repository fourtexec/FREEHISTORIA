import {buildPayload} from '../shared/provider.js';
import {orderPrompt,parseOrder} from '../shared/orders.js';
import {providerRelay} from './relay.js';
import { gameWorld } from '../shared/world.js';
import { actions, nationName } from '../shared/game.js';

export async function interpretOrder(game, order, catalog) {
  const model = process.env.OLLAMA_MODEL;
  if (!model) throw Object.assign(Error('На сервере не настроена модель Ollama.'), {status: 422});
  if (typeof order.text !== 'string' || !order.text.trim() || order.text.length > 1000) throw Error('Введите приказ длиной до 1000 символов.');
  const targets = gameWorld(game,catalog).nations.filter(n=>n!==game.nation && !game.members.includes(n));
  const context = { nation: nationName(game.nation), year: game.year, treasury: game.treasury,
    influence: game.influence, stability: game.stability, relations: game.relations, targets,
    history: game.history.slice(-3).map(e=>e.text), order: order.text };
  try {
    const response = await fetch(new URL('/api/chat',process.env.OLLAMA_URL || 'http://127.0.0.1:11434'), {
      method:'POST', headers:{'Content-Type':'application/json'}, signal:AbortSignal.timeout(55000),
      body:JSON.stringify({model, stream:false, format:'json', messages:[
        {role:'system',content:'Ты ведущий исторической стратегии. Истолкуй приказ в контексте года и державы. Выбери одно игровое действие: trade (торговля), reform (реформа), diplomacy (посольство), unite (мирная уния). Для последних двух выбери точное имя target из списка targets. Напиши 1–2 предложения на русском о том, как приказ был выполнен. Верни JSON с полями action, target, narrative. Цифры и изменения границ вычисляет игра.'},
        {role:'user',content:JSON.stringify(context)}
      ]})
    });
    if (!response.ok) throw Error();
    const data = JSON.parse((await response.json()).message.content);
    if (!Object.hasOwn(actions,data.action) || typeof data.narrative!=='string' || !data.narrative.trim()) throw Error();
    return {action:data.action, target:data.target, narrative:data.narrative.trim().slice(0,800)};
  } catch { throw Object.assign(Error('Модель Ollama не ответила корректно. Ход можно повторить.'),{status:503}); }
}

export async function providerOrder(cfg,game,order,catalog){
  const payload=buildPayload(cfg,orderPrompt(game,order,catalog));
  const answer=parseOrder(await providerRelay(payload),payload.path);
  return {...answer,narrative:'Приказ исполнен.'};
}
