import {
 arenaElixirs,arenaKits,zones,CHAT_MS,ITEM_COOLDOWN_MS,LEVEL_RANGE,OFFLINE_MS,ROUND_MS,
 type ArenaCommand,type ArenaElixir,type ArenaHero,type ArenaKit,type ArenaMatchView,type ArenaMessage,
 type ArenaMove,type ArenaReason,type ArenaSkill,type ArenaZone,
} from '../../src/arena/protocol';
import {skillData} from '../../src/data/catalog';
import {companions} from '../../src/dark/rules';
import type {ArenaBuild} from '../../src/arena/hero';
import {arenaAttackInterval,makeHeroState,resolveHeroTurn,type HeroState} from '../../src/arena/heroCombat';
import {healingPotion} from '../../src/arena/potion';
import balance from '../../config/test-balance.v1.json';

export type Entrant = {
 id:string;name:string;level:number;rating:number;hero:ArenaHero;kit:ArenaKit;controller:string;controlRevision?:number;trustedAttack?:number;rankEligible?:boolean;build?:ArenaBuild;potions?:number;
};
export type Fighter = Entrant & {
 seenAt:number;hp:number;maxHp:number;attack:number;defense:number;crit:number;gear:number[];
 sequence:number;turn?:{move:ArenaMove;at:number};auto:boolean;autoAt:number;fought:boolean;
 belt:Record<ArenaElixir,number>;itemAt:Partial<Record<ArenaElixir,number>>;lastChatAt?:number;
 combat?:HeroState;ready:Record<ArenaSkill,number>;buffUntil:number;gooseAt:number;dogAt:number;
};
export type Match = {
 id:string;bot:boolean;settled?:true;round:number;roundStart:number;roundMs:number;deadline:number;
 players:[Fighter,Fighter];log:ArenaMessage[];chat:ArenaMessage[];messageId:number;
 result?:{winner:string|null;reason:ArenaReason;points:number;finishedAt:number};
};
const BOT_ID = 'bot';
const startingStats = balance.new_player_test_start;
const goose = companions.goose_aviator;
const dog = companions.brown_white_dog;
const arenaZones = Object.keys(zones) as ArenaZone[];
const online = (player:Fighter,now:number) => player.id===BOT_ID || now-player.seenAt<OFFLINE_MS;

export function entrantStats(player:Entrant){
 if(player.build){
  const {hp,attack,defense,crit}=player.build.stats;
  return {gear:[],maxHp:hp,attack,defense,crit};
 }
 const {weapon,armor} = arenaKits[player.kit];
 const rank = player.level-1;
 // These provisioned Arena pieces and normalized class bonuses are separate from Solo.
 // Weapon, armor, helmet, shield, boots, ring and amulet in display order.
 const gear = [weapon,armor,8,2,4,2,6];
 return {
  gear, maxHp:Math.round((startingStats.hp+rank*14+gear[2]+gear[4]+gear[6])*(player.hero==='berserker'?1.15:1)),
  attack:Math.round((startingStats.attack+rank*3+gear[0])*(player.trustedAttack===undefined?1:Math.min(2,Math.max(.5,player.trustedAttack/100)))),
  defense:startingStats.defense+rank*2+gear[1]+gear[3],
  crit:5+gear[5]+(player.hero==='ranger'?5:0),
 };
}

// Adapted from TERRITORY arena_match_compatible, with the VVR ±7 level window.
export function compatible(a:Entrant,b:Entrant){
 const x=entrantStats(a), y=entrantStats(b);
 const ratio=(left:number,right:number,limit:number)=>Math.max(left,right)<=limit*Math.max(1,Math.min(left,right));
 return a.id!==b.id && (a.rankEligible!==false)===(b.rankEligible!==false) && Math.abs(a.level-b.level)<=LEVEL_RANGE && Math.abs(a.rating-b.rating)<=700
  && ratio(x.maxHp,y.maxHp,3) && ratio(x.attack,y.attack,4) && ratio(x.defense,y.defense,4);
}

