import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import type {ArenaBuild} from '../../src/arena/hero';
import {advanceLive,applyLive,arenaWinners,buildMatch,capacities,nextLiveWake,viewLive,type ArenaMode,type LiveAction,type LiveMatch,type LiveView,type RecentBattle} from '../../src/arena/match';
import {CHAT_MS,LEVEL_RANGE,MATCH_WAIT_MS} from '../../src/arena/protocol';
import {compatible,type Entrant} from './duel';

type Actor={id:string;controller:string};
type QueueEntry=Entrant&{ticket:string;mode:ArenaMode;since:number;seenAt:number};
type Active={id:string;json:string};
type Search={mode:ArenaMode;entries:QueueEntry[];deadline:number};
const idle=12_000;
export class LiveArena {
 readonly db:DatabaseSync;
 constructor(path:string,private readonly rng=Math.random){
  this.db=new DatabaseSync(path);
  this.db.exec(`
   PRAGMA journal_mode=WAL;
   PRAGMA foreign_keys=ON;
   PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS arena_live_queue (
    player TEXT PRIMARY KEY, mode TEXT NOT NULL, since INTEGER NOT NULL, seen INTEGER NOT NULL, json TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS arena_live_queue_mode ON arena_live_queue(mode,since);
   CREATE TABLE IF NOT EXISTS arena_live_matches (
    id TEXT PRIMARY KEY, json TEXT NOT NULL, wake INTEGER, expires INTEGER
   );
   CREATE INDEX IF NOT EXISTS arena_live_expiry ON arena_live_matches(expires) WHERE expires IS NOT NULL;
   CREATE INDEX IF NOT EXISTS arena_live_wake ON arena_live_matches(wake) WHERE wake IS NOT NULL;
   CREATE TABLE IF NOT EXISTS arena_live_seats (
    player TEXT NOT NULL, match TEXT NOT NULL REFERENCES arena_live_matches(id) ON DELETE CASCADE,
    joined INTEGER NOT NULL, active INTEGER NOT NULL, PRIMARY KEY(player,match)
   );
   CREATE UNIQUE INDEX IF NOT EXISTS arena_live_active ON arena_live_seats(player) WHERE active=1;
   CREATE INDEX IF NOT EXISTS arena_live_seat_match ON arena_live_seats(match);
   CREATE TABLE IF NOT EXISTS arena_live_fallback (
    player TEXT PRIMARY KEY, ticket TEXT NOT NULL, mode TEXT NOT NULL, expires INTEGER NOT NULL
   );
   CREATE TABLE IF NOT EXISTS arena_live_scores (
    match TEXT PRIMARY KEY, telegram TEXT NOT NULL, name TEXT NOT NULL, finishedAt TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS arena_live_team_results (id TEXT PRIMARY KEY, json TEXT NOT NULL);
  `);
 }
 close(){this.db.close()}

 private transaction<T>(work:()=>T):T{
  this.db.exec('BEGIN IMMEDIATE');
  try{const result=work();this.db.exec('COMMIT');return result;}
  catch(error){this.db.exec('ROLLBACK');throw error;}
 }

 private queue(mode:ArenaMode,now:number){
  return (this.db.prepare('SELECT json,seen FROM arena_live_queue WHERE mode=? AND seen>? ORDER BY since,player LIMIT 256')
   .all(mode,now-idle) as {json:string;seen:number}[]).map(row=>({...JSON.parse(row.json) as QueueEntry,seenAt:row.seen}));
 }

 private searches(mode:ArenaMode,now:number){
  const groups:Search[]=[];
  for(const player of this.queue(mode,now)){
   let group=groups.find(({entries,deadline})=>entries.length<capacities[mode]&&player.since<=deadline&&
    entries.every(other=>Math.abs(other.level-player.level)<=LEVEL_RANGE&&other.rankEligible===player.rankEligible));
   if(!group){
    group={mode,entries:[],deadline:player.since+MATCH_WAIT_MS};groups.push(group);
   }
   group.entries.push(player);
  }
  return groups;
 }

