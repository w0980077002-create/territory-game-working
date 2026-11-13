/**
 * Calibrates campaign_curve_test.hp_table / attack_table so the diligent bot meets the targets in
 * campaign_curve_test.bot_target on every stage. Run: npx tsx scripts/sim/calibrate.ts [passes] [--write]
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {playCampaign} from './bot';
import {curve,stageInRegion} from '../../src/saga/regions';
import type {HeroClass} from '../../src/core/types';
const passes=Number(process.argv[2]??8),write=process.argv.includes('--write'),target=curve.bot_target,N=curve.hp_table.length;
const ramp=(s:number)=>Math.min(1,(s-2)/target.ramp_stages),bossTarget=(s:number)=>(target.boss_seconds_start+(target.boss_seconds_end-target.boss_seconds_start)*ramp(s))*(stageInRegion(s)===10?curve.finale_hp:stageInRegion(s)===5?curve.midboss_hp:1),hpTarget=(s:number)=>target.taken_start+(target.taken_end-target.taken_start)*ramp(s);
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const history:{hp:number[];atk:number[]}[]=[];
for(let pass=0;pass<passes;pass++){
 const time=new Array(N+1).fill(0),left=new Array(N+1).fill(0),seen=new Array(N+1).fill(0),lost=new Array(N+1).fill(0);let reached=99;
 for(const c of ['berserker','ranger','runologist'] as HeroClass[]){const log=playCampaign(c,N+1,{potions:false});reached=Math.min(reached,log.at(-1)?.stage??0);for(const r of log){time[r.stage]+=r.bossTime;left[r.stage]+=r.taken;seen[r.stage]++;lost[r.stage]+=r.defeats}}
 let err=0;const gain=pass<3?.7:.35;
 for(let s=2;s<=N;s++){
  if(!seen[s]){curve.hp_table[s-1]*=.8;curve.attack_table[s-1]*=.85;continue}
  const t=time[s]/seen[s],h=left[s]/seen[s],defeats=lost[s]/seen[s];
  let hpAdj=clamp((bossTarget(s)/Math.max(.5,t))**gain,.5,2.2),atkAdj=clamp((hpTarget(s)/Math.max(.02,h))**gain,.6,1.6);
  if(defeats>0){hpAdj=Math.min(hpAdj,.85**Math.min(3,defeats));atkAdj=Math.min(atkAdj,.9)}
  curve.hp_table[s-1]*=hpAdj;curve.attack_table[s-1]*=atkAdj;err+=Math.abs(Math.log(hpAdj))+Math.abs(Math.log(atkAdj));
 }
 // Keep the curve monotone and free of single-stage jumps.
 for(const table of [curve.hp_table,curve.attack_table]){table[0]=1;for(let s=1;s<N;s++)table[s]=clamp(table[s],table[s-1]*1.01,table[s-1]*1.6)}
 history.push({hp:[...curve.hp_table],atk:[...curve.attack_table]});
 console.log(`pass ${pass+1}: reached ${reached} · error ${err.toFixed(2)} · hp@10/30/60 ${[10,30,60].map(s=>curve.hp_table[s-1].toFixed(1)).join('/')} · atk ${[10,30,60].map(s=>curve.attack_table[s-1].toFixed(1)).join('/')}`);
}
// Final curve: geometric mean of the last passes, smoothed in log space, with slack for less optimal players.
const lastRuns=history.slice(-Math.min(5,history.length)),margin=target.margin as {hp:number;attack:number};
function finish(key:'hp'|'atk',slack:number){let v=Array.from({length:N},(_,s)=>lastRuns.reduce((a,h)=>a+Math.log(h[key][s]),0)/lastRuns.length);for(let round=0;round<4;round++)v=v.map((_,s)=>{let sum=0,weight=0;for(let d=-3;d<=3;d++){const n=s+d;if(n<0||n>=N)continue;const w=4-Math.abs(d);sum+=v[n]*w;weight+=w}return sum/weight});const out=v.map((x,s)=>s===0?1:Math.exp(x)*slack);out[0]=1;for(let s=1;s<N;s++)out[s]=Math.max(out[s],out[s-1]*1.02);return out}
const hpFinal=finish('hp',margin.hp),atkFinal=finish('atk',margin.attack);curve.hp_table.splice(0,N,...hpFinal);curve.attack_table.splice(0,N,...atkFinal);
{let total=0,worst=0,reached=99;for(let run=0;run<2;run++)for(const c of ['berserker','ranger','runologist'] as HeroClass[]){const log=playCampaign(c,N+1);reached=Math.min(reached,log.at(-1)?.stage??0);for(const r of log){total+=r.defeats;worst=Math.max(worst,r.defeats)}}console.log(`verify: reached ${reached} · defeats total ${total} (6 runs) · worst stage ${worst}`)}
if(write){const path=new URL('../../config/test-balance.v1.json',import.meta.url),json=JSON.parse(readFileSync(path,'utf8'));const round=(v:number)=>Number(v.toPrecision(4));json.campaign_curve_test.hp_table=curve.hp_table.map(round);json.campaign_curve_test.attack_table=curve.attack_table.map(round);writeFileSync(path,JSON.stringify(json,null,2)+'\n');console.log('written')}
