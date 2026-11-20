import {calendarYear} from './shared/vendor/gameDates.js';
import {biography} from './shared/person.js';
import {yearName,nationName} from './shared/game.js';
import {bundledFacts,fetchFacts} from './shared/facts.js';
import {apiUrl} from './store.js';

const factsCache=new Map();
const profiles=new Map();
function personDetails(parent,entry) {
  const details=line(parent,'details','');
  line(details,'summary','Биография · '+entry.name);
  let busy=false;
  details.ontoggle=async()=>{
    if(!details.open || busy || details.dataset.loaded)return;
    busy=true;
    const content=details.querySelector('div')||line(details,'div','');
    content.textContent='Загрузка биографии…';
    try {
      let person=profiles.get(entry.qid);
      if(!person) {
        if(apiUrl()){
          const r=await fetch(apiUrl()+'/v1/history/person/'+entry.qid,{signal:AbortSignal.timeout(35000)});
          if(!r.ok)throw Error();person=await r.json();
        }else person=await biography(entry.qid);
        profiles.set(entry.qid,person);
      }
      content.replaceChildren();
      line(content,'p',person.description);
      for(const d of person.details)line(content,'p',d.title+' · '+d.text+(d.when?' ('+d.when+')':''));
      if(person.article)link(content,'Биография в Википедии ↗',person.article);
      link(content,'Все утверждения Wikidata ↗','https://www.wikidata.org/wiki/'+entry.qid);
      details.dataset.loaded='yes';
    }catch{content.textContent='Сейчас биография недоступна. Откройте раздел ещё раз для повтора.';}
    finally{busy=false;}
  };
}
const labels={magistrate:'Высший магистрат',place:'Подчинённая территория или населённый пункт',head:'Правитель',governmentHead:'Глава правительства',capital:'Столица',region:'Регион',government:'Форма правления',currency:'Валюта',language:'Язык'};
const url='https://github.com/Seshat-Global-History-Databank/cliopatria';
function line(parent,tag,text) {
  const node=document.createElement(tag);node.textContent=text;parent.append(node);return node;
}
function link(parent,name,href) {
  const a=line(parent,'a',name);a.href=href;a.target='_blank';a.rel='noopener noreferrer';
}
export function dossier(parent,world,nation) {
  parent.replaceChildren();
  const panel=document.createElement('div');parent.append(panel);
  line(panel,'h3','Историческая справка · '+yearName(world.year));
  line(panel,'p',nationName(nation));
  if(world.year!==world.mapYear)line(panel,'p','Карта и состав территорий приведены по срезу '+yearName(world.mapYear)+'.');
  const rows=world.records.filter(r=>r.nation===nation);
  if (!rows.length) {
    line(panel,'p',world.mapSource==='basemaps'?'Доступен ориентир по карте '+yearName(world.mapYear)+'.':'Для этой державы за выбранный год запись отсутствует.');return;
  }
  const regions=new Set(rows.flatMap(r=>r.regions));
  for(const r of world.records) if(r.parent.split(';').includes(nation))regions.add(r.nation);
  const source=world.provenance;
  if(source){
    line(panel,'p','Выпуск карты · '+source.mapDate+'. Справочник стран и регионов · '+source.directoryDate+'.');
    const r=rows[0];
    if(r.capital)line(panel,'p','Столица · '+r.capital);
    if(r.currency)line(panel,'p','Валюта · '+r.currency);
    if(r.area)line(panel,'p','Площадь по справочнику · '+r.area.toLocaleString('ru')+' км².');
    if(r.parent)line(panel,'p','Управляющее государство по карте · '+r.parent);
  }else for(const r of rows) {
    line(panel,'p','Период записи: '+yearName(r.from)+' — '+yearName(r.to)+'. Площадь по источнику: '+r.area.toLocaleString('ru')+' км².');
    if(r.parent)line(panel,'p','Входит в состав: '+r.parent);
  }
  line(panel,'p',regions.size?'Состав по атласу: '+[...regions].map(nationName).join(', '):'В атласе нет перечня составных территорий для этой записи.');
  if(source){
    link(panel,source.mapLabel+' ↗',source.geometryUrl);
    link(panel,'Country State City ↗',source.directoryUrl);
  }else link(panel,'Cliopatria ↗',url);
  const row=rows.find(r=>/^Q\d+$/.test(r.qid));
  if(!row){line(panel,'p','Связь с Wikidata для этой записи отсутствует.');return;}
  link(panel,'Wikidata ↗','https://www.wikidata.org/wiki/'+row.qid);
  const facts=document.createElement('div');panel.append(facts);
  const load=line(panel,'button','Правители и сведения за этот год');load.className='primary';
  load.onclick=async()=>{
    load.disabled=true;facts.textContent='Загрузка датированных сведений…';
    try {
      const cacheKey=row.qid+'_'+world.year;
      let entries=load.dataset.loaded?undefined:factsCache.get(cacheKey), status;
      load.dataset.loaded='yes';
      if(!entries && apiUrl()){
        const params=new URLSearchParams({year:world.year,nation,facts:'1'});
        const res=await fetch(apiUrl()+'/v1/history?'+params,{signal:AbortSignal.timeout(23000)});
        if(!res.ok)throw Error();
        const data=await res.json();entries=data.facts;status=data.factsStatus;
      }else if(!entries){
        const key=row.qid+'_'+world.year;
        if(bundledFacts.includes(key)){
          const seed=await fetch('./history/'+key+'.json');
          if (seed.ok)entries=await seed.json();
        }
        entries??=await fetchFacts(row.qid,world.year);
      }
      if(status==='unavailable')throw Error();
      factsCache.set(cacheKey,entries);
      facts.replaceChildren();
      if(!entries.length)line(facts,'p','В Wikidata не найдено сведений с подходящей датировкой.');
      if(status==='stale')line(facts,'p','Показана последняя сохранённая версия сведений.');
      const displayed = new Set();
      for (const entry of entries) {
        const event = JSON.stringify([entry.kind,entry.qid,entry.from,entry.to,entry.at]);
        if(displayed.has(event))continue;
        displayed.add(event);
        const detail=line(facts,'p',(labels[entry.kind]||entry.kind)+' · ');
        link(detail,entry.name,'https://www.wikidata.org/wiki/'+entry.qid);
        const date = s=>yearName(calendarYear(Number(s.match(/^[+-]?\d+/)[0])));
        let period='';
        if(entry.from && entry.to)period=date(entry.from)+' — '+date(entry.to);
        else if(entry.from)period='с '+date(entry.from)+', окончание не указано';
        else if(entry.to)period='до '+date(entry.to);
        else if(entry.at)period=date(entry.at);
        if(period)detail.append(' ('+period+')');
        const ref=/statement\/(Q\d+)-([\da-f-]+)$/i.exec(entry.statement||'');
        if(ref)link(detail,'Источник ↗','https://www.wikidata.org/wiki/'+ref[1]+'#'+ref[1]+'$'+ref[2]);
        if(['head','governmentHead','magistrate'].includes(entry.kind))personDetails(facts,entry);
      }
    }catch{facts.textContent='Источник сейчас недоступен. Можно повторить запрос.';}
    finally{load.disabled=false;load.textContent='Повторить запрос';}
  };
  setTimeout(()=>{if(panel.isConnected)load.click();},300);
}
