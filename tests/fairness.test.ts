import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fight,referencePlayer} from '../scripts/sim/fairness';
import {campaignPlan} from '../src/saga/regions';
import {damage,stats} from '../src/core/formulas';
import {rebaseEncounter,BALANCE_REVISION} from '../src/game/balanceRevision';
import {Battle} from '../src/game/Battle';
import {useGame,parseSave} from '../src/core/store';
import {validEncounter} from '../src/game/snapshot';
const classes=['berserker','ranger','runologist'] as const;
test('all sixty stages: mixed gear, both class builds, human skill cadence, no potions or perfect sets',()=>{
 const rows=[];
 for(let stage=1;stage<=60;stage++)for(const c of classes)for(const variant of [0,1])for(let wave=1;wave<=5;wave++){
  const r=fight(stage,wave,c,'mixed',variant,2026+stage+variant);rows.push(r);
  assert.equal(r.stage,stage);assert.equal(r.wave,wave);assert.equal(r.boss,wave===5);
  if(!r.win){const ready=fight(stage,wave,c,'prepared',variant,2026+stage+variant);assert.ok(ready.win,JSON.stringify({r,ready}));}
  assert.ok(r.maxHit<.6,JSON.stringify(r));
 }
 assert.ok(rows.filter(r=>r.win).length>=rows.length*.95,'at least 95% of mixed-gear encounters clear without a potion');
 const bosses=rows.filter(r=>r.wave===5&&r.stage>10).map(r=>r.seconds).sort((a,b)=>a-b);
 assert.ok(bosses[Math.floor(bosses.length/2)]>8,'ordinary boss encounters retain resistance');
});
test('enemy volleys, phase III ultimates and armour piercing cannot one-shot ordinary gear at any story stage',()=>{
 for(let stage=2;stage<=60;stage++)for(const c of classes)for(const seed of [7,123,2026]){
  const s=stats(referencePlayer(stage,c));
  for(let wave=1;wave<=5;wave++){
   const plan=campaignPlan(stage,wave,seed);
   const volley=plan.units.reduce((sum,u)=>sum+damage(u.atk,s.defense*.25,stage,wave===5?1.6*1.55+.5+.4:1.3),0);
   assert.ok(volley<s.hp*.85,`${stage}/${wave}/${c}: volley ${volley}/${s.hp}`);
  }
 }
});
test('upgrades and actions matter: neglected late builds lose; attainable preparation clears the same fights',()=>{
 let losses=0;
 for(const c of classes)for(const v of [0,1])for(const stage of [20,30,40,50,60]){
  const weak=fight(stage,5,c,'neglected',v,500+stage),ready=fight(stage,5,c,'prepared',v,500+stage);
  if(!weak.win)losses++;assert.ok(ready.win,JSON.stringify(ready));if(weak.win)assert.ok(ready.seconds<weak.seconds,'preparation must improve winning time');
 }
 assert.ok(losses>=5,`neglected builds need to hit meaningful resistance: ${losses}`);
});
test('legacy oversized battle rebases in place, preserves player possessions and pending actions, and reloads exactly once',()=>{
 const p=referencePlayer(34,'berserker');p.wave=4;useGame.setState({p,auto:false,panel:null});
 const b=new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement);b.phase='fight';b.hp=1234;b.cooldowns=[2,4,8];
 const old=b.snapshot();delete old.balanceRevision;
 for(const u of old.units){u.max*=50;u.hp=u.max*.4;u.atk*=90;u.windup=.4;}
 old.projectiles=[{source:'enemy',kind:'arrow',target:0,damage:old.units[0].atk*2,x0:500,y0:600,x1:400,y1:700,t:.2,duration:.55,crit:false}];old.hazard={remaining:3,tick:.7,damage:old.units[0].atk*.65};
 const before=structuredClone(p),plan=campaignPlan(34,4),fixed=rebaseEncounter(old,plan);
 assert.equal(fixed.id,old.id);assert.equal(fixed.hp,1234);assert.deepEqual(fixed.journey,old.journey);assert.deepEqual(fixed.cooldowns,old.cooldowns);assert.equal(fixed.timer,old.timer);assert.equal(fixed.units[0].windup,.4);
 assert.equal(fixed.units[0].atk,plan.units[0].atk);assert.ok(Math.abs(fixed.units[0].hp/fixed.units[0].max-.4)<1e-10);
 assert.ok(fixed.projectiles[0].damage<old.projectiles[0].damage/80);assert.equal(fixed.projectiles[0].t,.2);assert.ok(fixed.hazard!.damage<old.hazard!.damage/80);
 assert.equal(fixed.balanceRevision,BALANCE_REVISION);assert.ok(validEncounter(fixed));assert.deepEqual(rebaseEncounter(fixed,plan),fixed);assert.deepEqual(p,before);
 // Exercise the real hydration path, not just the pure conversion.
 b.destroy();useGame.setState({p:parseSave(JSON.stringify({...before,encounter:old}))!});const restored=new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement);
 assert.equal(restored.hp,1234);assert.equal(restored.units[0].atk,plan.units[0].atk);assert.equal(restored.id,old.id);assert.deepEqual(useGame.getState().p.equipment,before.equipment);restored.destroy();
});

test('all sixty stages: each class can overcome the rotating mini-boss lairs with attainable preparation',()=>{
 for(let stage=1;stage<=60;stage++)for(const c of classes){
  const r=fight(stage,5,c,'prepared',0,123+stage,'dungeon');
  assert.equal(r.mode,'dungeon');assert.ok(r.boss);assert.ok(r.win,JSON.stringify(r));assert.ok(r.maxHit<.6,JSON.stringify(r));
 }
});
