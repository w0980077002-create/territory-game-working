import type {EncounterSnapshot} from '../core/types';
import type {EncounterPlan} from '../saga/regions';
export const BALANCE_REVISION=2;
/** Rebase only legacy enemy numbers. Keep encounter identity, HP fractions, attacks in flight,
 * timers, camera, rewards and every player-owned value. Already revised fights are exact restores.
 */
export function rebaseEncounter(s:EncounterSnapshot,plan:EncounterPlan):EncounterSnapshot{
 const next=structuredClone(s);
 if((s.balanceRevision??1)>=BALANCE_REVISION||s.stage===1||s.phase==='victory'||s.phase==='defeat')return next;
 // Unknown/custom formations are left intact rather than risking a destructive restore.
 if(s.units.length!==plan.units.length||s.units.some((u,i)=>u.id!==plan.units[i].id))return next;
 const ratios=s.units.map((u,i)=>u.atk>0?Math.min(1,plan.units[i].atk/u.atk):1);
 for(const [i,u] of next.units.entries()){
  const target=plan.units[i];u.atk*=ratios[i];
  const max=Math.min(u.max,target.hp);u.hp*=max/u.max;u.max=max;
 }
 for(const shot of next.projectiles)if(shot.source==='enemy')shot.damage*=ratios[shot.target]??1;
 if(next.hazard)next.hazard.damage*=Math.max(...ratios);
 next.balanceRevision=BALANCE_REVISION;return next;
}
