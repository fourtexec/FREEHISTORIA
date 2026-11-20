import {factsQuery} from '../shared/facts.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../shared/catalog.json' with {type:'json'};
import {gameWorld,worldAt} from '../shared/world.js';
import {readFileSync} from 'node:fs';
import {newGame,playTurn} from '../shared/game.js';
import {buildPayload} from '../shared/provider.js';

test('annual map, changing polity, composition and legacy save',()=>{
  const first=worldAt(1804,catalog),next=worldAt(1805,catalog);
  assert.ok(first.nations.includes('French Consulate'));assert.ok(!next.nations.includes('French Consulate'));
  assert.ok(next.nations.includes('First French Empire'));
  assert.ok(first.records.find(r=>r.nation==='(Portuguese Empire)').regions.includes('Kingdom of Portugal'));
  assert.equal(worldAt(2500,catalog).mapYear,2026);assert.equal(worldAt(-4800,catalog).mapSource,'basemaps');
  const legacy={...newGame({year:1804,nation:'France'},catalog),mapYear:1800};
  delete legacy.mapSource;
  assert.equal(playTurn(legacy,{action:'diplomacy',target:'Portugal',expectedTurn:0},catalog).relations[0].nation,'Portugal');
});
test('provider protocols keep keys in headers and encode input as data',()=>{
  const cfg={url:'https://test.example/{model}',model:'demo',key:'test-secret'};
  for(const type of ['chat','gemini','anthropic','custom']){
    const prompt='Текст с "кавычками", {{model}} и новой строкой\n';
    const p=buildPayload({...cfg,type,header:'X-Token',prefix:'',path:'answer',template:'{"text":"{{prompt}}"}'},prompt);
    assert.ok(Object.values(p.headers).some(v=>v.includes(cfg.key)));
    assert.ok(!JSON.stringify(p.body).includes(cfg.key));
    if(type==='custom')assert.equal(p.body.text,prompt);
    assert.equal(p.url,'https://test.example/demo');
  }
});

test('Wikidata RDF uses astronomical years for ancient office terms',()=>{
  assert.match(factsQuery('Q175881',-52),/YEAR\(\?at\)=-51/);
  assert.match(factsQuery('Q175881',-1),/YEAR\(\?at\)=0/);
});

test('each modern start has its own map, regional directory and geometries',()=>{
  for(const year of [2025,2026]){
    const world=worldAt(year,catalog);
    assert.equal(world.mapYear,year);
    assert.equal(world.mapSource,'modern');
    assert.ok(world.provenance.mapDate.startsWith(String(year)));
    assert.ok(world.provenance.directoryDate.startsWith(String(year)));
    const shapeList=JSON.parse(readFileSync(new URL('../web/maps/'+year+'.json',import.meta.url)));
    assert.deepEqual(new Set(shapeList.filter(([name,path])=>name && path.startsWith('M')).map(([name])=>name)),new Set(world.nations));
    const germany=world.records.find(r=>r.qid==='Q183');
    assert.equal(germany.capital,'Berlin');
    assert.equal(germany.regions.length,16);
    assert.equal(world.nations.length,year===2025 ? 258 : 260);
  }
  const old=gameWorld({startYear:2025,mapYear:2024,mapSource:'cliopatria'},catalog);
  assert.equal(old.mapYear,2024);
  assert.equal(old.mapSource,'cliopatria');
});
