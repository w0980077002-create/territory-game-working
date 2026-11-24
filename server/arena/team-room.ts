import {CHAT_MS,type ArenaElixir,type ArenaHero,type ArenaMove} from '../../src/arena/protocol';
import {
 advanceTeamMatch,newTeamMatch,setTeamAuto,strikeTeamMatch,drinkTeamElixir,
 type TeamEntrant,type TeamMatch,type TeamMode,
} from './team';

import {appendMessage,blockedBattleChat,normalizeBattleChat} from './duel';

type Profile={id:string;name:string;hero:ArenaHero;attackPower:number;rankAwarded?:boolean};
export type Ticket={
 id:string;mode:TeamMode;closesAt:string;readyAt:string|null;revision:number;players:string[];roster?:Profile[];snapshot:TeamMatch|null;finishedAt?:string|null;
};
export type TeamCommand={sequence:number}&(
 |{kind:'strike';target:string;attack:ArenaMove['attack'];blocks:ArenaMove['blocks']}
 |{kind:'auto';enabled:boolean}
 |{kind:'item';item:ArenaElixir}
 |{kind:'chat';text:string}
);
export type Rooms={
 read(player:string,room:string):Promise<Ticket>;
 checkpoint(room:string,expected:number,snapshot:TeamMatch,finished:boolean):Promise<number|null>;
};

function teamView(ticket:Ticket,match:TeamMatch|null,player:string){
 if(!match)return {id:ticket.id,mode:ticket.mode,closesAt:ticket.closesAt,queued:ticket.players.length,roster:ticket.roster?.map(({id,name})=>({id,name}))??[]};
 const you=match.players.find(fighter=>fighter.id===player);
 if(!you||you.bot)throw new Error('arena_not_member');
 return {
  id:match.id,mode:match.mode,rankAwarded:!!ticket.roster?.find(entry=>entry.id===player)?.rankAwarded,sideDeadline:match.sideDeadline,log:match.log,chat:match.chat,result:match.result,training:match.players.some(fighter=>fighter.bot),
  chatDeadline:ticket.finishedAt?Date.parse(ticket.finishedAt)+CHAT_MS:match.result?match.updatedAt+CHAT_MS:null,
  you:{id:you.id,side:you.side,auto:you.auto,belt:you.belt,itemReadyAt:you.itemAt,nextStrikeAt:you.nextStrikeAt,nextSequence:you.sequence+1},
  players:match.players.map(({id,side,name,hero,hp,maxHp,damage,kills,bot})=>({id,side,name,hero,hp,maxHp,damage,kills,bot})),
 };
}

export class TeamRoomService {
 constructor(private readonly rooms:Rooms,
  private readonly roster:(mode:TeamMode,players:readonly string[],profiles?:Profile[])=>Promise<readonly TeamEntrant[]>,private readonly rng=Math.random){}

 async interact(player:string,room:string,now:number,command?:TeamCommand){
  for(let attempt=0;attempt<6;attempt++){
   const ticket=await this.rooms.read(player,room);
   if(!ticket.players.includes(player))throw new Error('arena_not_member');
   if(!ticket.readyAt)return {accepted:false,view:teamView(ticket,null,player)};
   const before=ticket.snapshot?JSON.stringify(ticket.snapshot):null;
   const match=ticket.snapshot??await this.start(ticket,Date.parse(ticket.readyAt));
   const clock=Math.max(now,match.updatedAt);
   const wasFinished=!!match.result;
   let accepted=false;
   if(command?.kind==='strike')accepted=strikeTeamMatch(match,player,command.target,command.attack,command.blocks,command.sequence,clock,this.rng);
   else if(command?.kind==='auto')accepted=setTeamAuto(match,player,command.enabled,command.sequence,clock,this.rng);
   else if(command?.kind==='item')accepted=drinkTeamElixir(match,player,command.item,command.sequence,clock,this.rng);
   else if(command?.kind==='chat'){
    advanceTeamMatch(match,clock,this.rng);
    accepted=sendChat(match,player,command,clock,ticket.finishedAt);
   }
   else advanceTeamMatch(match,clock,this.rng);
   if(before===JSON.stringify(match))return {accepted,view:teamView(ticket,match,player)};
   match.updatedAt=clock;
   if(await this.rooms.checkpoint(room,ticket.revision,match,!wasFinished&&!!match.result)!==null)
    return {accepted,view:teamView(ticket,match,player)};
  }
  throw new Error('arena_room_changed');
 }

 private async start(ticket:Ticket,startedAt:number){
  const entrants=await this.roster(ticket.mode,ticket.players,ticket.roster);
  const humans=entrants.filter(player=>!player.bot).map(player=>player.id);
  if(humans.length!==ticket.players.length||humans.some((id,index)=>id!==ticket.players[index]))
   throw new Error('arena_roster_changed');
  return newTeamMatch(ticket.id,ticket.mode,entrants,startedAt,this.rng);
 }
}

function sendChat(match:TeamMatch,id:string,command:Extract<TeamCommand,{kind:'chat'}>,now:number,finishedAt?:string|null){
 const player=match.players.find(fighter=>fighter.id===id);
 const text=normalizeBattleChat(command.text);
 if(!player||player.bot||command.sequence!==player.sequence+1||!text||blockedBattleChat.test(text)
   ||(player.lastChatAt!==undefined&&now-player.lastChatAt<1000)
   ||(finishedAt&&now>=Date.parse(finishedAt)+CHAT_MS))return false;
 player.lastChatAt=now;
 player.sequence=command.sequence;
 appendMessage(match,now,text,player.name);
 return true;
}
