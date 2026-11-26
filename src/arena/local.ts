import type {Player} from '../core/types';
import {arenaBuild,validArenaBuild} from './hero';
import {advanceLocal,applyLocal,arenaRandom,localBattle,MAX_PROOF_MOVES,SOLO_ACTOR,type LocalProof,type ProofMove} from './localProof';
import {capacities,type ArenaMode,type LiveAction,type LiveMatch} from './match';
import {addConsumable,consumableIds,consumableStock,potionStock,type ConsumableId,type ConsumableStock} from './potion';
import {beltHas,isBeltItem,playerBelt} from './belt';
import {CHAT_MS} from './protocol';

export {SOLO_ACTOR};
export type SavedArena={match:LiveMatch;reward?:{seal:boolean};confirmedPotions?:number;confirmedStock?:ConsumableStock;
 pendingPotion?:{operation:string;at:number;item?:ConsumableId};proof?:{random:number;clockOffset?:number;moves:ProofMove[];status?:'accepted'|'closed'}};
export function localArena(p:Player){
 const saved=p.localArena;
 const match=saved?.match;
 const game=match?.game;
 if(match&&Object.hasOwn(capacities,match.mode)&&game&&typeof game.id==='string'&&Array.isArray(game.players)&&game.players[0]?.id===SOLO_ACTOR&&
  validArenaBuild(game.players[0].combat?.build)&&Array.isArray(game.log)&&Array.isArray(game.chat))return saved;
}

/** Local stock of the non-potion kinds named on the belt (the server re-checks and caps them per fight). */
export function beltStock(p:Player,loadout=playerBelt(p)){
 const stock:Partial<Record<ConsumableId,number>>={};
 for(const id of consumableIds)if(id!=='potion'&&beltHas(loadout,id)&&consumableStock(p,id)>0)stock[id]=consumableStock(p,id);
 return stock;
}

export function startLocalArena(p:Player,id:string,mode:ArenaMode,now:number,proof?:LocalProof,serverNow=now,confirmedPotions=0,confirmedStock:ConsumableStock={}){
 const saved=localArena(p);
 if(saved?.match.game.id===id||saved&&!saved.match.game.result&&now<saved.match.game.players[0].seenAt+CHAT_MS)return false;
 const random=proof?arenaRandom(proof.seed):undefined;
 // The belt is fixed here for the whole fight; the server already zeroed reserved potions for a belt without them.
 const loadout=playerBelt(p),carries=beltHas(loadout,'potion');
 const stock=beltStock(p,loadout);
 for(const item of consumableIds)if(item!=='potion'&&confirmedStock[item])stock[item]=(stock[item]??0)+confirmedStock[item]!;
 const match=localBattle(id,mode,proof?.hero??arenaBuild(p),proof?.stage??p.stage,
  proof?.potions??(carries?potionStock(p)+confirmedPotions:0),proof?.startedAt??now,random?.next??Math.random,proof?.loadout??loadout,
  proof?proof.stock:stock);
 p.localArena={match,...(confirmedPotions>0?{confirmedPotions}:{}),...(Object.keys(confirmedStock).length?{confirmedStock}:{}),...(random?{proof:{random:random.state(),moves:[],clockOffset:serverNow-now}}:{})};
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
  const item=action.kind==='item'?action.item:undefined;
  if(item&&!isBeltItem(item))return false;
  const kind=isBeltItem(item)?item:undefined;
  if(kind&&(confirmed?confirmedCount(saved,kind):consumableStock(p,kind))<1)return false;
  if(!applyLocal(match,action,now,rng))return false;
  if(kind){
   if(confirmed)setConfirmedCount(saved,kind,confirmedCount(saved,kind)-1);
   else addConsumable(p,kind,-1);
  }
  if(proof&&action.kind!=='chat'){
   if(proof.moves.length<MAX_PROOF_MOVES)proof.moves.push([now,action]);
   else delete saved.proof;
  }
 }
 if(random&&saved.proof)saved.proof.random=random.state();
 return before!==JSON.stringify(match);
}

const confirmedCount=(saved:SavedArena,item:ConsumableId)=>item==='potion'?saved.confirmedPotions??0:saved.confirmedStock?.[item]??0;
function setConfirmedCount(saved:SavedArena,item:ConsumableId,count:number){
 if(item==='potion')saved.confirmedPotions=count;
 else (saved.confirmedStock??={})[item]=count;
}

export function prepareLocalConsumable(p:Player,now:number,operation:string,item:ConsumableId){
 const saved=localArena(p);
 if(!saved||saved.pendingPotion||!confirmedCount(saved,item))return false;
 updateLocalArena(p,now);
 const trial=structuredClone(saved.match);
 if(!applyLocal(trial,{kind:'item',item},localTime(saved,now),()=>0))return false;
 saved.pendingPotion={operation,at:now,item};
 return true;
}

export const prepareLocalPotion=(p:Player,now:number,operation:string)=>prepareLocalConsumable(p,now,operation,'potion');

export function settleLocalPotion(p:Player,battle:string,operation:string,accepted:boolean){
 const saved=localArena(p);
 const pending=saved?.pendingPotion;
 if(!saved||saved.match.game.id!==battle||pending?.operation!==operation)return false;
 const item=pending.item??'potion';
 if(accepted&&!updateLocalArena(p,pending.at,{kind:'item',item},true))return false;
 delete saved.pendingPotion;
 if(!accepted){
  setConfirmedCount(saved,item,0);
  const belt=saved.match.game.players[0].belt;
  belt[item]=Math.min(belt[item]??0,consumableStock(p,item));
 }
 return true;
}
