/** Offline calibration against fixed ordinary builds. Never scales enemies with live player stats. */
import {writeFileSync,readFileSync} from 'node:fs';
import {referencePlayer,fight} from './fairness';
import {stats} from '../../src/core/formulas';
import {damage} from '../../src/core/formulas';
import {curve} from '../../src/saga/regions';
const classes=['berserker','ranger','runologist'] as const;
// Anchor to the weakest ordinary class. Allow at least 5 unmitigated regular hits,
// and several simultaneous attacks, including phase III and ultimate multipliers.
for(let s=2;s<=60;s++){
 const heroes=classes.map(c=>stats(referencePlayer(s,c)));
 const hp=Math.min(...heroes.map(h=>h.hp)),mitigation=Math.min(...heroes.map(h=>damage(1000,h.defense*.25,s)/1000));
 curve.attack_table[s-1]=hp*.20/(27*mitigation);
 // Start from actual available attack; the pass below measures the real engine.
 curve.hp_table[s-1]=Math.min(...heroes.map(h=>h.attack))/stats(referencePlayer(1,'berserker')).attack;
}
for(let s=1;s<60;s++)curve.attack_table[s]=Math.max(curve.attack_table[s-1]*1.005,Math.min(curve.attack_table[s],curve.attack_table[s-1]*1.35));
for(let pass=0;pass<4;pass++){
 for(let s=2;s<=60;s++){
  const runs=classes.flatMap(c=>[0,1].map(v=>fight(s,5,c,'mixed',v,2026+s+v)));
  const longest=Math.max(...runs.map(r=>r.seconds));
  const target=s%10===0?23:s%5===0?19:16;
  curve.hp_table[s-1]*=Math.max(.7,Math.min(runs.some(r=>!r.win)?.85:1.35,(target/Math.max(1,longest))**.7));
 }
 // No table discontinuities or compound exponential growth.
 curve.hp_table[1]=1.5;
 for(let s=2;s<60;s++)curve.hp_table[s]=Math.max(curve.hp_table[s-1]*1.005,Math.min(curve.hp_table[s],curve.hp_table[s-1]*1.22));
}
const results=[];
for(let s=2;s<=60;s++)for(const c of classes)for(const v of [0,1])for(const wave of [1,2,3,4,5])results.push(fight(s,wave,c,'mixed',v,2026+s+v));
console.log(JSON.stringify({runs:results.length,losses:results.filter(r=>!r.win),worstHit:Math.max(...results.map(r=>r.maxHit)),bossMedian:results.filter(r=>r.wave===5).map(r=>r.seconds).sort((a,b)=>a-b)[177],tables:{hp:curve.hp_table,atk:curve.attack_table}},null,2));
if(process.argv.includes('--write')){const path='config/test-balance.v1.json',config=JSON.parse(readFileSync(path,'utf8'));for(const key of ['hp_table','attack_table'] as const)config.campaign_curve_test[key]=curve[key].map(n=>+n.toFixed(5));config.campaign_curve_test.note='TEST_ONLY: fixed mixed-equipment builds at lv8@2-3 and lv18@4-4; scripts/sim/fair-tune.ts. No scaling against live player stats.';writeFileSync(path,JSON.stringify(config,null,2)+'\n')}
