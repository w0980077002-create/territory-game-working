import {itemPower,stats} from '../core/formulas';
import type {Item,Player} from '../core/types';
import {gearSlots} from './protocol';

export const gearBonusLabels=['атака','защита','HP','защита','HP','крит, п.п.','HP'] as const;
const limits:Record<typeof gearSlots[number],{cap:number;divisor:number;value:(item:Item)=>number}>={
 weapon:{cap:8,divisor:4,value:item=>item.attack},
 armor:{cap:6,divisor:4,value:item=>item.defense},
 helmet:{cap:8,divisor:12,value:item=>item.hp},
 shield:{cap:2,divisor:6,value:item=>item.defense},
 boots:{cap:4,divisor:12,value:item=>item.hp},
 ring1:{cap:2,divisor:55,value:itemPower},
 amulet:{cap:6,divisor:12,value:item=>item.hp},
};
const bounded=(value:number,max:number)=>Math.round(Math.min(max,Math.max(0,Number.isNaN(value)?0:value))*10)/10;

/** Local comparison only. The transport and the duel engine have no Solo projection input. */
export function soloArenaPreview(player:Player){
 const summary=stats(player);
 const gear=gearSlots.map(slot=>{
  const item=player.equipment[slot];
  const {cap,divisor,value}=limits[slot];
  return {slot,contribution:item?.slot===slot?bounded(value(item)/divisor,cap):0,cap};
 });
 return {
  gear,hero:player.heroClass,level:player.level,
  skillLevels:player.skills.slice(0,3),
  hp:bounded(summary.hp/10,1000),attack:bounded(summary.attack/5,250),
  defense:bounded(summary.defense/5,200),crit:bounded(summary.crit*100,50),
 };
}