 private pair(mode:ArenaMode,now:number){
  for(const {entries,deadline} of this.searches(mode,now)){
   if(entries.length<capacities[mode]&&now<deadline)continue;
   for(const p of entries)this.db.prepare('DELETE FROM arena_live_queue WHERE player=?').run(p.id);
   if(entries.length===1){
    const p=entries[0];
    this.db.prepare('INSERT OR REPLACE INTO arena_live_fallback VALUES(?,?,?,?)').run(p.id,p.ticket,mode,now+CHAT_MS);
    continue;
   }
   const id=randomUUID(), match=buildMatch(id,mode,entries,now,this.rng);
   if(entries.length===capacities[mode]&&entries.every(p=>p.rankEligible)){
    const strongest=entries.reduce((a,b)=>a.build!.stats.attack>=b.build!.stats.attack?a:b);
    const weakest=entries.reduce((a,b)=>a.build!.stats.attack<=b.build!.stats.attack?a:b);
    if(strongest!==weakest&&!compatible(strongest,weakest))
     console.warn(JSON.stringify({event:'arena_power_gap',match:id,mode,players:[strongest.id,weakest.id],
      attack:[strongest.build!.stats.attack,weakest.build!.stats.attack],levels:[strongest.level,weakest.level]}));
   }

   this.db.prepare('INSERT INTO arena_live_matches VALUES(?,?,?,NULL)').run(id,JSON.stringify(match),now);
   for(const p of entries)this.db.prepare('INSERT INTO arena_live_seats VALUES(?,?,?,1)').run(p.id,id,now);
  }
 }

 private match(id:string,target?:string){
  return (target?this.db.prepare('SELECT m.id,m.json FROM arena_live_seats s JOIN arena_live_matches m ON m.id=s.match WHERE s.player=? AND s.match=?').get(id,target):
   this.db.prepare('SELECT m.id,m.json FROM arena_live_seats s JOIN arena_live_matches m ON m.id=s.match WHERE s.player=? ORDER BY s.active DESC,s.joined DESC,s.match LIMIT 1').get(id)) as Active|undefined;
 }

 private save(match:LiveMatch,before:string,now:number){
  const json=JSON.stringify(match),{game}=match,id=game.id;
  if(game.result){
   if(json===before)return;
   const first=this.db.prepare('UPDATE arena_live_matches SET wake=NULL,expires=?,json=? WHERE id=? AND expires IS NULL')
    .run(game.result.finishedAt+CHAT_MS,json,id).changes;
   if(!first){
    this.db.prepare('UPDATE arena_live_matches SET json=? WHERE id=?').run(json,id);
    return;
   }
   this.db.prepare('UPDATE arena_live_seats SET active=0 WHERE match=?').run(id);
   const winners=arenaWinners(match);
   const finishedAt=new Date(game.result.finishedAt).toISOString();
   if(match.mode==='duel'){
    for(const winner of winners)this.db.prepare('INSERT OR IGNORE INTO arena_live_scores VALUES(?,?,?,?)')
     .run(id,winner.id,winner.name,finishedAt);
   }else{
    const team=match.game;
    const result={match:id,mode:match.mode,startedAt:new Date(team.startedAt).toISOString(),finishedAt,
     reason:team.result!.reason,winner:team.result!.winner,members:team.players.filter(p=>!p.bot)
      .map(p=>({telegram:p.id,name:p.name,hero:p.hero,side:p.side,fought:p.fought,rankEligible:p.rankEligible!==false}))};
    this.db.prepare('INSERT OR IGNORE INTO arena_live_team_results VALUES(?,?)').run(id,JSON.stringify(result));
   }
   if(game.result.reason==='hp'&&now-game.result.finishedAt>60_000)
    console.info(JSON.stringify({event:'arena_delayed_settlement',match:id,mode:match.mode}));
  }else{
   const wake=nextLiveWake(match);
   if(json!==before)this.db.prepare('UPDATE arena_live_matches SET json=?,wake=? WHERE id=?').run(json,Math.max(now+1,Math.ceil(wake)),id);
   else this.db.prepare('UPDATE arena_live_matches SET wake=? WHERE id=? AND wake<>?').run(Math.max(now+1,Math.ceil(wake)),id,Math.max(now+1,Math.ceil(wake)));
  }
 }

