import type {Player} from '../core/types';
import {arenaBuild,validArenaBuild} from './hero';
import {advanceLocal,applyLocal,arenaRandom,localBattle,MAX_PROOF_MOVES,SOLO_ACTOR,type LocalProof,type ProofMove} from './localProof';
import {capacities,type ArenaMode,type LiveAction,type LiveMatch} from './match';
import {potionStock} from './potion';
import {CHAT_MS} from './protocol';

export {SOLO_ACTOR};
export type SavedArena={match:LiveMatch;reward?:{seal:boolean};proof?:{random:number;clockOffset?:number;moves:ProofMove[];status?:'accepted'|'closed'}};
export function localArena(p:Player){
 const saved=p.localArena;
 const match=saved?.match;
 const game=match?.game;
 if(match&&Object.hasOwn(capacities,match.mode)&&game&&typeof game.id==='string'&&Array.isArray(game.players)&&game.players[0]?.id===SOLO_ACTOR&&
  validArenaBuild(game.players[0].combat?.build)&&Array.isArray(game.log)&&Array.isArray(game.chat))return saved;
}

export function startLocalArena(p:Player,id:string,mode:ArenaMode,now:number,proof?:LocalProof,serverNow=now){
 const saved=localArena(p);
 if(saved?.match.game.id===id||saved&&!saved.match.game.result&&now<saved.match.game.players[0].seenAt+CHAT_MS)return false;
 const random=proof?arenaRandom(proof.seed):undefined;
 const match=localBattle(id,mode,proof?.hero??arenaBuild(p),proof?.stage??p.stage,
  proof?.potions??potionStock(p),proof?.startedAt??now,random?.next??Math.random);
 p.localArena={match,...(random?{proof:{random:random.state(),moves:[],clockOffset:serverNow-now}}:{})};
 return true;
}

export const localTime=(saved:SavedArena,wall:number)=>wall+(saved.proof?.clockOffset??0);

export function updateLocalArena(p:Player,now:number,action?:LiveAction){
 const saved=localArena(p);
 if(!saved)return false;
 const {match,proof}=saved,before=JSON.stringify(match);
 now=localTime(saved,now);
 const random=proof?arenaRandom(proof.random):undefined;
 const rng=random?.next??Math.random;
 advanceLocal(match,now,rng);
 if(action){
  const potion=action.kind==='item';
  if(potion&&(action.item!=='potion'||potionStock(p)<1))return false;
  if(!applyLocal(match,action,now,rng))return false;
  if(potion)p.arenaPotions=potionStock(p)-1;
  if(proof&&action.kind!=='chat'){
   if(proof.moves.length<MAX_PROOF_MOVES)proof.moves.push([now,action]);
   else delete saved.proof;
  }
 }
 if(random&&saved.proof)saved.proof.random=random.state();
 return before!==JSON.stringify(match);
}
