import { repeatReward } from '../core/economyBalance';
/**
 * Daily activity track (master spec §48.9): a 20/40/60/80/100 scale on top of the existing daily quests.
 * Points come only from daily quests already claimed today (20 each), so no action is counted twice and
 * nothing new has to be farmed. Each milestone pays once per UTC day; a new day starts a fresh track.
 */
import type {Player} from '../core/types';
import {boxOf,peekBox} from './save';
import {grant,stageCoins,regionMaterial,type Reward} from './rewards';
import {dayOf} from './quests';

export const ACTIVITY_PER_QUEST=20;
export const activityMilestones=[20,40,60,80,100] as const;
export function activityReward(p:Player,index:number):Reward{
 return repeatReward<Reward>([
  {gold:stageCoins(p,.6)},
  {horn:1},
  {gems:5},
  {chaosite:10},
  {gems:10,mats:{[regionMaterial(p)]:3}},
 ][index]??{});
}
interface ActivityBox {day:string;claimed:number[]}
interface QuestBox {day?:{id:string;claimed:string[]}}

export function activityPoints(p:Player,now=Date.now()){
 const board=peekBox<QuestBox>(p,'quests')?.day;
 if(!board||board.id!==dayOf(now))return 0;
 return Math.min(activityMilestones[activityMilestones.length-1],board.claimed.length*ACTIVITY_PER_QUEST);
}
function claimedToday(p:Player,now:number){
 const box=peekBox<ActivityBox>(p,'activity');
 return box?.day===dayOf(now)&&Array.isArray(box.claimed)?box.claimed:[];
}
export function activityView(p:Player,now=Date.now()){
 const points=activityPoints(p,now),claimed=claimedToday(p,now);
 return activityMilestones.map((at,index)=>({at,index,reward:activityReward(p,index),reached:points>=at,claimed:claimed.includes(index)}));
}
export const activityReady=(p:Player,now=Date.now())=>activityView(p,now).some(m=>m.reached&&!m.claimed);
/** Claims one reached milestone once per day. Call inside a save mutation. */
export function claimActivity(p:Player,index:number,now=Date.now()):Reward|null{
 const m=activityView(p,now)[index];
 if(!m||!m.reached||m.claimed)return null;
 const box=boxOf<ActivityBox>(p,'activity',()=>({day:dayOf(now),claimed:[]}));
 if(box.day!==dayOf(now)||!Array.isArray(box.claimed)){box.day=dayOf(now);box.claimed=[]}
 box.claimed.push(index);
 grant(p,m.reward);
 return m.reward;
}
