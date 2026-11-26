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
