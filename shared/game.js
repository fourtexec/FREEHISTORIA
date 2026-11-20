import {missionByType,nextInvitation} from './envoys.js';
export { mapYearFor, validateYear } from './world.js';
import modern from './modern.json' with {type:'json'};
import { worldAt, gameWorld, validateYear } from './world.js';
import { advanceDate, january } from './calendar.js';
import { gameDateYear } from './vendor/gameDates.js';
import { scriptedImpactFields } from './vendor/scriptedImpacts.js';

export const scenarios = [
  { year: -52, nation: 'Roman Republic', title: 'Римская республика', era: 'Античность', image: 'rome', description: 'Галльские войны подходят к развязке, а судьба республики ещё открыта.' },
  { year: 1453, nation: 'Ottoman Empire', title: 'Падение Константинополя', era: 'Средневековье', image: 'constantinople', description: 'На берегах Босфора решается будущее двух империй.' },
  { year: 1804, nation: 'French Consulate', title: 'Эпоха Наполеона', era: 'Новое время', image: 'napoleon', description: 'Франция провозглашает империю. Европа готовится к переменам.' }
];

const names = new Map(Object.entries({
  'Roman Republic': 'Римская республика', 'Roman Empire': 'Римская империя',
  'Ottoman Empire': 'Османская империя', 'Holy Roman Empire': 'Священная Римская империя',
  'French Consulate': 'Французский консулат', 'Kingdom of Portugal':'Королевство Португалия', France: 'Франция', England: 'Англия', Portugal: 'Португалия', Scotland: 'Шотландия',
  Austria: 'Австрия', Spain: 'Испания', 'United Kingdom': 'Великобритания',
  Japan: 'Япония', Prussia: 'Пруссия', Russia: 'Россия', China: 'Китай',
  'United States': 'США', Parthia: 'Парфия', 'Ptolemaic Kingdom': 'Царство Птолемеев',
  Venice: 'Венеция', 'Papal States': 'Папская область', 'Ming Dynasty': 'Империя Мин'
}));
const countryNames = new Intl.DisplayNames('ru', {type:'region'});
for (const {records} of Object.values(modern)) {
  for (const {nation,iso2} of records) {
    if (!names.has(nation) && /^[A-Z]{2}$/.test(iso2)) names.set(nation,countryNames.of(iso2));
  }
}
export const nationName = id => names.get(id) || id;
export const yearName = year => year < 0 ? Math.abs(year) + ' г. до н. э.' : year + ' г.';
export const actions = {
  trade: { title: 'Развивать торговлю', detail: 'Доход +9, влияние +1' },
  infrastructure: {title:'Построить дороги',detail:'Казна −12. Каждая сеть дорог добавляет 2 монеты к доходу от торговли.'},
  academy: {title:'Открыть академию',detail:'Казна −10, влияние +6. Каждая академия усиливает будущие реформы.'},
  relief: {title:'Выдать помощь жителям',detail:'Казна −10, стабильность +14.'},
  reform: { title: 'Провести реформу', detail: 'Казна −6, стабильность +9' },
  diplomacy: { title: 'Отправить посольство', detail: 'Казна −4, отношения +25, влияние +5' },
  invitation: {title:'Принять предложение посланника',detail:'Условия предложения указаны в сообщении посланника.'},
  unite: { title: 'Заключить унию', detail: 'Отношения от 75, казна −15. Держава войдёт в союз.' }
};
export const difficulties = {
  sandbox: ['Песочница',100,85], easy: ['Лёгкая',65,75], normal: ['Обычная',40,60],
  hard: ['Сложная',25,50], severe: ['Кризис',10,35]
};
export const objectives={free:'Свободная игра',prosperity:'Накопить 150 монет',prestige:'Достичь 80 влияния',union:'Заключить первую унию'};
export function newGame({ year, nation, title='', difficulty='normal', briefing='', objective='free' }, catalog, id = crypto.randomUUID()) {
  validateYear(year);
  if (typeof nation !== 'string' || !nation.trim() || nation.trim().length > 100) throw Error('Название державы должно содержать от 1 до 100 символов.');
  if(typeof title!=='string'||title.trim().length>100)throw Error('Название кампании должно быть не длиннее 100 символов.');
  if(!Object.hasOwn(difficulties,difficulty))throw Error('Выберите сложность.');
  if(typeof briefing!=='string'||briefing.length>1500||!Object.hasOwn(objectives,objective))throw Error('Проверьте описание и цель сценария.');
  const [,treasury,stability]=difficulties[difficulty];
  const {mapYear,mapSource} = worldAt(year,catalog);
  return { id, title:title.trim(), difficulty, briefing, objective, date:january(year), nation: nation.trim(), startYear: year, year, mapYear, mapSource,
    turn: 0, treasury, stability, influence: 20, relations: [], members: [], history: [] };
}
export function playTurn(previous, { action, target, expectedTurn, orders, interval, text, narrative }, catalog, excludedNations=[]) {
  if (expectedTurn !== previous.turn) throw Error('Кампания уже обновлена. Загрузите последний ход.');
  const plan=action==='plan'?orders:[{action,target,text,narrative}];
  if(!Array.isArray(plan)||plan.length<1||plan.length>6)throw Error('На ход можно запланировать от одного до шести решений.');
  const game=structuredClone(previous);
  game.date=advanceDate(previous.date||january(previous.year),interval);
  game.year=gameDateYear(game.date);
  game.turn++;
  for(const order of plan){
    if(!order||!Object.hasOwn(actions,order.action))throw Error('Выберите действие.');
    if(order.action==='invitation' && excludedNations.includes(game.invitation?.nation))throw Error('Держава посланника больше недоступна.');
    applyAction(game,order,catalog);
  }
  if(game.turn%3===0){
    const supported=game.stability>=65;
    if(supported)game.treasury+=8;
    else game.stability=Math.max(0,game.stability-4);
    game.history.at(-1).text+=supported?' Жители внесли ещё 8 монет налогового дохода.':' Недовольство налогами снизило стабильность на 4.';
  }
  nextInvitation(game,gameWorld(game,catalog).nations,excludedNations);
  const achieved={prosperity:game.treasury>=150,prestige:game.influence>=80,union:game.members.length>0};
  if(!game.achieved && achieved[game.objective]===true){
    game.achieved=game.date;game.history.at(-1).text+=' Цель сценария достигнута: '+objectives[game.objective]+'.';
  }
  return game;
}
function applyAction(game,{action,target,text:order,narrative},catalog){
  const name = nationName(target);
  const mission=action==='invitation'?missionByType(game.invitation?.type):null;
  if(action==='invitation' && (!mission||game.members.includes(game.invitation.nation)))throw Error('Сейчас нет доступного предложения посланника.');
  const cost = { invitation:mission?.cost, trade: 0, reform: 6, diplomacy: 4, unite: 15, infrastructure:12, academy:10, relief:10 }[action];
  if (cost > game.treasury) throw Error('Для этого решения недостаточно средств.');
  game.treasury -= cost;
  let text, impact = {};
  if(action==='invitation'){
    game.treasury+=mission.returns;game.stability+=mission.stability;game.influence+=mission.influence;
    const foreign=nationName(game.invitation.nation);
    text=mission.title+' · '+foreign+'. Делегации выполнили договор. Доход '+mission.returns+', влияние +'+mission.influence+', стабильность +'+mission.stability+'.';
    delete game.invitation;
  }else if (action === 'trade') {
    game.treasury += 9+2*(game.roads||0);
    game.influence++;
    text = 'Новые торговые соглашения пополнили казну и укрепили влияние державы.';
  } else if(action==='infrastructure'){
    game.roads=(game.roads||0)+1;text='Торговцы получили новую дорожную сеть. Доход торгового решения вырос до '+(9+2*game.roads)+' монет.';
  } else if(action==='academy'){
    game.academies=(game.academies||0)+1;game.influence+=6;text='Открылась академия. Учёные помогут советам проводить реформы.';
  } else if(action==='relief'){
    game.stability+=14;text='Местные общины распределили помощь среди жителей. Поддержка правительства выросла.';
  } else if (action === 'reform') {
    game.stability += 9+(game.academies||0);
    text = 'Местные советы приняли реформу. Поддержка правительства выросла.';
  } else {
    if (!gameWorld(game,catalog).nations.includes(target) || target === game.nation || game.members.includes(target)) throw Error('Выберите самостоятельную державу на карте.');
    let relation = game.relations.find(entry => entry.nation === target);
    if (!relation) {
      relation = { nation: target, value: 25 };
      game.relations.push(relation);
    }
    if (action === 'diplomacy') {
      relation.value = Math.min(100, relation.value + 25);
      game.influence += 5;
      text = 'Посольство завершило переговоры. Отношения с державой «' + name + '» достигли ' + relation.value + ' из 100.';
    } else {
      if (relation.value < 75) throw Error('Для унии нужны отношения не ниже 75. Отправьте посольство.');
      impact = scriptedImpactFields({ impactRows: [{ type: 'annex', polity: target, to: game.nation }] });
      game.members.push(...impact.impacts.regionTransfers.map(change => change.fromCode));
      game.influence += 12;
      text = 'Держава «' + name + '» вступила в унию. Её земли теперь отмечены на карте цветом вашего союза.';
    }
  }
  game.stability = Math.max(0, Math.min(100, game.stability));
  game.influence = Math.min(100, game.influence);
  game.history.push({date:game.date, year:game.year, turn:game.turn, action, ...impact,
    ...(typeof order==='string'&&order.trim()?{order:order.trim().slice(0,1000)}:{}),
    text:(typeof narrative==='string'&&narrative.trim()?narrative.trim().slice(0,1200)+' ':'')+text});
}
