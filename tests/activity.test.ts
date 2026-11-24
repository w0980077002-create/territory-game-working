import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freshPlayer} from '../src/core/store';
import {ensureQuests,claimBoard,dailyView,dayOf} from '../src/saga/quests';
import {activityPoints,activityView,claimActivity} from '../src/saga/activity';
import {bumpCount} from '../src/saga/save';

const now=Date.UTC(2026,10,24,12);
function finishDaily(p:ReturnType<typeof freshPlayer>,n:number){
 ensureQuests(p,now);
 for(const q of dailyView(p,now).slice(0,n)){
  for(const k of q.def.keys){if(k.startsWith('stat:kills'))p.kills+=q.def.goal;else if(k==='stat:bosses')p.bosses+=q.def.goal;else if(k.startsWith('world:')){p.world??={seed:1,counts:{}} as never;(p.world as {counts:Record<string,number>}).counts[k.slice(6)]=q.def.goal}else if(k.startsWith('state:')){/* set state cannot be forced here */}else bumpCount(p,k,q.def.goal)}
  claimBoard(p,'day',q.def.id,now);
 }
}
test('activity points come only from daily quests claimed today, 20 each, capped at 100',()=>{
 const p=freshPlayer();ensureQuests(p,now);
 assert.equal(activityPoints(p,now),0);
 finishDaily(p,6);
 const claimed=dailyView(p,now).filter(q=>q.claimed).length;
 assert.equal(activityPoints(p,now),Math.min(100,claimed*20));
 assert.equal(activityPoints(p,now+86_400_000),0,'a new day starts a fresh track');
});
test('each milestone pays once per day and only when reached',()=>{
 const p=freshPlayer();finishDaily(p,6);
 const points=activityPoints(p,now);assert.ok(points>=40);
 const gems=p.gems,horn=p.horn;
 assert.ok(claimActivity(p,1,now));assert.equal(claimActivity(p,1,now),null,'no second claim');
 assert.ok(p.horn>=horn||p.horn===horn);
 assert.equal(claimActivity(p,4,now)===null,points<100);
 assert.ok(activityView(p,now)[1].claimed);
 assert.equal(activityView(p,now+86_400_000)[1].claimed,false,'tomorrow the milestone is new');
 assert.equal(dayOf(now),'2026-11-24');assert.ok(p.gems>=gems);
});
