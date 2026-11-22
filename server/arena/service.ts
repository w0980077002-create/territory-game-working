import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {CHAT_MS,MATCH_WAIT_MS,type ArenaCommand,type ArenaHero,type ArenaKit,type ArenaView} from '../../src/arena/protocol';
import {advance,appendMessage,applyCommand,compatible,forfeit,newMatch,viewMatch,type Entrant,type Match} from './duel';
import type {ArenaIdentity} from './auth';

export class ArenaError extends Error {
 constructor(readonly status:number,message:string){super(message)}
}
type Queued=Entrant&{since:number;seenAt:number};
type State={queue:Queued[];matches:Match[]};
type Profile={id:string;name:string;points:number;wins:number};
type Actor={id:string;controller:string};
export const QUEUE_IDLE_MS=12_000;
const MAX_ACTIVE=128;
const trainingLevel=1;
const trainingRating=1000;
const blockedChat=/(https?:\/\/|www\.|t\.me|telegram\.me|startapp\s*=|ref_[a-f\d]{14})/iu;

export class ArenaService {
 private readonly db:DatabaseSync;

 constructor(path:string,private readonly rng=Math.random){
  this.db=new DatabaseSync(path);
  this.db.exec(`
   PRAGMA journal_mode=WAL;
   PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS arena_state (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
   INSERT OR IGNORE INTO arena_state VALUES(1,'{"queue":[],"matches":[]}');
   CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS settlements (id TEXT PRIMARY KEY, winner TEXT, points INTEGER NOT NULL, finished_at INTEGER NOT NULL);
  `);
 }

 close(){this.db.close()}

 authenticate(identity:ArenaIdentity){
  this.db.prepare('INSERT INTO profiles(id,name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name').run(identity.id,identity.name);
 }

 private profile(id:string):Profile{
  const profile=this.db.prepare('SELECT * FROM profiles WHERE id=?').get(id) as Profile|undefined;
  if(!profile)throw new ArenaError(401,'Войдите в Арену');
  return profile;
 }

 private current(state:State,id:string,exclude?:string,finishedOnly=false){
  for(let index=state.matches.length-1;index>=0;index--){
   const match=state.matches[index];
   if(match.id!==exclude&&(!finishedOnly||match.result)&&match.players.some(player=>player.id===id))return match;
  }
 }

 private update(state:State,now:number){
  state.queue=state.queue.filter(player=>now-player.seenAt<QUEUE_IDLE_MS);
  for(const match of state.matches)advance(match,now,this.rng);
  this.settle(state);
  state.matches=state.matches.filter(match=>!match.result||now<match.result.finishedAt+CHAT_MS);
  this.pairQueue(state,now);
 }

 private pairQueue(state:State,now:number){
  let active=state.matches.filter(match=>!match.result).length;
  for(let first=0;first<state.queue.length&&active<MAX_ACTIVE;){
   const entry=state.queue[first];
   const rival=state.queue.findIndex((candidate,index)=>index>first&&compatible(entry,candidate));
   if(rival<0){first++;continue}
   const [opponent]=state.queue.splice(rival,1);
   state.queue.splice(first,1);
   state.matches.push(newMatch(randomUUID(),entry,opponent,now,false,this.rng));
   active++;
  }
  for(const entry of state.queue.filter(player=>now-player.since>=MATCH_WAIT_MS)){
   if(active>=MAX_ACTIVE)break;
   state.queue=state.queue.filter(player=>player!==entry);
   const bot={...entry,id:'bot',name:'Тренировочный бот',controller:''};
   state.matches.push(newMatch(randomUUID(),entry,bot,now,true,this.rng));
   active++;
  }
 }

 private settle(state:State){
  const insert=this.db.prepare('INSERT OR IGNORE INTO settlements(id,winner,points,finished_at) VALUES(?,?,?,?)');
  const credit=this.db.prepare('UPDATE profiles SET points=points+?,wins=wins+1 WHERE id=?');
  for(const match of state.matches){
   const result=match.result;
   if(!result||match.settled)continue;
   if(insert.run(match.id,result.winner,result.points,result.finishedAt).changes&&result.points&&result.winner)
    credit.run(result.points,result.winner);
   match.settled=true;
  }
 }