 tick(now:number){
  const due=this.db.prepare('SELECT id,json FROM arena_live_matches WHERE wake<=? LIMIT 128').all(now) as Active[];
  const queues=this.db.prepare('SELECT DISTINCT mode FROM arena_live_queue WHERE since<=? AND seen>?').all(now-MATCH_WAIT_MS,now-idle) as {mode:ArenaMode}[];
  this.transaction(()=>{
   for(const {json} of due){const match=JSON.parse(json) as LiveMatch;advanceLive(match,now,this.rng);this.save(match,json,now);}
   for(const {mode} of queues)this.pair(mode,now);
   this.db.prepare('DELETE FROM arena_live_queue WHERE seen<=?').run(now-idle);
   this.db.prepare('DELETE FROM arena_live_matches WHERE expires<=?').run(now);
   this.db.prepare('DELETE FROM arena_live_fallback WHERE expires<=?').run(now);
  });
 }

 private read(actor:Actor,now:number,target?:string):LiveView{
  const row=this.db.prepare('SELECT mode,json,seen FROM arena_live_queue WHERE player=? AND seen>?').get(actor.id,now-idle) as {mode:ArenaMode;json:string;seen:number}|undefined;
  const queued=row?JSON.parse(row.json) as QueueEntry:undefined;
  if(!target&&queued){
   if(queued.controller===actor.controller&&now-row!.seen>=1500)
    this.db.prepare('UPDATE arena_live_queue SET seen=? WHERE player=?').run(now,actor.id);
   const group=this.searches(queued.mode,now).find(({entries})=>entries.some(p=>p.id===actor.id));
   return {now,search:{id:queued.ticket,mode:queued.mode,deadline:group?.deadline??queued.since+MATCH_WAIT_MS,
    names:group?.entries.map(p=>p.name)??[queued.name],control:queued.controller===actor.controller,revision:queued.controlRevision??0}};
  }
  const fallback=this.db.prepare('SELECT ticket AS id,mode FROM arena_live_fallback WHERE player=? AND expires>?').get(actor.id,now) as LiveView['local'];
  if(!target&&fallback)return {now,local:fallback};
  const found=this.match(actor.id,target);
  if(!found)return {now};
  const match=JSON.parse(found.json) as LiveMatch;
  if(match.game.result&&now>=match.game.result.finishedAt+CHAT_MS)return {now};
  advanceLive(match,now,this.rng);
  const player=match.game.players.find(p=>p.id===actor.id)!;
  if(!match.game.result&&player.controller===actor.controller&&now-player.seenAt>=1500)player.seenAt=now;
  this.save(match,found.json,now);
  return {now,battle:viewLive(match,actor.id,actor.controller,now)};
 }

 state(actor:Actor,now:number){return this.transaction(()=>this.read(actor,now))}

 room(actor:Actor,id:string,now:number){return this.transaction(()=>this.read(actor,now,id))}

 recent(actor:Actor,now:number){
  const rows=this.db.prepare("SELECT m.id,m.expires,json_extract(m.json,'$.mode') AS mode FROM arena_live_seats s "+
   'JOIN arena_live_matches m ON m.id=s.match WHERE s.player=? AND m.expires>? ORDER BY m.expires DESC')
   .all(actor.id,now) as {id:string;expires:number;mode:ArenaMode}[];
  return rows.map(({id,expires,mode}):RecentBattle=>({id,mode,chatDeadline:expires}));
 }

