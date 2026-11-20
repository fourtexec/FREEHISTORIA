import { astronomicalYear } from './vendor/gameDates.js';
export const bundledFacts = ['Q12560_1453','Q877619_1804','Q175881_-52','Q183_2025','Q183_2026','Q159_2025','Q159_2026'];

// Statements are matched to a calendar year, so a succession year can have several rulers.
export function factsQuery(qid,year) {
  if (!/^Q[1-9]\d*$/.test(qid) || !Number.isSafeInteger(year) || !year) throw Error('Некорректная историческая ссылка.');
  // Wikidata RDF uses astronomical numbering; the JSON entity API uses historical years.
  const rdfYear=astronomicalYear(year);
  return `SELECT DISTINCT ?kind ?item ?itemLabel ?from ?to ?at ?statement WHERE {
    { VALUES (?pred ?value ?kind) {
       (p:P35 ps:P35 "head") (p:P6 ps:P6 "governmentHead")
       (p:P36 ps:P36 "capital") (p:P150 ps:P150 "region") (p:P122 ps:P122 "government")
       (p:P38 ps:P38 "currency") (p:P37 ps:P37 "language")
      } wd:${qid} ?pred ?statement . ?statement ?value ?item .
    } UNION {
      VALUES (?role ?kind) {(wdt:P1906 "head") (wdt:P1313 "governmentHead")}
      wd:${qid} ?role ?office . ?item p:P39 ?statement . ?statement ps:P39 ?office .
    }
    ${year<2025 ? `UNION { ?item p:P131 ?statement . ?statement ps:P131 wd:${qid} . BIND("place" AS ?kind) }` : ''}
    ${qid==='Q175881' ? 'UNION { ?item p:P39 ?statement . VALUES ?office { wd:Q21597597 wd:Q40779 wd:Q236885 } ?statement ps:P39 ?office . BIND("magistrate" AS ?kind) }' : ''}
    FILTER NOT EXISTS { ?statement wikibase:rank wikibase:DeprecatedRank }
    OPTIONAL { ?statement pq:P580 ?from }
    OPTIONAL { ?statement pq:P582 ?to }
    OPTIONAL { ?statement pq:P585 ?at }
    FILTER((BOUND(?from) && YEAR(?from)=${rdfYear}) || (BOUND(?to) && YEAR(?to)=${rdfYear}) ||
           (BOUND(?at) && YEAR(?at)=${rdfYear}) ||
           (BOUND(?from) && YEAR(?from)<=${rdfYear} && BOUND(?to) && YEAR(?to)>=${rdfYear}) ||
           (BOUND(?from) && YEAR(?from)<=${rdfYear} && !BOUND(?to) && (${rdfYear}=YEAR(NOW()) || (${rdfYear}>=2025 && ${rdfYear}<=YEAR(NOW())))))
    SERVICE wikibase:label { bd:serviceParam wikibase:language "ru,en". }
  } ORDER BY ?kind ?item`;
}
export async function fetchFacts(qid,year,fetcher=fetch) {
  const url=new URL('https://query.wikidata.org/sparql');
  url.search=new URLSearchParams({query:factsQuery(qid,year),format:'json'}).toString();
  const response=await fetcher(url,{signal:AbortSignal.timeout(18000),headers:{Accept:'application/sparql-results+json',...(typeof window==='undefined'?{'User-Agent':'FreeHISTORIA/0.2 (historical atlas)'}:{})}});
  if (!response.ok) throw Error('Wikidata временно недоступна (HTTP '+response.status+').');
  const {results}=await response.json();
  return results.bindings.map(row=>({kind:row.kind.value,name:row.itemLabel.value,qid:row.item.value.split('/').pop(),
    from:row.from?.value,to:row.to?.value,at:row.at?.value,statement:row.statement.value}));
}
