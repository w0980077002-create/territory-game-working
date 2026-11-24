import type {Player} from '../core/types';
import {useGame} from '../core/store';
import {activityView,activityPoints,claimActivity,activityMilestones,ACTIVITY_PER_QUEST} from '../saga/activity';
import {actualReward} from '../saga/events';
import {rewardText} from '../saga/rewards';

import {MiniReward} from './MiniReward';
import './activity.css';

/** Daily activity scale over the claimed daily quests: 20/40/60/80/100, each milestone once a day. */
export function ActivityTrack({p}:{p:Player}){
 const g=useGame(),now=Date.now(),points=activityPoints(p,now),view=activityView(p,now),max=activityMilestones[activityMilestones.length-1];
 const claim=(index:number)=>{
  let message='';
  if(!g.mutate(draft=>{const before={horn:draft.horn,hornAt:draft.hornAt},reward=claimActivity(draft,index,now);if(reward)message=rewardText(actualReward(before,reward))})){g.notice('Не удалось сохранить награду');return}
  if(message)g.notice('Активность дня: '+message);
 };
 return <section className="activity-track" aria-label={`Активность дня ${points} из ${max}`}>
  <header><strong>Активность дня</strong><span>{points}/{max}</span><small>+{ACTIVITY_PER_QUEST} за каждое полученное задание дня</small></header>
  <div className="activity-bar" aria-hidden="true"><i style={{width:Math.min(100,points/max*100)+'%'}}/></div>
  <ol>{view.map(m=><li key={m.at} className={m.claimed?'claimed':m.reached?'ready':''}>
   <button type="button" disabled={!m.reached||m.claimed} onClick={()=>claim(m.index)}
    aria-label={`${m.at} очков · ${rewardText(m.reward)} · ${m.claimed?'получено':m.reached?'получить':'ещё не достигнуто'}`}>
    <b>{m.at}</b><MiniReward reward={m.reward}/><em>{m.claimed?'✓ получено':m.reached?'Забрать':''}</em>
   </button>
  </li>)}</ol>
 </section>;
}
