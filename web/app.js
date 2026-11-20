import {localOrder} from './shared/orders.js';
import {workshop} from './workshop.js';
import {dateLabel} from './shared/calendar.js';
import {intervalOptions,planControls,bindPlan,setupBoardTools,showInvitation} from './strategy.js';
import {accountDialog} from './account.js';
import {account,restoreAccount,applyTheme,setTheme,theme} from './store.js';
import {board,bindBoard} from './board.js';
import {multiplayer} from './multiplayer.js';
import {provider,providerSettings,resolvePersonalOrder} from './provider.js';
import {worldAt,gameWorld} from './shared/world.js';
import {dossier} from './dossier.js';
import { actions, difficulties, objectives, mapYearFor, nationName, scenarios, validateYear, yearName } from './shared/game.js';
import { requestId as makeId, apiUrl, configure, createGame, freeOrders, refreshCapabilities, initStore, listGames, nextTurn, readGame } from './store.js';
import { icon } from './icons.js';
import { drawMap } from './map.js';

const $ = id => document.getElementById(id);
const main = $('main'), dialog = $('dialog');
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalog, activePage, renderId = 0, status = 'local', messageTimer;
const navItems = [['games','games','Игры'],['home','play','Сценарии'],['atlas','layers','Атлас'],['multi','people','Мультиплеер']];
function notify(message) {
  clearTimeout(messageTimer);
  $('notice').textContent = message; $('notice').classList.add('on');
  messageTimer = setTimeout(()=>$('notice').classList.remove('on'),5000);
}
function dialogBody(title, content) {
  dialog.innerHTML = '<div class="dialog-head"><h2>'+title+'</h2><button class="icon-btn" id="close" aria-label="Закрыть">'+icon('close')+'</button></div>'+content;
  $('close').onclick = ()=>dialog.close();
  if (!dialog.open) dialog.showModal();
}
function chrome(page) {
  const current=({room:'multi',join:'multi',game:'games'})[page]||page;
  document.body.dataset.page=page;
  $('topbar').innerHTML='<a class="brand" href="#welcome"><i>'+icon('globe',23)+'</i> FreeHISTORIA</a><nav class="main-nav" aria-label="Главная навигация">'+navItems.map(([key,ic,label])=>'<a href="#'+key+'" '+(current===key?'aria-current="page"':'')+'>'+icon(ic,17)+'<span>'+label+'</span></a>').join('')+'</nav><div class="tools"><button id="account-menu" class="account-pill">'+esc(account?.username||'Войти')+'</button><button id="connection" class="status"><i class="'+status+'"></i>'+({local:'Локальная игра',online:'API подключён',offline:'API недоступен',checking:'Проверка API'}[status])+'</button><details class="settings-menu"><summary aria-label="Параметры игры">'+icon('sliders')+'</summary><div><button id="ai-settings">ИИ-провайдер</button><button id="theme-switch">Сменить тему</button><button id="settings">Подключение</button><button id="about">О проекте</button></div></details></div>';
  $('account-menu').onclick=openAccount;
  $('theme-switch').onclick=async()=>{try{await setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');}catch(e){notify(e.message);}};
  $('ai-settings').onclick=()=>providerSettings(dialogBody,()=>{dialog.close();route();notify('Настройки ИИ обновлены.');});
  $('settings').onclick = ()=>settings(); $('connection').onclick = ()=>settings();
  $('about').onclick = ()=>dialogBody('О проекте','<p>FreeHISTORIA — бесплатная пошаговая стратегия на основе Open Historia. Выберите год и державу, принимайте решения и ведите летопись своей кампании.</p><p>Календарь и модель территориальных событий предоставлены Open Historia. Датированные границы предоставлены Cliopatria, обзорные карты — Historical Basemaps. Карты 2025 и 2026 годов используют Geo Countries и Country Boundary Map. Современные регионы взяты из Country State City. Сведения о правителях предоставляет Wikidata. Живопись и карта Ортелия представлены в собрании Wikimedia Commons.</p><div class="resource-links"><a href="./CREDITS.md">Авторы и источники ↗</a><a href="./freehistoria-source.tar.gz" download>Скачать исходный код</a><a href="./LICENSE">Лицензия AGPL-3.0</a></div>');

}
async function connectionStatus() {
  const url = apiUrl();
  if (url) {
    try { await refreshCapabilities(); if (url===apiUrl()) status='online'; } catch { if (url===apiUrl()) status='offline'; }
  } else status='local';
  chrome(activePage);
  if ((freeOrders || provider()) && $('action') && !$('action').querySelector('[value="order"]')) $('action').add(new Option('Свой приказ · ИИ','order'));
}
function openAccount(){
  accountDialog({open:dialogBody,settings:()=>settings(true),done:()=>{dialog.close();applyTheme();route();}});
}
function welcome(){
  main.innerHTML='<section class="welcome"><div class="welcome-copy"><h1>Добро пожаловать в FreeHISTORIA</h1><p>Игра-песочница альтернативной истории</p><a class="welcome-start" href="#home">Начать '+icon('arrow',18)+'</a></div><img class="welcome-earth" src="./assets/welcome-earth.webp" alt=""></section>';
}
function settings(forLogin=false) {
  dialogBody('Настройки подключения','<form id="settingsForm"><label for="mode">Игровой сервер</label><select id="mode"><option value="local">Без подключения</option><option value="server">Подключить API FreeHISTORIA</option></select><div id="apiField"><label for="url">Адрес API</label><input id="url" type="url" placeholder="https://api.example.org" value="'+esc(apiUrl())+'"></div><p class="hint">Для аккаунтов и мультиплеера нужен адрес общего API. Одиночная игра доступна и без подключения.</p><p class="error" role="alert"></p><button class="primary">Сохранить настройки '+icon('arrow')+'</button></form>');
  $('mode').value = apiUrl()||forLogin===true?'server':'local';
  const sync = ()=>{ $('apiField').hidden = $('mode').value==='local'; $('url').required = !$('apiField').hidden; $('url').disabled=$('apiField').hidden; };
  $('mode').onchange=sync; sync();
  $('settingsForm').onsubmit = async e=>{
    e.preventDefault(); const btn=e.target.querySelector('button'); btn.disabled=true;
    try {
      await configure($('mode').value==='local'?'':$('url').value.trim());
      status = apiUrl()?'online':'local'; dialog.close(); if(forLogin===true && apiUrl()){openAccount();connectionStatus();return;} if(!['multi','join'].includes(activePage)) location.hash='home'; await route(); notify('Настройки сохранены.');
    } catch(err) { dialog.querySelector('.error').textContent = err.message==='Failed to fetch'?'Проверьте адрес, доступность API и разрешённый источник панели.':err.message; }
    finally {btn.disabled=false;}
  };
}
const heading = (title, description) => '<div class="heading"><h1>'+title+'</h1><p>'+description+'</p></div>';
const arrow = icon('arrow',17);
function home(startYear) {
  const presets=[...scenarios,{year:2025,title:'Мир в 2025 году',era:'Современность'},{year:2026,title:'Мир в 2026 году',era:'Современность'}];
  let featured=presets.findIndex(s=>s.year===(startYear||1453));
  if(featured<0)featured=1;
  main.innerHTML='<section class="feature" aria-label="Выбор сценария"><div id="featureArt"></div><div class="feature-copy"><p id="featureEra"></p><h1 id="featureTitle"></h1><p id="featureDesc"></p><form id="heroForm"><label for="heroYear">Стартовый год</label><div><input id="heroYear" type="number" min="-999999" max="999999" step="1" required><button class="feature-play">'+icon('play',15)+' Играть</button></div></form></div><div class="feature-controls"><button id="prevFeature" aria-label="Предыдущий сценарий">'+icon('back')+'</button><button id="nextFeature" aria-label="Следующий сценарий">'+icon('chevron')+'</button></div></section><section class="catalog"><div class="section-head"><h2>Исторические сценарии</h2><a href="#atlas">'+icon('globe',15)+' Открыть атлас</a></div><div class="filters" role="group" aria-label="Фильтр эпох"></div><div class="cards"></div></section>';
  function feature(offset=0) {
    featured=(featured+offset+presets.length)%presets.length;
    const preset=presets[featured];
    const art=$('featureArt');
    art.replaceChildren();
    art.style.backgroundImage=preset.image?'url("./assets/'+preset.image+'.webp")':'none';
    if(!preset.image)preview(art,preset.year);
    $('featureEra').textContent=preset.era+' · '+yearName(preset.year);
    $('featureTitle').textContent=preset.title;
    $('featureDesc').textContent=preset.description||'Выберите страну на политической карте мира и начните кампанию.';
    $('heroYear').value=preset.year;
  }
  function preview(parent,year){
    const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');parent.append(canvas);
    drawMap(canvas,{mapYear:year,mapSource:'modern'},null).catch(()=>canvas.remove());
  }
  function filter(era){
    const cards=main.querySelector('.cards');
    cards.replaceChildren();
    for(const preset of presets.filter(s=>!era||s.era===era)){
      const tile=document.createElement('button');tile.className='card '+(preset.image||'modern');
      tile.innerHTML='<div class="card-picture"></div><h3>'+esc(preset.title)+'</h3><p>'+esc(preset.era)+' · '+yearName(preset.year)+'</p>';
      const picture=tile.firstElementChild;
      if(preset.image)picture.innerHTML='<img alt="" src="./assets/'+preset.image+'.webp">';
      else preview(picture,preset.year);
      tile.onclick=()=>setup(preset.year,preset.nation,preset);cards.append(tile);
    }
    for(const b of main.querySelectorAll('[data-era]'))b.setAttribute('aria-pressed',String(b.dataset.era===era));
  }
  for(const era of ['',...new Set(presets.map(s=>s.era))]){
    const button=document.createElement('button');button.textContent=era||'Все эпохи';button.dataset.era=era;
    button.onclick=()=>filter(era);main.querySelector('.filters').append(button);
  }
  feature();filter('');workshop({main,esc,open:dialogBody,setup});
  if(startYear)$('heroYear').value=startYear;
  $('prevFeature').onclick=()=>feature(-1);$('nextFeature').onclick=()=>feature(1);
  $('heroForm').onsubmit=e=>{e.preventDefault();const y=$('heroYear').valueAsNumber;try{validateYear(y);setup(y,presets.find(p=>p.year===y)?.nation,presets.find(p=>p.year===y));}catch(err){$('heroYear').setCustomValidity(err.message);$('heroYear').reportValidity();}};
  $('heroYear').oninput=e=>e.target.setCustomValidity('');
}
function nationOptions(year, game) {
  const items = (game?gameWorld(game,catalog):worldAt(year,catalog)).nations.filter(n=>!game || (n!==game.nation && !game.members.includes(n)));
  return items.map(id=>({id,name:nationName(id)})).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
}
const options = list=>list.map(({id,name})=>'<option value="'+esc(id)+'">'+esc(name)+'</option>').join('');
function setup(year, preferred, preset) {
  const requestId=makeId(),initialTitle=preset?.title||'';
  dialogBody(esc(initialTitle||'Новая кампания'),'<form id="createForm"><section id="choose-country"><p>'+esc(preset?.description||'Выберите стартовую дату и державу на карте.')+'</p><label for="start">Стартовый год</label><input id="start" type="number" value="'+year+'" min="-999999" max="999999" step="1" required><canvas id="choose-map" aria-label="Выбор державы на карте"></canvas><div class="filters" id="country-tabs"></div><input type="search" id="country-search" aria-label="Поиск державы" placeholder="Поиск по названию"><label for="nation">Ваша держава</label><select id="nation"></select><input id="custom" placeholder="Название своей державы" aria-label="Название своей державы" maxlength="100" hidden><p id="snapshot" class="hint"></p></section><section id="choose-rules" hidden><label for="game-title">Название кампании</label><input id="game-title" maxlength="100"><label for="difficulty">Сложность</label><select id="difficulty">'+Object.entries(difficulties).map(([id,[name]])=>'<option value="'+id+'">'+name+'</option>').join('')+'</select><small id="resources"></small><button type="button" id="back-country" class="secondary">Изменить державу</button><button type="button" class="secondary" id="setup-room">Играть с другими</button></section><p class="error" role="alert"></p><button type="submit" class="primary">Продолжить '+arrow+'</button></form>');
  const form=$('createForm'),next=form.querySelector('[type=submit]'),error=form.querySelector('.error');
  let mode='suggested',choices=[],pick=preferred,step=1;
  const tabs=[['suggested','Рекомендуемые'],['all','Все державы'],['custom','Своя держава']];
  function fill(){
    const query=$('country-search').value.trim().toLocaleLowerCase('ru');
    const featured=(worldAt($('start').valueAsNumber,catalog).records||[]).slice().sort((a,b)=>(b.area||0)-(a.area||0)).slice(0,8).map(c=>c.nation);
    const short=[preferred,...featured,...choices.slice(0,8).map(c=>c.id)].filter(Boolean).slice(0,9);
    const items=choices.filter(c=>(mode==='all'||short.includes(c.id)) && (c.name+' '+c.id).toLocaleLowerCase('ru').includes(query));
    $('nation').innerHTML=options(items);
    if(items.some(c=>c.id===pick))$('nation').value=pick;
    $('nation').disabled=mode==='custom';$('nation').hidden=mode==='custom';$('custom').hidden=mode!=='custom';$('country-search').hidden=mode!=='all';
    for(const b of $('country-tabs').children)b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
  }
  for(const [key,label] of tabs){
    const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.mode=key;
    b.onclick=()=>{mode=key;$('country-search').value='';update(false);};$('country-tabs').append(b);
  }
  function update(map=true){
    try{
      const y=$('start').valueAsNumber,world=worldAt(y,catalog);
      choices=nationOptions(y);if(!choices.length)mode='custom';
      if(mode==='suggested'&&pick===preferred&&preferred&&!choices.some(c=>c.id===preferred)){mode='custom';$('custom').value=preferred;}
      fill();
      if(map){
        const canvas=$('choose-map').cloneNode();$('choose-map').replaceWith(canvas);
        drawMap(canvas,world,n=>{if(!canvas.isConnected)return;mode='all';pick=n;$('country-search').value='';fill();}).catch(()=>canvas.hidden=true);
      }
      $('snapshot').textContent=(world.provenance?world.provenance.mapLabel:world.mapSource==='cliopatria'?'Датированные территории Cliopatria':'Ближайшая обзорная карта')+' · '+yearName(world.mapYear);
      error.textContent='';return true;
    }catch(e){error.textContent=e.message;return false;}
  }
  $('start').onchange=()=>update();$('nation').onchange=e=>pick=e.target.value;$('country-search').oninput=()=>update(false);update();
  $('difficulty').value=preset?.difficulty||'normal';
  const resources=()=>{const [,gold,stability]=difficulties[$('difficulty').value];$('resources').textContent='На старте · казна '+gold+', стабильность '+stability+' из 100.';};
  $('difficulty').onchange=resources;resources();
  $('setup-room').onclick=()=>{
    const selected={year:$('start').valueAsNumber,nation:mode==='custom'?$('custom').value:$('nation').value,title:$('game-title').value,difficulty:$('difficulty').value,objective:preset?.objective||'free',briefing:preset?.description||''};
    sessionStorage.setItem('fh.next-room',JSON.stringify(selected));dialog.close();location.hash='multi/'+selected.year+'?scenario=1';
  };
  $('back-country').onclick=()=>{step=1;$('choose-country').hidden=false;$('choose-rules').hidden=true;next.textContent='Продолжить →';};
  form.onsubmit=async e=>{
    e.preventDefault();if(next.disabled||!dialog.open)return;error.textContent='';
    if(step===1&&!update(false))return;
    const nation=mode==='custom'?$('custom').value.trim():$('nation').value;
    if(!nation){error.textContent='Укажите державу.';return;}
    if(step===1){
      step=2;$('choose-country').hidden=true;$('choose-rules').hidden=false;
      if(!$('game-title').value)$('game-title').value=initialTitle||nationName(nation)+' · '+yearName($('start').valueAsNumber);
      next.textContent='Начать кампанию';$('game-title').focus();return;
    }
    next.disabled=true;
    try{
      const game=await createGame({id:requestId,year:$('start').valueAsNumber,nation,title:$('game-title').value,difficulty:$('difficulty').value,briefing:preset?.description||'',objective:preset?.objective||'free'},catalog);
      dialog.close();location.hash='game/'+game.id;
    }catch(e){error.textContent=e.message;}finally{next.disabled=false;}
  };
}
async function games(version) {
  main.innerHTML=heading('Мои кампании','Продолжайте игру с последнего сохранённого хода.')+'<div id="saves">Загрузка…</div>';
  const saved=await listGames();if(version!==renderId)return;
  if(!saved.length){$('saves').innerHTML='<div class="empty">'+icon('archive',32)+'<h2>Пока нет кампаний</h2><a class="primary" href="#home">Выбрать сценарий '+arrow+'</a></div>';return;}
  $('saves').innerHTML='<div class="library-controls"><input type="search" id="game-search" aria-label="Поиск кампаний" placeholder="Название или держава"><select id="sort-games" aria-label="Сортировка"><option value="updated">Недавно сыгранные</option><option value="turns">Больше всего ходов</option></select></div><div class="save-list" id="game-list"></div>';
  function filter(){
    const term=$('game-search').value.trim().toLocaleLowerCase('ru');
    const rows=saved.filter(g=>[g.title,nationName(g.nation),g.nation].join(' ').toLocaleLowerCase('ru').includes(term));
    if($('sort-games').value==='turns')rows.sort((a,b)=>b.turn-a.turn);
    $('game-list').innerHTML=rows.map(g=>'<a href="#game/'+encodeURIComponent(g.id)+'"><span class="tile-icon">'+icon('flag')+'</span><div><b>'+esc(g.title||nationName(g.nation))+'</b><small>'+esc(nationName(g.nation))+' · Старт '+yearName(g.startYear)+' · Ход '+g.turn+'</small></div><strong>'+dateLabel(g.date,g.year)+'</strong>'+arrow+'</a>').join('')||'<p>Кампании не найдены.</p>';
  }
  $('game-search').oninput=filter;$('sort-games').onchange=filter;filter();
}
function atlas(startYear) {
  main.innerHTML=heading('Атлас мира','Выберите год, чтобы изучить территории, правителей и состав государств.')+'<section class="panel"><form class="inline-form" id="atlasForm"><label for="atlasYear">Год карты</label><input type="number" id="atlasYear" value="1453" min="-999999" max="999999" required><button class="primary">Показать</button></form><div id="atlasMap"></div></section>';
  if (startYear) $('atlasYear').value=startYear;
  let query=0;
  const render=async()=>{
    const ticket=++query;
    try {
      const year=$('atlasYear').valueAsNumber;const world=worldAt(year,catalog);const mapYear=world.mapYear;
      $('atlasMap').innerHTML='<h3>'+(world.provenance?esc(world.provenance.mapLabel)+' · ':world.mapSource==='cliopatria'?'Cliopatria · ':'Ближайший срез · ')+yearName(mapYear)+'</h3><canvas id="map" aria-label="Карта мира"></canvas><p id="mapName" class="hint">Выберите территорию на карте.</p><label for="atlasNation">Территории среза</label><select id="atlasNation">'+options(nationOptions(year))+'</select><div id="atlas-dossier" class="dossier"></div>';
      const show=(id,name)=>{if(ticket===query && $('atlasNation')){$('atlasNation').value=id;$('mapName').textContent=name;dossier($('atlas-dossier'),world,id);}};
      $('atlasNation').onchange=e=>show(e.target.value,nationName(e.target.value));
      const initial=scenarios.find(s=>s.year===year)?.nation || $('atlasNation').value;
      show(initial,nationName(initial));
      await drawMap($('map'),{mapYear,mapSource:world.mapSource,nation:null},show);
    }catch(err){notify(err.message);}
  };
  $('atlasForm').onsubmit=e=>{e.preventDefault();render();};render();
}
async function campaign(id,version) {
  main.innerHTML='<p>Загрузка кампании…</p>';
  const game=await readGame(id);if(version!==renderId)return;
  const name=esc(nationName(game.nation));
  const turn='<form id="turnForm" ><p class="hint">Решение на '+yearName(game.year)+'</p><label for="action">Действие</label><select id="action">'+Object.entries(actions).map(([key,a])=>'<option value="'+key+'">'+a.title+'</option>').join('')+'<option value="local-order">Свой приказ · бесплатно</option>'+((freeOrders||provider())?'<option value="order">Свой приказ · ИИ</option>':'')+'</select><textarea id="orderText" aria-label="Свободный приказ" maxlength="1000" rows="4" placeholder="Ваш приказ…" hidden></textarea><p class="hint" id="effect"></p><div id="targetField"><label for="target">Держава</label><select id="target">'+options(nationOptions(game.startYear,game))+'</select><small id="relation"></small></div>'+planControls+'<label>Продвинуть время<select id="interval">'+intervalOptions+'</select></label><p class="error" role="alert"></p><button type="submit" class="primary">Завершить ход '+arrow+'</button></form>';
  const stats=[['Казна',game.treasury],['Стабильность',game.stability],['Влияние',game.influence],['Дороги',game.roads||0],['Академии',game.academies||0]].map(([l,n])=>'<div><small>'+l+'</small><strong>'+n+'</strong></div>').join('');
  const history=(game.briefing?'<p>'+esc(game.briefing)+'</p>':'')+(game.objective&&game.objective!=='free'?'<p><b>Цель · '+esc(objectives[game.objective])+'</b>'+(game.achieved?' · выполнена':'')+'</p>':'')+'<ol>'+[...game.history].reverse().map(e=>'<li><time>'+dateLabel(e.date,e.year)+'</time><div><b>'+esc(actions[e.action]?.title)+'</b>'+(e.order?'<p>«'+esc(e.order)+'»</p>':'')+'<p>'+esc(e.text)+'</p></div></li>').join('')+'<li><time>'+yearName(game.startYear)+'</time><div><b>Начало кампании</b><p>Вы возглавили державу «'+name+'».</p></div></li></ol>';
  main.innerHTML=board({name,date:dateLabel(game.date,game.year),summary:(game.title?esc(game.title)+' · ':'')+'Ход '+game.turn,turn,stats,history});
  const show=bindBoard(main);
  const sync=()=>{const action=$('action').value;$('orderText').hidden=!['local-order','order'].includes(action);$('orderText').required=!$('orderText').hidden;$('effect').textContent=actions[action]?.detail || (action==='local-order'?'Движок распознаёт торговлю, реформы, дипломатию, унию, дороги, академии и помощь жителям.':'Модель истолкует приказ как торговлю, реформу, посольство или унию.');$('targetField').hidden=!['diplomacy','unite','local-order'].includes(action);$('relation').textContent='Текущие отношения · '+(game.relations.find(r=>r.nation===$('target').value)?.value ?? 25)+' / 100';};
  $('action').onchange=sync;$('target').onchange=sync;sync();
  showInvitation($('turnForm'),game,esc);
  const getOrder=()=>$('action').value==='local-order'?localOrder($('orderText').value,$('target').value):{action:$('action').value,target:$('target').value,text:$('action').value==='order'?$('orderText').value:''};
  const planner=bindPlan($('turnForm'),'fh.plan.'+id+'.'+game.turn,getOrder);
  $('turnForm').onsubmit=async e=>{
    e.preventDefault();const form=e.target;const btn=form.querySelector('[type=submit]');btn.disabled=true;
    try {const order=await resolvePersonalOrder(game,{...planner.order(),interval:$('interval').value,expectedTurn:game.turn},catalog);await nextTurn(id,order,catalog);planner.clear();await route();}
    catch(err){form.querySelector('.error').textContent=err.message;if(err.message.includes('обновлена')){await route();notify(err.message);}}finally{btn.disabled=false;}
  };
  const historic=worldAt(game.year,catalog);
  dossier($('game-dossier'),historic,game.nation);
  let focus;
  function inspect(target){
    if(version!==renderId)return;
    dossier($('game-dossier'),historic,target);show('country');
    if([...$('target').options].some(o=>o.value===target)){$('target').value=target;sync();}
  }
  const nations=gameWorld(game,catalog).nations;
  setupBoardTools(main,{game,catalog,nations,partners:nations.filter(n=>n!==game.nation&&!game.members.includes(n)),onFind:n=>{focus?.(n);inspect(n);}});
  focus=await drawMap($('map'),game,inspect);
}
async function route() {
  const version=++renderId;const [fragment,search]=location.hash.slice(1).split('?');const [page,id]=fragment.split('/');
  activePage=!page||page==='welcome'?'welcome':['games','game','atlas','multi','join','room'].includes(page)?page:'home';chrome(activePage);window.scrollTo(0,0);
  try {
    if(activePage==='welcome'){welcome();return;}
    if(['multi','join','room'].includes(activePage)){
      const ui=multiplayer({main,catalog,esc,settings,openAccount,current:()=>version===renderId});
      if(activePage==='room')await ui.room(id);else await ui.hub(activePage==='join'?id:'',new URLSearchParams(search).get('server'),activePage==='multi'?Number(id):undefined);
    }else if(activePage==='game')await campaign(id,version);
    else if(activePage==='games')await games(version);
    else {
      const y=Number(id);
      const startYear=Number.isInteger(y) && y!==0 && Math.abs(y)<=999999 ? y : undefined;
      if(activePage==='atlas')atlas(startYear);else home(startYear);
    }
  }catch(err){if(version===renderId){main.innerHTML=heading('Не удалось открыть кампании',esc(err.message))+'<button id="retry" class="primary">Повторить</button>';$('retry').onclick=route;}}
}
try {
  const getJson=async path=>{const r=await fetch(path);if(!r.ok)throw Error('Не удалось загрузить '+path);return r.json();};
  const [config,data]=await Promise.all([getJson('./config.json'),getJson('./shared/catalog.json')]);
  initStore(config);catalog=data;applyTheme();
  matchMedia('(prefers-color-scheme:dark)').addEventListener('change',applyTheme);
  window.addEventListener('storage',e=>{
    if(e.key==='freehistoria.v1.endpoint'||e.key==='freehistoria.v1.session.'+apiUrl())location.reload();
    if(e.key==='freehistoria.v1.theme')applyTheme();
  });
  try{await restoreAccount();}catch(err){notify(err.message);}
  status=apiUrl()?'checking':'local';await route();connectionStatus();
  window.addEventListener('hashchange',route);
}catch(err){main.textContent='Ошибка запуска: '+err.message;}