export function createFighter(player:Entrant,now:number):Fighter{
 const stats=entrantStats(player);
 const belt=Object.fromEntries(Object.entries(arenaElixirs).map(([id,item])=>[id,player.build?(id==='potion'?player.potions??0:0):item.qty])) as Fighter['belt'];
 const {build,...entry}=player;
 return {...entry,...stats,combat:build?makeHeroState(build,now):undefined,hp:stats.maxHp,seenAt:now,sequence:0,auto:player.id===BOT_ID,autoAt:now,
  fought:false,belt,itemAt:{},ready:{strike:0,call:0,hammer:0},buffUntil:0,
  gooseAt:now+goose.interval*1000,dogAt:now+dog.interval*1000};
}

function schedule(player:Fighter,now:number,rng:()=>number){
 player.autoAt=now+(player.combat?1500+500*rng():player.id===BOT_ID?2000+12000*rng():1000+3000*rng());
}

export function newMatch(id:string,a:Entrant,b:Entrant,now:number,bot=false,rng=Math.random):Match{
 const players:[Fighter,Fighter]=[createFighter(a,now),createFighter(b,now)];
 for(const player of players)if(player.auto)schedule(player,now,rng);
 if(a.build&&b.build){
  players[0].hp=Math.max(1,Math.round(players[0].hp*(1-b.build.aura.foeHpCut)));
  players[1].hp=Math.max(1,Math.round(players[1].hp*(1-a.build.aura.foeHpCut)));
 }
 return {id,bot,round:1,roundStart:now,roundMs:ROUND_MS,deadline:now+ROUND_MS,
  players,log:[],chat:[],messageId:0};
}

type Messages = Pick<Match,'log'|'chat'|'messageId'>;

export function appendMessage(match:Messages,now:number,value:string,author?:string){
 const list=author===undefined?match.log:match.chat;
 list.push({id:++match.messageId,at:now,text:value,author});
 if(list.length>80)list.shift();
}

function finish(match:Match,now:number,reason:ArenaReason,winner:string|null){
 if(match.result)return;
 const eligible=!match.bot && match.players.every(player=>player.fought&&player.rankEligible!==false);
 match.result={winner,reason,points:eligible&&winner&&(reason==='hp'||reason==='time')?1:0,finishedAt:now};
}

export function forfeit(match:Match,id:string,now:number){
 const opponent=match.players.find(player=>player.id!==id);
 if(opponent)finish(match,now,'leave',opponent.id);
}

function autoMove(player:Fighter,now:number,rng:()=>number){
 const first=Math.floor(rng()*4),second=(first+1+Math.floor(rng()*3))%4;
 player.turn={at:now,move:{attack:arenaZones[Math.floor(rng()*4)],blocks:[arenaZones[first],arenaZones[second]],skill:null}};
}

function heal(player:Fighter,amount:number){
 const gain=Math.min(amount,player.maxHp-player.hp);
 player.hp+=gain;
 return gain;
}

export function resolveStrike(match:Messages,a:Fighter,b:Fighter,move:ArenaMove,blocks:readonly ArenaZone[],now:number,rng:()=>number,others:readonly Fighter[]=[]){
 if(a.combat){resolveHeroTurn(a,b,move,blocks,now,rng,value=>appendMessage(match,now,value),others);return}
 const text=a.name+' → '+b.name+': ';
 const impact=zones[move.attack].impact;
 // TERRITORY duel resolver: dodge, independent crit, full block or 80% block
 // penetration, then zone and damage variance. Both start-of-round fighters act.
 if(rng()<.06){appendMessage(match,now,text+'уклонение от удара '+impact);return}
 const blocked=blocks.includes(move.attack);
 const crit=rng()*100<a.crit;
 const buff=a.buffUntil>now?1.3:1;
 const skillScale=a.hero==='runologist'?1.15:1;
 const technique=move.skill==='strike'?1.5*skillScale:move.skill==='hammer'?1.35*skillScale:1;
 const defense=move.skill==='hammer'?b.defense*.5:b.defense;
 let damage=Math.max(1,Math.round((a.attack*buff*technique*(.85+rng()*.3)-defense*.5)*zones[move.attack].multiplier));
 if(blocked&&!crit){appendMessage(match,now,text+'блок удара '+impact);return}
 if(blocked)damage=Math.max(1,Math.round(damage*.8));
 else if(crit)damage=Math.round(damage*1.6);
 if(now>=a.gooseAt){
  const support=Math.round(a.attack*goose.base);
  damage+=support;
  a.gooseAt=now+goose.interval*1000;
 }
 b.hp=Math.max(0,b.hp-damage);
 appendMessage(match,now,text+(blocked?'пробитие блока, ':crit?'критический удар ':'удар ')+impact+' · −'+damage+' HP');
}

