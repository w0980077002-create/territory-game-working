/**
 * Road events: reproducible planning and idempotent one-time outcomes.
 * A campaign "leg" is the walk to one encounter. Each leg can hold one event and
 * `world.lastLeg` is the only gate for its reward, so reload/pause/double taps cannot repeat it.
 */
import type {Player,Item} from '../core/types';
import {freshWorld,legOf,roll,type EventKind,type WorldSave,type CountKey} from '../core/world';
import {variants,boons,feats,boonValues,weathers,type Feat,type Variant,type WeatherId} from '../data/world-variants';
import {bossIds} from '../data/catalog';
import balance from '../../config/test-balance.v1.json';
export interface LegPlan {leg:number;stage:number;wave:number;kind:EventKind;variant:Variant;options:string[]}
const affinity:EventKind[]=['cache','caravan','ambush','altar'];
const DEFAULT_SEED=0x5eed;
export const bossOf=(stage:number)=>bossIds[(stage-1)%bossIds.length];
/** Which waves (1–4) of a stage carry an event, and of which kind. Wave 5 always carries the boss omen. */
export function stageDeck(seed:number,stage:number):Partial<Record<number,EventKind>>{
 if(stage===1)return {1:'cache',2:'caravan',3:'ambush',4:'altar'};
 const order=[1,2,3,4].sort((a,b)=>roll(seed,stage,10+a)-roll(seed,stage,10+b)),count=roll(seed,stage,1)<.3?3:2,chosen=order.slice(0,count).sort((a,b)=>a-b);
 const deck:Partial<Record<number,EventKind>>={};let previous:EventKind|undefined,ambushed=false;
 for(const wave of chosen){
  let kind=roll(seed,stage,20+wave)<.35?affinity[Math.floor(roll(seed,stage,30+wave)*4)]:affinity[wave-1];
  for(let n=0;n<4&&(kind===previous||kind==='ambush'&&ambushed);n++)kind=affinity[(affinity.indexOf(kind)+1)%4];
  deck[wave]=kind;previous=kind;ambushed||=kind==='ambush';
 }
 return deck;
}
export function planLeg(world:WorldSave|undefined,stage:number,wave:number):LegPlan|null{
 const leg=legOf(stage,wave),seed=world?.seed??DEFAULT_SEED;if(world&&leg<=world.lastLeg)return null;
 const kind:EventKind|undefined=wave===5?'omen':stageDeck(seed,stage)[wave];if(!kind)return null;
 if(kind==='omen'){const variant=variants.omen.find(v=>v.id===bossOf(stage));return variant?{leg,stage,wave,kind,variant,options:['see']}:null}
 const unlocked=variants[kind].filter(v=>v.from<=stage),fresh=unlocked.filter(v=>!world?.seen.includes(kind+':'+v.id)),pool=stage===1?unlocked.slice(0,1):fresh.length?fresh:unlocked;
 const variant=pool[Math.floor(roll(seed,leg,3)*pool.length)];
 if(kind!=='altar')return {leg,stage,wave,kind,variant,options:['act']};
 const open=boons.filter(b=>b.from<=Math.max(2,stage)),a=Math.floor(roll(seed,leg,5)*open.length),b=(a+1+Math.floor(roll(seed,leg,6)*(open.length-1)))%open.length;
 return {leg,stage,wave,kind,variant,options:stage===1?['fury','ice']:[open[a].id,open[b].id]};
}
export function weatherOf(world:WorldSave|undefined,stage:number):WeatherId{
 if(stage<=1)return 'clear';const open=weathers.filter(w=>w.from<=stage),r=roll(world?.seed??DEFAULT_SEED,stage,77);
 return r<.4?'clear':open[1+Math.floor((r-.4)/.6*(open.length-1))]?.id??'clear';
}
export interface Outcome {lines:string[];feats:Feat[];item?:Item}
const goldBase=(stage:number)=>Math.round(balance.test_rewards.regular_win_gold_base*1.14**(stage-1));
const horn=(p:Player,n:number)=>{const before=p.horn;p.horn=Math.min(balance.horn_test_settings.maximum_charges,p.horn+n);return p.horn-before};
function note(w:WorldSave,line:string){w.log.push(line);if(w.log.length>8)w.log.shift()}
/** Count progress, unlock feats and pay their one-time rewards. Call only inside a store mutation. */
export function bump(p:Player,key:CountKey,amount=1):Feat[]{
 const w=p.world??=freshWorld();w.counts[key]=(w.counts[key]??0)+amount;const unlocked:Feat[]=[];
 for(const f of feats)if(f.count===key&&w.counts[key]>=f.goal&&!w.feats.includes(f.id)){w.feats.push(f.id);p.gold+=f.gold;p.gems+=f.gems;unlocked.push(f);note(w,`Достижение «${f.title}»`)}
 return unlocked;
}
/**
 * Applies the result of a road event exactly once. Returns null if this leg is already settled.
 * `choice`: 'act' | 'pass' | 'see' | a boon id. `addItem` is injected to keep this module store-free and testable.
 */
