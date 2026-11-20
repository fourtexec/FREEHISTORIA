import {icon} from './icons.js';

// The same map controls and panel navigation are used in both game modes.
export function board({name,date,summary,turn,stats,history,room=false}) {
  const canvas=room?'room-map':'map', dossier=room?'room-dossier':'game-dossier';
  const tabs=[['action','bolt','Действия'],['chat','chat','Переговоры'],['search','compass','Поиск'],['country','flag','Держава'],['history','clock','Летопись']];
  return `<div class="board">
    <canvas id="${canvas}" class="world-map" aria-label="Политическая карта. Нажмите на территорию, чтобы открыть досье." tabindex="0"></canvas>
    <a href="#${room?'multi':'games'}" class="board-back" aria-label="Назад к играм">${icon('back')} Игры</a>
    <header class="board-date heading"><h1>${date}</h1><p>${name} · ${summary}</p></header>
    <section class="board-sheet" id="sheet-action" aria-label="Действия"><div class="sheet-title"><h2>Действия</h2>${closeButton()}</div>${turn}</section>
    <section class="board-sheet" id="sheet-country" aria-label="Держава" hidden><div class="sheet-title"><h2>Держава</h2>${closeButton()}</div><div class="stats">${stats}</div><div class="dossier" id="${dossier}"></div></section>
    <section class="board-sheet" id="sheet-chat" hidden><div class="sheet-title"><h2>Переговоры</h2>${closeButton()}</div><form id="diplomatic-form"><label>Собеседник<select name="partner"></select></label><p class="hint">${room?'Личная переписка между игроками этой комнаты.':'Дипломатические ответы по правилам игры. Обсудите торговлю, границы или союз.'}</p><div class="transcript" role="log"></div><label>Послание<textarea name="message" maxlength="1000" required rows="2"></textarea></label><p class="error" role="alert"></p><button class="primary">Отправить</button></form></section>
    <section class="board-sheet" id="sheet-search" hidden><div class="sheet-title"><h2>Поиск по карте</h2>${closeButton()}</div><label>Держава<input type="search" id="nation-search" placeholder="Введите название"></label><div id="nation-results"></div></section>
    <section class="board-sheet log" id="sheet-history" aria-label="Летопись" hidden><div class="sheet-title"><h2>Летопись</h2>${closeButton()}</div>${history}</section>
    <nav class="board-dock" aria-label="Панели игры">${tabs.map(([key,symbol,label])=>`<button type="button" data-sheet="${key}" aria-controls="sheet-${key}" aria-expanded="${key==='action'}">${icon(symbol,19)}<span>${label}</span></button>`).join('')}</nav>
    <details class="map-layers"><summary>${icon('layers',17)} Слои</summary><label>Раскраска<select data-layer><option value="political">Политическая карта</option><option value="relations">Отношения с вашей державой</option></select></label><label><input type="checkbox" data-labels checked> Подписи держав</label><label><input type="checkbox" data-relief checked> Рельеф</label><small data-legend hidden>Золото — ваша держава. Зелёный — от 75, голубой — от 50, серый — ниже 50.</small></details>
    <div class="zoom"><button type="button" data-zoom="in" aria-label="Приблизить">+</button><button type="button" data-zoom="out" aria-label="Отдалить">−</button><button type="button" data-zoom="fit" aria-label="Весь мир">${icon('globe',17)}</button></div>
  </div>`;
}
function closeButton(){
  return '<button class="sheet-close" aria-label="Скрыть панель">'+icon('close',16)+'</button>';
}
export function bindBoard(root) {
  const sheets=root.querySelectorAll('.board-sheet');
  const buttons=root.querySelectorAll('[data-sheet]');
  function syncButtons() {
    for(const button of buttons){
      const sheet=root.querySelector('#'+button.getAttribute('aria-controls'));
      button.setAttribute('aria-expanded',String(!sheet.hidden));
    }
  }
  function show(key) {
    const wide=window.matchMedia('(min-width: 900px)').matches;
    for(const sheet of sheets){
      const target=sheet.id==='sheet-'+key;
      const independent=wide && (key==='country' || sheet.id==='sheet-country');
      if(target || !independent)sheet.hidden=!target;
    }
    syncButtons();
  }
  for(const button of buttons)button.onclick=()=>{
    const sheet=root.querySelector('#'+button.getAttribute('aria-controls'));
    if(sheet.hidden)show(button.dataset.sheet);
    else{sheet.hidden=true;syncButtons();}
  };
  for(const button of root.querySelectorAll('.sheet-close'))button.onclick=()=>{
    button.closest('.board-sheet').hidden=true;syncButtons();
  };
  return show;
}
