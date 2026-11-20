import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {advanceDate} from '../shared/calendar.js';
import {localOrder} from '../shared/orders.js';
import {newGame,playTurn} from '../shared/game.js';
import {diplomaticReply} from '../shared/diplomacy.js';

const catalog=JSON.parse(readFileSync(new URL('../shared/catalog.json',import.meta.url)));
test('calendar steps preserve BCE, leap dates and expanded years',()=>{
  assert.equal(advanceDate('-0001-12-31','day'),'0001-01-01');
  assert.equal(advanceDate('999999-01-31','week'),'999999-02-07');
  assert.equal(advanceDate('2024-02-29','year'),'2025-02-28');
  assert.equal(advanceDate('2025-12-31','quarter'),'2026-03-31');
  assert.throws(()=>advanceDate('999999-12-25','week'));
  assert.throws(()=>advanceDate('2025-01-01','invalid'));
});
test('free orders resolve atomically with dated history, investments and objectives',()=>{
  const g=newGame({title:'Купцы',year:2026,nation:'Germany',difficulty:'sandbox',objective:'prosperity'},catalog);
  const plan=(orders,game=g)=>playTurn(game,{action:'plan',orders,expectedTurn:game.turn,interval:'week'},catalog);
  assert.throws(()=>plan([{action:'trade'},{action:'unite',target:'Russia'}]));
  assert.equal(g.treasury,100);assert.deepEqual(g.history,[]);
  const end=plan([localOrder('Построить дороги'),localOrder('Открыть рынок')]);
  assert.equal(end.treasury,99);assert.equal(end.history.length,2);assert.equal(end.turn,1);assert.equal(end.date,'2026-01-08');
  assert.equal(end.history[0].order,'Построить дороги');
  assert.equal(plan(Array(5).fill({action:'trade'}),end).achieved,'2026-01-15');
  assert.throws(()=>plan(Array(7).fill({action:'trade'})));
  assert.throws(()=>localOrder('неопределённо'));
  assert.match(diplomaticReply(g,'Russia','Предлагаем союз',catalog),/посольство/);
});
test('envoy invitations persist, expire and resolve at most once per plan',()=>{
  const g=newGame({year:2026,nation:'Germany'},catalog,'fixed');
  const advance=(g,action)=>playTurn(g,{action,expectedTurn:g.turn},catalog);
  const first=advance(g,'trade'),second=advance(first,'trade');
  assert.deepEqual(first.invitation,second.invitation);
  assert.throws(()=>playTurn(second,{action:'plan',orders:[{action:'invitation'},{action:'invitation'}],expectedTurn:2},catalog));
  const accepted=advance(second,'invitation');
  assert.equal(accepted.history.at(-1).action,'invitation');
  assert.ok(accepted.invitation.expires>second.invitation.expires);
  assert.equal(advance(advance(second,'trade'),'trade').invitation.expires,7);
});