function strike(match:Match,a:Fighter,b:Fighter,now:number,rng:()=>number){
 resolveStrike(match,a,b,a.turn!.move,b.turn!.move.blocks,now,rng);
}

export function applyCompanionSupport(match:Messages,player:Fighter,now:number){
 if(!player.combat&&now>=player.dogAt){
   const gain=heal(player,Math.round(player.maxHp*dog.base));
   if(gain){
    appendMessage(match,now,dog.name+' · '+player.name+' +'+gain+' HP');
    player.dogAt=now+dog.interval*1000;
   }
  }
}

function resolveRound(match:Match,now:number,rng:()=>number){
 const [a,b]=match.players;
 for(const player of match.players)if(player.auto&&!player.turn)autoMove(player,now,rng);
 if(!a.turn||!b.turn){
  const missing=match.players.filter(player=>!player.turn);
  for(const player of missing){
   player.hp=0;
   appendMessage(match,now,player.name+' пропускает ход и выбывает');
  }
  finish(match,now,missing.some(player=>!online(player,now))?'disconnect':'afk',a.hp?a.id:b.hp?b.id:null);
  return;
 }
 for(const player of match.players){
  if(player.turn?.move.skill==='call')player.buffUntil=now+5_000;
  applyCompanionSupport(match,player,now);
  player.fought=true;
 }
 if(a.combat&&b.combat){
  const ai=arenaAttackInterval(a,b,now),bi=arenaAttackInterval(b,a,now);
  const [first,second]=ai<bi||ai===bi&&rng()<.5?[a,b]:[b,a];
  strike(match,first,second,now,rng);
  if(second.hp)strike(match,second,first,now,rng);
 }else if(rng()<.5){strike(match,a,b,now,rng);strike(match,b,a,now,rng)}
 else{strike(match,b,a,now,rng);strike(match,a,b,now,rng)}
 if(!a.hp||!b.hp){finish(match,now,'hp',a.hp?a.id:b.hp?b.id:null);return}
 if(match.round===60){finish(match,now,'time',a.hp===b.hp?null:a.hp>b.hp?a.id:b.id);return}
 match.round++;
 match.roundStart=now;
 match.deadline=now+match.roundMs;
 for(const player of match.players){
  delete player.turn;
  if(player.auto)schedule(player,now,rng);
 }
}

export const blockedBattleChat=/(https?:\/\/|www\.|t\.me|telegram\.me|startapp\s*=|ref_[a-f\d]{14})/iu;
export function normalizeBattleChat(raw:string){
 return raw.normalize('NFKC').replace(/\p{Cf}/gu,'').replace(/\p{Cc}/gu,' ').trim().slice(0,200);
}

export function drinkStatElixir(match:Messages,player:Fighter,item:ArenaElixir,now:number){
 if(!player.belt[item]||now<(player.itemAt[item]??0))return false;
 let detail=arenaElixirs[item].label;
 if(item==='potion'){
  if(!player.combat||!player.hp||player.hp===player.maxHp)return false;
  detail+=' · +'+heal(player,Math.round(player.maxHp*healingPotion.fraction))+' HP';
  player.belt[item]--;
  player.itemAt[item]=now+healingPotion.cooldown;
  appendMessage(match,now,player.name+' · '+detail);
  return true;
 }
 if(item==='heal_small'||item==='heal_large'){
  if(player.hp===player.maxHp)return false;
  const amount=item==='heal_small'?Math.max(50,Math.round(player.maxHp*.18)):Math.max(150,Math.round(player.maxHp*.35));
  detail+=' · +'+heal(player,amount)+' HP';
 }else if(item==='crit')player.crit=Math.min(75,player.crit+15);
 else if(item==='attack'||item==='defense')player[item]+=Math.max(10,Math.round(player[item]*.25));
 else return false;
 spendElixir(match,player,item,now,detail);
 return true;
}

