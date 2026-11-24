import {ROUND_MS,zones,type ArenaMessage,type ArenaMove,type ArenaZone} from '../../src/arena/protocol';
import {appendMessage,createFighter,resolveStrike,type Entrant,type Fighter} from './duel';

export const teamArenaSize={team:3,chaos:20} as const;
type TeamMode=keyof typeof teamArenaSize;
type Side=0|1;
type Blocks=ArenaMove['blocks'];
type TeamFighter=Fighter&{side:Side;blocks:ArenaZone[];nextStrikeAt:number;damage:number;kills:number};
type TeamMatch={
 id:string;mode:TeamMode;startedAt:number;sideDeadline:[number,number];players:TeamFighter[];
 log:ArenaMessage[];chat:ArenaMessage[];messageId:number;
 result?:{winner:Side|null;reason:'hp'|'time'|'afk';finishedAt:number};
};
const attackInterval=3_000;
const matchDuration=60*ROUND_MS;
const otherSide=(side:Side):Side=>side===0?1:0;

export function newTeamMatch(id:string,mode:TeamMode,entrants:readonly Entrant[],now:number):TeamMatch{
 if(entrants.length!==2*teamArenaSize[mode]||new Set(entrants.map(player=>player.id)).size!==entrants.length)
  throw new Error('Invalid Arena team roster');
 const players=entrants.map((player,index):TeamFighter=>({
  ...createFighter(player,now),side:index%2===0?0:1,blocks:[],nextStrikeAt:now,damage:0,kills:0,
 }));
 return {id,mode,startedAt:now,sideDeadline:[now+ROUND_MS,now+ROUND_MS],players,log:[],chat:[],messageId:0};
}

export function advanceTeamMatch(match:TeamMatch,now:number){
 if(match.result)return;
 const durationDeadline=match.startedAt+matchDuration;
 const [first,second]=match.sideDeadline;
 if(Math.min(first,second)<=Math.min(now,durationDeadline)){
  match.result={winner:first===second?null:first<second?1:0,reason:'afk',finishedAt:Math.min(first,second)};
  return;
 }
 if(now<durationDeadline)return;
 const hp:[number,number]=[0,0];
 for(const player of match.players)hp[player.side]+=player.hp;
 match.result={winner:hp[0]===hp[1]?null:hp[0]>hp[1]?0:1,reason:'time',finishedAt:durationDeadline};
}

export function strikeTeamMatch(match:TeamMatch,id:string,targetId:string,attack:ArenaZone,blocks:Blocks,
 sequence:number,now:number,rng=Math.random){
 advanceTeamMatch(match,now);
 if(match.result||!Object.hasOwn(zones,attack)||blocks.length!==2||blocks[0]===blocks[1]||
   !blocks.every(zone=>Object.hasOwn(zones,zone)))return false;
 const attacker=match.players.find(player=>player.id===id);
 const target=match.players.find(player=>player.id===targetId);
 if(!attacker?.hp||!target||target.side===attacker.side||now<attacker.nextStrikeAt||sequence!==attacker.sequence+1)
  return false;
 // A teammate can finish the selected enemy while this command is in flight.
 const defender=target.hp?target:match.players.reduce<TeamFighter|undefined>((candidate,player)=>{
  if(player.side===attacker.side||!player.hp)return candidate;
  return !candidate||player.hp<candidate.hp?player:candidate;
 },undefined);
 if(!defender)return false;
 attacker.sequence=sequence;
 attacker.nextStrikeAt=now+attackInterval;
 attacker.blocks=[...blocks];
 attacker.fought=true;
 attacker.seenAt=now;
 match.sideDeadline[attacker.side]=now+ROUND_MS;
 const before=defender.hp;
 resolveStrike(match,attacker,defender,{attack,blocks,skill:null},defender.blocks,now,rng);
 attacker.damage+=before-defender.hp;
 if(!defender.hp){
  attacker.kills++;
  appendMessage(match,now,defender.name+' падает от удара '+attacker.name);
  if(!match.players.some(player=>player.side===otherSide(attacker.side)&&player.hp>0))
   match.result={winner:attacker.side,reason:'hp',finishedAt:now};
 }
 return true;
}
