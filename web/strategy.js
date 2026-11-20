import {missionByType} from './shared/envoys.js';
import {actions,nationName} from './shared/game.js';
import {intervals} from './shared/calendar.js';
import {conversation,freeOrders,remoteGames} from './store.js';

export const intervalOptions=Object.entries(intervals).map(([key,name])=>'<option value="'+key+'" '+(key==='year'?'selected':'')+'>'+name+'</option>').join('');

export const planControls='<ol class="order-list" data-orders></ol><button type="button" class="secondary" data-add>Добавить в план</button>';
export function bindPlan(form,key,getOrder){
  const list=form.querySelector('[data-orders]'),add=form.querySelector('[data-add]');
  let orders=JSON.parse(sessionStorage.getItem(key)||'[]');
  function render(){
    list.replaceChildren();
    orders.forEach((o,i)=>{
      const li=document.createElement('li'),remove=document.createElement('button');
      li.textContent=actions[o.action].title+(['unite','diplomacy'].includes(o.action)?' · '+nationName(o.target):'');
      remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Убрать решение '+(i+1));
      remove.onclick=()=>{orders.splice(i,1);render();};li.append(remove);list.append(li);
    });
    sessionStorage.setItem(key,JSON.stringify(orders));
    add.disabled=orders.length>=6;
  }
  add.onclick=()=>{
    const error=form.querySelector('.error');
    let order;
    try{order=getOrder();}catch(e){error.textContent=e.message;return;}
    if(order.action==='order'){error.textContent='ИИ-приказ отправляется отдельным ходом.';return;}
    if(['unite','diplomacy'].includes(order.action)&&!order.target){error.textContent='Выберите державу.';return;}
    error.textContent='';orders.push({action:order.action,target:order.target,...(order.text?{text:order.text}:{})});render();
  };
  render();
  return {
    order(){
      if(orders.length && form.querySelector('select[name=action],#action')?.value==='order')throw Error('Отправьте план обычных действий или очистите его для ИИ-приказа.');
      return orders.length?{action:'plan',orders}:getOrder();
    },
    clear(){sessionStorage.removeItem(key);}
  };
}

export function setupBoardTools(root,{game,catalog,partners,nations,onFind,room=false}){
  const form=root.querySelector('#diplomatic-form'),select=form.elements.partner,log=form.querySelector('.transcript');
  const error=form.querySelector('.error');
  const order=(a,b)=>nationName(a).localeCompare(nationName(b),'ru');
  for(const n of [...partners].sort(order))select.add(new Option(nationName(n),n));
  form.querySelector('button').disabled=!select.length;
  if(!select.length)error.textContent='Нет доступных собеседников.';
  let model;
  if(!room&&freeOrders&&remoteGames()){
    const label=document.createElement('label');label.textContent='Ответы делегации';
    model=document.createElement('select');model.add(new Option('По правилам игры','rules'));model.add(new Option('Модель Ollama на сервере','ollama'));
    label.append(model);log.before(label);
  }
  let request=0,loading=false;
  async function update(text){
    if(!select.value)return;
    const revision=++request,partner=select.value;
    const entries=await conversation(game,partner,catalog,text,room,model?.value==='ollama');
    if(revision!==request||!form.isConnected)return;
    const fragment=document.createDocumentFragment();
    for(const entry of entries){
      const p=document.createElement('p'),who=document.createElement('b');
      who.textContent=entry.sender===game.nation?'Вы':nationName(entry.sender);
      p.append(who,document.createTextNode(entry.text));fragment.append(p);
    }
    const atEnd=log.scrollHeight-log.scrollTop-log.clientHeight<5;
    log.replaceChildren(fragment);
    if(atEnd||text)log.scrollTop=log.scrollHeight;
  }
  function refresh(){
    if(loading||!form.isConnected||form.closest('section').hidden)return;
    return update().catch(e=>{if(form.isConnected)error.textContent=e.message;});
  }
  select.onchange=()=>{log.replaceChildren();error.textContent='';refresh();};
  root.querySelector('[data-sheet=chat]').addEventListener('click',refresh);
  form.onsubmit=async e=>{
    e.preventDefault();if(loading)return;
    loading=true;const btn=form.querySelector('button');btn.disabled=true;select.disabled=true;
    try{await update(form.elements.message.value);form.elements.message.value='';error.textContent='';}
    catch(e){error.textContent=e.message;}finally{loading=false;btn.disabled=false;select.disabled=false;}
  };
  const search=root.querySelector('#nation-search'),results=root.querySelector('#nation-results');
  const sorted=[...nations].sort(order);
  function filter(){
    const term=search.value.trim().toLocaleLowerCase('ru');results.replaceChildren();
    for(const n of sorted.filter(n=>(nationName(n)+' '+n).toLocaleLowerCase('ru').includes(term)).slice(0,30)){
      const b=document.createElement('button');b.type='button';b.textContent=nationName(n);b.onclick=()=>onFind(n);results.append(b);
    }
    if(!results.childElementCount)results.textContent='Держава не найдена.';
  }
  search.oninput=filter;filter();
  return refresh;
}

export function showInvitation(form,game,esc){
  const invite=game.invitation,mission=missionByType(invite?.type);
  const select=form.querySelector('#action,select[name=action]');
  const option=select.querySelector('[value=invitation]');
  if(!mission){option?.remove();return;}
  const message=document.createElement('aside');message.className='envoy';
  message.innerHTML='<b>'+esc(mission.title)+'</b><p>'+esc(nationName(invite.nation))+' '+mission.request+'.</p><small>Взнос '+mission.cost+' · Доход '+mission.returns+' · Влияние +'+mission.influence+' · Стабильность +'+mission.stability+'</small>';
  form.prepend(message);
}
