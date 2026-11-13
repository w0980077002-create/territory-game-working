/** One honest reward shape for quests, expeditions, tower, raids and NPC events. Call `grant` inside a mutation. */
import type {Player} from '../core/types';
import {grantHorn,grantMaterial} from '../core/store';
import {xpNeeded} from '../core/formulas';
import {materialIds,materials} from './gear';
import {regionIndex,stageGold} from './regions';
export interface Reward {gold?:number;gems?:number;horn?:number;chaosite?:number;tokens?:number;xp?:number;mats?:Record<string,number>}
export const regionMaterial=(p:Player)=>materialIds[regionIndex(p.stage)%6];
/** Gold scaled to the hero's current stage, so a reward stays meaningful in every chapter. */
export const stageCoins=(p:Player,bossWins:number)=>Math.round(stageGold(p.stage,true)*bossWins);
export function grant(p:Player,r:Reward){
 p.gold+=r.gold??0;p.gems+=r.gems??0;p.chaosite+=r.chaosite??0;p.tokens+=r.tokens??0;if(r.horn)grantHorn(p,r.horn);
 if(r.xp){p.xp+=r.xp;while(p.xp>=xpNeeded(p.level)){p.xp-=xpNeeded(p.level);p.level++}}
 for(const [id,n] of Object.entries(r.mats??{}))grantMaterial(p,id,n);
}
const short=(v:number)=>v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e4?`${(v/1000).toFixed(1)}K`:String(Math.round(v));
export function rewardText(r:Reward){return [r.gold&&`${short(r.gold)} золота`,r.gems&&`${r.gems} самоцв.`,r.horn&&`${r.horn} зар. Рога`,r.chaosite&&`${r.chaosite} Хаосита`,r.tokens&&`${r.tokens} жет.`,r.xp&&`${short(r.xp)} опыта`,...Object.entries(r.mats??{}).map(([id,n])=>`${n} × ${materials[id]?.name??id}`)].filter(Boolean).join(' · ')}
