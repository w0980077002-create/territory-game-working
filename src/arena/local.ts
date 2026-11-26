import type {Player} from '../core/types';
import {arenaBuild,validArenaBuild} from './hero';
import {advanceLocal,applyLocal,arenaRandom,localBattle,MAX_PROOF_MOVES,SOLO_ACTOR,type LocalProof,type ProofMove} from './localProof';
import {capacities,type ArenaMode,type LiveAction,type LiveMatch} from './match';
import {potionStock} from './potion';
import {beltHas,playerBelt} from './belt';
import {CHAT_MS} from './protocol';

export {SOLO_ACTOR};
export type SavedArena={match:LiveMatch;reward?:{seal:boolean};confirmedPotions?:number;
 pendingPotion?:{operation:string;at:number};proof?:{random:number;clockOffset?:number;moves:ProofMove[];status?:'accepted'|'closed'}};
export function localArena(p:Player){
 const saved=p.localArena;
 const match=saved?.match;
 const game=match?.game;
 if(match&&Object.hasOwn(capacities,match.mode)&&game&&typeof game.id==='string'&&Array.isArray(game.players)&&game.players[0]?.id===SOLO_ACTOR&&
  validArenaBuild(game.players[0].combat?.build)&&Array.isArray(game.log)&&Array.isArray(game.chat))return saved;
}

export function startLocalArena(p:Player,id:string,mode:ArenaMode,now:number,proof?:LocalProof,serverNow=now,confirmedPotions=0){
 const saved=localArena(p);
 if(saved?.match.game.id===id||saved&&!saved.match.game.result&&now<saved.match.game.players[0].seenAt+CHAT_MS)return false;
 const random=proof?arenaRandom(proof.seed):undefined;
 // The belt is fixed here for the whole fight; the server already zeroed reserved potions for a belt without them.
 const loadout=playerBelt(p),carries=beltHas(loadout,'potion');
 const match=localBattle(id,mode,proof?.hero??arenaBuild(p),proof?.stage??p.stage,
  proof?.potions??(carries?potionStock(p)+confirmedPotions:0),proof?.startedAt??now,random?.next??Math.random,loadout);
 p.localArena={match,...(confirmedPotions>0?{confirmedPotions}:{}),...(random?{proof:{random:random.state(),moves:[],clockOffset:serverNow-now}}:{})};
 return true;
}

export const localTime=(saved:SavedArena,wall:number)=>wall+(saved.proof?.clockOffset??0);

export function updateLocalArena(p:Player,now:number,action?:LiveAction,confirmed=false){
 const saved=localArena(p);
 if(!saved||saved.pendingPotion&&!confirmed)return false;
 const {match,proof}=saved,before=JSON.stringify(match);
 now=localTime(saved,now);
 const random=proof?arenaRandom(proof.random):undefined;
 const rng=random?.next??Math.random;
 advanceLocal(match,now,rng);
 if(action){
  const potion=action.kind==='item';
  if(potion&&(action.item!=='potion'||(confirmed?saved.confirmedPotions??0:potionStock(p))<1))return false;
  if(!applyLocal(match,action,now,rng))return false;
  if(potion){
   if(confirmed)saved.confirmedPotions=saved.confirmedPotions!-1;
   else p.arenaPotions=potionStock(p)-1;
  }
  if(proof&&action.kind!=='chat'){
   if(proof.moves.length<MAX_PROOF_MOVES)proof.moves.push([now,action]);
   else delete saved.proof;
  }
 }
 if(random&&saved.proof)saved.proof.random=random.state();
 return before!==JSON.stringify(match);
}

export function prepareLocalPotion(p:Player,now:number,operation:string){
 const saved=localArena(p);
 if(!saved||saved.pendingPotion||!saved.confirmedPotions)return false;
 updateLocalArena(p,now);
 const fighter=saved.match.game.players[0];
 if(saved.match.game.result||!fighter.hp||fighter.hp===fighter.maxHp||!fighter.belt.potion||
  localTime(saved,now)<(fighter.itemAt.potion??0))return false;
 saved.pendingPotion={operation,at:now};
 return true;
}

export function settleLocalPotion(p:Player,battle:string,operation:string,accepted:boolean){
 const saved=localArena(p);
 const pending=saved?.pendingPotion;
 if(!saved||saved.match.game.id!==battle||pending?.operation!==operation)return false;
 if(accepted&&!updateLocalArena(p,pending.at,{kind:'item',item:'potion'},true))return false;
 delete saved.pendingPotion;
 if(!accepted){
  saved.confirmedPotions=0;
  saved.match.game.players[0].belt.potion=potionStock(p);
 }
 return true;
}
