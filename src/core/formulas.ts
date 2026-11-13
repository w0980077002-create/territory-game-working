import type {Player,Stats,Item} from './types';
import balance from '../../config/test-balance.v1.json';
import {setCounts,engraveTotals,hasPerk} from '../saga/gear';
import {specId} from '../saga/specs';
export function itemPower(i:Item){return i.hp*.2+i.attack*2.5+i.defense*1.8+(i.percent?i.percent.attack*12+i.percent.hp*8+i.percent.defense*8:0)}
export function stats(p:Player):Stats {
 let hp=balance.new_player_test_start.hp+(p.level-1)*18,attack=balance.new_player_test_start.attack+(p.level-1)*4,defense=balance.new_player_test_start.defense+(p.level-1)*2;
 for(const i of Object.values(p.equipment)){if(i){hp+=i.hp;attack+=i.attack;defense+=i.defense;}}
 const wings=p.equipment.wings?.percent;
 hp*=1+(wings?.hp??0)/100; attack*=1+(wings?.attack??0)/100;defense*=1+(wings?.defense??0)/100;
 // Saga layer: set bonuses, engravings, named perks and the chosen class build. Old saves have none of them.
 const n=setCounts(p),eng=engraveTotals(p),spec=specId(p);
 hp*=1+p.talents[1]*.05+(p.heroClass==='berserker'?.25:0)+p.companions[0]*.02+(n.stone>=2?.08:0)+eng.vigor*.025;
 attack*=1+p.talents[0]*.04+p.relic*.03+eng.might*.02;defense*=1+p.talents[1]*.03+(n.stone>=2?.12:0)+eng.ward*.03+(spec==='bastion'?.15:0);
 const crit=.07+(p.heroClass==='ranger'?.15:0)+p.talents[0]*.005+(n.storm>=4?.12:0)+eng.edge*.01+(spec==='deadeye'?.1:0),critDamage=1.5+(spec==='deadeye'?.3:0);
 const lifesteal=Math.max(.02,(p.heroClass==='berserker'?.1:.02)+(n.ember>=2?.06:0)+(spec==='onslaught'?.06:0)-(spec==='bastion'?.05:0)), dodge=p.talents[1]*.003+(hasPerk(p,'duskwings')?.05:0);
 return {hp:Math.round(hp),attack:Math.round(attack),defense:Math.round(defense),aspd:balance.new_player_test_start.attacks_per_second*(p.heroClass==='ranger'?1.2:1)*(n.storm>=2?1.1:1),crit,critDamage,lifesteal,dodge,skillDamage:(p.heroClass==='runologist'?1.3:1)*(n.rune>=2?1.15:1),reduction:0,cp:Math.floor(hp*.2+attack*2.5+defense*1.8+crit*500+critDamage*200+lifesteal*600+dodge*500)};
}
/** Armour never absorbs more than this share of a hit, so late-game enemies stay dangerous. TEST_ONLY. */
export const MITIGATION_CAP=balance.campaign_curve_test.mitigation_cap;
export function damage(attack:number,defense:number,level:number,mult=1,crit=false,critDamage=1.5){return Math.max(1,Math.round(attack*mult*(1-Math.min(MITIGATION_CAP,defense/(defense+100+15*level)))*(crit?critDamage:1)))}
export const xpNeeded=(level:number)=>Math.round(balance.progression_test_settings.level_exp_base*balance.progression_test_settings.level_exp_multiplier**(level-1));
export const stageLabel=(stage:number)=>`${Math.floor((stage-1)/10)+1}-${(stage-1)%10+1}`;