function spendElixir(match:Messages,player:Fighter,item:ArenaElixir,now:number,detail:string){
 player.belt[item]--;
 player.itemAt[item]=now+ITEM_COOLDOWN_MS;
 appendMessage(match,now,player.name+' · '+detail);
}

function drinkElixir(match:Match,player:Fighter,item:ArenaElixir,now:number){
 if(item!=='time')return drinkStatElixir(match,player,item,now);
 if(!player.belt.time||now<(player.itemAt.time??0)||match.roundMs<=30_000)return false;
 match.roundMs-=10_000;
 match.deadline=Math.max(now,match.roundStart+match.roundMs);
 spendElixir(match,player,item,now,arenaElixirs.time.label+' · '+match.roundMs/1000+' с на раунд');
 return true;
}

export function advance(match:Match,now:number,rng=Math.random){
 // Resolve elapsed round deadlines at the original server time, including after restart.
 while(!match.result){
  for(const player of match.players)
   if(player.auto&&!player.turn&&player.autoAt<=Math.min(now,match.deadline))autoMove(player,player.autoAt,rng);
  const [a,b]=match.players;
  if(a.turn&&b.turn){
   resolveRound(match,Math.max(a.turn.at,b.turn.at),rng);
   continue;
  }
  if(now>=match.deadline){resolveRound(match,match.deadline,rng);continue}
  break;
 }
}

export function applyCommand(match:Match,id:string,command:ArenaCommand,round:number,sequence:number,now:number,rng=Math.random){
 const player=match.players.find(p=>p.id===id);
 if(!player||match.result||round!==match.round||sequence!==player.sequence+1)return false;
 if(command.kind==='move'){
  const {move}=command;
  if(player.turn||move.blocks[0]===move.blocks[1]||(move.skill&&now<player.ready[move.skill]))return false;
  if(move.skill&&!player.combat){
   const index={strike:0,call:1,hammer:2}[move.skill];
   player.ready[move.skill]=now+skillData[index].cd*1000;
  }
  player.turn={at:now,move};
 }else if(command.kind==='auto'){
  player.auto=command.enabled;
  if(player.auto)schedule(player,now,rng);
 }else if(!drinkElixir(match,player,command.item,now))return false;
 player.sequence=sequence;
 player.seenAt=now;
 advance(match,now,rng);
 return true;
}

export function viewMatch(match:Match,id:string,controller:string,now:number):ArenaMatchView{
 const index=match.players.findIndex(player=>player.id===id),you=match.players[index],opponent=match.players[1-index];
 const publicFighter=(p:Fighter)=>({name:p.name,hero:p.hero,level:p.level,hp:p.hp,maxHp:p.maxHp,
  online:online(p,now),moved:!!p.turn,gear:p.gear});
 const result=match.result;
 return {
  id:match.id,bot:match.bot,training:match.bot||match.players.some(player=>player.rankEligible===false),round:match.round,deadline:match.deadline,you:publicFighter(you),opponent:publicFighter(opponent),
  control:you.controller===controller,controlRevision:you.controlRevision??0,nextSequence:you.sequence+1,auto:you.auto,belt:you.belt,itemReadyAt:you.itemAt,
  ready:you.ready,log:match.log,chat:match.chat,chatDeadline:result?result.finishedAt+CHAT_MS:null,
  result:result?{outcome:!result.winner?'draw':result.winner===id?'win':'loss',
   reason:result.reason,points:result.winner===id?result.points:0,finishedAt:result.finishedAt}:undefined,
 };
}
