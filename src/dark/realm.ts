/**
 * Dark Realm: seven introductory foes, four persistent portal choices and the final boss.
 * Loot is banked in the itinerary and issued only by an atomic result acknowledgment. The fight itself
 * is the ordinary battle engine in mode `darkness`.
 */
import type {Player,EncounterSnapshot} from '../core/types';
import balance from '../../config/test-balance.v1.json';
import {bossIds,miniIds,enemyIds,characters} from '../data/catalog';
import {threat,regions,stageGold,stageXp,curve,type EncounterPlan} from '../saga/regions';
import {peekBox,boxOf,bumpCount} from '../saga/save';
import {rollDark,rollGem,darkName,gemLabel,lootBonus,type DarkItem} from './rules';

export const ROOMS=6;
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
export const roomTitles=['Вступление · 7 врагов','Участок 1','Участок 2','Участок 3','Участок 4','Владыка этажа'];
export type RealmStage='ENTRY_PAID'|'INTRO_7'|`CHOICE_${1|2|3|4}`|`SEGMENT_${1|2|3|4}`|'FINAL_BOSS'|'WIN_PENDING'|'DEFEAT'|'CLAIMED';
export interface Portal {id:string;stars:number;biome:number;count:number;label:string}
/** TEST_ONLY provisional counts, independent of stars: video proves 7/9/11, not a star/count formula. */
export const portalConfig={stars:[1,2,3,4],counts:[9,10,11],biomes:['Тёмные руины','Ледяной склеп','Грибная бездна']};
export function portalPair(runId:string,choice:number,random:()=>number=Math.random):[Portal,Portal]{
 return [0,1].map(i=>({id:`${runId}:${choice}:${i}`,stars:portalConfig.stars[Math.min(3,Math.floor(random()*4))],biome:Math.min(2,Math.floor(random()*3)),count:portalConfig.counts[Math.min(2,Math.floor(random()*3))],label:['Врата теней','Путь скитальцев'][i]})) as [Portal,Portal];
}
export function realmPlan(floor:number,room:number,run?:RealmRun):EncounterPlan{
 const t=threat(floorStage(floor)),selected=run?.selected,region=regions[(selected?.biome??floor-1)%regions.length],title=`Тьма ${floor} · ${roomTitles[room-1]}`,boss=room===ROOMS;
 const id=boss?floorBoss(floor):enemyIds[(floor*3+(run?.killed??0)*2+room)%enemyIds.length];
 const stars=selected?.stars??1,lord=lordFloor(floor),scale=1+(stars-1)*.12;
 const count=boss?1:Math.min(3,Math.max(1,(run?.total??7)-(run?.killed??0)));
 return {units:Array.from({length:count},(_,i)=>({id:boss?id:enemyIds[(floor*3+(run?.killed??0)*2+room+i*2)%enemyIds.length],hp:boss?t.bossHp*curve.dark_hp*(lord?1.25:1):t.hp*1.25*scale,atk:boss?t.bossAtk*(lord?1.1:1):t.atk*1.05*scale,def:t.def})),boss,finale:false,timer:boss?(balance.locked_owner_rules.boss_timer_seconds as number)+(lord?15:0):0,title,
 hint:boss?'Владыка этажа · итоговая награда после победы':run?.stage.startsWith('CHOICE')?'Выберите один из двух порталов на земле':`${run?.killed??0}/${run?.total??7} · ${selected?`${selected.stars}★ · ${portalConfig.biomes[selected.biome]}`:'Вступление'}`,
 role:`Царство тьмы · ${room}/6`,region,...(boss?{bossName:name(id),ultimates:lord?region.ultimates:undefined}:{})};
}
export interface RealmTotals {ess:number;gold:number;xp:number;shard:number;dusk:number;seal:number;gems:number;loot:string[]}
export interface RealmRun {v:2;runId:string;f:number;r:number;b:BlessingId;acc:RealmTotals;stage:RealmStage;total:number;killed:number;pair?:[Portal,Portal];selected?:Portal;history:Portal[];pending:RoomLoot[];lastCombatId?:string;checkpoint?:EncounterSnapshot;legacy?:boolean}
export interface RealmLast extends RealmTotals {stage:'WIN_PENDING'|'DEFEAT'|'CLAIMED';resultId:string;ack:boolean;f:number;win:boolean;rooms:number;first:boolean;pending:RoomLoot[]}
interface RealmBox {run?:unknown;last?:unknown;sel?:unknown}
const totals=(v:unknown):RealmTotals=>{const t=(v&&typeof v==='object'?v:{}) as Partial<RealmTotals>,n=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>0?Math.round(x):0;return {ess:n(t.ess),gold:n(t.gold),xp:n(t.xp),shard:n(t.shard),dusk:n(t.dusk),seal:n(t.seal),gems:n(t.gems),loot:Array.isArray(t.loot)?t.loot.filter((x):x is string=>typeof x==='string').slice(0,12):[]}};
export const emptyTotals=():RealmTotals=>totals(undefined);
/** The active run, or undefined. A run on a floor the hero has not unlocked is ignored. */
export function newRealmRun(f:number,b:BlessingId,runId:string=globalThis.crypto?.randomUUID?.()??`realm-${Date.now()}-${Math.random()}`):RealmRun{return {v:2,runId,f,r:1,b,acc:emptyTotals(),stage:'INTRO_7',total:7,killed:0,history:[],pending:[]}}
export function realmRun(p:Player):RealmRun|undefined{
 const r=peekBox<RealmBox>(p,'realm')?.run as Partial<RealmRun>|undefined;
 if(!r||typeof r!=='object'||!Number.isInteger(r.f)||r.f!<1||r.f!>p.darkFloor||!Number.isInteger(r.r)||r.r!<1||r.r!>ROOMS)return undefined;
 if(r.v!==2){const fresh=newRealmRun(r.f!,blessingIds.includes(r.b as BlessingId)?r.b!:'fury',`legacy-${r.f}-${r.r}`);fresh.legacy=true;return fresh}
 if(typeof r.stage!=='string'||!['INTRO_7','CHOICE_1','CHOICE_2','CHOICE_3','CHOICE_4','SEGMENT_1','SEGMENT_2','SEGMENT_3','SEGMENT_4','FINAL_BOSS'].includes(r.stage)||typeof r.runId!=='string'||!Array.isArray(r.history)||!Array.isArray(r.pending)||!Number.isInteger(r.total)||r.total!<0||r.total!>20||!Number.isInteger(r.killed)||r.killed!<0||r.killed!>r.total!)return undefined;
 return {...r,acc:totals(r.acc)} as RealmRun;
}
/** Legacy runs restart the new itinerary with the already-paid entry; previously banked loot is untouched. */
export function migrateRealm(p:Player){const raw=peekBox<RealmBox>(p,'realm')?.run as Partial<RealmRun>|undefined;if(raw&&raw.v!==2){const run=realmRun(p);if(run){realmBox(p).run=run;if(p.encounter?.mode==='darkness')delete p.encounter}}}
export function realmLast(p:Player):RealmLast|undefined{const l=peekBox<RealmBox>(p,'realm')?.last as Partial<RealmLast>|undefined;if(!l||typeof l!=='object'||!Number.isInteger(l.f)||l.f!<1)return undefined;return {...totals(l),stage:l.ack===false?(l.win?'WIN_PENDING':'DEFEAT'):'CLAIMED',resultId:l.resultId??`legacy-result-${l.f}`,ack:l.ack??true,f:l.f!,win:l.win===true,rooms:Number.isInteger(l.rooms)?Math.max(0,Math.min(ROOMS,l.rooms!)):0,first:l.first===true,pending:l.pending??[]}}
export function realmChoose(p:Player,id:string){const run=realmRun(p);if(!run?.stage.startsWith('CHOICE_'))return false;const portal=run.pair?.find(v=>v.id===id);if(!portal)return false;run.selected=portal;run.history.push(portal);run.stage=`SEGMENT_${run.r-1}` as RealmStage;run.total=portal.count;run.killed=0;delete run.pair;realmBox(p).run=run;return true}
export const realmSelected=(p:Player)=>{const v=peekBox<RealmBox>(p,'realm')?.sel;return typeof v==='number'&&Number.isInteger(v)&&v>=1&&v<=p.darkFloor?v:p.darkFloor};
export const realmBox=(p:Player)=>boxOf<{run?:RealmRun;last?:RealmLast;sel?:number}>(p,'realm',()=>({}));
/** What a room can give. Shown to the player before the challenge and used by the reward itself. */
export function roomReward(floor:number,room:number,first:boolean){
 const lord=lordFloor(floor)?1.5:1,stage=floorStage(floor);
 if(room<ROOMS-1)return {ess:3+floor,gold:Math.round(stageGold(stage,false)*1.2),xp:stageXp(stage,false),shard:0,dusk:0,gemChance:0,sealChance:0,gems:0,items:0};
 if(room===ROOMS-1)return {ess:5+floor*2,gold:Math.round(stageGold(stage,false)*2),xp:stageXp(stage,false)*2,shard:1,dusk:0,gemChance:.3,sealChance:0,gems:0,items:0};
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
 * Records a defeated formation once. Only a fully cleared section banks loot; only the boss creates a win result.
 * No currency or floor progress is issued here.
 */
export function realmVictory(p:Player,combatId?:string,defeated=1,random:()=>number=Math.random){
 const run=realmRun(p);if(!run||run.stage.startsWith('CHOICE')||combatId&&run.lastCombatId===combatId)return false;
 delete run.checkpoint;run.lastCombatId=combatId;const kills=Math.max(1,Math.min(3,Math.floor(defeated),run.total-run.killed));run.killed+=kills;p.kills+=kills;const box=realmBox(p);
 if(run.killed<run.total){box.run=run;return true}
 bumpCount(p,'win:darkness');const loot=rollRoom(p,run,random);run.pending.push(loot);mergeTotals(run.acc,loot.totals);
 if(run.r===ROOMS){bumpCount(p,'carnival:realm');box.last={...run.acc,stage:'WIN_PENDING',resultId:run.runId+':result',ack:false,f:run.f,win:true,rooms:ROOMS,first:run.f===p.darkFloor,pending:run.pending};delete box.run;return true}
 run.r++;run.killed=0;
 if(run.r===ROOMS){run.stage='FINAL_BOSS';run.total=1}else{run.stage=`CHOICE_${run.r-1}` as RealmStage;run.pair=portalPair(run.runId,run.r-1,random);run.total=0}
 box.run=run;return true;
}
/** Defeat banks cleared sections only, through the same explicit one-time acknowledgment as victory. */
export function realmDefeat(p:Player){const run=realmRun(p);if(!run)return false;const box=realmBox(p);box.last={...run.acc,stage:'DEFEAT',resultId:run.runId+':result',ack:false,f:run.f,win:false,rooms:run.r-1,first:false,pending:run.pending};delete box.run;return true}
export function realmClaim(p:Player,hooks:RealmHooks){
 const last=realmLast(p);if(!last||last.ack)return false;
 const box=realmBox(p);last.ack=true;last.stage='CLAIMED';box.last=last;
 for(const loot of last.pending){const t=loot.totals;p.gold+=t.gold;p.gems+=t.gems;hooks.xp(t.xp);addRes(p,'ess',t.ess);addRes(p,'shard',t.shard);addRes(p,'seal',t.seal);if(t.dusk)addDusk(p,t.dusk);
  const store=darkBox(p);for(const item of loot.items){if(store.inv.length<DARK_STORAGE)store.inv.push(item);else addRes(p,'ess',darkSalvageValue(item))}
  if(loot.gem){const bag=gemBox(p).bag;bag[loot.gem]=(bag[loot.gem]??0)+1}
 }
 if(last.win){last.loot=[...hooks.trophies(last.f,last.first),...last.loot];p.darkFloor=Math.max(p.darkFloor,last.f+1)}
 last.pending=[];box.sel=last.win?Math.min(p.darkFloor,last.f+1):last.f;return true;
}

/** Shared team achievements keep their own one-time flags, while their currency waits for this result. */
export function bankRealmBonus(p:Player,gold:number,gems:number,labels:string[]){
 const run=realmRun(p);if(!run||gold<=0&&gems<=0)return;
 const award=emptyTotals();award.gold=gold;award.gems=gems;award.loot=labels;
 p.gold-=gold;p.gems-=gems;mergeTotals(run.acc,award);run.pending.push({totals:award,items:[]});realmBox(p).run=run;
}
