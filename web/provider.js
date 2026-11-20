import {buildPayload} from './shared/provider.js';
import {actions} from './shared/game.js';
import {gameWorld} from './shared/world.js';
import {relayRequest} from './store.js';

const storage='freehistoria.provider.v1';
export const provider=()=>JSON.parse(sessionStorage.getItem(storage)||'null');
const presets={
  chat:{url:'https://api.openai.com/v1/chat/completions',label:'Chat Completions / совместимый API'},
  anthropic:{url:'https://api.anthropic.com/v1/messages',label:'Anthropic Messages'},
  gemini:{url:'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',label:'Google Gemini'},
  custom:{url:'',label:'Произвольный JSON API'}
};
export function providerSettings(open,after) {
  const cfg=provider()||{type:'chat',url:presets.chat.url,transport:'direct'};
  open('Личный ИИ-провайдер',`<form id="provider-form">
    <label>Протокол<select name="type"></select></label><label>Адрес запроса<input name="url" required placeholder="https://…"></label>
    <label>Модель<input name="model" required placeholder="Идентификатор модели"></label>
    <label>Личный API-ключ<input name="key" type="password" required autocomplete="off"></label>
    <div id="custom-provider"><label>Заголовок ключа<input name="header"></label><label>Префикс ключа<input name="prefix"></label>
    <label>Тело запроса JSON<textarea name="template" rows="4"></textarea></label><small>{{prompt}} и {{model}} заменяются в строках JSON.</small>
    <label>Путь к тексту в ответе<input name="path"></label></div>
    <label>Соединение<select name="transport"><option value="direct">Напрямую из браузера</option><option value="relay">Через подключённый игровой сервер</option></select></label>
    <p class="hint">Ключ хранится до закрытия вкладки. В режиме сервера ключ передаётся ему для запроса к провайдеру. Оплату определяет ваш тариф.</p>
    <p class="error" role="alert"></p><button class="primary">Сохранить провайдера</button><button type="button" id="forget-key" class="text-action">Удалить ключ</button></form>`);
  const form=document.querySelector('#provider-form'),f=form.elements;
  for(const [key,preset] of Object.entries(presets))f.type.add(new Option(preset.label,key));
  const defaults={header:'Authorization',prefix:'Bearer',template:'{"model":"{{model}}","prompt":"{{prompt}}"}',path:'text',...cfg};
  for(const [k,v] of Object.entries(defaults)) if(f.namedItem(k))f.namedItem(k).value=v;
  const custom=document.querySelector('#custom-provider');
  const sync=()=>{custom.hidden=f.type.value!=='custom';};
  f.url.addEventListener('input',()=>{if(cfg.url && f.url.value!==cfg.url && f.key.value===cfg.key)f.key.value='';});
  sync();f.type.onchange=()=>{f.url.value=presets[f.type.value].url;f.key.value='';sync();};
  document.querySelector('#forget-key').onclick=()=>{sessionStorage.removeItem(storage);after();};
  form.onsubmit=e=>{
    e.preventDefault();
    try{const input=Object.fromEntries(new FormData(form));buildPayload(input,'Проверка формата');sessionStorage.setItem(storage,JSON.stringify(input));after();}
    catch{form.querySelector('.error').textContent='Проверьте адрес, JSON и заголовок ключа.';}
  };
}
export async function resolvePersonalOrder(game,order,catalog) {
  const cfg=provider();
  if(order.action!=='order' || !cfg)return order;
  if (!order.text?.trim() || order.text.length>1000)throw Error('Введите приказ длиной до 1000 символов.');
  const targets=gameWorld(game,catalog).nations.filter(n=>n!==game.nation && !game.members.includes(n));
  const prompt='Историческая стратегия. Верни только JSON {"action":"trade|reform|diplomacy|unite","target":"имя державы"}. Выбери одно действие, для дипломатии и унии используй имя из списка targets. '+JSON.stringify({nation:game.nation,year:game.year,treasury:game.treasury,stability:game.stability,relations:game.relations,targets,order:order.text});
  const {url,headers,body,path}=buildPayload(cfg,prompt);
  let result;
  if(cfg.transport==='relay')result=await relayRequest({url,headers,body});
  else{
    let res;
    try {res=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),redirect:'error',credentials:'omit',signal:AbortSignal.timeout(55000)});}
    catch{throw Error('Нет ответа провайдера. Проверьте адрес и CORS или выберите соединение через сервер.');}
    if(!res.ok)throw Error('Провайдер вернул HTTP '+res.status+'. Проверьте модель, ключ и лимиты.');
    result=await res.json();
  }
  try{
    const raw=path.split('.').filter(Boolean).reduce((obj,key)=>obj?.[key],result);
    const answer=typeof raw==='string'?JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g,'')):raw;
    if(typeof answer?.action!=='string' || !Object.hasOwn(actions,answer.action))throw Error();
    return {...order,action:answer.action,target:answer.target};
  }catch{throw Error('Провайдер не вернул распознаваемое игровое действие. Проверьте формат ответа.');}
}