 join(actor:Actor,mode:ArenaMode,build:ArenaBuild,name:string,now:number,rankEligible:boolean){
  return this.transaction(()=>{
   const current=this.read(actor,now);
   if(current.search||current.battle&&!current.battle.result)return current;
   this.db.prepare('DELETE FROM arena_live_fallback WHERE player=?').run(actor.id);
   const ticket=randomUUID();
   const entrant:QueueEntry={...actor,mode,ticket,build,hero:build.hero,level:build.level,name,kit:'balanced',rating:1000,rankEligible,since:now,seenAt:now};
   this.db.prepare('INSERT OR REPLACE INTO arena_live_queue VALUES(?,?,?,?,?)').run(actor.id,mode,now,now,JSON.stringify(entrant));
   this.pair(mode,now);
   return this.read(actor,now);
  });
 }

 cancel(actor:Actor,id:string,revision:number,now:number){
  return this.transaction(()=>{
   const row=this.db.prepare('SELECT json FROM arena_live_queue WHERE player=?').get(actor.id) as {json:string}|undefined;
   if(row){
    const entry=JSON.parse(row.json) as QueueEntry;
    if(entry.ticket===id&&entry.controller===actor.controller&&(entry.controlRevision??0)===revision)
     this.db.prepare('DELETE FROM arena_live_queue WHERE player=?').run(actor.id);
   }
   return this.read(actor,now);
  });
 }

 resume(actor:Actor,id:string,revision:number,now:number){
  return this.transaction(()=>{
   const row=this.db.prepare('SELECT json FROM arena_live_queue WHERE player=?').get(actor.id) as {json:string}|undefined;
   if(row){
    const entry=JSON.parse(row.json) as QueueEntry;
    if(entry.ticket===id&&(entry.controlRevision??0)===revision&&entry.controller!==actor.controller){
     entry.controller=actor.controller;entry.controlRevision=revision+1;
     this.db.prepare('UPDATE arena_live_queue SET json=?,seen=? WHERE player=?').run(JSON.stringify(entry),now,actor.id);
    }
   }else{
    const found=this.match(actor.id,id);
    if(found){
     const match=JSON.parse(found.json) as LiveMatch,player=match.game.players.find(p=>p.id===actor.id)!;
     if((player.controlRevision??0)===revision&&player.controller!==actor.controller){
      player.controller=actor.controller;player.controlRevision=revision+1;player.seenAt=now;this.save(match,found.json,now);
     }
    }
   }
   return this.read(actor,now);
  });
 }

 act(actor:Actor,id:string,revision:number,action:LiveAction,round:number,sequence:number,now:number){
  return this.transaction(()=>{
   const found=this.match(actor.id,id);
   if(!found)return {accepted:false,view:this.read(actor,now)};
   const match=JSON.parse(found.json) as LiveMatch;
   advanceLive(match,now,this.rng);
   const player=match.game.players.find(p=>p.id===actor.id)!;
   const controlled=player.controller===actor.controller&&(player.controlRevision??0)===revision;
   const accepted=(controlled||!!match.game.result&&action.kind==='chat')&&
    applyLive(match,actor.id,action,round,sequence,now,this.rng);
   if(!accepted&&action.kind==='item')
    console.warn(JSON.stringify({event:'arena_item_rejected',match:id,player:actor.id,item:action.item}));
   this.save(match,found.json,now);
   return {accepted,view:this.read(actor,now,id)};
  });
 }

 pending(){return this.db.prepare('SELECT match,telegram,name,finishedAt FROM arena_live_scores ORDER BY finishedAt,match LIMIT 40').all() as
  {match:string;telegram:string;name:string;finishedAt:string}[]}
 delivered(id:string){this.db.prepare('DELETE FROM arena_live_scores WHERE match=?').run(id)}
 pendingTeams(){return this.db.prepare('SELECT id,json FROM arena_live_team_results ORDER BY rowid LIMIT 10').all() as {id:string;json:string}[]}
 deliveredTeam(id:string){this.db.prepare('DELETE FROM arena_live_team_results WHERE id=?').run(id)}

}
