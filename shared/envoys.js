// Offers are generated from the campaign's political map. The seed also makes
// retries of a turn reproduce the same invitation.
const missions=[
  {type:'market',title:'Торговая ярмарка',request:'предлагает провести совместную ярмарку',cost:8,returns:15,influence:1,stability:0},
  {type:'scholars',title:'Обмен учёными',request:'приглашает ваших учёных в совместную экспедицию',cost:7,returns:0,influence:7,stability:2},
  {type:'harvest',title:'Помощь общинам',request:'просит помочь общинам после неурожая',cost:8,returns:0,influence:4,stability:6}
];
export const missionByType=type=>missions.find(m=>m.type===type);
export function nextInvitation(game,nations,excluded=[]){
  if(game.invitation && game.invitation.expires>game.turn && !game.members.includes(game.invitation.nation) && !excluded.includes(game.invitation.nation))return;
  const candidates=nations.filter(n=>n!==game.nation&&!game.members.includes(n)&&!excluded.includes(n));
  if(!candidates.length){delete game.invitation;return;}
  let seed=2166136261;
  for(const char of [game.id||'',game.nation,game.turn].join('/'))seed=Math.imul(seed^char.charCodeAt(0),16777619)>>>0;
  game.invitation={nation:candidates[seed%candidates.length],type:missions[(seed>>>12)%missions.length].type,expires:game.turn+3};
}
