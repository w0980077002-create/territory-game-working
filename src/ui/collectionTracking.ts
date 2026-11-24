import {useGame} from '../core/store';
import {unrecorded,recordCollection} from '../saga/collections';

/** Remembers newly obtained named and set gear in the collection, so it stays found after salvage. */
export function startCollectionTracking(){
 let pending=false;
 const check=()=>{
  const g=useGame.getState();
  if(pending||g.recoveryRequired||!unrecorded(g.p).length)return;
  pending=true;
  queueMicrotask(()=>{pending=false;const s=useGame.getState();if(!s.recoveryRequired&&unrecorded(s.p).length)s.mutate(p=>{recordCollection(p)})});
 };
 check();
 return useGame.subscribe((next,prev)=>{if(next.p!==prev.p&&(next.p.inventory!==prev.p.inventory||next.p.equipment!==prev.p.equipment||next.p.pendingLoot!==prev.p.pendingLoot))check()});
}
