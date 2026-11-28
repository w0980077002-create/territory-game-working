import economyStageOne from '../../config/economy-stage-1.json';
import balance from '../../config/test-balance.v1.json';

const {offline_accrual_limit_hours,mine_collect_cooldown_seconds}=balance.resource_test_settings;
export const mineBufferHours=offline_accrual_limit_hours;

const bufferSeconds=mineBufferHours*3600;

export function previewMine(lastAt:number,now=Date.now()){
 const elapsed=Math.min(bufferSeconds,Math.max(0,(now-lastAt)/1000));
 return {
  gold:Math.floor(elapsed*economyStageOne.mineFullReward.gold/bufferSeconds),
  chaosite:Math.floor(elapsed*economyStageOne.mineFullReward.chaosite/bufferSeconds),
  waitMs:elapsed>=mine_collect_cooldown_seconds?0:Math.max(0,lastAt+mine_collect_cooldown_seconds*1000-now),
  progress:Math.min(1,elapsed/mine_collect_cooldown_seconds),
 };
}
