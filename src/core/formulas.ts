import type {Player,Stats,Item} from './types';
import balance from '../../config/test-balance.v1.json';
export function itemPower(i:Item){return i.hp*.2+i.attack*2.5+i.defense*1.8+(i.percent?i.percent.attack*12+i.percent.hp*8+i.percent.defense*8:0)}
export function stats(p:Player):Stats {
 let hp=balance.new_player_test_start.hp+(p.level-1)*18,attack=balance.new_player_test_start.attack+(p.level-1)*4,defense=balance.new_player_test_start.defense+(p.level-1)*2;
 for(const i of Object.values(p.equipment)){if(i){hp+=i.hp;attack+=i.attack;defense+=i.defense;}}
 const wings=p.equipment.wings?.percent;
 hp*=1+(wings?.hp??0)/100; attack*=1+(wings?.attack??0)/100;defense*=1+(wings?.defense??0)/100;
 hp*=1+p.talents[1]*.05+(p.heroClass==='berserker'?.25:0)+p.companions[0]*.02;
 attack*=1+p.talents[0]*.04+p.relic*.03;defense*=1+p.talents[1]*.03;
 const crit=.07+(p.heroClass==='ranger'?.15:0)+p.talents[0]*.005,critDamage=1.5;
 const lifesteal=p.heroClass==='berserker'?.1:.02, dodge=p.talents[1]*.003;
 return {hp:Math.round(hp),attack:Math.round(attack),defense:Math.round(defense),aspd:p.heroClass==='ranger'?1.2:1,crit,critDamage,lifesteal,dodge,skillDamage:p.heroClass==='runologist'?1.3:1,reduction:0,cp:Math.floor(hp*.2+attack*2.5+defense*1.8+crit*500+critDamage*200+lifesteal*600+dodge*500)};
}
export function damage(attack:number,defense:number,level:number,mult=1,crit=false,critDamage=1.5){return Math.max(1,Math.round(attack*mult*(1-defense/(defense+100+15*level))*(crit?critDamage:1)))}
export const xpNeeded=(level:number)=>Math.round(balance.progression_test_settings.level_exp_base*balance.progression_test_settings.level_exp_multiplier**(level-1));
export const stageLabel=(stage:number)=>`${Math.floor((stage-1)/10)+1}-${(stage-1)%10+1}`;
