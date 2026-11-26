/**
 * Target simulation of Arena consumables V1.0 on the real engine (Issue #81, comment 7186062726).
 * Run: npx tsx scripts/sim/consumables.ts   → JSON lines; summary in docs/qa/consumables-v1/SIMULATION.md.
 * Fights are server fights built with buildMatch; every fighter is on auto strikes. "items" sides also drink from a
 * 7-slot belt by a simple manual-player policy: heals below 50% HP, everything else as soon as the engine accepts it.
 */
import {pathToFileURL} from 'node:url';
import {arenaBuild} from '../../src/arena/hero';
import {advanceLive,applyLive,buildMatch,capacities,type ArenaMode,type LiveMatch} from '../../src/arena/match';
import {consumablePrice,type ConsumableId} from '../../src/arena/potion';
import {stageGold} from '../../src/saga/regions';
import {LEVEL_RANGE} from '../../src/arena/protocol';
import {hero,seeded} from './arena';

type Belt=ConsumableId[];
export const belts:Record<string,Belt>={
 none:[],
 heart:['potion'],
 offense:['berserk','thor','mars','apollo','fenrir','odin','potion'],
 defense:['aegis','steel','mercury','valkyrie','tear','potion','bifrost'],
 sustain:['potion','tear','hel','aegis','valkyrie','neptune','steel'],
 control:['niflheim','venom','muspel','loki','odin','minerva','potion'],
};
const heals=new Set<ConsumableId>(['potion','tear','neptune']);
const quantile=(xs:number[],q:number)=>[...xs].sort((a,b)=>a-b)[Math.max(0,Math.ceil(xs.length*q)-1)];

function entrant(id:string,level:number,developed:boolean,belt:Belt){
 const build=arenaBuild(hero(level,developed));
 return {id,name:'Игрок '+id,level:build.level,hero:build.hero,build,kit:'balanced' as const,controller:'sim',rating:1000,
  potions:belt.includes('potion')?5:0,loadout:[...belt,...Array(7-belt.length).fill(null)],
  stock:Object.fromEntries(belt.filter(id=>id!=='potion').map(id=>[id,5]))};
}

function drink(match:LiveMatch,now:number,rng:()=>number,spent:Map<string,number>){
 for(const player of match.game.players){
  if(!player.hp||!player.loadout)continue;
  for(const item of player.loadout){
   if(!item||!player.belt[item]||now<(player.itemAt[item]??0))continue;
   if(heals.has(item)&&player.hp>player.maxHp*.5)continue;
   if(applyLive(match,player.id,{kind:'item',item},match.mode==='duel'?match.game.round:0,player.sequence+1,now,rng)){
    spent.set(item,(spent.get(item)??0)+1);break;
   }
  }
 }
}

/** One fight: side 0 = even entrants (player "0" is ours), side 1 = odd. Returns winner side, seconds and spend. */
export function fight(mode:ArenaMode,level:number,foeLevel:number,ours:Belt,theirs:Belt,seed:number,developed=false){
 const rng=seeded(seed),size=capacities[mode];
 const entrants=Array.from({length:size},(_,i)=>i%2===0?entrant(String(i),level,developed,ours):entrant(String(i),foeLevel,developed,theirs));
 const match=buildMatch('sim',mode,entrants,0,rng),spent=new Map<string,number>();
 for(const p of match.game.players)applyLive(match,p.id,{kind:'auto',enabled:true},mode==='duel'?1:0,1,0,rng);
 let now=0;
 for(;!match.game.result&&now<=3_600_000;now+=250){
  advanceLive(match,now,rng);
  if(!match.game.result&&(ours.length||theirs.length))drink(match,now,rng,spent);
 }
 const result=match.game.result!;
 const winner='winner' in result&&typeof result.winner==='number'?result.winner:
  result.winner===null?null:match.game.players.findIndex(p=>p.id===result.winner)%2;
 const ourSpend=[...spent].filter(([id])=>ours.includes(id as ConsumableId));
 return {winner,seconds:result.finishedAt/1000,reason:result.reason,spent};
}

function run(label:string,mode:ArenaMode,level:number,foe:number,ours:Belt,theirs:Belt,seeds:number){
 let wins=0,draws=0;const seconds:number[]=[],totals=new Map<string,number>();
 for(let seed=1;seed<=seeds;seed++){
  const r=fight(mode,level,foe,ours,theirs,seed*7919+level);
  if(r.winner===0)wins++;if(r.winner===null)draws++;
  seconds.push(r.seconds);
  for(const [id,n] of r.spent)totals.set(id,(totals.get(id)??0)+n);
 }
 // Gold: our side's average spend per fight, per fighter, against one regular stage win at the player's stage.
 const stage=Math.max(1,level*2),fighters=Math.ceil(capacities[mode]/2);
 let gold=0;for(const [id,n] of totals)if(ours.includes(id as ConsumableId))gold+=n*consumablePrice(id as ConsumableId,stage);
 const perFighter=gold/seeds/fighters;
 console.log(JSON.stringify({label,mode,level,foe,ours:ours.join('+')||'—',theirs:theirs.join('+')||'—',seeds,
  winRate:+(wins/seeds).toFixed(2),draws,p50:quantile(seconds,.5),p95:quantile(seconds,.95),max:Math.max(...seconds),
  goldPerFight:Math.round(perFighter),stageWins:+(perFighter/stageGold(stage,false)).toFixed(2)}));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const only=process.argv[2];
 if(!only||only==='levels')for(const level of [1,25,50,100,150])for(const mode of Object.keys(capacities) as ArenaMode[]){
  const seeds=mode==='chaos'?6:mode==='team'?16:40;
  run('auto, no items',mode,level,level,[],[],seeds);
  run('items vs auto',mode,level,level,belts.sustain,[],seeds);
  run('items both',mode,level,level,belts.sustain,belts.offense,seeds);
  run('weaker+items vs +'+LEVEL_RANGE,mode,level,level+LEVEL_RANGE,belts.sustain,[],seeds);
 }
 if(!only||only==='combos')for(const level of [25,100]){
  const names=Object.keys(belts);
  for(const a of names)for(const b of names)if(a!==b)run('combo '+a+' vs '+b,'duel',level,level,belts[a],belts[b],40);
 }
}
