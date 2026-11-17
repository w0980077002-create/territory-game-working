/**
 * Dark Realm: floors of three rooms (guard pack → gate keeper → floor lord), one blessing per run,
 * rewards per room, first-clear bonuses and free replays of cleared floors. Pure rules; the fight itself
 * is the ordinary battle engine in mode `darkness`.
 */
import type {Player} from '../core/types';
import balance from '../../config/test-balance.v1.json';
import {bossIds,miniIds,enemyIds,characters} from '../data/catalog';
import {threat,regions,stageGold,stageXp,curve,type EncounterPlan,type AffixId} from '../saga/regions';
import {peekBox,boxOf} from '../saga/save';
import {rollDark,rollGem,darkName,gemLabel,lootBonus,type DarkItem} from './rules';

export const ROOMS=3;
export const REALM_COST=balance.combat_test_settings.mode_entry_chaosite;
export type BlessingId='fury'|'ward'|'harvest';
export const blessings:Record<BlessingId,{name:string;icon:string;text:string;color:string}>={
 fury:{name:'Ярость Тьмы',icon:'axes',text:'+20% урона героя на весь поход',color:'#ff7a6b'},
 ward:{name:'Покров ночи',icon:'shield',text:'Герой получает на 20% меньше урона',color:'#7ac8ff'},
 harvest:{name:'Жатва теней',icon:'rune',text:'+30% Тёмной эссенции и осколков реликвий',color:'#b98cff'}
};
export const blessingIds=Object.keys(blessings) as BlessingId[];
const floorNames=['Врата мучений','Ледяной склеп','Грибная бездна','Лабиринт эха','Огненное пекло'];
export const floorName=(floor:number)=>floorNames[(floor-1)%floorNames.length];
export const lordFloor=(floor:number)=>floor%5===0;
/** The campaign stage whose threat a floor matches. Floors do not scale with the hero, so old floors get easier. */
export const floorStage=(floor:number)=>1+Math.max(1,floor)*2;
const name=(id:string)=>characters.find(c=>c.id===id)?.name.split(',')[0]??id;
export const floorBoss=(floor:number)=>bossIds[(floor-1)%bossIds.length];
export const floorKeeper=(floor:number)=>miniIds[(floor-1)%miniIds.length];
const affixCycle:AffixId[]=['bulwark','frenzy','regen','venom','warded','swift'];
export const roomTitles=['Стража этажа','Страж врат','Владыка этажа'];
export function realmPlan(floor:number,room:number):EncounterPlan{
 const t=threat(floorStage(floor)),region=regions[(floor-1)%regions.length],timer=balance.locked_owner_rules.boss_timer_seconds as number,title=`Тьма ${floor} · ${roomTitles[room-1]}`;
 if(room<=1){const size=floor>=4?3:2,share=size===3?curve.trio_hp_share:1,ids=Array.from({length:size},(_,i)=>enemyIds[(floor*3+i*2)%enemyIds.length]);
  return {units:ids.map((id,i)=>({id,hp:t.hp*1.25*share,atk:t.atk*(size===3?.75:1.05),def:t.def,...(floor>=3&&i===0?{affix:affixCycle[floor%affixCycle.length]}:{})})),boss:false,finale:false,timer:0,title,hint:'Стража этажа. Срывайте замахи — впереди ещё две комнаты.',role:'Царство тьмы · 1/3',region}}
 if(room===2){const id=floorKeeper(floor);return {units:[{id,hp:t.bossHp*curve.dark_hp*.55,atk:t.bossAtk*.85,def:t.def}],boss:true,finale:false,timer,title,hint:'Страж врат охраняет путь к владыке этажа.',role:'Царство тьмы · 2/3',region,bossName:name(id)}}
 const id=floorBoss(floor),lord=lordFloor(floor);
 return {units:[{id,hp:t.bossHp*curve.dark_hp*(lord?1.25:1),atk:t.bossAtk*(lord?1.1:1),def:t.def}],boss:true,finale:false,timer:timer+(lord?15:0),title,hint:lord?'Этаж владыки: усиленный босс и повышенная награда.':'Владыка этажа. Победа открывает следующий этаж.',role:'Царство тьмы · 3/3',region,bossName:(lord?'Тёмный владыка · ':'')+name(id),ultimates:lord?region.ultimates:undefined};
}
export interface RealmTotals {ess:number;gold:number;xp:number;shard:number;dusk:number;seal:number;gems:number;loot:string[]}
export interface RealmRun {f:number;r:number;b:BlessingId;acc:RealmTotals}
export interface RealmLast extends RealmTotals {f:number;win:boolean;rooms:number;first:boolean}
interface RealmBox {run?:unknown;last?:unknown;sel?:unknown}
const totals=(v:unknown):RealmTotals=>{const t=(v&&typeof v==='object'?v:{}) as Partial<RealmTotals>,n=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>0?Math.round(x):0;return {ess:n(t.ess),gold:n(t.gold),xp:n(t.xp),shard:n(t.shard),dusk:n(t.dusk),seal:n(t.seal),gems:n(t.gems),loot:Array.isArray(t.loot)?t.loot.filter((x):x is string=>typeof x==='string').slice(0,12):[]}};
export const emptyTotals=():RealmTotals=>totals(undefined);
/** The active run, or undefined. A run on a floor the hero has not unlocked is ignored. */
export function realmRun(p:Player):RealmRun|undefined{const r=peekBox<RealmBox>(p,'realm')?.run as Partial<RealmRun>|undefined;if(!r||typeof r!=='object'||!Number.isInteger(r.f)||r.f!<1||r.f!>p.darkFloor||!Number.isInteger(r.r)||r.r!<1||r.r!>ROOMS)return undefined;return {f:r.f!,r:r.r!,b:blessingIds.includes(r.b as BlessingId)?r.b as BlessingId:'fury',acc:totals(r.acc)}}
export function realmLast(p:Player):RealmLast|undefined{const l=peekBox<RealmBox>(p,'realm')?.last as Partial<RealmLast>|undefined;if(!l||typeof l!=='object'||!Number.isInteger(l.f)||l.f!<1)return undefined;return {...totals(l),f:l.f!,win:l.win===true,rooms:Number.isInteger(l.rooms)?Math.max(0,Math.min(ROOMS,l.rooms!)):0,first:l.first===true}}
export const realmSelected=(p:Player)=>{const v=peekBox<RealmBox>(p,'realm')?.sel;return typeof v==='number'&&Number.isInteger(v)&&v>=1&&v<=p.darkFloor?v:p.darkFloor};
export const realmBox=(p:Player)=>boxOf<{run?:RealmRun;last?:RealmLast;sel?:number}>(p,'realm',()=>({}));
/** What a room can give. Shown to the player before the challenge and used by the reward itself. */
export function roomReward(floor:number,room:number,first:boolean){
 const lord=lordFloor(floor)?1.5:1,stage=floorStage(floor);
 if(room===1)return {ess:3+floor,gold:Math.round(stageGold(stage,false)*1.2),xp:stageXp(stage,false),shard:0,dusk:0,gemChance:0,sealChance:0,gems:0,items:0};
 if(room===2)return {ess:5+floor*2,gold:Math.round(stageGold(stage,false)*2),xp:stageXp(stage,false)*2,shard:1,dusk:0,gemChance:.3,sealChance:0,gems:0,items:0};
 return {ess:Math.round((10+floor*4)*lord),gold:Math.round(stageGold(stage,true)*lord),xp:stageXp(stage,true),shard:Math.round((2+Math.floor(floor/3))*lord),dusk:1+Math.floor(floor/10),gemChance:first?1:.6,sealChance:first?1:.25,gems:first?20+floor*5:5,items:first?2:1};
}
export interface RoomLoot {totals:RealmTotals;items:DarkItem[];gem?:string}
/** Rolls one room. Pure for a given random source; the caller applies it inside a single mutation. */
export function rollRoom(p:Player,run:RealmRun,random:()=>number=Math.random):RoomLoot{
 const first=run.f===p.darkFloor,r=roomReward(run.f,run.r,first),harvest=run.b==='harvest'?1.3:1,relic=1+lootBonus(p),t=emptyTotals();
 t.ess=Math.round(r.ess*harvest*relic);t.shard=Math.round(r.shard*harvest);t.gold=Math.round(r.gold*(1+lootBonus(p)));t.xp=r.xp;t.dusk=r.dusk;t.gems=r.gems;
 const items=Array.from({length:r.items},(_,i)=>rollDark(run.f,random,first&&i===0?2:0)),gem=r.gemChance>0&&random()<r.gemChance?rollGem(random,1+(run.f>=10?1:0)+(run.f>=20?1:0)):undefined;
 if(r.sealChance>0&&random()<r.sealChance)t.seal=1;
 t.loot=[...items.map(darkName),...(gem?[gemLabel(gem)]:[])];
 return {totals:t,items,gem};
}
export function mergeTotals(into:RealmTotals,add:RealmTotals){into.ess+=add.ess;into.gold+=add.gold;into.xp+=add.xp;into.shard+=add.shard;into.dusk+=add.dusk;into.seal+=add.seal;into.gems+=add.gems;into.loot=[...into.loot,...add.loot].slice(0,12)}
import {addRes,addDusk,darkBox,gemBox,darkSalvageValue,DARK_STORAGE} from './rules';
export interface RealmHooks {xp:(amount:number)=>void;trophies:(floor:number,first:boolean)=>string[]}
/**
 * Applies one won room inside the caller's mutation: rewards, next room or the end of the run.
 * Returns false when there is no active run (the legacy single-boss darkness fight).
 */
