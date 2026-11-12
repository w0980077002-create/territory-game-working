/**
 * EnemyTactics — honest, readable behaviours layered on Codex's enemy loop.
 * Rules of the house: no stat changes, no hidden damage, nothing reads future input.
 * Every tactic is visible (label/marker), has a cooldown and a counter the player already owns.
 * Pure functions over the fighters array, so behaviour is reproducible in tests.
 */
import type {Fighter} from '../core/types';
export type Role='shield'|'raider'|'ranged'|'boss';
export const roleOf=(id:string):Role=>/veteran|shield_spearman|legionary/.test(id)?'shield':/pirate|club|boar/.test(id)?'raider':/roman_spearman|mage/.test(id)?'ranged':'boss';
export const tactics={coverSeconds:3,coverTelegraph:.7,coverCooldown:11,coverTaken:.5,coverShared:.25,comboCooldown:8,comboGap:.35,confused:1.5,momentCooldown:9,momentDelay:.6,quickCasts:2,quickWindup:.42,quickDamage:.6,flinchDelay:.6,flinchExposed:1} as const;
export type TacticEvent={type:'cover-call'|'cover'|'combo'|'moment'|'quick'|'confused'|'flinch';from:Fighter;to?:Fighter};
export interface TacticContext {interruptCooldown:number;stunned:boolean;boss:boolean}
const alive=(u:Fighter)=>u.hp>0;
const idle=(u:Fighter)=>u.windup<=0&&u.actionTime<=0&&!u.tactic;
const heavy=(u:Fighter)=>/boar|club/.test(u.id);
/** One decision step for a living regular enemy. Mutates only tactic fields and attack timing. */
export function think(units:Fighter[],u:Fighter,dt:number,ctx:TacticContext):TacticEvent|null{
 if(ctx.boss||!alive(u)||roleOf(u.id)==='boss')return null;
 u.tacticCd=Math.max(0,(u.tacticCd??2.5+u.role*2)-dt);u.cover=Math.max(0,(u.cover??0)-dt);
 if(ctx.stunned)return null;
 const ally=units.find(a=>a!==u&&alive(a));
 if(u.tactic==='cover-call'){
  u.tacticT=(u.tacticT??0)-dt;if(u.tacticT>0)return null;u.tactic=undefined;u.tacticT=0;
  if(ally){ally.cover=tactics.coverSeconds;return {type:'cover',from:u,to:ally}}return null;
 }
 if(u.tactic==='combo'){if(!ally||ally.windup<=0&&ally.actionTime<=0&&ally.attack<=0)u.tactic=undefined;return null}
 if(!ally||!idle(u)||u.tacticCd>0)return null;
 const role=roleOf(u.id);
 // Shield bearers protect a hurt or exposed comrade. Telegraphed; Thor's Hammer breaks the cover.
 if(role==='shield'&&(ally.cover??0)<=0&&((ally.exposed??0)>0||ally.hp/ally.max<.4)){u.tactic='cover-call';u.tacticT=tactics.coverTelegraph;u.tacticCd=tactics.coverCooldown;return {type:'cover-call',from:u,to:ally}}
 if(role==='raider'){
  // Follow a partner's heavy swing so both blows land together; interrupting the partner confuses the follower.
  if(heavy(ally)&&ally.windup>.3&&u.cd>.2){u.cd=ally.windup+tactics.comboGap;u.tactic='combo';u.tacticCd=tactics.comboCooldown;return {type:'combo',from:u,to:ally}}
  // The hero's interrupt is visibly on cooldown: step in sooner (the wind-up itself stays full length).
  if(ctx.interruptCooldown>3&&u.cd>tactics.momentDelay){u.cd=tactics.momentDelay;u.tacticCd=tactics.momentCooldown;return {type:'moment',from:u}}
 }
 return null;
}
/** A hero skill broke this enemy's attack. Ranged foes adapt; a combo partner loses the rhythm. */
export function interrupted(units:Fighter[],u:Fighter):TacticEvent[]{
 const events:TacticEvent[]=[];
 if(roleOf(u.id)==='ranged'){u.quick=tactics.quickCasts;events.push({type:'quick',from:u})}
 for(const a of units)if(a!==u&&alive(a)&&a.tactic==='combo'){a.tactic=undefined;a.exposed=Math.max(a.exposed??0,tactics.confused);a.cd=Math.max(a.cd,1.2);events.push({type:'confused',from:a})}
 return events;
}
/** Called when a wind-up starts. Quick casts are shorter but weaker and are named differently. */
export function onWindup(u:Fighter){if((u.quick??0)>0&&roleOf(u.id)==='ranged'){u.quick!--;u.windup=tactics.quickWindup;u.castTotal=u.windup;u.ability=u.id.includes('mage')?'Быстрые искры':'Короткий бросок';return true}return false}
export const strikeMultiplier=(u:Fighter)=>u.ability==='Быстрые искры'||u.ability==='Короткий бросок'?tactics.quickDamage:1;
/** Damage against a covered enemy is split with the shield bearer. Returns what each one takes. */
export function absorb(units:Fighter[],u:Fighter,amount:number){
 if((u.cover??0)<=0)return {amount,coverer:undefined as Fighter|undefined,shared:0};
 const coverer=units.find(a=>a!==u&&alive(a)&&roleOf(a.id)==='shield');if(!coverer){u.cover=0;return {amount,coverer,shared:0}}
 return {amount:Math.max(1,Math.round(amount*tactics.coverTaken)),coverer,shared:Math.max(1,Math.round(amount*tactics.coverShared))};
}
/** Thor's Hammer shatters every cover. */
export function breakCovers(units:Fighter[]){let any=false;for(const u of units){if((u.cover??0)>0){u.cover=0;any=true}if(u.tactic==='cover-call'){u.tactic=undefined;u.tacticT=0;any=true}}return any}
/** A comrade fell: the survivor hesitates for a moment — an opening for the player. */
export function died(units:Fighter[],dead:Fighter):TacticEvent[]{
 const events:TacticEvent[]=[];for(const a of units)if(a!==dead&&alive(a)&&roleOf(a.id)!=='boss'){a.cover=0;if(idle(a)){a.cd+=tactics.flinchDelay;events.push({type:'flinch',from:a})}}
 return events;
}
