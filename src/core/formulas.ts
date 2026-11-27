import {wingRank,wingBonuses} from '../saga/soloProgress';
import type {Player,Stats,Item} from './types';
import balance from '../../config/test-balance.v1.json';
import economy from '../../config/solo-economy.v1.json';
import {setCounts,engraveTotals,hasPerk} from '../saga/gear';
import {specId} from '../saga/specs';
import {glacierAttackBonus} from './progression';
import {powerBonus,companionBalance} from '../dark/rules';
import {honorRank,honorRanks} from '../saga/honor';
export function itemPower(i:Item){return i.hp*.2+i.attack*2.5+i.defense*1.8+(i.percent?i.percent.attack*12+i.percent.hp*8+i.percent.defense*8:0)}
export const skillDamageMultiplier=(hero:Player['heroClass'],runicPieces:number,bonus:number)=>
 (hero==='runologist'?1.3:1)*(runicPieces>=2?1.15:1)*(1+bonus);
export function stats(p:Player,rank=honorRank(p)):Stats {
 let hp=balance.new_player_test_start.hp+(p.level-1)*18,attack=balance.new_player_test_start.attack+(p.level-1)*4,defense=balance.new_player_test_start.defense+(p.level-1)*2;
 for(const i of Object.values(p.equipment)){if(i){hp+=i.hp;attack+=i.attack;defense+=i.defense;}}
 // Dark Energy, gems, relics and companions: one aggregated bonus, so no percent is ever counted twice.
 const dark=powerBonus(p);hp+=dark.hp;attack+=dark.attack;defense+=dark.defense;
 const wings=p.equipment.wings?.percent;
 const growth=wingBonuses(p.equipment.wings?wingRank(p):0);
 hp*=1+((wings?.hp??0)+growth.hp)/100;attack*=1+((wings?.attack??0)+growth.attack)/100;defense*=1+((wings?.defense??0)+growth.defense)/100;
 // Saga layer: set bonuses, engravings, named perks and the chosen class build. Old saves have none of them.
 const n=setCounts(p),eng=engraveTotals(p),spec=specId(p);
 hp*=1+p.talents[1]*.05+(p.heroClass==='berserker'?.25:0)+Math.min(companionBalance.gooseHpCap,p.companions[0]*companionBalance.gooseHpPerLevel)+(n.stone>=2?.08:0)+eng.vigor*.025+dark.hpPct;
 attack*=1+p.talents[0]*.04+glacierAttackBonus(p)+eng.might*.02+dark.atkPct;defense*=1+p.talents[1]*.03+(n.stone>=2?.12:0)+eng.ward*.03+(spec==='bastion'?.15:0)+dark.defPct;
 const honor=honorRanks[rank].bonuses;
 hp*=1+honor.hp/100;attack*=1+honor.attack/100;defense*=1+honor.defense/100;
 const crit=Math.min(.9,dark.crit+.07+(p.heroClass==='ranger'?.15:0)+p.talents[0]*.005+(n.storm>=4?.12:0)+eng.edge*.01+(spec==='deadeye'?.1:0)),critDamage=1.5+(spec==='deadeye'?.3:0)+dark.critDamage;
 const lifesteal=Math.max(.02,(p.heroClass==='berserker'?.1:.02)+(n.ember>=2?.06:0)+(spec==='onslaught'?.06:0)-(spec==='bastion'?.05:0))+Math.min(.4,dark.lifesteal), dodge=Math.min(.45,p.talents[1]*.003+(hasPerk(p,'duskwings')?.05:0)+dark.dodge),reduction=Math.min(.5,dark.reduction);
 return {hp:Math.round(hp),attack:Math.round(attack),defense:Math.round(defense),aspd:balance.new_player_test_start.attacks_per_second*(p.heroClass==='ranger'?1.2:1)*(n.storm>=2?1.1:1),crit,critDamage,lifesteal,dodge,skillDamage:skillDamageMultiplier(p.heroClass,n.rune,dark.skill),reduction,cp:Math.floor(hp*.2+attack*2.5+defense*1.8+crit*500+critDamage*200+lifesteal*600+dodge*500)};
}
/** Armour never absorbs more than this share of a hit, so late-game enemies stay dangerous. TEST_ONLY. */
export const MITIGATION_CAP=balance.campaign_curve_test.mitigation_cap;
export function damage(attack:number,defense:number,level:number,mult=1,crit=false,critDamage=1.5){return Math.max(1,Math.round(attack*mult*(1-Math.min(MITIGATION_CAP,defense/(defense+100+15*level)))*(crit?critDamage:1)))}
export {xpNeeded} from './experience';
export const stageLabel=(stage:number)=>`${Math.floor((stage-1)/10)+1}-${(stage-1)%10+1}`;

export const skillPowerMultiplier=(level:number)=>1+(level-1)*.1;
export const odinCallMaxLevel=economy.odinCall.maxLevel;
export const odinCallSeconds=(level:number,echo:boolean)=>(echo?8:5)+Math.min(level-1,odinCallMaxLevel-1)*economy.odinCall.extraSecondsPerLevel;
