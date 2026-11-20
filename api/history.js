import { worldAt } from '../shared/world.js';
import { fetchFacts } from '../shared/facts.js';
import { readFileSync, existsSync } from 'node:fs';

export function historyService(db, catalog) {
  db.exec('CREATE TABLE IF NOT EXISTS historic_facts (qid TEXT, year INTEGER, fetched INTEGER, facts TEXT, PRIMARY KEY(qid,year))');
  const pending=new Map();
  return async function history(params) {
    const year=Number(params.get('year'));
    const world=worldAt(year,catalog);
    const nation=params.get('nation'), records=nation ? world.records.filter(r=>r.nation===nation) : world.records;
    const result={year,mapYear:world.mapYear,source:world.mapSource,provenance:world.provenance,nations:nation?undefined:world.nations,records};
    if (!nation || params.get('facts')!=='1') return result;
    const qid=records.find(r=>/^Q\d+$/.test(r.qid))?.qid;
    if (!qid) return {...result,facts:[],factsStatus:'unmapped'};
    const key=qid+'_'+year;
    const cached=db.prepare('SELECT * FROM historic_facts WHERE qid=? AND year=?').get(qid,year);
    if (cached && Date.now()-cached.fetched<7*86400000) return {...result,facts:JSON.parse(cached.facts),factsStatus:'cached'};
    const seed=new URL('../web/history/'+key+'.json',import.meta.url);
    if (existsSync(seed)) return {...result,facts:JSON.parse(readFileSync(seed)),factsStatus:'bundled'};
    if (!pending.has(key)) {
      const promise=fetchFacts(qid,year).then(facts=>{
        db.prepare('INSERT OR REPLACE INTO historic_facts VALUES (?,?,?,?)').run(qid,year,Date.now(),JSON.stringify(facts));
        return facts;
      }).finally(()=>pending.delete(key));
      pending.set(key,promise);
    }
    try {return {...result,facts:await pending.get(key),factsStatus:'live'};}
    catch {return {...result,facts:cached?JSON.parse(cached.facts):[],factsStatus:cached?'stale':'unavailable'};}
  };
}
