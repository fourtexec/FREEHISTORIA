import {localOrder} from './shared/orders.js';
import {intervalOptions,planControls,bindPlan,setupBoardTools,showInvitation} from './strategy.js';
import {dateLabel} from './shared/calendar.js';
import {board,bindBoard} from './board.js';
import {actions, difficulties, objectives, nationName, yearName} from './shared/game.js';
import {worldAt,gameWorld} from './shared/world.js';
import {configure,apiUrl,freeOrders,roomRequest,requestId,account,saveSettings} from './store.js';
import {drawMap} from './map.js';
import {dossier} from './dossier.js';

export function multiplayer({main,catalog,esc,settings,openAccount,current}) {
  const $=id=>document.getElementById(id);
  const option=(value,label)=>'<option value="'+esc(value)+'">'+esc(label)+'</option>';
  const navigate=room=>{ location.hash='room/'+room.id; };
  function fillCountries(select,year,except=[],savedMap) {
    select.replaceChildren();
    const names=(savedMap?gameWorld(savedMap,catalog):worldAt(year,catalog)).nations.filter(n=>!except.includes(n)).sort((a,b)=>nationName(a).localeCompare(nationName(b),'ru'));
    for (const nation of names) select.add(new Option(nationName(nation),nation));
  }
  function onSubmit(id, task) {
    const form=$(id);
    form.onsubmit=async e=>{
      e.preventDefault();const button=form.querySelector('button[type=submit]')||form.querySelector('button');
      button.disabled=true; const error=form.querySelector('.error');error.textContent='';
      try {await task(form.elements);}
      catch(err){error.textContent=err.message;}
      finally{button.disabled=false;}
    };
  }
  function connectMessage(){
    main.innerHTML='<div class="heading"><h1>Мультиплеер</h1></div><section class="panel"><h2>Общий сервер</h2><p>Участники одной комнаты подключаются к одному API FreeHISTORIA.</p><button id="connect-room" class="primary">Подключить сервер</button></section>';
    $('connect-room').onclick=settings;
  }
  async function hub(invite='',suggested='',startYear){
    if (invite && suggested && suggested!==apiUrl()){
      main.innerHTML='<div class="heading"><h1>Приглашение в комнату</h1></div><form class="panel" id="invite-server"><label>Общий сервер<input name="address" readonly></label><p class="error"></p><button class="primary">Подключиться к серверу приглашения</button></form>';
      $('invite-server').elements.address.value=suggested;
      onSubmit('invite-server',async()=>{await configure(suggested);if(current())await hub(invite);});
      return;
    }
    if(!apiUrl()){connectMessage();return;}
    main.innerHTML=`<div class="heading"><h1>Мультиплеер</h1><p>Одна карта и общая летопись. Время продвигается после хода каждой державы.</p></div>
      <div class="room-forms"><form id="host-form" class="panel"><h2>Новая комната</h2>
      <label>Название комнаты<input name="title" maxlength="100"></label><label>Ваше имя<input name="name" maxlength="40" required></label><label>Стартовый год<input name="year" type="number" min="-999999" max="999999" value="1453" required></label>
      <label>Держава<select name="nation" required></select></label>
      <details class="seats"><summary>Правила сценария</summary><label>Начальная ситуация<textarea name="briefing" maxlength="1500"></textarea></label><label>Сложность<select name="difficulty">${Object.entries(difficulties).map(([v,[n]])=>option(v,n)).join('')}</select></label><label>Цель каждой державы<select name="objective">${Object.entries(objectives).map(([v,n])=>option(v,n)).join('')}</select></label></details>
      <label>Длительность раунда<select name="interval">${intervalOptions}</select></label><label>Видимость<select name="visibility"><option value="private">По приглашению</option><option value="public">Открыта для подбора</option></select></label>
      <label>Места<input name="capacity" type="number" min="2" max="16" value="6" required></label>
      <label>ИИ в комнате<select name="billing"><option value="free">Бесплатно, обычные действия</option><option value="host">Я оплачиваю ИИ всех игроков</option></select></label>
      <label id="ai-limit" hidden>Лимит платных запросов на всю партию<input name="aiLimit" type="number" min="1" max="1000" value="12"></label><p id="billing-info" class="hint"></p><p class="error" role="alert"></p><button class="primary">Создать комнату</button></form>
      <form id="join-form" class="panel"><h2>По приглашению</h2><label>Код комнаты<input name="invite" maxlength="18" required></label>
      <div id="join-fields" hidden><label>Ваше имя<input name="name" maxlength="40"></label><label>Свободная держава<select name="nation"></select></label></div>
      <p class="hint" id="join-info"></p><p class="error" role="alert"></p><button class="primary">Найти комнату</button></form></div>
      <section class="panel log"><h2>Открытые комнаты</h2><form id="match-form"><div class="match-fields">
      <label>С года<input type="number" name="minYear" placeholder="Любой"></label><label>По год<input type="number" name="maxYear" placeholder="Любой"></label>
      <label>Оплата ИИ<select name="billing"><option value="any">Любая</option><option value="free">Без ИИ</option><option value="host">Платит хозяин</option></select></label>
      <label>Свободных мест от<input type="number" name="seats" min="1" max="15" value="1" required></label></div>
      <div class="match-actions"><button type="submit" class="primary">Найти комнаты</button><button type="submit" value="random" class="primary">Случайная игра</button></div>
      <p class="error" role="alert"></p></form><div id="found-rooms" aria-live="polite"></div></section>
      <section class="panel log"><h2>Ваши комнаты</h2><div class="save-list" id="rooms-list">Загрузка…</div></section>`;
    const host=$('host-form').elements;
    host.difficulty.value='normal';
    if(account)host.name.value=account.username;
    const syncBilling=()=>{
      const paid=host.billing.value==='host';
      $('ai-limit').hidden=!paid;host.aiLimit.required=paid;
      $('billing-info').textContent=paid?'Каждый ИИ-приказ отправляется с вашим ключом по тарифу провайдера. Обычные ходы бесплатны.':'';
    };
    host.billing.onchange=syncBilling;syncBilling();
    if(Number.isInteger(startYear) && startYear && Math.abs(startYear)<=999999)host.year.value=startYear;
    const setYear=()=>{try{fillCountries(host.nation,host.year.valueAsNumber);}catch{host.nation.replaceChildren();}};
    host.year.oninput=setYear; setYear();
    if(new URLSearchParams(location.hash.split('?')[1]).get('scenario')==='1'){
      const scenario=JSON.parse(sessionStorage.getItem('fh.next-room')||'null');
      if(scenario&&scenario.year===host.year.valueAsNumber){
        for(const key of ['title','briefing','difficulty','objective'])host[key].value=scenario[key];
        if([...host.nation.options].some(o=>o.value===scenario.nation))host.nation.value=scenario.nation;
      }
    }
    const creationId=requestId();
    onSubmit('host-form',async f=>{
      if(!account){openAccount();return;}
      if(f.billing.value==='host' && !account?.provider)throw Error('Сначала сохраните личный ключ в настройках ИИ-провайдера.');
      navigate(await roomRequest('',{id:creationId,title:f.title.value,briefing:f.briefing.value,difficulty:f.difficulty.value,objective:f.objective.value,name:f.name.value,year:f.year.valueAsNumber,nation:f.nation.value,
        interval:f.interval.value,visibility:f.visibility.value,capacity:f.capacity.valueAsNumber,billing:f.billing.value,aiLimit:f.aiLimit.valueAsNumber}));
    });
    const join=$('join-form'), f=join.elements;
    if(account)f.name.value=account.username;
    const match=$('match-form'),mf=match.elements;
    for(const [key,val] of Object.entries(account?.settings.match||{}))mf.namedItem(key).value=val;
    let matchId=requestId();
    match.oninput=()=>{matchId=requestId();};
    match.onsubmit=async e=>{
      e.preventDefault();
      if(!account){openAccount();return;}
      const random=e.submitter?.value==='random',filters=Object.fromEntries(new FormData(match));
      filters.seats=Number(filters.seats);
      const error=match.querySelector('.error'),results=$('found-rooms');
      error.textContent='';results.replaceChildren();
      const buttons=[...match.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
      try{
        await saveSettings({match:filters});
        if(random){navigate(await roomRequest('/match',{requestId:matchId,filters}));return;}
        const rows=await roomRequest('/discover?'+new URLSearchParams(filters));
        if(!rows.length)results.textContent='По этим фильтрам пока нет комнат.';
        for(const row of rows){
          const b=document.createElement('button');b.type='button';
          b.textContent=(row.title?row.title+' · ':'')+row.host+' · '+yearName(row.year)+' · '+row.players+'/'+row.capacity+' · '+(row.billing==='host'?'ИИ оплачивает хозяин':'Без ИИ');
          b.onclick=()=>{resetJoin();f.invite.value=row.invite;join.requestSubmit();join.scrollIntoView({block:'center'});};results.append(b);
        }
      }catch(err){error.textContent=err.message;}finally{buttons.forEach(b=>b.disabled=false);}
    };
    function resetJoin(){
      $('join-fields').hidden=true;f.name.required=false;f.nation.required=false;
      join.querySelector('button').textContent='Найти комнату';$('join-info').textContent='';
    }
    f.invite.oninput=resetJoin;
    onSubmit('join-form',async f=>{
      const code=f.invite.value.trim();
      if(!$('join-fields').hidden){
        navigate(await roomRequest('/join',{invite:code,name:f.name.value,nation:f.nation.value}));return;
      }
      const target=await roomRequest('/preview',{invite:code});
      if(!current())return;
      if(target.requiresAccount && !account){openAccount();return;}
      if(target.joined){navigate(target);return;}
      if(target.phase!=='lobby')throw Error('Игра в этой комнате уже началась.');
      $('join-fields').hidden=false;f.name.required=true;f.nation.required=true;
      fillCountries(f.nation,target.startYear,target.nations,target);$('join-info').textContent='Старт · '+yearName(target.startYear);
      join.querySelector('button').textContent='Войти в комнату';
    });
    if(invite){f.invite.value=invite;join.requestSubmit();}
    const rooms=await roomRequest();
    if(!current())return;
    $('rooms-list').innerHTML=rooms.length?rooms.map(r=>'<a href="#room/'+esc(r.id)+'"><b>'+esc(r.title||nationName(r.nation))+'</b><span>'+yearName(r.year)+' · '+r.count+' игр.</span><strong>'+(r.phase==='lobby'?'Лобби':'Идёт игра')+'</strong></a>').join(''):'<p>Вы пока не состоите в комнатах.</p>';
  }
  async function room(id){
    if(!apiUrl()){connectMessage();return;}
    let state=await roomRequest('/'+id),busy=false;
    if(!current())return;
    async function send(op,body={}){
      busy=true;
      try{
        const next=await roomRequest('/'+id+'/'+op,{...body,revision:state.revision});
        if(current()){state=next;paint();}
      }finally{busy=false;}
    }
    let refreshChat;
    function paint(){
      const oldChat=main.querySelector('#diplomatic-form');
      const chat=oldChat && !oldChat.closest('section').hidden?{partner:oldChat.elements.partner.value,text:oldChat.elements.message.value}:null;
      const me=state.players[state.seat], active=state.players[state.active];
      const turn=state.phase==='playing' && state.active===state.seat;
      main.innerHTML='<div class="heading"><h1>'+ (state.phase==='lobby'?'Лобби кампании':'Совместная кампания')+'</h1><p>'+yearName(state.year)+' · Вы играете за '+esc(nationName(me.nation))+'</p></div>'+
        '<section class="panel"><h2>Участники</h2><ul class="roster">'+state.players.map((p,i)=>'<li><b>'+esc(p.name)+'</b> · '+esc(nationName(p.nation))+(i===state.seat?' (вы)':'')+(i===state.active&&state.phase==='playing'?' · ходит':'')+'</li>').join('')+'</ul><p id="room-status" role="status"></p></section>';
      const goal=state.objective&&state.objective!=='free'?'<p>Цель · '+esc(objectives[state.objective])+(me.achieved?' · выполнена':'')+'</p>':'';
      const policy=state.billing==='host'?'ИИ оплачивает хозяин · использовано запросов '+state.aiUsed+' из '+state.aiLimit:'Обычные действия бесплатны';
      if(state.phase==='lobby'){
        if(state.title)main.querySelector('h1').textContent=state.title;
        if(state.briefing||goal)$('room-status').insertAdjacentHTML('beforebegin','<p>'+esc(state.briefing)+'</p>'+goal);
        $('room-status').before(Object.assign(document.createElement('p'),{textContent:policy}));
        main.insertAdjacentHTML('beforeend','<section class="panel log"><h2>Приглашение</h2><label>Код комнаты<input readonly value="'+esc(state.invite)+'"></label><label>Ссылка для игроков на этом сервере<input id="invite-link" readonly></label><small>Сервер: '+esc(apiUrl())+'</small><p class="hint">После старта состав участников фиксируется.</p>'+
          (state.seat===0?'<form id="start-form"><p class="error"></p><button class="primary" '+(state.players.length<2?'disabled':'')+'>Начать игру</button></form>':'<p>Ожидаем старта игры.</p>')+'</section>');
        $('invite-link').value=location.href.split('#')[0]+'#join/'+state.invite+'?'+new URLSearchParams({server:apiUrl()});$('invite-link').onclick=e=>e.target.select();
        if(state.seat===0)onSubmit('start-form',()=>send('start'));
        return;
      }
      const world=worldAt(state.year,catalog);
      const stats=[['Казна',me.treasury],['Стабильность',me.stability],['Влияние',me.influence]].map(([k,v])=>'<div><small>'+k+'</small><strong>'+v+'</strong></div>').join('');
      const history='<ol>'+[...state.history].reverse().map(e=>'<li><time>'+dateLabel(e.date,e.year)+'</time><div><b>'+esc(nationName(e.nation))+'</b><p>'+esc(e.text)+'</p></div></li>').join('')+'</ol>'+(state.history.length?'':'<p>Первый раунд ещё идёт.</p>');
      const controls=goal+'<p>'+policy+'</p><p><b>'+(turn?'Ваш ход':'Ожидание хода')+'</b> · '+esc(active.name)+'</p>'+
        (turn?'<form id="room-turn"><label>Решение<select name="action">'+Object.entries(actions).map(([v,a])=>option(v,a.title)).join('')+option('local-order','Свой приказ · бесплатно')+((state.billing==='host' && !state.aiSent && state.aiUsed<state.aiLimit || !state.billing && freeOrders)?option('order','Свой приказ · ИИ'):'')+'</select></label><label id="room-target">Держава<select name="target"></select></label><label id="room-order">Приказ<textarea name="text" maxlength="1000"></textarea></label><p id="room-effect" class="hint"></p>'+planControls+'<p class="error"></p><button type="submit" class="primary">Передать ход</button></form>':'<p>Очередь обновляется автоматически.</p>')+
        '<details class="seats"><summary>Участники · '+state.players.length+'</summary><ul>'+state.players.map(p=>'<li>'+esc(p.name)+' · '+esc(nationName(p.nation))+'</li>').join('')+'</ul></details><p id="room-status" role="status"></p>';
      main.innerHTML=board({name:esc(nationName(me.nation)),date:dateLabel(state.date,state.year),summary:(state.title?esc(state.title)+' · ':'')+'Раунд '+(state.round+1),turn:controls,stats,history,room:true});
      const show=bindBoard(main);
      const game={...me,year:state.year,mapYear:state.mapYear,mapSource:state.mapSource,players:state.players};
      dossier($('room-dossier'),world,me.nation);
      let focus;
      const inspect=target=>{dossier($('room-dossier'),world,target);show('country');};
      refreshChat=setupBoardTools(main,{game:{...game,id},catalog,room:true,nations:gameWorld(state,catalog).nations,
        partners:state.players.filter(p=>p!==me).map(p=>p.nation),onFind:n=>{focus?.(n);inspect(n);}});
      if(chat){
        const form=$('diplomatic-form');form.elements.partner.value=chat.partner;form.elements.message.value=chat.text;show('chat');refreshChat();
      }
      drawMap($('room-map'),game,inspect).then(fn=>{focus=fn;}).catch(()=>{if(current())$('room-status').textContent='Карту не удалось загрузить.';});
      if(!turn)return;
      const f=$('room-turn').elements;
      const sync=()=>{
        const action=f.action.value,needs=['diplomacy','unite','local-order'].includes(action);
        $('room-target').hidden=!needs;f.target.required=needs&&action!=='local-order';
        $('room-order').hidden=!['order','local-order'].includes(action);f.text.required=!$('room-order').hidden;
        const used=state.players.flatMap(p=>p.members);
        if(action==='unite')used.push(...state.players.map(p=>p.nation));
        fillCountries(f.target,state.startYear,[...used,me.nation],state);
        $('room-effect').textContent=actions[action]?.detail||(action==='local-order'?'Напишите приказ о торговле, реформе, дипломатии, дорогах, академии, помощи или унии.':'ИИ предложит действие, которое проверит сервер.');
      };
      f.action.onchange=sync;sync();
      showInvitation($('room-turn'),me,esc);
      const planner=bindPlan($('room-turn'),'fh.room.plan.'+id+'.'+state.revision,()=>f.action.value==='local-order'?localOrder(f.text.value,f.target.value):{action:f.action.value,target:f.target.value,text:f.action.value==='order'?f.text.value:''});
      onSubmit('room-turn',async f=>{
        const revision=state.revision;
        const order=planner.order();
        if(!current()||revision!==state.revision)throw Error('Очередь хода изменилась.');
        try{await send('turns',order);planner.clear();}
        catch(err){
          if(order.action==='order' && state.billing==='host' && current()){
            const latest=await roomRequest('/'+id);
            if(current()){state=latest;paint();$('room-status').textContent=err.message;}
          }
          throw err;
        }
      });
    }
    paint();
    async function poll(){
      if(!current())return;
      try{
        if(!busy){
          const next=await roomRequest('/'+id+'?since='+state.revision);
          if(!current())return;
          if(next.revision>state.revision && next.players){state=next;paint();}
          await refreshChat?.();
          if(!current())return;
          if($('room-status').dataset.offline){$('room-status').textContent='';delete $('room-status').dataset.offline;}
        }
      }catch{if(current()){$('room-status').dataset.offline='1';$('room-status').textContent='Связь прервана. Повторное подключение…';}}
      if(current())setTimeout(poll,1600);
    }
    setTimeout(poll,1600);
  }
  return {hub,room};
}
