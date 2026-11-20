import modern from './modern.json' with { type: 'json' };
import periods from './periods.json' with { type: 'json' };
import { astronomicalYear, parseGameDate } from './vendor/gameDates.js';

export function validateYear(year) {
  if (!Number.isInteger(year) || !parseGameDate(year + '-01-01')) throw Error('Введите целый год от −999999 до 999999. Нулевого года нет.');
}
export function mapYearFor(year, catalog) {
  validateYear(year);
  const distance = value => Math.abs(astronomicalYear(value) - astronomicalYear(year));
  return Object.keys(catalog).map(Number).sort((a,b) => distance(a)-distance(b) || a-b)[0];
}


const cache = new Map();
export function worldAt(year, catalog, source = 'auto') {
  validateYear(year);
  if (year >= 2025 && (source === 'auto' || source === 'modern')) {
    const mapYear = Math.min(year, 2026);
    const {records, ...provenance} = modern[mapYear];
    return {year,mapYear,mapSource:'modern',records,nations:records.map(row=>row.nation),provenance};
  }
  if (source === 'cliopatria' && year>2024) return {...worldAt(2024,catalog),year};
  if (source !== 'basemaps' && year >= -3400 && year <= 2024) {
    if (!cache.has(year)) {
      const records = periods.filter(([,from,to])=>from<=year && year<=to)
        .map(([nation,from,to,qid,parent,components,article,area,shard,shape])=>
          ({nation,from,to,qid,parent,regions:components.split(';').filter(Boolean),article,area,shard,shape}));
      if (cache.size >= 24) cache.delete(cache.keys().next().value);
      cache.set(year,{year,mapYear:year,mapSource:'cliopatria',records,nations:[...new Set(records.map(r=>r.nation))].sort()});
    }
    const world = cache.get(year);
    if (world.records.length) return world;
  }
  const mapYear = mapYearFor(year,catalog);
  return {year,mapYear,mapSource:'basemaps',records:[],nations:catalog[mapYear]};
}
export function gameWorld(game,catalog) {
  // Existing saves keep their starting map, including user-defined historical scenarios.
  return worldAt(game.mapYear,catalog,game.mapSource || 'basemaps');
}
