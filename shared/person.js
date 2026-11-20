// A ruler's biography belongs to the person, independently of the selected polity.
const fields={P569:'Рождение',P570:'Смерть',P19:'Место рождения',P20:'Место смерти',
  P53:'Династия',P97:'Титулы',P39:'Должности'};
const label=entity=>entity?.labels?.ru?.value || entity?.labels?.en?.value || entity?.id;
async function entities(ids,props) {
  const params=new URLSearchParams({action:'wbgetentities',ids:ids.join('|'),props,languages:'ru|en',
    sitefilter:'ruwiki|enwiki',format:'json',origin:'*'});
  const response=await fetch('https://www.wikidata.org/w/api.php?'+params,{signal:AbortSignal.timeout(12000),
    headers:typeof window==='undefined'?{'User-Agent':'FreeHISTORIA/0.2 (historical atlas)'}:{}});
  if(!response.ok)throw Error('Wikidata временно недоступна.');
  const data=await response.json();if(!data.entities)throw Error('Wikidata не вернула запись.');
  return data.entities;
}
function yearText(time) {
  if(!time?.time || time.precision<9)return '';
  const year=Number(time.time.split('T')[0].slice(0,-6));
  return year<0?Math.abs(year)+' г. до н. э.':year+' г.';
}
export async function biography(qid) {
  if(!/^Q[1-9]\d*$/.test(qid))throw Error('Неизвестная персона.');
  const person=(await entities([qid],'labels|descriptions|claims|sitelinks'))[qid];
  if(!person || 'missing' in person)throw Error('Персона отсутствует в Wikidata.');
  const items=[];
  for(const [prop,title] of Object.entries(fields)){
    for(const claim of person.claims?.[prop]||[]){
      if(claim.rank==='deprecated')continue;
      const value=claim.mainsnak.datavalue?.value;
      if(!value)continue;
      const date=yearText(value);
      if(!date && !value.id)continue;
      const q=claim.qualifiers||{};
      const range=['P580','P582'].map(k=>yearText(q[k]?.[0]?.datavalue?.value));
      const when=range.filter(Boolean).length?range.map(x=>x||'…').join(' — '):yearText(q.P585?.[0]?.datavalue?.value);
      items.push({title,qid:value.id,text:date,when});
    }
  }
  const ids=[...new Set(items.map(v=>v.qid).filter(Boolean))],names={};
  for(let i=0;i<ids.length;i+=50)Object.assign(names,await entities(ids.slice(i,i+50),'labels'));
  const site=person.sitelinks?.ruwiki || person.sitelinks?.enwiki;
  return {qid,name:label(person),description:person.descriptions?.ru?.value||person.descriptions?.en?.value||'',
    article:site?'https://'+(site.site==='ruwiki'?'ru':'en')+'.wikipedia.org/wiki/'+encodeURIComponent(site.title):'',
    details:items.map(item=>({...item,text:item.text||label(names[item.qid])||item.qid}))};
}
