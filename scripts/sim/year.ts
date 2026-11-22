/**
 * Year-long season simulator (TEST_ONLY). The ordinary bot plays `minutes` per day on the real Battle engine;
 * between sessions the wall clock jumps to the next day (horn, mine and daily timers refill as for a real player).
 * It fits a per-level XP table so that level L is reached on day 350·((L-1)/99)^k, re-simulating until stable.
 * Usage: npx tsx scripts/sim/year.ts [days=350] [minutes=90] [iterations=3] [k=1.8]
 * Output: scratch JSON with the fitted table + a day-by-day progression log.
 */
import {writeFileSync} from 'node:fs';
import {playCampaign,seedRandom,restoreRandom} from './bot';
import {useGame} from '../../src/core/store';
import balance from '../../config/test-balance.v1.json';

const days=Number(process.argv[2]??350),minutes=Number(process.argv[3]??90),iterations=Number(process.argv[4]??3),k=Number(process.argv[5]??1.8);
const out=process.argv[6]??'season-fit.json';
const settings=balance.progression_test_settings as typeof balance.progression_test_settings&{level_exp_table?:number[]};
const MAX=100,targetDay=(L:number)=>days*((L-1)/(MAX-1))**k;
interface Day {day:number;stage:number;level:number;xpTotal:number;forge:number;blessing:number;relic:number;comp:string;skills:string;gearUp:number;gold:number}

function totalXp(level:number,xp:number){let s=xp;for(let l=1;l<level;l++)s+=settings.level_exp_table![Math.min(l,MAX)-1];return s}
function simulate():Day[]{
 const originalNow=Date.now;let now=Date.UTC(2026,10,13,9),session=0,day=1;const log:Day[]=[];
 const record=()=>{const p=useGame.getState().p;log.push({day,stage:p.stage,level:p.level,xpTotal:totalXp(p.level,p.xp),forge:p.forge,blessing:p.blessing,relic:p.relic,comp:p.companions.join('/'),skills:p.skills.join('/'),gearUp:Object.values(p.equipment).reduce((s,i)=>s+(i?.upgrade??0),0),gold:p.gold})};
 Date.now=()=>now;seedRandom(2026);
 try{playCampaign('berserker',100000,{spend:.5,ordinary:true,skillDelay:1.7,maxDefeats:1e9,maxSeconds:days*minutes*60,advanceTime:s=>{
  now+=s*1000;session+=s;
  if(session>=minutes*60){record();session=0;day++;now+=(24*60-minutes)*60*1000}
 }})}finally{Date.now=originalNow;restoreRandom()}
 return log;
}
/** Cumulative XP needed to reach level L is the XP the bot had earned by targetDay(L). */
function fit(log:Day[],old:number[]):number[]{
 const cumAt=(d:number)=>{if(d<=0)return 0;const i=Math.min(log.length-1,Math.max(0,Math.ceil(d)-1)),lo=i?log[i-1].xpTotal:0,f=d-Math.floor(d)||1;return lo+(log[i].xpTotal-lo)*f};
 // XP earned depends on stage, not on the table, so earned XP is table-independent: reuse it directly.
 const table:number[]=[];for(let L=1;L<MAX;L++)table.push(Math.max(50,Math.round(cumAt(targetDay(L+1))-cumAt(targetDay(L)))));
 table.push(old.at(-1)??table.at(-1)!);return table;
}
let table=Array.from({length:MAX},(_,i)=>Math.round(100*1.08**i));
for(let it=1;it<=iterations;it++){
 settings.level_exp_table=table;const t=Date.now(),log=simulate();
 const at=(d:number)=>log[Math.min(log.length,d)-1];
 console.log(`\n== итерация ${it} · ${((Date.now()-t)/1000).toFixed(0)} с`);
 console.log('день этап  ур  кузн благ рел спутн  навыки +экип');
 for(const d of [1,2,3,7,14,30,60,90,120,180,240,300,350].filter(d=>d<=log.length)){const r=at(d);console.log([r.day,r.stage,r.level,r.forge,r.blessing,r.relic,r.comp,r.skills,r.gearUp].map(String).map((v,i)=>v.padStart([4,5,4,5,5,4,6,8,6][i])).join(' '))}
 writeFileSync(out,JSON.stringify({iteration:it,minutes,days,k,table,log},null,1));
 table=fit(log,table);
}
settings.level_exp_table=table;
writeFileSync(out.replace('.json','-table.json'),JSON.stringify(table));
console.log('\nИтоговая таблица (опыт на уровень), каждые 10:',table.filter((_,i)=>i%10===0).join(' · '));
