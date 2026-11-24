import type {Reward} from '../saga/rewards';
import {rewardParts} from './RewardArt';
import {Icon} from './Icon';

const compact=(n:number)=>n>=1e6?(n/1e6).toFixed(1).replace('.',',')+'M':n>=1e4?(n/1e3).toFixed(1).replace('.',',')+'K':n.toLocaleString('ru');
/** Small single-line reward for narrow milestone cells: icon + compact count, never wraps. */
export function MiniReward({reward}:{reward:Reward}){
 return <span className="reward-art mini-reward">{rewardParts(reward).map(part=><span className="reward-piece" role="img" key={part.key} title={part.name} aria-label={`${part.name} × ${part.count}`}>
  <Icon name={part.icon}/><strong>{compact(part.count)}</strong>
 </span>)}</span>;
}
