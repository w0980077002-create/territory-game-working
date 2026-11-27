import {odinCallMaxLevel,skillDamageMultiplier,stats} from '../core/formulas';
import balance from '../../config/test-balance.v1.json';
import {gearRules,equippedUniques} from '../core/gear';
import type {GearEffectId,Player,Stats} from '../core/types';
import {combatAura,companions,maxSkillPowerBonus,squadCombat,type Aura} from '../dark/rules';
import {branchOf} from '../saga/companions';
import {hasPerk,perkIds,setCounts,setIds,type PerkId,type SetId} from '../saga/gear';
import {runeMultiplier,runeRules} from '../saga/runes';
import {specId,type SpecId} from '../saga/specs';
import {arenaHeroes,type ArenaHero} from './protocol';

type Triple<T>=[T,T,T];
export type ArenaFollower={id:string;power:number;interval:number;role:'striker'|'guardian';awake:boolean};
export type ArenaBuild={
 level:number;hero:ArenaHero;stats:Omit<Stats,'cp'>;skills:Triple<number>;runes:Triple<number>;
 runePower:Triple<number>;spec:SpecId;sets:Record<SetId,number>;perks:PerkId[];
 unique:GearEffectId[];aura:Aura;followers:ArenaFollower[];branches:[number,number];
};

export function arenaBuild(p:Player):ArenaBuild{
 const {cp: _cp,...combatStats}=stats(p);
 const squad=squadCombat(p);
 return {
  level:p.level,hero:p.heroClass,stats:combatStats,
  skills:[p.skills[0],p.skills[1],p.skills[2]],runes:[p.runes[0],p.runes[1],p.runes[2]],
  runePower:[runeMultiplier(p,0),runeMultiplier(p,1),runeMultiplier(p,2)],
  spec:specId(p),sets:setCounts(p),perks:perkIds.filter(id=>hasPerk(p,id)),
  unique:[...new Set(equippedUniques(p).map(({def})=>def.effect))],aura:combatAura(p,squad),
  followers:[squad.striker,squad.guardian,...(squad.reserve?[squad.reserve]:[])].map(({id,power,interval,role,awake})=>({id,power,interval,role,awake})),
  branches:[branchOf(p,0),branchOf(p,1)],
 };
}

const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const bounded=(value:unknown,min:number,max:number):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const int=(value:unknown,min:number,max:number):value is number=>bounded(value,min,max)&&Number.isSafeInteger(value);
function fields(value:unknown,limits:Record<string,readonly [number,number]>){
 return record(value)&&Object.keys(value).length===Object.keys(limits).length&&
  Object.entries(limits).every(([key,[min,max]])=>bounded(value[key],min,max));
}
const statLimits={hp:[1,1e9],attack:[1,1e8],defense:[0,1e8],aspd:[1,1.32],crit:[0,.9],critDamage:[1,6],
 lifesteal:[0,.7],dodge:[0,.45],reduction:[0,.5]} as const;
const auraLimits={execute30:[0,.6],execute35:[0,.3],boss:[0,.6],opening:[0,.6],thorns:[0,.6],veil:[0,.6],
 killHeal:[0,.6],regen:[0,.01],boltEvery:[0,6],boltPower:[0,1.8],rally:[0,.3],cooldownRate:[1,1.12],
 foeHpCut:[0,.1],heroDamage:[0,.3]} as const;
const specByHero={berserker:['onslaught','bastion'],ranger:['deadeye','trapper'],runologist:['frostweave','chain']};
const triple=(value:unknown,test:(n:unknown)=>boolean)=>Array.isArray(value)&&value.length===3&&value.every(test);
const ids=(value:unknown,allowed:readonly string[])=>Array.isArray(value)&&value.length<=allowed.length&&
 new Set(value).size===value.length&&value.every(v=>allowed.includes(v));
export function validArenaBuild(value:unknown):value is ArenaBuild{
 if(!record(value)||Object.keys(value).length!==13||!int(value.level,1,1_000_000)||!arenaHeroes.includes(value.hero as ArenaHero)||
  !triple(value.skills,n=>int(n,1,1_000_000))||
  !triple(value.runes,n=>int(n,0,2))||
  !triple(value.runePower,n=>bounded(n,1,1+runeRules.rankCosts.length*runeRules.upgradeEffect))||
  !specByHero[value.hero as ArenaHero].includes(String(value.spec))||
  !record(value.sets)||Object.keys(value.sets).length!==setIds.length||!setIds.every(id=>int((value.sets as Record<string,unknown>)[id],0,12))||
  Object.values(value.sets).reduce<number>((sum,n)=>sum+Number(n),0)>12||
  !ids(value.perks,perkIds)||!ids(value.unique,Object.keys(gearRules.effects))||
  !Array.isArray(value.branches)||value.branches.length!==2||!value.branches.every(n=>int(n,-1,1))||!record(value.aura)||!Array.isArray(value.followers)||value.followers.length<2||value.followers.length>3)
  return false;
 const maxSkillDamage=skillDamageMultiplier(value.hero as ArenaHero,Number(value.sets.rune),maxSkillPowerBonus(Number(value.level)));
 // The game adds bonuses from several sources in a different order.
 if(!fields(value.stats,{...statLimits,skillDamage:[1,maxSkillDamage+1e-12]}))return false;
 const {firstBlock,...aura}=value.aura;
 const speed=balance.new_player_test_start.attacks_per_second*(value.hero==='ranger'?1.2:1)*(Number(value.sets.storm)>=2?1.1:1);
 return Number((value.stats as Record<string,unknown>).aspd)===speed&&
  ['hp','attack','defense'].every(key=>Number.isSafeInteger((value.stats as Record<string,unknown>)[key]))&&
  Number((value.skills as unknown[])[1])<=odinCallMaxLevel&& typeof firstBlock==='boolean'&&fields(aura,auraLimits)&&[0,6].includes(Number(aura.boltEvery))&&
  value.followers.every((f,i)=>record(f)&&Object.keys(f).length===5&&typeof f.id==='string'&&Object.hasOwn(companions,f.id)&&companions[f.id].role===f.role&&
   bounded(f.power,0,20)&&bounded(f.interval,1,120)&&typeof f.awake==='boolean'&&
   (i===0?f.role==='striker':i===1?f.role==='guardian':f.role==='striker'||f.role==='guardian'));
}
