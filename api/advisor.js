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

export async function envoyReply(game,partner,text,transcript){
  if(!process.env.OLLAMA_MODEL)throw Object.assign(Error('На сервере не настроена модель Ollama.'),{status:422});
  const context={date:game.date||String(game.year),scenario:game.briefing||'',player:nationName(game.nation),delegation:nationName(partner),
    relations:game.relations.find(r=>r.nation===partner)?.value??25,events:game.history.slice(-4).map(e=>e.text),
    conversation:transcript.slice(-8).map(m=>({speaker:nationName(m.sender),message:m.text})),message:text};
  try{
    const response=await fetch(new URL('/api/chat',process.env.OLLAMA_URL||'http://127.0.0.1:11434'),{
      method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(45000),
      body:JSON.stringify({model:process.env.OLLAMA_MODEL,stream:false,options:{num_predict:300},messages:[
        {role:'system',content:'Ты дипломат указанной державы в вымышленной альтернативной истории. Веди переговоры на русском с учётом даты, отношений и хода разговора. Дай краткий ответ от лица делегации. Можешь предложить условия. Игровые ресурсы и границы меняются только решениями игрока.'},
        {role:'user',content:JSON.stringify(context)}]})
    });
    if(!response.ok)throw Error();
    const answer=(await response.json()).message?.content;
    if(typeof answer!=='string'||!answer.trim())throw Error();
    return answer.trim().slice(0,2000);
  }catch{throw Object.assign(Error('Модель не ответила. Повторите сообщение или выберите ответы по правилам.'),{status:503});}
}