export function settle(p:Player,plan:LegPlan,choice:string,addItem?:(p:Player)=>Item|undefined):Outcome|null{
 const w=p.world??=freshWorld();if(plan.leg<=w.lastLeg)return null;w.lastLeg=plan.leg;
 const out:Outcome={lines:[],feats:[]},base=goldBase(plan.stage),key=plan.kind+':'+plan.variant.id,seen=()=>{if(!w.seen.includes(key))w.seen.push(key);if(w.seen.length>96)w.seen.shift()};
 const gold=(n:number)=>{p.gold+=n;out.lines.push(`+${n} золота`)};
 if(choice==='pass')return out;
 if(plan.kind==='cache'&&choice==='act'){
  seen();gold(Math.round(base*2.2));
  if(plan.variant.id==='barrel'&&horn(p,1))out.lines.push('+1 заряд Рога');
  if(plan.variant.id==='nest'){p.gems+=2;out.lines.push('+2 самоцвета')}
  if(plan.variant.id==='shield'){out.item=addItem?.(p);if(out.item)out.lines.push(out.item.name)}
  out.feats.push(...bump(p,'cache'));note(w,`${plan.variant.done} · этап ${plan.stage}`);
 }else if(plan.kind==='caravan'&&choice==='act'){
  seen();gold(Math.round(base*2.6));w.gift={leg:plan.leg};out.lines.push('Лечение в следующем бою');
  if(plan.variant.id==='courier'&&horn(p,1))out.lines.push('+1 заряд Рога');
  if(plan.variant.id==='boar'){p.gems+=2;out.lines.push('+2 самоцвета')}
  out.feats.push(...bump(p,'caravan'));note(w,`${plan.variant.done} · этап ${plan.stage}`);
 }else if(plan.kind==='altar'&&plan.options.includes(choice)){
  const boon=boons.find(b=>b.id===choice)!;seen();w.boon={id:boon.id,leg:plan.leg};out.lines.push(`${boon.name}: ${boon.short}`);
  out.feats.push(...bump(p,'altar'));note(w,`${boon.name} · этап ${plan.stage}`);
 }else if(plan.kind==='ambush'&&choice==='act'){
  seen();out.lines.push('Засада раскрыта!');out.feats.push(...bump(p,'ambushReady'));note(w,`Засада раскрыта · этап ${plan.stage}`);
 }else if(plan.kind==='omen'&&choice==='see'){
  if(!w.seen.includes(key)){seen();out.feats.push(...bump(p,'omen'));note(w,`Примета: ${plan.variant.title.toLowerCase()}`)}
 }
 return out;
}
/** Runs once per campaign victory (the caller is already guarded by the encounter id). */
export function afterVictory(p:Player,stage:number,wave:number,ambushed:boolean):Outcome{
 const out:Outcome={lines:[],feats:[]},leg=legOf(stage,wave),w=p.world??=freshWorld();
 if(w.boon&&w.boon.leg<=leg){if(w.boon.id==='harvest'&&w.boon.leg===leg){const bonus=Math.round(goldBase(stage)*(wave===5?balance.test_rewards.boss_win_gold_base/balance.test_rewards.regular_win_gold_base:1)*boonValues.harvestGold);p.gold+=bonus;out.lines.push(`Руна Жатвы: +${bonus} золота`)}delete w.boon}
 if(w.gift&&w.gift.leg<=leg)delete w.gift;
 w.lastLeg=Math.max(w.lastLeg,leg);
 if(ambushed)out.feats.push(...bump(p,'ambushWon'));
 if(wave===5){out.feats.push(...bump(p,'freed'));note(w,`Цитадель свободна · этап ${stage}`)}
 return out;
}
export const activeBoon=(p:Player,stage:number,wave:number,mode:string)=>mode==='campaign'&&p.world?.boon?.leg===legOf(stage,wave)?p.world.boon.id:undefined;
export const activeGift=(p:Player,stage:number,wave:number,mode:string)=>mode==='campaign'&&p.world?.gift?.leg===legOf(stage,wave);
