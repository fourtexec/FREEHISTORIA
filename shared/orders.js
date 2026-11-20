import {actions} from './game.js';
import {gameWorld} from './world.js';

export function orderPrompt(game,order,catalog){
  if (typeof order.text!=='string' || !order.text.trim() || order.text.length>1000)throw Error('Введите приказ длиной до 1000 символов.');
  const targets=gameWorld(game,catalog).nations.filter(n=>n!==game.nation && !game.members.includes(n));
  return 'Историческая стратегия. Верни только JSON {"action":"trade|reform|diplomacy|unite","target":"имя державы"}. Выбери одно действие, для дипломатии и унии используй имя из списка targets. '+JSON.stringify({nation:game.nation,year:game.year,treasury:game.treasury,stability:game.stability,relations:game.relations,targets,order:order.text});
}
export function parseOrder(result,path){
  try{
    const raw=path.split('.').filter(Boolean).reduce((obj,key)=>obj?.[key],result);
    const answer=typeof raw==='string'?JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g,'')):raw;
    if(typeof answer?.action!=='string' || !Object.hasOwn(actions,answer.action))throw Error();
    return {action:answer.action,target:answer.target};
  }catch{throw Error('Провайдер не вернул распознаваемое игровое действие. Проверьте формат ответа.');}
}
