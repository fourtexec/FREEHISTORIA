import {buildPayload} from './shared/provider.js';
import {orderPrompt,parseOrder} from './shared/orders.js';
import {relayRequest,account,saveSettings,accountOrder} from './store.js';

const storage='freehistoria.provider.v1';
export const provider=()=>account?account.provider:JSON.parse(sessionStorage.getItem(storage)||'null');
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
    <p class="hint">${account?'Настройки синхронизируются с аккаунтом. Ключ шифруется на сервере. Для замены настроек введите ключ снова.':'Ключ хранится в этой вкладке. Войдите в аккаунт, чтобы сохранять настройки между устройствами.'}</p>
    <p class="error" role="alert"></p><button class="primary">Сохранить провайдера</button><button type="button" id="forget-key" class="text-action">Удалить ключ</button></form>`);
  const form=document.querySelector('#provider-form'),f=form.elements;
  for(const [key,preset] of Object.entries(presets))f.type.add(new Option(preset.label,key));
  const defaults={header:'Authorization',prefix:'Bearer',template:'{"model":"{{model}}","prompt":"{{prompt}}"}',path:'text',...cfg};
  for(const [k,v] of Object.entries(defaults)) if(f.namedItem(k))f.namedItem(k).value=v;
  const custom=document.querySelector('#custom-provider');
  const sync=()=>{custom.hidden=f.type.value!=='custom';};
  f.url.addEventListener('input',()=>{if(cfg.url && f.url.value!==cfg.url && f.key.value===cfg.key)f.key.value='';});
  sync();f.type.onchange=()=>{f.url.value=presets[f.type.value].url;f.key.value='';sync();};
  if(account){f.transport.value='relay';f.transport.disabled=true;}
  document.querySelector('#forget-key').onclick=async()=>{
    try{if(account)await saveSettings({provider:null});else sessionStorage.removeItem(storage);after();}
    catch(err){form.querySelector('.error').textContent=err.message;}
  };
  form.onsubmit=async e=>{
    e.preventDefault();
    try{
      const input=Object.fromEntries(new FormData(form));buildPayload(input,'Проверка формата');
      if(account)await saveSettings({provider:input});else sessionStorage.setItem(storage,JSON.stringify(input));
      after();
    }catch(err){form.querySelector('.error').textContent=err.message;}
  };
}
export async function resolvePersonalOrder(game,order,catalog) {
  const cfg=provider();
  if(order.action!=='order' || !cfg)return order;
  if(account)return {...order,...await accountOrder(game,order)};
  const prompt=orderPrompt(game,order,catalog);
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
  return {...order,...parseOrder(result,path)};
}
