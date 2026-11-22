/**
 * Season audit (TEST_ONLY). Real Battle engine, real store actions, current balance — no table fitting.
 * Each day: daily/mine/mission claims, Dark Realm runs paid with chaosite, then campaign for the rest of
 * `minutes`; the clock then jumps to the next day so horn/mine/daily timers refill like for a real player.
 * Every spend action is counted as attempted vs. actually changed state, so bot mistakes show up.
 * Usage: npx tsx scripts/sim/season-audit.ts [days=350] [minutes=90] [class=berserker] [out.json]
 */
import {writeFileSync} from 'node:fs';
import {playCampaign,seedRandom,restoreRandom} from './bot';
import {useGame} from '../../src/core/store';
import {realmRun,realmLast,blessingIds,REALM_COST} from '../../src/dark/realm';
import {realmStart,chooseRealmPortal,collectRealmReward,darkUpgrade,darkEquip,relicUnlock,relicUpgrade,petLevel,gemSynthAll} from '../../src/dark/actions';
import {darkState,duskCount,resCount,relicIds,companions} from '../../src/dark/rules';
import {wingRank} from '../../src/saga/soloProgress';
import type {HeroClass} from '../../src/core/types';

const days=Number(process.argv[2]??350),minutes=Number(process.argv[3]??90),cls=(process.argv[4]??'berserker') as HeroClass,out=process.argv[5];
const G=()=>useGame.getState();
/** Share of the daily session a player spends in the Dark Realm (assumption, tweakable). */
const REALM_SHARE=Number(process.env.REALM_SHARE??.3);
const fp=()=>JSON.stringify(G().p);
const acts:Record<string,{tried:number;changed:number}>={};
/** Runs an action and records whether it really changed the save. */
function act(name:string,fn:()=>unknown){const before=fp();try{fn()}catch{/* counted as no change */}const a=acts[name]??={tried:0,changed:0};a.tried++;if(fp()!==before)a.changed++}
// Count the bot's own store calls as well.
for(const key of ['train','upgrade','equip','salvage','hornLoot'] as const){const orig=G()[key] as (...a:unknown[])=>unknown;useGame.setState({[key]:(...a:unknown[])=>{const before=fp(),r=orig(...a);const n=`${key}${key==='train'?':'+a[0]:''}`,x=acts[n]??={tried:0,changed:0};x.tried++;if(fp()!==before)x.changed++;return r}} as never)}

interface Day {day:number;stage:number;level:number;gold:number;forge:number;blessing:number;relic:number;wings:number;comp:string;skills:string;gearUp:number;floor:number;dusk:number;duskGain:number;ess:number;chaosite:number;realmRuns:number;darkUp:number;deaths:number}
const log:Day[]=[];let day=1,session=0,realmRuns=0,deaths=0,duskStart=0,started=false;
const originalNow=Date.now;let now=Date.UTC(2026,10,13,9);Date.now=()=>now;
function morning(){
 act('claim:daily',()=>G().claim('daily'));act('claim:mine',()=>G().claim('mine'));act('claim:mission',()=>G().claim('mission'));
 duskStart=duskCount(G().p);realmRuns=0;deaths=0;
}
function spendDark(){
 const p=G().p,s=darkState(p);
 for(const item of [...s.inv].sort((a,b)=>b.r-a.r)){const cur=s.eq[item.s];if(!cur||item.r>cur.r)act('dark:equip',()=>darkEquip(item.id))}
 for(const item of darkState(G().p).eq)if(item)act('dark:upgrade',()=>darkUpgrade(item.id));
 for(const id of relicIds){act('relic:unlock',()=>relicUnlock(id));act('relic:upgrade',()=>relicUpgrade(id))}
 for(const id of Object.keys(companions))if(G().p.gold>2000)act('pet:level',()=>petLevel(id));
 act('gem:synth',()=>gemSynthAll());
}
function record(){const p=G().p,s=darkState(p);log.push({day,stage:p.stage,level:p.level,gold:p.gold,forge:p.forge,blessing:p.blessing,relic:p.relic,wings:p.equipment.wings?wingRank(p):0,comp:p.companions.join('/'),skills:p.skills.join('/'),gearUp:Object.values(p.equipment).reduce((n,i)=>n+(i?.upgrade??0),0),floor:p.darkFloor,dusk:duskCount(p),duskGain:duskCount(p)-duskStart,ess:resCount(p,'ess'),chaosite:p.chaosite,realmRuns,darkUp:s.eq.reduce((n,i)=>n+(i?.u??0),0),deaths})}
seedRandom(2026+cls.length);
const t0=originalNow();
try{
 playCampaign(cls,100000,{spend:.5,ordinary:false,skillDelay:1.7,maxDefeats:1e9,maxSeconds:days*minutes*60,
  onTick:b=>{
   if(!started){started=true;morning()}
   const p=G().p;if(b.phase==='defeat')deaths+=0;
   const run=realmRun(p),last=realmLast(p);
   if(run?.stage.startsWith('CHOICE_')&&run.pair?.[0])chooseRealmPortal(run.pair[0].id);
   else if(last&&!last.ack){act('realm:collect',()=>collectRealmReward());spendDark();if(b.mode==='campaign'&&!b.running)b.toggle()}
   else if(!run&&session<minutes*60*REALM_SHARE&&b.mode!=='darkness'&&p.chaosite>=REALM_COST&&!(p.rewardOffer&&!p.rewardOffer.resolved)){
    const floor=Math.max(1,p.darkFloor);act('realm:start',()=>realmStart(floor,blessingIds[0]));if(realmRun(G().p)){realmRuns++;if(!b.running)b.toggle()}
   }
  },
  advanceTime:s=>{now+=s*1000;session+=s;if(session>=minutes*60){spendDark();record();session=0;day++;now+=(24*60-minutes)*60*1000;morning()}}});
}finally{Date.now=originalNow;restoreRandom()}
console.log(`# ${cls} · ${minutes} мин/день · ${log.length} дн. · ${((originalNow()-t0)/1000).toFixed(0)} с`);
console.log('день этап  ур     золото кузн благ рел крл   спутн   навыки +экип этаж сумр +/дн эсс хаос похд т+');
for(const d of [1,2,3,7,14,30,60,90,120,180,240,300,350].filter(d=>d<=log.length)){const r=log[d-1];console.log([r.day,r.stage,r.level,r.gold,r.forge,r.blessing,r.relic,r.wings,r.comp,r.skills,r.gearUp,r.floor,r.dusk,r.duskGain,r.ess,r.chaosite,r.realmRuns,r.darkUp].map(String).map((v,i)=>v.padStart([4,5,4,10,5,5,4,4,7,8,6,5,5,5,4,5,5,3][i])).join(' '))}
console.log('действия (попытки → изменили состояние):',Object.entries(acts).map(([k,v])=>`${k} ${v.tried}→${v.changed}`).join(' · '));
if(out)writeFileSync(out,JSON.stringify({cls,minutes,log,acts},null,1));
