import {
 advance,appendMessage,applyCommand,blockedBattleChat,forfeit,newMatch,normalizeBattleChat,viewMatch,
 type Entrant,type Match,
} from '../../server/arena/duel';
import {
 advanceTeamMatch,drinkTeamElixir,newTeamMatch,setTeamAuto,strikeTeamMatch,teamArenaSize,
 type TeamEntrant,type TeamMatch,type TeamMode,
} from '../../server/arena/team';
import {CHAT_MS,OFFLINE_MS,ROUND_MS,type ArenaCommand,type ArenaElixir,type ArenaFighter,type ArenaMessage,type ArenaMove,type ArenaReason} from './protocol';

import type {LocalProof} from './localProof';
import type {ArenaBuild} from './hero';

export const capacities={duel:2,team:teamArenaSize.team*2,chaos:teamArenaSize.chaos*2} as const;
export type ArenaMode=keyof typeof capacities;
export type LiveMatch={mode:'duel';game:Match}|{mode:TeamMode;game:TeamMatch};
export type LiveFighter=ArenaFighter&{id:string;side:0|1;damage:number;kills:number;bot?:true};
export type LiveAction=ArenaCommand|{kind:'strike';target:string;attack:ArenaMove['attack'];blocks:ArenaMove['blocks']}|{kind:'chat';text:string}|{kind:'leave'};
export type LiveBattle={
 id:string;mode:ArenaMode;local:boolean;bot:boolean;ranked:boolean;round?:number;deadline:number;
 control:boolean;revision:number;nextSequence:number;auto:boolean;nextStrikeAt:number;
 you:LiveFighter;players:LiveFighter[];belt:Record<ArenaElixir,number>;
 itemReadyAt:Partial<Record<ArenaElixir,number>>;log:ArenaMessage[];chat:ArenaMessage[];chatDeadline:number|null;
 result?:{outcome:'win'|'loss'|'draw';reason:ArenaReason;points:number;finishedAt:number};
};
export type LiveSearch={id:string;mode:ArenaMode;deadline:number;names:string[];control:boolean;revision:number};
export type RecentBattle={id:string;mode:ArenaMode;chatDeadline:number};
export type LiveView={now:number;battle?:LiveBattle;search?:LiveSearch;local?:{id:string;mode:ArenaMode;proof?:LocalProof}};

export function buildMatch(id:string,mode:ArenaMode,humans:readonly Entrant[],now:number,rng=Math.random,botBuild?:ArenaBuild):LiveMatch{
 const entrants:TeamEntrant[]=[...humans];
 for(let index=entrants.length;index<capacities[mode];index++){
  const source=humans[index%humans.length];
  entrants.push({...source,id:mode==='duel'?'bot':'bot-'+index,name:mode==='duel'?'Соперник':'Боец '+(index+1),
   bot:true,potions:0,rankEligible:false,controller:'',hero:botBuild?.hero??source.hero,build:botBuild??source.build});
 }
 if(mode==='duel')return {mode,game:newMatch(id,entrants[0],entrants[1],now,humans.length===1,rng)};
 return {mode,game:newTeamMatch(id,mode,entrants,now,rng)};
}

export function advanceLive(match:LiveMatch,now:number,rng=Math.random){
 if(match.mode==='duel')advance(match.game,now,rng);
 else advanceTeamMatch(match.game,now,rng);
}
export function nextLiveWake(match:LiveMatch){
 if(match.game.result)return Infinity;
 if(match.mode==='duel')return Math.min(match.game.deadline,
  ...match.game.players.filter(p=>p.auto&&!p.turn).map(p=>p.autoAt));
 return Math.min(match.game.startedAt+60*ROUND_MS,...match.game.sideDeadline,
  ...match.game.players.filter(p=>p.auto&&p.hp).map(p=>Math.max(p.autoAt,p.nextStrikeAt)));
}
export function hasBots(match:LiveMatch){return match.mode==='duel'?match.game.bot:match.game.players.some(p=>p.bot)}
export function eligible(match:LiveMatch){
 return !hasBots(match)&&match.game.players.every(player=>player.fought&&player.rankEligible!==false);
}
export function arenaWinners(match:LiveMatch){
 const {result}=match.game;
 if(!result||result.winner===null||!['hp','time'].includes(result.reason)||!eligible(match))return [];
 return match.mode==='duel'?match.game.players.filter(player=>player.id===match.game.result?.winner):
  match.game.players.filter(player=>player.side===match.game.result?.winner);
}