export function realmVictory(p:Player,hooks:RealmHooks,random:()=>number=Math.random){
 const run=realmRun(p);if(!run)return false;
 const first=run.f===p.darkFloor,loot=rollRoom(p,run,random),t=loot.totals,box=realmBox(p);
 p.gold+=t.gold;p.gems+=t.gems;hooks.xp(t.xp);addRes(p,'ess',t.ess);addRes(p,'shard',t.shard);addRes(p,'seal',t.seal);if(t.dusk)addDusk(p,t.dusk);
 const store=darkBox(p);for(const item of loot.items){if(store.inv.length<DARK_STORAGE)store.inv.push(item);else{const back=darkSalvageValue(item);addRes(p,'ess',back);t.ess+=back}}
 if(loot.gem){const bag=gemBox(p).bag;bag[loot.gem]=(bag[loot.gem]??0)+1}
 const acc=run.acc;mergeTotals(acc,t);
 if(run.r<ROOMS){box.run={f:run.f,r:run.r+1,b:run.b,acc};return true}
 acc.loot=[...hooks.trophies(run.f,first),...acc.loot].slice(0,12);
 if(first)p.darkFloor=run.f+1;
 box.last={...acc,f:run.f,win:true,rooms:ROOMS,first};delete box.run;box.sel=Math.min(p.darkFloor,run.f+(first?1:0));
 return true;
}
/** A lost fight ends the run; everything earned in the cleared rooms is already saved. */
export function realmDefeat(p:Player){const run=realmRun(p);if(!run)return false;const box=realmBox(p);box.last={...run.acc,f:run.f,win:false,rooms:run.r-1,first:false};delete box.run;return true}
