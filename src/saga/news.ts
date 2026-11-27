import type {Player} from '../core/types';
import {boxOf} from './save';

/** Update news delivered as mail letters without attachments. A letter stays until the player deletes it after reading.
 * Only heroes saved before the update date receive it: new players do not need news about changes they never saw. */
export interface NewsLetter {id:string;date:number;title:string;body:readonly string[]}
export const newsLetters:readonly NewsLetter[]=[
 {id:'news:2026-11-27',date:Date.UTC(2026,10,27,12),title:'Что нового: спутники и Арена',body:[
  'Спутники теперь дополняют экипировку, а не заменяют её. Бонус дружины — +0,15% здоровья и атаки за звезду, всего не более +35%. После 20★ и 20-го уровня сила спутника растёт медленнее. Уровень Гуся добавляет герою не более +20% здоровья.',
  'Звёзды, уровни, пробуждения и все ресурсы сохранены. Развитые спутники стали слабее, поэтому экипировка и заточка снова важны.',
  'Во вкладке «Звёзды» появилась подсказка: сколько у вас копий, Душ и Печатей и где взять недостающие. Старые осколки больше не выпадают — их можно обменять на Души.',
  'На Арене — боевой пояс из 7 слотов и 20 зелий и эликсиров. Их можно купить за золото в Лавке, раздел «Зелья и эликсиры».',
 ]},
];
export const isNews=(id:string)=>newsLetters.some(letter=>letter.id===id);
/** On load: a save last written before a letter's date becomes its recipient (0 = delivered, unread). */
export function migrateNews(p:Player){
 if(!(p.savedAt>0))return;
 for(const letter of newsLetters)if(p.savedAt<letter.date){
  const read=boxOf<Record<string,number>>(p,'mail',()=>({}));
  if(read[letter.id]===undefined)read[letter.id]=0;
 }
}
