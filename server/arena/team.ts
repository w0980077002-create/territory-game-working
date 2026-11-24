import {ITEM_COOLDOWN_MS,ROUND_MS,zones,type ArenaMessage,type ArenaMove,type ArenaZone} from '../../src/arena/protocol';
import {appendMessage,createFighter,resolveStrike,type Entrant,type Fighter} from './duel';

export const teamArenaSize={team:3,chaos:20} as const;
export type TeamMode=keyof typeof teamArenaSize;
type Side=0|1;
type Blocks=ArenaMove['blocks'];
export type TeamEntrant=Entrant&{bot?:true};
type TeamFighter=Fighter&{bot?:true;side:Side;blocks:ArenaZone[];nextStrikeAt:number;damage:number;kills:number};
export type TeamMatch={
 id:string;mode:TeamMode;startedAt:number;updatedAt:number;sideDeadline:[number,number];timePenalty:[number,number];players:TeamFighter[];
 log:ArenaMessage[];chat:ArenaMessage[];messageId:number;
 result?:{winner:Side|null;reason:'hp'|'time'|'afk';finishedAt:number};
};
const attackInterval=3_000;
const matchDuration=60*ROUND_MS;
const otherSide=(side:Side):Side=>side===0?1:0;
const arenaZones=Object.keys(zones) as ArenaZone[];
const nextAutoAt=(now:number,rng:()=>number)=>now+4_000+Math.floor(rng()*5_000);

export function newTeamMatch(id:string,mode:TeamMode,entrants:readonly TeamEntrant[],now:number,rng=Math.random):TeamMatch{
 if(entrants.length!==2*teamArenaSize[mode]||new Set(entrants.map(player=>player.id)).size!==entrants.length)
  throw new Error('Invalid Arena team roster');
 const players=entrants.map((player,index):TeamFighter=>({
  ...createFighter(player,now),side:index%2===0?0:1,blocks:[],nextStrikeAt:now,damage:0,kills:0,
  bot:player.bot,auto:player.bot===true,autoAt:player.bot?nextAutoAt(now,rng):now,
 }));
 return {id,mode,startedAt:now,updatedAt:now,sideDeadline:[now+ROUND_MS,now+ROUND_MS],timePenalty:[0,0],players,log:[],chat:[],messageId:0};
}

export function advanceTeamMatch(match:TeamMatch,now:number,rng=Math.random){
 if(match.result)return;
 const durationDeadline=match.startedAt+matchDuration;
 const [first,second]=match.sideDeadline;
 if(Math.min(first,second)<=Math.min(now,durationDeadline)){
  match.result={winner:first===second?null:first<second?1:0,reason:'afk',finishedAt:Math.min(first,second)};
  return;
 }
 if(now>=durationDeadline){
  const hp:[number,number]=[0,0];
  for(const player of match.players)hp[player.side]+=player.hp;
  match.result={winner:hp[0]===hp[1]?null:hp[0]>hp[1]?0:1,reason:'time',finishedAt:durationDeadline};
  return;
 }
 const ready=match.players.filter(player=>player.hp&&player.auto&&now>=player.autoAt&&now>=player.nextStrikeAt)
  .sort((a,b)=>a.autoAt-b.autoAt||a.id.localeCompare(b.id)).slice(0,8);
 for(const player of ready){
  if(match.result)break;
  const defender=weakestEnemy(match,player.side);
  if(!defender||!player.hp)continue;
  const zone=Math.floor(rng()*arenaZones.length);
  const second=(zone+1+Math.floor(rng()*(arenaZones.length-1)))%arenaZones.length;
  teamStrike(match,player,defender,arenaZones[Math.floor(rng()*arenaZones.length)],
   [arenaZones[zone],arenaZones[second]],now,rng);
 }
}

export function strikeTeamMatch(match:TeamMatch,id:string,targetId:string,attack:ArenaZone,blocks:Blocks,
 sequence:number,now:number,rng=Math.random){
 advanceTeamMatch(match,now,rng);
 if(match.result||!Object.hasOwn(zones,attack)||blocks.length!==2||blocks[0]===blocks[1]||
   !blocks.every(zone=>Object.hasOwn(zones,zone)))return false;
 const attacker=match.players.find(player=>player.id===id);
 const target=match.players.find(player=>player.id===targetId);
 if(!canCommand(attacker,sequence)||!target||target.side===attacker.side||now<attacker.nextStrikeAt)
  return false;
 // A teammate can finish the selected enemy while this command is in flight.
 const defender=target.hp?target:weakestEnemy(match,attacker.side);
 if(!defender)return false;
 attacker.sequence=sequence;
 teamStrike(match,attacker,defender,attack,blocks,now,rng);
 return true;
}

function canCommand(player:TeamFighter|undefined,sequence:number):player is TeamFighter{
 return !!player?.hp&&!player.bot&&sequence===player.sequence+1;
}

export function setTeamAuto(match:TeamMatch,id:string,enabled:boolean,sequence:number,now:number,rng=Math.random){
 advanceTeamMatch(match,now,rng);
 const player=match.players.find(fighter=>fighter.id===id);
 if(match.result||!canCommand(player,sequence))return false;
 player.sequence=sequence;
 player.seenAt=now;
 player.auto=enabled;
 if(enabled)player.autoAt=nextAutoAt(now,rng);
 return true;
}

export function drinkTeamTimeElixir(match:TeamMatch,id:string,sequence:number,now:number,rng=Math.random){
 advanceTeamMatch(match,now,rng);
 const player=match.players.find(fighter=>fighter.id===id);
 if(match.result||!canCommand(player,sequence)||!player.belt.time||now<(player.itemAt.time??0))return false;
 const opponent=otherSide(player.side);
 if(match.timePenalty[opponent]>=30_000)return false;
 match.timePenalty[opponent]+=10_000;
 match.sideDeadline[opponent]-=10_000;
 player.belt.time--;
 player.itemAt.time=now+ITEM_COOLDOWN_MS;
 player.sequence=sequence;
 player.seenAt=now;
 appendMessage(match,now,player.name+' · таймер соперников сокращён на 10 секунд');
 advanceTeamMatch(match,now,rng);
 return true;
}

function weakestEnemy(match:TeamMatch,side:Side){
 return match.players.reduce<TeamFighter|undefined>((candidate,player)=>{
  if(player.side===side||!player.hp)return candidate;
  return !candidate||player.hp<candidate.hp?player:candidate;
 },undefined);
}

function teamStrike(match:TeamMatch,attacker:TeamFighter,defender:TeamFighter,attack:ArenaZone,blocks:Blocks,now:number,rng:()=>number){
 attacker.nextStrikeAt=now+attackInterval;
 if(attacker.auto)attacker.autoAt=nextAutoAt(now,rng);
 attacker.blocks=[...blocks];
 attacker.fought=true;
 attacker.seenAt=now;
 match.timePenalty[attacker.side]=0;
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
}