export function applyLive(match:LiveMatch,id:string,action:LiveAction,round:number,sequence:number,now:number,rng=Math.random){
 const player=match.game.players.find(p=>p.id===id);
 if(!player||sequence!==player.sequence+1||match.game.result&&action.kind!=='chat')return false;
 if(action.kind==='chat'){
  if(match.game.result&&now>=match.game.result.finishedAt+CHAT_MS)return false;
  const value=normalizeBattleChat(action.text);
  if(!value||blockedBattleChat.test(value)||player.lastChatAt!==undefined&&now-player.lastChatAt<1000)return false;
  appendMessage(match.game,now,value,player.name);player.lastChatAt=now;player.sequence=sequence;
  return true;
 }
 if(action.kind==='leave'){
  if(match.mode==='duel')forfeit(match.game,id,now);
  else{
   const teamPlayer=match.game.players.find(p=>p.id===id)!;
   teamPlayer.hp=0;teamPlayer.rankEligible=false;
   if(!match.game.players.some(p=>p.side===teamPlayer.side&&p.hp&&!p.bot)){
    match.game.result={winner:teamPlayer.side===0?1:0,reason:'afk',finishedAt:now};
   }
  }
  player.sequence=sequence;
  return true;
 }
 if(match.mode==='duel')return action.kind==='strike'?false:applyCommand(match.game,id,action,round,sequence,now,rng);
 if(action.kind==='strike')return strikeTeamMatch(match.game,id,action.target,action.attack,action.blocks,sequence,now,rng);
 if(action.kind==='auto')return setTeamAuto(match.game,id,action.enabled,sequence,now,rng);
 return action.kind==='item'&&drinkTeamElixir(match.game,id,action.item,sequence,now,rng);
}

export function viewLive(match:LiveMatch,id:string,controller:string,now:number,local=false):LiveBattle{
 const {game,mode}=match;
 const bot=hasBots(match), ranked=!local&&!bot&&game.players.every(p=>p.rankEligible!==false);
 const common={id:game.id,local,bot,ranked,log:game.log,chat:game.chat,chatDeadline:game.result?game.result.finishedAt+CHAT_MS:null};
 if(mode==='duel'){
  const view=viewMatch(match.game,id,controller,now),youIndex=game.players.findIndex(p=>p.id===id);
  const you:LiveFighter={...view.you,id,side:youIndex===0?0:1,damage:0,kills:0};
  const opponent:LiveFighter={...view.opponent,id:game.players[1-youIndex].id,side:youIndex===0?1:0,damage:0,kills:0,bot:bot||undefined};
  return {...common,mode,round:view.round,deadline:view.deadline,control:view.control,revision:view.controlRevision,
   nextSequence:view.nextSequence,auto:view.auto,nextStrikeAt:0,you,players:[you,opponent],belt:view.belt,itemReadyAt:view.itemReadyAt,result:view.result};
 }
 const fighters=match.game.players;
 const player=fighters.find(p=>p.id===id)!;
 const players:LiveFighter[]=fighters.map(({id,name,side,level,hero,hp,maxHp,damage,kills,bot,seenAt})=>({
  id,name,side,level,hero,hp,maxHp,damage,kills,bot,online:local||!!bot||now-seenAt<OFFLINE_MS,moved:false,gear:[],
 }));
 const result=match.game.result;
 return {...common,mode,deadline:match.game.sideDeadline[player.side],control:player.controller===controller,
  revision:player.controlRevision??0,nextSequence:player.sequence+1,auto:player.auto,nextStrikeAt:player.nextStrikeAt,
  you:players.find(p=>p.id===id)!,players,belt:player.belt,itemReadyAt:player.itemAt,
  result:result?{outcome:result.winner===null?'draw':player.side===result.winner?'win':'loss',
   reason:result.reason,points:arenaWinners(match).some(p=>p.id===id)?1:0,finishedAt:result.finishedAt}:undefined};
}
