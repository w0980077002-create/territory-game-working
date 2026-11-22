import balance from '../../config/test-balance.v1.json';

const {offline_accrual_limit_hours,mine_collect_cooldown_seconds}=balance.resource_test_settings;

export function previewMine(lastAt:number,now=Date.now()){
 const elapsed=Math.min(offline_accrual_limit_hours*3600,Math.max(0,(now-lastAt)/1000));
 return {
  gold:Math.floor(elapsed*2),
  chaosite:Math.floor(elapsed/60),
  waitMs:elapsed>=mine_collect_cooldown_seconds?0:Math.max(0,lastAt+mine_collect_cooldown_seconds*1000-now),
  progress:Math.min(1,elapsed/mine_collect_cooldown_seconds),
 };
}
