import {playCampaign,seedRandom,restoreRandom} from './bot';
const originalNow=Date.now;let now=Date.UTC(2026,10,13);Date.now=()=>now;
try{for(const [n,c] of (['berserker','ranger','runologist'] as const).entries()){
 now=Date.UTC(2026,10,13);seedRandom(2026+n);
 const log=playCampaign(c,61,{ordinary:true,skillDelay:1.7,advanceTime:s=>now+=s*1000});
 console.log(c,'cleared',log.at(-1)?.stage,'defeats',log.reduce((s,r)=>s+r.defeats,0));
 console.log(log.filter(r=>r.stage%5===0||r.stage===13||r.stage===34).map(r=>({stage:r.stage,level:r.level,cp:r.cp,boss:r.bossTime.toFixed(1),taken:r.taken.toFixed(2),hp:r.hpLeft.toFixed(2),defeats:r.defeats})));
}}finally{Date.now=originalNow;restoreRandom()}
