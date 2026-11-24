/**
 * Detailed hero stats (master spec §12, §48.5): where each number comes from, measured on the real formula.
 * Every source's share is "stats with everything" minus "stats without this source", computed on a
 * throw-away copy of the save, so the table can never disagree with combat. Nothing is written back.
 */
import type {Player,Stats} from '../core/types';
import {stats} from '../core/formulas';
import {sagaOf} from './save';
import {honorRank} from './honor';

export type StatId=Exclude<keyof Stats,'cp'>;
export const statRows:readonly {id:StatId;name:string;percent:boolean}[]=[
 {id:'hp',name:'Здоровье',percent:false},{id:'attack',name:'Атака',percent:false},{id:'defense',name:'Защита',percent:false},
 {id:'crit',name:'Шанс крита',percent:true},{id:'critDamage',name:'Крит. урон',percent:true},{id:'aspd',name:'Скорость атаки',percent:false},
 {id:'lifesteal',name:'Вампиризм',percent:true},{id:'dodge',name:'Уклонение',percent:true},{id:'reduction',name:'Снижение урона',percent:true},
 {id:'skillDamage',name:'Урон навыков',percent:false},
];
type Strip=(p:Player)=>void;
const box=(p:Player,name:string)=>{const s=sagaOf(p);delete s.box[name]};
/** How to remove one source from a copy. Order is the display order. */
const sources:readonly {id:string;name:string;strip:Strip;honor?:boolean}[]=[
 {id:'gear',name:'Снаряжение',strip:p=>{for(const k of Object.keys(p.equipment))if(k!=='wings')delete (p.equipment as Record<string,unknown>)[k]}},
 {id:'wings',name:'Крылья',strip:p=>{delete p.equipment.wings;box(p,'wings')}},
 {id:'talents',name:'Таланты',strip:p=>{p.talents=[0,0,0]}},
 {id:'runes',name:'Руны и пассивы',strip:p=>box(p,'runes')},
 {id:'dark',name:'Тёмная энергия и камни',strip:p=>{box(p,'dgear');box(p,'gems')}},
 {id:'relics',name:'Реликвии',strip:p=>{p.relic=0;box(p,'relics')}},
 {id:'squad',name:'Спутники',strip:p=>{p.companions=[1,1];box(p,'squad')}},
 {id:'honor',name:'Почётное звание',strip:()=>{},honor:true},
];
export interface SourceShare {id:string;name:string;delta:Partial<Record<StatId,number>>}
/** Real contribution of each source; sources that change nothing are left out. */
export function statSources(p:Player):{total:Stats;base:Stats;sources:SourceShare[]}{
 const total=stats(p);
 const rank=honorRank(p);
 const shares:SourceShare[]=[];
 const everything=structuredClone(p);
 for(const src of sources){
  const copy=structuredClone(p);src.strip(copy);
  const without=src.honor?stats(copy,0):stats(copy,rank);
  const delta:Partial<Record<StatId,number>>={};
  for(const {id} of statRows){const d=total[id]-without[id];if(Math.abs(d)>1e-9)delta[id]=d}
  if(Object.keys(delta).length)shares.push({id:src.id,name:src.name,delta});
  src.strip(everything);
 }
 return {total,base:stats(everything,0),sources:shares};
}
