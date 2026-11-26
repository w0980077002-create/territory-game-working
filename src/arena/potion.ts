import balance from '../../config/test-balance.v1.json';
import {stageGold} from '../saga/regions';

const rules=balance.combat_test_settings;
export const healingPotion={
 fraction:rules.potion_heal_fraction,
 cooldown:rules.potion_cooldown_seconds*1000,
 cost:(stage:number)=>Math.max(rules.potion_gold_cost,Math.round(stageGold(stage,false)*rules.potion_stage_gold_share)),
};

export type PotionQuote={stage:number;price:number;gold:number;stock:number;reserved:number};
export function potionStock(p:{arenaPotions?:number}){
 const value=p.arenaPotions;
 return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:0;
}

export const consumables={
 potion:{name:'Зелье лечения',icon:'potion',
  description:`Восстанавливает ${Math.round(healingPotion.fraction*100)}% максимального здоровья. Перезарядка ${healingPotion.cooldown/1000} с.`},
} as const;
export type ConsumableId=keyof typeof consumables;

export function consumableStacks(player:{arenaPotions?:number},confirmed=0){
 const counts:Record<ConsumableId,number>={potion:potionStock(player)+confirmed};
 return (Object.keys(consumables) as ConsumableId[]).filter(id=>counts[id]>0)
  .map(id=>({id,count:counts[id],...consumables[id]}));
}
