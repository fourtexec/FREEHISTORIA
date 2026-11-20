import {addGameMonths,formatGameDate,gameDateDaysInMonth,parseGameDate} from './vendor/gameDates.js';

export const intervals={day:'День',week:'Неделя',month:'Месяц',quarter:'Три месяца',year:'Год'};
export const january=year=>formatGameDate({year,month:1,day:1});
const months='января февраля марта апреля мая июня июля августа сентября октября ноября декабря'.split(' ');
export function dateLabel(date,year){
  const p=parseGameDate(date)||{year,month:1,day:1};
  return p.day+' '+months[p.month-1]+' '+Math.abs(p.year)+(p.year<0?' г. до н. э.':' г.');
}
export function advanceDate(date,interval='year'){
  if(!Object.hasOwn(intervals,interval))throw Error('Выберите длительность хода.');
  let next;
  if(interval==='day'||interval==='week'){
    const p=parseGameDate(date);
    p.day+=interval==='day'?1:7;
    const length=gameDateDaysInMonth(p.year,p.month);
    next=p.day<=length?formatGameDate(p):addGameMonths(formatGameDate({...p,day:p.day-length}),1);
  }else next=addGameMonths(date,{month:1,quarter:3,year:12}[interval]);
  if(!parseGameDate(next))throw Error('Достигнут последний год календаря.');
  return next;
}
