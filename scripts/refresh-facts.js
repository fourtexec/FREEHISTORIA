import {writeFileSync} from 'node:fs';
import {bundledFacts,fetchFacts} from '../shared/facts.js';

for (const key of bundledFacts) {
  const [qid, yearText] = key.split('_');
  const year = Number(yearText);
  const facts=await fetchFacts(qid,year);
  writeFileSync(new URL('../web/history/'+qid+'_'+year+'.json',import.meta.url), JSON.stringify(facts));
  console.log(qid,year,facts.length);
}
