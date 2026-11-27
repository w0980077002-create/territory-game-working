import {randomBytes,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import type {ArenaBuild} from '../../src/arena/hero';
import {advanceLive,applyLive,arenaWinners,buildMatch,capacities,nextLiveWake,viewLive,type ArenaMode,type LiveAction,type LiveMatch,type LiveView,type RecentBattle} from '../../src/arena/match';
import {CHAT_MS,LEVEL_RANGE,MATCH_WAIT_MS} from '../../src/arena/protocol';
import {PROOF_DURATION,replayProof,type LocalProof,type ProofMove,type TeamArenaMode} from '../../src/arena/localProof';
import {battleLimit,consumableIds,consumablePrice,type ConsumableId,type ConsumableStock,type ConsumablesQuote,type PotionQuote} from '../../src/arena/potion';
import {beltHas,DEFAULT_BELT,isBeltItem,sanitizeBelt} from '../../src/arena/belt';
import {compatible,type Entrant} from './duel';

type Actor={id:string;controller:string};
type QueueEntry=Entrant&{ticket:string;mode:ArenaMode;since:number;seenAt:number;localStage?:number;localPotions?:number;localStock?:Partial<Record<ConsumableId,number>>;localOnly?:boolean};
type Active={id:string;json:string};
type Search={mode:ArenaMode;entries:QueueEntry[];deadline:number};
const idle=12_000;
type Spending={telegram:string;item:ConsumableId;total:number};

function beltStock(loadout:readonly (string|null)[],stock:ConsumableStock){
 const result:ConsumableStock={};
 for(const item of loadout)if(isBeltItem(item)&&stock[item])
  result[item]=Math.min(stock[item]!,battleLimit(item));
 return result;
}

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
   CREATE TABLE IF NOT EXISTS arena_potion_spending (player TEXT PRIMARY KEY, total INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS arena_local_potion_reserve (
    battle TEXT PRIMARY KEY, player TEXT NOT NULL UNIQUE, remaining INTEGER NOT NULL, expires INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS arena_local_potion_reserve_expiry ON arena_local_potion_reserve(expires);
   CREATE TABLE IF NOT EXISTS arena_local_potion_uses (
    operation TEXT PRIMARY KEY, player TEXT NOT NULL, battle TEXT NOT NULL, expires INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS arena_local_potion_uses_expiry ON arena_local_potion_uses(expires);
   CREATE TABLE IF NOT EXISTS arena_consumable_spending (
    player TEXT NOT NULL, item TEXT NOT NULL, total INTEGER NOT NULL, published INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(player,item), CHECK(total>=published AND published>=0)
   );
   CREATE INDEX IF NOT EXISTS arena_consumable_outbox ON arena_consumable_spending(player,item) WHERE total>published;
   INSERT INTO arena_consumable_spending(player,item,total)
    SELECT player,'potion',total FROM arena_potion_spending WHERE total>0
    ON CONFLICT(player,item) DO UPDATE SET total=max(total,excluded.total);
   CREATE TABLE IF NOT EXISTS arena_local_consumable_reserve (
    battle TEXT NOT NULL, player TEXT NOT NULL, item TEXT NOT NULL, remaining INTEGER NOT NULL CHECK(remaining>=0),
    expires INTEGER NOT NULL, PRIMARY KEY(battle,player,item), UNIQUE(player,item)
   );
   CREATE INDEX IF NOT EXISTS arena_local_consumable_expiry ON arena_local_consumable_reserve(expires);
   CREATE TABLE IF NOT EXISTS arena_local_consumable_uses (
    operation TEXT PRIMARY KEY, player TEXT NOT NULL, battle TEXT NOT NULL, item TEXT NOT NULL, expires INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS arena_local_consumable_uses_expiry ON arena_local_consumable_uses(expires);
   CREATE TABLE IF NOT EXISTS arena_local_proofs (
    id TEXT PRIMARY KEY, player TEXT NOT NULL, mode TEXT NOT NULL, json TEXT NOT NULL, expires INTEGER NOT NULL, day TEXT
   );
   CREATE INDEX IF NOT EXISTS arena_local_proof_expiry ON arena_local_proofs(expires);
   CREATE UNIQUE INDEX IF NOT EXISTS arena_local_proof_day ON arena_local_proofs(player,day) WHERE day IS NOT NULL;

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
   let group=player.localOnly?undefined:groups.find(({entries,deadline})=>entries.length<capacities[mode]&&player.since<=deadline&&
    entries.every(other=>!other.localOnly&&Math.abs(other.level-player.level)<=LEVEL_RANGE&&other.rankEligible===player.rankEligible));
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
    if(p.potions)
     this.db.prepare('INSERT INTO arena_local_potion_reserve VALUES(?,?,?,?)')
      .run(p.ticket,p.id,p.potions,now+PROOF_DURATION+CHAT_MS);

    for(const [item,count] of Object.entries(p.stock??{}))
     this.db.prepare('INSERT INTO arena_local_consumable_reserve VALUES(?,?,?,?,?)')
      .run(p.ticket,p.id,item,count,now+PROOF_DURATION+CHAT_MS);
    const stock:ConsumableStock={...p.localStock};
    for(const [item,count] of Object.entries(p.stock??{})){
     const kind=item as ConsumableId;
     stock[kind]=(stock[kind]??0)+count;
    }

    if(mode!=='duel'&&p.build&&p.localStage!==undefined&&!this.db
      .prepare('SELECT 1 FROM arena_local_proofs WHERE player=? AND day=?').get(p.id,new Date(now).toISOString().slice(0,10))){
     const proof:LocalProof={seed:randomBytes(4).readUInt32LE(),startedAt:now,hero:p.build,
      stage:p.localStage,potions:(p.localPotions??0)+(p.potions??0),
      ...(p.loadout?{loadout:p.loadout}:{}),...(Object.keys(stock).length?{stock}:{})};
     this.db.prepare('INSERT OR IGNORE INTO arena_local_proofs VALUES(?,?,?,?,?,NULL)')
      .run(p.ticket,p.id,mode,JSON.stringify(proof),now+PROOF_DURATION+CHAT_MS);
    }
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
   this.db.prepare('DELETE FROM arena_local_potion_reserve WHERE expires<=?').run(now);
   this.db.prepare('DELETE FROM arena_local_potion_uses WHERE expires<=?').run(now);
   this.db.prepare('DELETE FROM arena_local_consumable_reserve WHERE expires<=?').run(now);
   this.db.prepare('DELETE FROM arena_local_consumable_uses WHERE expires<=?').run(now);

   this.db.prepare('DELETE FROM arena_local_proofs WHERE expires<=? AND (day IS NULL OR day<?)')
    .run(now,new Date(now).toISOString().slice(0,10));
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
  if(!target&&fallback){
   const row=this.db.prepare('SELECT json FROM arena_local_proofs WHERE id=? AND player=? AND day IS NULL')
    .get(fallback.id,actor.id) as {json:string}|undefined;
   const reserve=this.db.prepare('SELECT remaining FROM arena_local_potion_reserve WHERE battle=? AND player=? AND expires>?')
    .get(fallback.id,actor.id,now) as {remaining:number}|undefined;
   const confirmedStock=this.localReserve(actor.id,now,fallback.id);
   return {now,local:{...fallback,...(row?{proof:JSON.parse(row.json) as LocalProof}:{}),
    ...(reserve?{confirmedPotions:reserve.remaining}:{}),...(Object.keys(confirmedStock).length?{confirmedStock}:{})}};
  }
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

 private localReserve(player:string,now:number,battle?:string):ConsumableStock{
  const rows=this.db.prepare('SELECT item,remaining FROM arena_local_consumable_reserve WHERE player=? AND expires>? AND (? IS NULL OR battle=?)')
   .all(player,now,battle??null,battle??null) as {item:ConsumableId;remaining:number}[];
  return Object.fromEntries(rows.map(({item,remaining})=>[item,remaining]));
 }

 private available(player:string,issued:ConsumableStock,remote:ConsumableStock):ConsumableStock{
  const rows=this.db.prepare('SELECT item,total FROM arena_consumable_spending WHERE player=?').all(player) as
   {item:ConsumableId;total:number}[];
  const spent:ConsumableStock={...remote};
  for(const {item,total} of rows)spent[item]=Math.max(spent[item]??0,total);
  return Object.fromEntries(consumableIds.map(item=>[item,Math.max(0,(issued[item]??0)-(spent[item]??0))]));
 }

 private reserved(playerId:string,now:number):ConsumableStock{
  const found=this.match(playerId);
  const match=found?JSON.parse(found.json) as LiveMatch:undefined;
  const player=match&&!match.game.result?match.game.players.find(p=>p.id===playerId):undefined;
  if(player)return Object.fromEntries(consumableIds.map(item=>[item,player.belt[item]??0]));
  const queued=this.db.prepare('SELECT json FROM arena_live_queue WHERE player=? AND seen>?').get(playerId,now-idle) as {json:string}|undefined;
  if(queued){
   const entry=JSON.parse(queued.json) as QueueEntry;
   return {...entry.stock,potion:Math.min(entry.potions??0,battleLimit('potion'))};
  }
  const potion=this.db.prepare('SELECT remaining FROM arena_local_potion_reserve WHERE player=? AND expires>?')
   .get(playerId,now) as {remaining:number}|undefined;
  return {...this.localReserve(playerId,now),potion:potion?.remaining??0};
 }

 consumablesQuote(actor:Actor,issued:ConsumableStock,spent:ConsumableStock,stage:number,gold:number,now:number):ConsumablesQuote{
  return {stage,gold,prices:Object.fromEntries(consumableIds.map(item=>[item,consumablePrice(item,stage)])) as Record<ConsumableId,number>,
   stock:this.available(actor.id,issued,spent),reserved:this.reserved(actor.id,now)};
 }

 availablePotions(player:string,issued:number){
  return this.available(player,{potion:issued},{}).potion??0;
 }

 potionQuote(actor:Actor,issued:number,stage:number,price:number,gold:number,now=Date.now()):PotionQuote{
  return {stage,price,gold,stock:this.availablePotions(actor.id,issued),reserved:this.reserved(actor.id,now).potion??0};
 }

 join(actor:Actor,mode:ArenaMode,build:ArenaBuild,name:string,now:number,rankEligible:boolean,issued:ConsumableStock|number=0,localStage?:number,localPotions?:number,belt?:unknown,localStock?:ConsumableStock,spent:ConsumableStock={},localOnly=false){
  return this.transaction(()=>{
   const current=this.read(actor,now);
   if(current.search||current.battle&&!current.battle.result)return current;
   this.db.prepare('DELETE FROM arena_live_fallback WHERE player=?').run(actor.id);
   this.db.prepare('DELETE FROM arena_local_potion_reserve WHERE player=?').run(actor.id);
   this.db.prepare('DELETE FROM arena_local_consumable_reserve WHERE player=?').run(actor.id);
   const ticket=randomUUID();
   // The next match uses a fixed reservation from the account ledger; client stock is only for the local fallback.
   const loadout=sanitizeBelt(belt??DEFAULT_BELT,0);
   for(const [item,total] of Object.entries(spent))if(total>0)this.restoreSpending(actor.id,item as ConsumableId,total);
   const stock=beltStock(loadout,this.available(actor.id,typeof issued==='number'?{potion:issued}:issued,spent));
   const potions=stock.potion;
   delete stock.potion;
   const entrant:QueueEntry={...actor,mode,ticket,build,hero:build.hero,level:build.level,name,kit:'balanced',rating:1000,
    rankEligible,localOnly,loadout,potions,stock,localStage,localPotions:beltHas(loadout,'potion')?localPotions:0,
    localStock:beltStock(loadout,localStock??{}),since:now,seenAt:now};
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
   if(accepted&&action.kind==='item'&&isBeltItem(action.item))this.spend(actor.id,action.item);
   if(!accepted&&action.kind==='item')
    console.warn(JSON.stringify({event:'arena_item_rejected',match:id,player:actor.id,item:action.item}));
   this.save(match,found.json,now);
   return {accepted,view:this.read(actor,now,id)};
  });
 }

 private restoreSpending(player:string,item:ConsumableId,total:number){
  this.db.prepare('INSERT INTO arena_consumable_spending VALUES(?,?,?,?) ON CONFLICT(player,item) '+
   'DO UPDATE SET total=max(total,excluded.total),published=max(published,excluded.published)').run(player,item,total,total);
  if(item==='potion')this.db.prepare('INSERT INTO arena_potion_spending VALUES(?,?) ON CONFLICT(player) DO UPDATE SET total=max(total,excluded.total)')
   .run(player,total);
 }

 private spend(player:string,item:ConsumableId){
  this.db.prepare('INSERT INTO arena_consumable_spending(player,item,total) VALUES(?,?,1) ON CONFLICT(player,item) DO UPDATE SET total=total+1')
   .run(player,item);
  if(item==='potion')this.db.prepare('INSERT INTO arena_potion_spending VALUES(?,1) ON CONFLICT(player) DO UPDATE SET total=total+1').run(player);
 }

 pendingSpending(){
  return this.db.prepare('SELECT player AS telegram,item,total FROM arena_consumable_spending WHERE total>published ORDER BY player,item LIMIT 100')
   .all() as Spending[];
 }
 confirmSpending(entries:readonly Spending[]){
  this.transaction(()=>{
   const confirm=this.db.prepare('UPDATE arena_consumable_spending SET published=max(published,?) WHERE player=? AND item=?');
   for(const {telegram,item,total} of entries)confirm.run(total,telegram,item);
  });
 }

 useLocalConsumable(actor:Actor,battle:string,operation:string,item:ConsumableId,now:number){
  if(item==='potion')return this.useLocalPotion(actor,battle,operation,now);
  return this.transaction(()=>{
   const prior=this.db.prepare('SELECT player,battle,item FROM arena_local_consumable_uses WHERE operation=?')
    .get(operation) as {player:string;battle:string;item:ConsumableId}|undefined;
   if(prior)return prior.player===actor.id&&prior.battle===battle&&prior.item===item;
   if(this.db.prepare('SELECT 1 FROM arena_local_potion_uses WHERE operation=?').get(operation))return false;
   const reserve=this.db.prepare('UPDATE arena_local_consumable_reserve SET remaining=remaining-1 WHERE battle=? AND player=? AND item=? AND remaining>0 AND expires>?')
    .run(battle,actor.id,item,now);
   if(!reserve.changes)return false;
   this.spend(actor.id,item);
   this.db.prepare('INSERT INTO arena_local_consumable_uses VALUES(?,?,?,?,?)').run(operation,actor.id,battle,item,now+24*60*60_000);
   return true;
  });
 }

 useLocalPotion(actor:Actor,battle:string,operation:string,now:number){
  return this.transaction(()=>{
   const prior=this.db.prepare('SELECT player,battle FROM arena_local_potion_uses WHERE operation=?')
    .get(operation) as {player:string;battle:string}|undefined;
   if(prior)return prior.player===actor.id&&prior.battle===battle;
   if(this.db.prepare('SELECT 1 FROM arena_local_consumable_uses WHERE operation=?').get(operation))return false;
   const reserve=this.db.prepare('UPDATE arena_local_potion_reserve SET remaining=remaining-1 WHERE battle=? AND player=? AND remaining>0 AND expires>?')
    .run(battle,actor.id,now);
   if(!reserve.changes)return false;
   this.spend(actor.id,'potion');
   this.db.prepare('INSERT INTO arena_local_potion_uses VALUES(?,?,?,?)').run(operation,actor.id,battle,now+24*60*60_000);
   return true;
  });
 }

 releaseLocalPotions(actor:Actor,battle:string){
  this.transaction(()=>{
   this.db.prepare('DELETE FROM arena_local_potion_reserve WHERE battle=? AND player=?').run(battle,actor.id);
   this.db.prepare('DELETE FROM arena_local_consumable_reserve WHERE battle=? AND player=?').run(battle,actor.id);
  });
 }

 prove(actor:Actor,id:string,name:string,moves:readonly ProofMove[],now:number){
  return this.transaction(()=>{
   const row=this.db.prepare('SELECT mode,json,day FROM arena_local_proofs WHERE id=? AND player=? AND expires>?')
    .get(id,actor.id,now) as {mode:TeamArenaMode;json:string;day:string|null}|undefined;
   if(!row)return {status:'closed'};
   if(row.day)return {status:'accepted'};
   const config=JSON.parse(row.json) as LocalProof;
   const result=replayProof(id,row.mode,config,moves,now);
   if(!result)return {status:'closed'};
   const finishedAt=new Date(result.finishedAt).toISOString();
   const day=finishedAt.slice(0,10);
   const updated=this.db.prepare('UPDATE OR IGNORE arena_local_proofs SET day=? WHERE id=? AND day IS NULL').run(day,id);
   if(!updated.changes)return {status:'accepted'};
   const publication={local:true,match:id,mode:row.mode,startedAt:new Date(config.startedAt).toISOString(),finishedAt,
    reason:result.reason,winner:result.winner,members:[{telegram:actor.id,name,hero:config.hero.hero,side:0,fought:true}]};
   this.db.prepare('INSERT OR IGNORE INTO arena_live_team_results VALUES(?,?)').run(id,JSON.stringify(publication));
   return {status:'accepted'};
  });
 }

 pending(){return this.db.prepare('SELECT match,telegram,name,finishedAt FROM arena_live_scores ORDER BY finishedAt,match LIMIT 40').all() as
  {match:string;telegram:string;name:string;finishedAt:string}[]}
 delivered(id:string){this.db.prepare('DELETE FROM arena_live_scores WHERE match=?').run(id)}
 pendingTeams(){return this.db.prepare('SELECT id,json FROM arena_live_team_results ORDER BY rowid LIMIT 10').all() as {id:string;json:string}[]}
 deliveredTeam(id:string){this.db.prepare('DELETE FROM arena_live_team_results WHERE id=?').run(id)}

}
