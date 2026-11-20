import {difficulties,objectives} from './game.js';
import {validateYear} from './world.js';
export function presetData(input){
  const {title,year,nation='',description='',difficulty='normal',objective='free'}=input;
  validateYear(year);
  if(typeof title!=='string'||!title.trim()||title.length>100)throw Error('Введите название до 100 символов.');
  if(typeof nation!=='string'||nation.length>100||typeof description!=='string'||description.length>1500)throw Error('Проверьте державу и описание сценария.');
  if(!Object.hasOwn(difficulties,difficulty)||!Object.hasOwn(objectives,objective))throw Error('Выберите сложность и цель.');
  return {title:title.trim(),year,nation:nation.trim(),description:description.trim(),difficulty,objective};
}
