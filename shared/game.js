export { mapYearFor, validateYear } from './world.js';
import modern from './modern.json' with {type:'json'};
import { worldAt, gameWorld, validateYear } from './world.js';
import { shiftGameYear } from './vendor/gameDates.js';
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
  reform: { title: 'Провести реформу', detail: 'Казна −6, стабильность +9' },
  diplomacy: { title: 'Отправить посольство', detail: 'Казна −4, отношения +25, влияние +5' },
  unite: { title: 'Заключить унию', detail: 'Отношения от 75, казна −15. Держава войдёт в союз.' }
};
export function newGame({ year, nation }, catalog, id = crypto.randomUUID()) {
  validateYear(year);
  if (typeof nation !== 'string' || !nation.trim() || nation.trim().length > 100) throw Error('Название державы должно содержать от 1 до 100 символов.');
  const {mapYear,mapSource} = worldAt(year,catalog);
  return { id, nation: nation.trim(), startYear: year, year, mapYear, mapSource,
    turn: 0, treasury: 40, stability: 60, influence: 20, relations: [], members: [], history: [] };
}
export function playTurn(previous, { action, target, expectedTurn }, catalog) {
  if (expectedTurn !== previous.turn) throw Error('Кампания уже обновлена. Загрузите последний ход.');
  if (!Object.hasOwn(actions, action)) throw Error('Выберите действие.');
  const game = structuredClone(previous);
  game.year = shiftGameYear(game.year, 1);
  if (game.year > 999999) throw Error('Достигнут последний год календаря.');
  const name = nationName(target);
  const cost = { trade: 0, reform: 6, diplomacy: 4, unite: 15 }[action];
  if (cost > game.treasury) throw Error('Для этого решения недостаточно средств.');
  game.treasury -= cost;
  game.turn++;
  let text, impact = {};
  if (action === 'trade') {
    game.treasury += 9;
    game.influence++;
    text = 'Новые торговые соглашения пополнили казну и укрепили влияние державы.';
  } else if (action === 'reform') {
    game.stability += 9;
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
  if (game.turn % 3 === 0) {
    if (game.stability >= 65) {
      game.treasury += 8;
      text += ' Поддержка жителей принесла ещё 8 монет налогового дохода.';
    } else {
      game.stability -= 4;
      text += ' Недовольство сбором налогов снизило стабильность на 4.';
    }
  }
  game.stability = Math.max(0, Math.min(100, game.stability));
  game.influence = Math.min(100, game.influence);
  game.history.push({ year: game.year, action, text, ...impact });
  return game;
}
