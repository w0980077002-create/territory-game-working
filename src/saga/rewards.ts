import {grantSolo,soloResources,type SoloResource} from './soloEconomy';
/** One honest reward shape for quests, expeditions, tower, raids and NPC events. Call `grant` inside a mutation. */
import type {Player} from '../core/types';
import {grantHorn,grantMaterial} from '../core/store';
import {addRes,resources,type ResId} from '../dark/rules';
import {gainExperience} from '../core/experience';
import {materialIds,materials} from './gear';
import {regionIndex,stageGold} from './regions';
export interface Reward {gold?:number;gems?:number;horn?:number;chaosite?:number;tokens?:number;xp?:number;mats?:Record<string,number>;solo?:Partial<Record<SoloResource,number>>;res?:Partial<Record<ResId,number>>}
export const chapterReward = {gold:200, gems:15} satisfies Reward;

export function combineRewards(rewards:readonly Reward[]): Reward {
 const total: Reward={};
 for(const reward of rewards){
  for(const key of ['gold','gems','horn','chaosite','tokens','xp'] as const)
   if(reward[key])total[key]=(total[key]??0)+reward[key];
  for(const key of ['mats','solo','res'] as const){
   if(!reward[key])continue;
   const target:Record<string,number>=(total[key]??={});
   for(const [id,count] of Object.entries(reward[key]))if(count)target[id]=(target[id]??0)+count;
  }
 }
 return total;
}

export const regionMaterial=(p:Player)=>materialIds[regionIndex(p.stage)%6];
/** Gold scaled to the hero's current stage, so a reward stays meaningful in every chapter. */
export const stageCoins=(p:Player,bossWins:number)=>Math.round(stageGold(p.stage,true)*bossWins);
export function grant(p:Player,r:Reward,now=Date.now()){
 p.gold+=r.gold??0;p.gems+=r.gems??0;p.chaosite+=r.chaosite??0;p.tokens+=r.tokens??0;if(r.horn)grantHorn(p,r.horn,now);
 if(r.xp)gainExperience(p,r.xp);
 for(const id of Object.keys(resources) as ResId[])if(r.res?.[id])addRes(p,id,r.res[id]);
 for(const [id,n] of Object.entries(r.solo??{}))grantSolo(p,id as SoloResource,n);
 for(const [id,n] of Object.entries(r.mats??{}))grantMaterial(p,id,n);
}
const exact=(v:number)=>v.toLocaleString('ru');
export function rewardText(r:Reward){return [r.gold&&`${exact(r.gold)} золота`,r.gems&&`${r.gems} самоцв.`,r.horn&&`${r.horn} зар. Рога`,r.chaosite&&`${r.chaosite} Хаосита`,r.tokens&&`${r.tokens} жетонов Арены`,r.xp&&`${exact(r.xp)} опыта`,...(Object.keys(resources) as ResId[]).flatMap(id=>r.res?.[id]?[`${r.res[id]} × ${resources[id].name}`]:[]),...Object.entries(r.solo??{}).map(([id,n])=>n+' × '+soloResources[id as SoloResource].name),...Object.entries(r.mats??{}).map(([id,n])=>`${n} × ${materials[id]?.name??id}`)].filter(Boolean).join(' · ')}
