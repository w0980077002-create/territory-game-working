import type {Player} from '../core/types';
import {planFor} from '../saga/encounters';
import {arenaBuild,validArenaBuild,type ArenaBuild} from './hero';
import {advanceLive,applyLive,buildMatch,viewLive,type ArenaMode,type LiveAction,type LiveMatch} from './match';
import {healingPotion} from './potion';
import {CHAT_MS} from './protocol';

export const SOLO_ACTOR='solo';
export type SavedArena={match:LiveMatch;reward?:{seal:boolean}};
export function localArena(p:Player){
 const saved=p.localArena;
 const game=saved?.match?.game;
 if(game&&typeof game.id==='string'&&Array.isArray(game.players)&&game.players[0]?.id===SOLO_ACTOR&&
  validArenaBuild(game.players[0].combat?.build)&&Array.isArray(game.log)&&Array.isArray(game.chat))return saved;
}

export function startLocalArena(p:Player,id:string,mode:ArenaMode,now:number){
 const saved=localArena(p);
 if(saved?.match.game.id===id||saved&&!saved.match.game.result&&now<saved.match.game.players[0].seenAt+CHAT_MS)return false;
 const build=arenaBuild(p);
 const {hp,atk,def}=planFor(p,'arena').units[0];
 const bot:ArenaBuild={...build,hero:build.hero==='berserker'?'ranger':'berserker',
  stats:{hp:Math.round(hp),attack:Math.round(atk),defense:Math.round(def),aspd:1,crit:.07,critDamage:1.5,lifesteal:0,dodge:.06,skillDamage:1,reduction:0},
  skills:[1,1,1],runes:[0,0,0],runePower:[1,1,1],spec:build.hero==='berserker'?'deadeye':'onslaught',
  sets:{frost:0,storm:0,rune:0,stone:0,legion:0,ember:0},perks:[],unique:[],
  aura:{execute30:0,execute35:0,boss:0,opening:0,thorns:0,veil:0,killHeal:0,regen:0,firstBlock:false,
   boltEvery:0,boltPower:0,rally:0,cooldownRate:1,foeHpCut:0,heroDamage:0},followers:[],branches:[-1,-1],
 };
 const match=buildMatch(id,mode,[{id:SOLO_ACTOR,name:'Вы',hero:build.hero,level:build.level,controller:SOLO_ACTOR,
  kit:'balanced',rating:1000,potion:true,rankEligible:false,build}],now,Math.random,bot);
 p.localArena={match};
 return true;
}

export function updateLocalArena(p:Player,now:number,action?:LiveAction){
 const saved=localArena(p);
 if(!saved)return false;
 const {match}=saved,before=JSON.stringify(match);
 advanceLive(match,now);
 if(action){
  const view=viewLive(match,SOLO_ACTOR,SOLO_ACTOR,now,true);
  if(action.kind==='item'&&action.item!=='potion')return false;
  const potion=action.kind==='item';
  const cost=potion?healingPotion.cost(p.stage):0;
  if(p.gold<cost)return false;
  if(!applyLive(match,SOLO_ACTOR,action,view.round??0,view.nextSequence,now))return false;
  p.gold-=cost;
 }
 return before!==JSON.stringify(match);
}