 private transaction<T>(now:number,work:(state:State)=>T):T{
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const {json}=this.db.prepare('SELECT json FROM arena_state WHERE id=1').get() as {json:string};
   const state=JSON.parse(json) as State;
   this.update(state,now);
   const result=work(state);
   const next=JSON.stringify(state);
   if(next!==json)this.db.prepare('UPDATE arena_state SET json=? WHERE id=1').run(next);
   this.db.exec('COMMIT');
   return result;
  }catch(error){
   this.db.exec('ROLLBACK');
   throw error;
  }
 }

 tick(now:number){this.transaction(now,()=>{})}

 private view(state:State,actor:Actor,now:number):ArenaView{
  const profile=this.profile(actor.id),queued=state.queue.find(player=>player.id===actor.id);
  const match=this.current(state,actor.id);
  const past=this.current(state,actor.id,queued?undefined:match?.id,true);
  return {
   now,level:trainingLevel,points:profile.points,
   queued:queued?{since:queued.since,control:queued.controller===actor.controller}:undefined,
   match:match&&!queued?viewMatch(match,actor.id,actor.controller,now):undefined,
   lastResult:past?.result?{id:past.id,chatDeadline:past.result.finishedAt+CHAT_MS}:undefined,
  };
 }

 read(actor:Actor,now:number){
  return this.transaction(now,state=>{
   const queued=state.queue.find(player=>player.id===actor.id&&player.controller===actor.controller);
   const match=this.current(state,actor.id),player=match?.players.find(player=>player.id===actor.id&&player.controller===actor.controller);
   if(queued&&now-queued.seenAt>=750)queued.seenAt=now;
   if(player&&!match?.result&&now-player.seenAt>=750)player.seenAt=now;
   return this.view(state,actor,now);
  });
 }

 join(actor:Actor,hero:ArenaHero,kit:ArenaKit,now:number){
  return this.transaction(now,state=>{
   const match=this.current(state,actor.id);
   if(match&&!match.result||state.queue.some(player=>player.id===actor.id))return this.view(state,actor,now);
   const profile=this.profile(actor.id);
   const entry={id:actor.id,name:profile.name,level:trainingLevel,rating:trainingRating,hero,kit,
    controller:actor.controller,since:now,seenAt:now};
   if(state.queue.length>=MAX_ACTIVE)throw new ArenaError(503,'Очередь заполнена. Повторите позже.');
   state.queue.push(entry);
   this.pairQueue(state,now);
   return this.view(state,actor,now);
  });
 }

 takeover(actor:Actor,now:number){
  return this.transaction(now,state=>{
   const queued=state.queue.find(player=>player.id===actor.id);
   const match=this.current(state,actor.id);
   const player=queued??(!match?.result?match?.players.find(player=>player.id===actor.id):undefined);
   if(player){player.controller=actor.controller;player.seenAt=now}
   return this.view(state,actor,now);
  });
 }

 leave(actor:Actor,id:string|null,now:number){
  return this.transaction(now,state=>{
   const queued=state.queue.find(player=>player.id===actor.id&&player.controller===actor.controller);
   if(queued&&!id)state.queue=state.queue.filter(player=>player!==queued);
   const match=this.current(state,actor.id);
   if(match?.id===id&&!match.result&&match.players.some(player=>player.id===actor.id&&player.controller===actor.controller)){
    forfeit(match,actor.id,now);
    this.settle(state);
   }
   return this.view(state,actor,now);
  });
 }

 act(actor:Actor,id:string,action:ArenaCommand,round:number,sequence:number,now:number){
  return this.transaction(now,state=>{
   const match=this.current(state,actor.id);
   const controlled=match?.id===id&&match.players.some(player=>player.id===actor.id&&player.controller===actor.controller);
   if(!match||!controlled||!applyCommand(match,actor.id,action,round,sequence,now,this.rng))
    return {accepted:false,view:this.view(state,actor,now)};
   this.settle(state);
   return {accepted:true,view:this.view(state,actor,now)};
  });
 }

 room(actor:Actor,id:string,now:number){
  return this.transaction(now,state=>{
   const match=state.matches.find(room=>room.id===id&&room.players.some(player=>player.id===actor.id));
   if(!match)throw new ArenaError(404,'Комната недоступна');
   return viewMatch(match,actor.id,actor.controller,now);
  });
 }

 chat(actor:Actor,id:string,raw:string,now:number){
  return this.transaction(now,state=>{
   const match=state.matches.find(room=>room.id===id);
   const player=match?.players.find(other=>other.id===actor.id);
   if(!match||!player)throw new ArenaError(404,'Комната недоступна');
   const value=raw.normalize('NFKC').replace(/\p{Cf}/gu,'').replace(/\p{Cc}/gu,' ').trim().slice(0,200);
   if(!value)throw new ArenaError(400,'Введите сообщение');
   if(blockedChat.test(value))throw new ArenaError(400,'Ссылки в боевом чате запрещены');
   if(player.lastChatAt!==undefined&&now-player.lastChatAt<1000)
    throw new ArenaError(429,'Подождите секунду перед отправкой');
   player.lastChatAt=now;
   appendMessage(match,now,value,player.name);
   return viewMatch(match,actor.id,actor.controller,now);
  });
 }
}
