/** Goose and dog growth: evolutions by level and one of two branches each. Pure rules. */
import type {Player} from '../core/types';
import {peekBox,boxOf} from './save';
export const evolutions=[{level:1,name:'Юный'},{level:5,name:'Боевой'},{level:12,name:'Ветеран'},{level:25,name:'Легенда'}];
export const evoTier=(level:number)=>evolutions.reduce((t,e,i)=>level>=e.level?i:t,0);
export const evoName=(level:number)=>evolutions[evoTier(level)].name;
/** Each evolution strengthens the companion's own job by 15%. */
export const evoPower=(level:number)=>1+evoTier(level)*.15;
export const nextEvolution=(level:number)=>evolutions[evoTier(level)+1];
export const BRANCH_LEVEL=5;
export const branches=[
 [{name:'Ас',tag:'Пике',text:'Пике готово на 30% чаще; сорвав выстрел, гусь ещё и бьёт на 150%.'},{name:'Добытчик',tag:'Добыча',text:'+10% золота за победы и +50% к шансу найти материалы региона.'}],
 [{name:'Страж',tag:'Заслон',text:'Заслон готов на 30% чаще и гасит 75% удара вместо 50%.'},{name:'Лекарь',tag:'Лечение',text:'Лечит на 40% сильнее и может выручить героя дважды за бой.'}]
] as const;
type PetBox={b?:number[]};
/** -1 until the companion reaches BRANCH_LEVEL and the player picks a branch. */
export function branchOf(p:Player,pet:0|1){const v=peekBox<PetBox>(p,'pets')?.b?.[pet];return p.companions[pet]>=BRANCH_LEVEL&&(v===0||v===1)?v:-1}
export function chooseBranch(p:Player,pet:0|1,branch:number){if(p.companions[pet]<BRANCH_LEVEL)return false;const box=boxOf<PetBox>(p,'pets',()=>({b:[-1,-1]}));box.b??=[-1,-1];box.b[pet]=branch===1?1:0;return true}
export const combos={finish:{window:3,bonus:.6,label:'ДОБИВАНИЕ!'},riposte:{window:3,bonus:.6,label:'КОНТРАТАКА!'}} as const;
