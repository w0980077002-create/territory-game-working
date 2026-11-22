/**
 * Season pacing simulator (TEST_ONLY numbers). Plays the real Battle engine headless with the existing
 * "ordinary player" bot and records, per cleared stage, the game time spent and every progression system.
 * Usage: npx tsx scripts/sim/season.ts [untilStage=200] [minutesPerDay=40] [class=berserker] [mode=ordinary|diligent]
 */
import {playCampaign,seedRandom,restoreRandom} from './bot';
import {useGame} from '../../src/core/store';
import {xpNeeded} from '../../src/core/formulas';
import {wingRank} from '../../src/saga/soloProgress';
import {stageXp} from '../../src/saga/regions';
import type {HeroClass} from '../../src/core/types';

const until=Number(process.argv[2]??200),perDay=Number(process.argv[3]??40),cls=(process.argv[4]??'berserker') as HeroClass,mode=process.argv[5]??'ordinary';
const originalNow=Date.now;let now=Date.UTC(2026,10,13),played=0,lastStage=1;
Date.now=()=>now;
interface Row {stage:number;hours:number;day:number;level:number;forge:number;blessing:number;relic:number;wings:number;comp:string;skills:string;gearUp:number;cp:number;gold:number}
const rows:Row[]=[];
const snap=()=>{const p=useGame.getState().p,up=Object.values(p.equipment).reduce((s,i)=>s+(i?.upgrade??0),0);
 rows.push({stage:p.stage,hours:played/3600,day:Math.ceil(played/60/perDay),level:p.level,forge:p.forge,blessing:p.blessing,relic:p.relic,wings:p.equipment.wings?wingRank(p):0,comp:p.companions.join('/'),skills:p.skills.join('/'),gearUp:up,cp:0,gold:p.gold})};
seedRandom(2026);
const t0=originalNow();
try{
 playCampaign(cls,until,{spend:.5,ordinary:mode==='ordinary',skillDelay:1.7,maxSeconds:3_000_000,advanceTime:s=>{now+=s*1000;played+=s;const st=useGame.getState().p.stage;if(st!==lastStage){lastStage=st;snap()}}});
}finally{Date.now=originalNow;restoreRandom()}
const p=useGame.getState().p;
console.log(`# ${cls} · ${mode} · ${perDay} мин/день · стоп на этапе ${p.stage} · ${(played/3600).toFixed(1)} ч игры · расчёт ${((originalNow()-t0)/1000).toFixed(0)} с`);
console.log('этап  часы  день  ур  кузн благ рел крыл  спутн  навыки  +экип');
for(const r of rows)if(r.stage<=10||r.stage%10===1||r===rows.at(-1))console.log([r.stage,r.hours.toFixed(1),r.day,r.level,r.forge,r.blessing,r.relic,r.wings,r.comp,r.skills,r.gearUp].map(String).map((v,i)=>v.padStart([4,5,5,4,5,5,4,4,7,8,6][i])).join(' '));
// Analytic: XP needed to reach level 100 vs XP a campaign stage pays.
let total=0;const need:Record<number,number>={};for(let l=1;l<100;l++){total+=xpNeeded(l);if([20,30,40,50,60,80,99].includes(l))need[l+1]=total}
console.log('\nСуммарный опыт до уровня:',Object.entries(need).map(([l,v])=>`${l}: ${v.toExponential(2)}`).join(' · '));
console.log('Опыт за этап (4 волны + босс): этап 60 =',4*stageXp(60,false)+stageXp(60,true),'· этап 200 =',4*stageXp(200,false)+stageXp(200,true));
