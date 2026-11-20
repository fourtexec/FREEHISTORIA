import {gameWorld} from './world.js';

export function messageText(value){
  if(typeof value!=='string'||!value.trim()||value.trim().length>1000)throw Error('Введите сообщение от 1 до 1000 символов.');
  return value.trim();
}
export function diplomaticReply(game,partner,text,catalog){
  if(partner===game.nation||game.members.includes(partner)||!gameWorld(game,catalog).nations.includes(partner))throw Error('Выберите независимую державу.');
  const relations=game.relations.find(r=>r.nation===partner)?.value??25;
  if(/союз|унию|унии|alliance/i.test(text)){
    return relations>=75?'Мы готовы объединиться. Включите решение «Заключить унию» в следующий ход.':'Для союза нужно больше доверия. Отправьте посольство. Наши отношения сейчас '+relations+' из 100.';
  }
  if(/торг|рынок|пошлин|trade/i.test(text))return 'Мы готовы открыть рынок для ваших купцов. Включите развитие торговли в план хода, чтобы получить доход.';
  if(/мир|границ|peace/i.test(text))return 'Предлагаем сохранить существующие границы и обменяться посольствами. Наши отношения сейчас '+relations+' из 100.';
  return 'Мы получили ваше послание. Готовы обсудить торговлю, границы или союз. Текущие отношения — '+relations+' из 100.';
}
