import balance from '../../config/test-balance.v1.json';
import {rarityBoostChance} from './gear';

/** Exact rarity odds of a random drop, as rolled by rollItem: base weight, then the blessing's +1 step. */
export function dropRarityOdds(blessing:number):number[]{
 const base=balance.loot_test_settings.rarities.map(r=>r.weight_percent/100),boost=rarityBoostChance(blessing);
 const odds=base.map(()=>0);
 base.forEach((w,i)=>{odds[i]+=w*(1-boost);odds[Math.min(base.length-1,i+1)]+=w*boost});
 return odds;
}
