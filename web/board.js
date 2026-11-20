import {icon} from './icons.js';

// The same map controls and panel navigation are used in both game modes.
export function board({name,date,summary,turn,stats,history,room=false}) {
  const canvas=room?'room-map':'map', dossier=room?'room-dossier':'game-dossier';
  const tabs=[['action','bolt','Действия'],['country','flag','Держава'],['history','clock','Летопись']];
  return `<div class="board">
    <canvas id="${canvas}" class="world-map" aria-label="Политическая карта. Нажмите на территорию, чтобы открыть досье." tabindex="0"></canvas>
    <a href="#${room?'multi':'games'}" class="board-back" aria-label="Назад к играм">${icon('back')} Игры</a>
    <header class="board-date heading"><h1>${date}</h1><p>${name} · ${summary}</p></header>
    <section class="board-sheet" id="sheet-action" aria-label="Действия"><div class="sheet-title"><h2>Действия</h2>${closeButton()}</div>${turn}</section>
    <section class="board-sheet" id="sheet-country" aria-label="Держава" hidden><div class="sheet-title"><h2>Держава</h2>${closeButton()}</div><div class="stats">${stats}</div><div class="dossier" id="${dossier}"></div></section>
    <section class="board-sheet log" id="sheet-history" aria-label="Летопись" hidden><div class="sheet-title"><h2>Летопись</h2>${closeButton()}</div>${history}</section>
    <nav class="board-dock" aria-label="Панели игры">${tabs.map(([key,symbol,label])=>`<button type="button" data-sheet="${key}" aria-controls="sheet-${key}" aria-expanded="${key==='action'}">${icon(symbol,19)}<span>${label}</span></button>`).join('')}</nav>
    <div class="zoom"><button type="button" data-zoom="in" aria-label="Приблизить">+</button><button type="button" data-zoom="out" aria-label="Отдалить">−</button><button type="button" data-zoom="fit" aria-label="Весь мир">${icon('globe',17)}</button></div>
  </div>`;
}
function closeButton(){
  return '<button class="sheet-close" aria-label="Скрыть панель">'+icon('close',16)+'</button>';
}
export function bindBoard(root) {
  const sheets=root.querySelectorAll('.board-sheet');
  const buttons=root.querySelectorAll('[data-sheet]');
  function show(key) {
    for(const sheet of sheets)sheet.hidden=sheet.id!=='sheet-'+key;
    for(const button of buttons)button.setAttribute('aria-expanded',String(button.dataset.sheet===key));
  }
  for(const button of buttons)button.onclick=()=>show(button.getAttribute('aria-expanded')==='true'?'':button.dataset.sheet);
  for(const button of root.querySelectorAll('.sheet-close'))button.onclick=()=>show('');
  return show;
}
