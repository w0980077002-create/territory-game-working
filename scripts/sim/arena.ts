import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {mkdtempSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {freshPlayer,makeItem} from '../../src/core/store';
import {arenaBuild,validArenaBuild} from '../../src/arena/hero';
import {advanceLive,applyLive,buildMatch,capacities,viewLive,type ArenaMode} from '../../src/arena/match';
import {startLocalArena,updateLocalArena,SOLO_ACTOR} from '../../src/arena/local';
import {slots} from '../../src/data/catalog';
import {LiveArena} from '../../server/arena/live';

export function seeded(seed:number){
 return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32};
}
export function hero(level:number,developed:boolean){
 const p=freshPlayer();
 p.level=level;p.stage=Math.min(200,Math.max(1,level*2));
 p.heroClass=developed?'runologist':'berserker';
 p.equipment=Object.fromEntries(slots.filter(slot=>slot!=='wings'||developed).map(slot=>[slot,makeItem(slot,level,developed?5:1)]));
 if(developed){
  p.skills=[Math.ceil(level/4),5,Math.ceil(level/5)];
  p.talents=[Math.floor(level/6),Math.floor(level/8),0];
  p.equipment.weapon!.set=p.equipment.helmet!.set=p.equipment.boots!.set=p.equipment.extra1!.set='rune';
  p.equipment.ring1!.perk='moss';p.equipment.amulet!.perk='heart';
 }
 return p;
}
const modes=Object.keys(capacities) as ArenaMode[];
const dates=Array.from({length:30},(_,i)=>17+i);
const samples:number[]=[];
const quantile=(xs:number[],quant:number)=>[...xs].sort((a,b)=>a-b)[Math.ceil(xs.length*quant)-1];
const report=(samples:number[])=>({min:Math.min(...samples),p50:quantile(samples,.5),p95:quantile(samples,.95),max:Math.max(...samples)});

function simulate(){
 for(const level of [1,35,120])for(const mode of modes){
  const seconds:number[]=[],localSeconds:number[]=[];
  let wins=0,draws=0,elapsed=0,localWins=0;
  for(const seed of dates){
   const rng=seeded(seed);
   const low=arenaBuild(hero(level,false)),high=arenaBuild(hero(level,true));
   if(!validArenaBuild(low)||!validArenaBuild(high))throw new Error('Unexpected hero snapshot');
   const entrants=Array.from({length:capacities[mode]},(_,i)=>{
    const build=i===0?high:low;
    return {id:String(i+1),name:'Игрок '+i,level,hero:build.hero,build,kit:'balanced' as const,controller:'tab',rating:1000};
   });
   const match=buildMatch('sim',mode,entrants,0,rng);
   for(const player of match.game.players)applyLive(match,player.id,{kind:'auto',enabled:true},mode==='duel'?1:0,1,0,rng);
   for(elapsed=0;!match.game.result&&elapsed<=3_600_000;elapsed+=200)advanceLive(match,elapsed,rng);
   const result=viewLive(match,'1','tab',elapsed).result!;
   seconds.push(result.finishedAt/1000);
   if(result.outcome==='win')wins++;
   if(result.outcome==='draw')draws++;
   const player=hero(level,true);
   const original=Math.random;
   try{
    Math.random=rng;
    startLocalArena(player,'local',mode,0);
    updateLocalArena(player,0,{kind:'auto',enabled:true});
    const local=player.localArena!.match;
    for(elapsed=0;!local.game.result&&elapsed<=3_600_000;elapsed+=200)advanceLive(local,elapsed,rng);
    const result=viewLive(local,SOLO_ACTOR,SOLO_ACTOR,elapsed,true).result!;
    localSeconds.push(result.finishedAt/1000);
    if(result.outcome==='win')localWins++;
   }finally{Math.random=original}
  }
  console.log(JSON.stringify({level,mode,seeds:dates.length,network:{wins,draws,...report(seconds)},local:{wins:localWins,...report(localSeconds)}}));
 }
}

function sustain(){
 const seconds:number[]=[];
 const build=arenaBuild(hero(120,true));
 const fortified={...build,stats:{...build.stats,hp:build.stats.hp*3,lifesteal:.55,reduction:.45},
  aura:{...build.aura,regen:.01,firstBlock:true}};
 let timedOut=0;
 for(const seed of dates){
  const rng=seeded(seed),entry={name:'Герой',level:120,hero:build.hero,build:fortified,kit:'balanced' as const,controller:'tab',rating:1000};
  const match=buildMatch('sustain','duel',[{...entry,id:'1'},{...entry,id:'2'}],0,rng);
  for(const id of ['1','2'])applyLive(match,id,{kind:'auto',enabled:true},1,1,0,rng);
  for(let tick=0;!match.game.result&&tick<=3_600_000;tick+=200)advanceLive(match,tick,rng);
  seconds.push(match.game.result!.finishedAt/1000);
  if(match.game.result!.reason==='time')timedOut++;
 }
 console.log(JSON.stringify({sustain:{level:120,stressScenario:'triple HP, 55% lifesteal, 45% damage reduction, 1% HP/s + gear regen',
  seeds:dates.length,timeout:timedOut,...report(seconds)}}));
}

function sqlite(){
 const root=mkdtempSync(join(tmpdir(),'vvr-arena-bench-')),path=join(root,'arena.sqlite');
 const arena=new LiveArena(path,seeded(47)),build=arenaBuild(hero(35,true));
 try{
  let now=Date.now(),ops=0;
  const st=performance.now();
  const record=(fn:()=>unknown)=>{const at=performance.now();fn();samples.push(performance.now()-at);ops++};
  for(let battle=0;battle<300;battle++){
   now+=61_000;
   const mode=modes[battle%modes.length];
   const players=Array.from({length:capacities[mode]},(_,i)=>({id:String(1000+i),controller:'tab'}));
   for(const actor of players)record(()=>arena.join(actor,mode,build,'Игрок '+actor.id,now,true));
   for(const actor of players)record(()=>{
    const fight=arena.state(actor,now).battle!;
    arena.act(actor,fight.id,fight.revision,{kind:'auto',enabled:true},fight.round??0,fight.nextSequence,now);
   });
   for(let step=0;step<60;step++)record(()=>arena.tick(now+step*1000));
  }
  const elapsed=performance.now()-st;
  console.log(JSON.stringify({sqlite:{battles:300,ops,ms:elapsed,throughput:Math.round(ops/(elapsed/1000)),
   milliseconds:report(samples),databaseBytes:statSync(path).size,walBytes:statSync(path+'-wal').size}}));
 } finally {arena.close();rmSync(root,{recursive:true,force:true})}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){simulate();sustain();sqlite();}
