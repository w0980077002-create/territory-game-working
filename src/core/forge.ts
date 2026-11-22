import type {Item,Player} from './types';
import {forgeBonus,nextForgeBonus} from './progression';
import balance from '../../config/test-balance.v1.json';

const MAX_FORGE_GEAR_LEAD=5;
const ENHANCEMENT_STEP=0.04;
const keys=['attack','hp','defense'] as const;
const bonus=(p:Player)=>p.progression?forgeBonus(p.forge,p.progression.anchors.forge):forgeBonus(p.forge);

export {forgeBonus,nextForgeBonus};
// Hero progression remains primary even for a highly upgraded forge.
export const forgeLevel=(p:Player)=>Math.max(1,p.level+Math.min(MAX_FORGE_GEAR_LEAD,bonus(p)));
// Forge investment beyond the level lead contributes up to 25% to new gear.
export const forgeMasteryBonus=(p:Player)=>0.25*(1-Math.exp(-Math.max(0,bonus(p)-MAX_FORGE_GEAR_LEAD)/35));
export function applyForgeMastery(item:Item,p:Player):Item {
 if(item.slot==='wings')return item;
 const multiplier=1+forgeMasteryBonus(p);
 for(const key of keys)item[key]=Math.round(item[key]*multiplier);
 return item;
}

// Enhancement base is persisted on the first new-system upgrade.
// Legacy gear is left intact; its current stats become the baseline.
export function upgradePreview(item:Item){
 const wings=item.slot==='wings';
 const cost=Math.round(
  (wings?balance.wings_test_settings.rank_upgrade_base_gold_cost:balance.forge_test_settings.upgrade_gold_cost_base)*
  (wings?balance.wings_test_settings.rank_upgrade_multiplier:balance.forge_test_settings.cost_multiplier_per_level)**item.upgrade
 );
 const next=structuredClone(item);
 next.upgrade++;
 if(!wings){
  const base=item.enhancementBase??{
   attack:item.attack/(1+ENHANCEMENT_STEP*item.upgrade),
   hp:item.hp/(1+ENHANCEMENT_STEP*item.upgrade),
   defense:item.defense/(1+ENHANCEMENT_STEP*item.upgrade)
  };
  next.enhancementBase={attack:base.attack,hp:base.hp,defense:base.defense};
  for(const key of keys)next[key]=Math.max(item[key],Math.ceil(base[key]*(1+ENHANCEMENT_STEP*next.upgrade)));
 }
 if(next.percent){next.percent.hp++;next.percent.attack++;next.percent.defense++}
 return {cost,next};
}

/** Reforge rescales upgrades from the new gear tier, without compounding them. */
export function withExistingUpgrades(item:Item,newBase:Item):Item {
 const next:Item={...structuredClone(item),level:newBase.level,
  attack:newBase.attack,hp:newBase.hp,defense:newBase.defense};
 if(item.upgrade>0){
  next.enhancementBase={attack:newBase.attack,hp:newBase.hp,defense:newBase.defense};
  for(const key of keys)next[key]=Math.ceil(next.enhancementBase[key]*(1+ENHANCEMENT_STEP*item.upgrade));
 }else delete next.enhancementBase;
 return next;
}
