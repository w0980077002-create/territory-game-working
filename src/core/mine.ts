import economyStageOne from '../../config/economy-stage-1.json';
import {repeatSupply} from './economyBalance';
import balance from '../../config/test-balance.v1.json';

const {offline_accrual_limit_hours,mine_collect_cooldown_seconds}=balance.resource_test_settings;

export function previewMine(lastAt:number,now=Date.now()){
 const elapsed=Math.min(offline_accrual_limit_hours*3600,Math.max(0,(now-lastAt)/1000));
 return {
  gold:Math.floor(Math.min(elapsed,economyStageOne.mineGoldCapMinutes*60)*2),
  chaosite:repeatSupply(Math.floor(Math.min(elapsed/60,economyStageOne.mineChaositeCapMinutes))),
  waitMs:elapsed>=mine_collect_cooldown_seconds?0:Math.max(0,lastAt+mine_collect_cooldown_seconds*1000-now),
  progress:Math.min(1,elapsed/mine_collect_cooldown_seconds),
 };
}
