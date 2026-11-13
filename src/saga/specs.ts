/** Two working builds per class. The choice is free to change between fights and is saved per class. */
import type {HeroClass,Player} from '../core/types';
import {peekBox,boxOf} from './save';
export type SpecId='onslaught'|'bastion'|'deadeye'|'trapper'|'frostweave'|'chain';
export interface SpecDef {id:SpecId;name:string;tag:string;lines:string[];pairs:string}
export const specs:Record<HeroClass,[SpecDef,SpecDef]>={
 berserker:[
  {id:'onslaught',name:'Натиск',tag:'Натиск и вампиризм',lines:['+6% вампиризма','Каждый удар подряд по одной цели: +8% урона (до +40%)','Смена цели сбрасывает ярость'],pairs:'Сердце Бездны, Штормовой прилив'},
  {id:'bastion',name:'Бастион',tag:'Щит и контрприём',lines:['+15% защиты, вампиризм −5%','Срыв атаки даёт щит на 10% HP','После срыва следующий удар — контратака ×2'],pairs:'Каменная стража, Щит нерушимой клятвы'}],
 ranger:[
  {id:'deadeye',name:'Меткий глаз',tag:'Крит и скорость',lines:['+10% шанса крита','+30% критического урона','Криты чаще открывают «Грозовой ритм»'],pairs:'Штормовой прилив, Кольцо грозового ритма'},
  {id:'trapper',name:'Ловчий',tag:'Точность и контроль',lines:['Стрелы замедляют цель на 20% на 2 сек','Каждый 4-й выстрел — оглушающий: сбивает замах врага','Сбитый замах не открывает слабость, но спасает от удара'],pairs:'Ледяной шёлк, Орёл легиона'}],
 runologist:[
  {id:'frostweave',name:'Ледяная вязь',tag:'Лёд и контроль',lines:['Ледяные сферы замедляют цель на 20% на 2 сек','Сокрушительный удар замораживает цель на 1,5 сек','По замороженным врагам проще попасть в окно срыва'],pairs:'Ледяной шёлк, Рунный круг'},
  {id:'chain',name:'Цепные руны',tag:'Цепные руны',lines:['Сфера перескакивает на второго врага: 50% урона','Молот Тора бьёт всех врагов сразу','Лучший выбор против отрядов и строя легиона'],pairs:'Рунный круг, Штормовой прилив'}]
};
type SpecBox=Partial<Record<HeroClass,number>>;
export const specIndex=(p:Player)=>peekBox<SpecBox>(p,'spec')?.[p.heroClass]===1?1:0;
export const specOf=(p:Player)=>specs[p.heroClass][specIndex(p)];
export const specId=(p:Player):SpecId=>specOf(p).id;
export function chooseSpec(p:Player,index:number){boxOf<SpecBox>(p,'spec',()=>({}))[p.heroClass]=index===1?1:0}
