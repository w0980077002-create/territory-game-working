import {curve,threat} from '../saga/regions';
import type {ArenaBuild} from './hero';
import {advanceLive,applyLive,buildMatch,nextLiveWake,type ArenaMode,type LiveAction,type LiveMatch} from './match';

export const SOLO_ACTOR='solo';
export const PROOF_DURATION=60*60_000;
export const MAX_PROOF_MOVES=2048;
export type TeamArenaMode=Exclude<ArenaMode,'duel'>;
export type LocalProof={seed:number;startedAt:number;hero:ArenaBuild;stage:number;potions:number};
export type ProofMove=[at:number,action:LiveAction];

export function arenaRandom(seed:number){
 let state=seed>>>0;
 return {next:()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;},state:()=>state};
}

export function localBattle(id:string,mode:ArenaMode,build:ArenaBuild,stage:number,potions:number,now:number,rng:()=>number){
 const t=threat(stage);
 const bot:ArenaBuild={...build,hero:build.hero==='berserker'?'ranger':'berserker',
  stats:{hp:Math.round(t.bossHp*curve.arena_hp),attack:Math.round(t.bossAtk*.9),defense:Math.round(t.def),
   aspd:1,crit:.07,critDamage:1.5,lifesteal:0,dodge:.06,skillDamage:1,reduction:0},
  skills:[1,1,1],runes:[0,0,0],runePower:[1,1,1],spec:build.hero==='berserker'?'deadeye':'onslaught',
  sets:{frost:0,storm:0,rune:0,stone:0,legion:0,ember:0},perks:[],unique:[],
  aura:{execute30:0,execute35:0,boss:0,opening:0,thorns:0,veil:0,killHeal:0,regen:0,firstBlock:false,
   boltEvery:0,boltPower:0,rally:0,cooldownRate:1,foeHpCut:0,heroDamage:0},followers:[],branches:[-1,-1],
 };
 return buildMatch(id,mode,[{id:SOLO_ACTOR,name:'Вы',hero:build.hero,level:build.level,controller:SOLO_ACTOR,
  kit:'balanced',rating:1000,potions,rankEligible:false,build}],now,rng,bot);
}

// The proof uses scheduled times so render speed, tab suspension and reload cannot change the replay.
export function advanceLocal(match:LiveMatch,now:number,rng:()=>number){
 for(let previous=-1;;){
  const at=Math.ceil(nextLiveWake(match));
  if(at>now||at<=previous)return;
  advanceLive(match,at,rng);
  previous=at;
 }
}

export function applyLocal(match:LiveMatch,action:LiveAction,now:number,rng:()=>number){
 const player=match.game.players[0];
 return applyLive(match,SOLO_ACTOR,action,match.mode==='duel'?match.game.round:0,player.sequence+1,now,rng);
}

export function replayProof(id:string,mode:TeamArenaMode,config:LocalProof,moves:readonly ProofMove[],now:number){
 if(!moves.length||moves.length>MAX_PROOF_MOVES)return;
 const end=Math.min(now,config.startedAt+PROOF_DURATION);
 const random=arenaRandom(config.seed);
 const match=localBattle(id,mode,config.hero,config.stage,config.potions,config.startedAt,random.next);
 let earliest=config.startedAt;
 for(const [at,action] of moves){
  if(!Number.isSafeInteger(at)||at<earliest||at>end)return;
  advanceLocal(match,at,random.next);
  if(match.game.result||!applyLocal(match,action,at,random.next))return;
  earliest=at;
 }
 advanceLocal(match,end,random.next);
 const result=match.game.result;
 if(result&&match.game.players[0].fought&&(result.reason==='hp'||result.reason==='time'))return result;
}
