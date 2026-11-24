import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const maxBalance=1_000_000_000;
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const playerId=/^[1-9]\d{0,15}$/;

export type TradeCommand=
 | {kind:'list';itemId:string;price:number}
 | {kind:'buy'|'cancel';listingId:string};
type Listing={id:string;itemId:string;seller:string;price:number;state:'open'|'sold'|'cancelled'};
type Receipt={operationId:string;kind:TradeCommand['kind'];listingId:string;itemId:string;price:number;at:number};

export class TradeError extends Error {
 constructor(readonly code:'invalid'|'unavailable'|'forbidden'|'funds'|'operation_conflict'){
  super(code);
 }
}

/** Call from authenticated server handlers. Grants belong to trusted game services only. */
export class AuctionLedger {
 private readonly db:DatabaseSync;

 constructor(path:string){
  this.db=new DatabaseSync(path);
  this.db.exec(`
   PRAGMA busy_timeout=5000;
   PRAGMA journal_mode=WAL;
   PRAGMA foreign_keys=ON;
   CREATE TABLE IF NOT EXISTS auction_wallets(
    player TEXT PRIMARY KEY, balance INTEGER NOT NULL CHECK(balance BETWEEN 0 AND 1000000000)
   ) STRICT;
   CREATE TABLE IF NOT EXISTS auction_items(
    id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES auction_wallets(player),
    issued_to TEXT NOT NULL REFERENCES auction_wallets(player), catalog_id TEXT NOT NULL
   ) STRICT;
   CREATE TABLE IF NOT EXISTS auction_listings(
    id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES auction_items(id),
    seller TEXT NOT NULL REFERENCES auction_wallets(player), price INTEGER NOT NULL CHECK(price BETWEEN 1 AND 1000000000),
    state TEXT NOT NULL CHECK(state IN ('open','sold','cancelled'))
   ) STRICT;
   CREATE UNIQUE INDEX IF NOT EXISTS auction_one_open_listing ON auction_listings(item_id) WHERE state='open';
   CREATE TABLE IF NOT EXISTS auction_receipts(
    actor TEXT NOT NULL REFERENCES auction_wallets(player), operation_id TEXT NOT NULL,
    command TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(actor,operation_id)
   ) STRICT;
  `);
 }

 close(){this.db.close()}

 /** An existing wallet keeps its balance when provisioning is retried. */
 provisionWallet(player:string,balance=0){
  if(!playerId.test(player)||!Number.isSafeInteger(balance)||balance<0||balance>maxBalance)throw new TradeError('invalid');
  this.db.prepare('INSERT INTO auction_wallets VALUES (?,?) ON CONFLICT(player) DO NOTHING').run(player,balance);
 }

 grantItem(id:string,owner:string,catalogId:string){
  if(!uuid.test(id)||!playerId.test(owner)||!/^[-a-z0-9:]{1,48}$/.test(catalogId))throw new TradeError('invalid');
  this.db.prepare('INSERT INTO auction_items VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id,owner,owner,catalogId);
  const item=this.db.prepare('SELECT issued_to,catalog_id FROM auction_items WHERE id=?').get(id);
  if(item?.issued_to!==owner||item.catalog_id!==catalogId)throw new TradeError('operation_conflict');
 }

 balance(player:string){
  const row=this.db.prepare('SELECT balance FROM auction_wallets WHERE player=?').get(player);
  return row?Number(row.balance):undefined;
 }

 /** Escrowed items cannot be used for another operation while listed. */
 ownedItems(player:string){
  const items=this.db.prepare(`SELECT id,catalog_id AS catalogId FROM auction_items i WHERE owner=? AND NOT EXISTS(
   SELECT 1 FROM auction_listings l WHERE l.item_id=i.id AND l.state='open'
  ) ORDER BY id`).all(player) as {id:string;catalogId:string}[];
  return items.map(({id,catalogId})=>({id,catalogId}));
 }

 history(player:string){
  return this.db.prepare(`SELECT r.result FROM auction_receipts r WHERE r.actor=? OR (
   json_extract(r.result,'$.kind')='buy' AND EXISTS(
    SELECT 1 FROM auction_listings l WHERE l.id=json_extract(r.result,'$.listingId') AND l.seller=?
   )
  ) ORDER BY r.rowid DESC LIMIT 100`).all(player,player).map(row=>JSON.parse(String(row.result)) as Receipt);
 }

 transact(actor:string,operationId:string,command:TradeCommand,now=Date.now()):Receipt{
  if(!playerId.test(actor)||!uuid.test(operationId)||!Number.isSafeInteger(now)||now<0)throw new TradeError('invalid');
  if(command.kind==='list'){
   if(!uuid.test(command.itemId)||!Number.isSafeInteger(command.price)||command.price<1||command.price>maxBalance)
    throw new TradeError('invalid');
  }else if((command.kind!=='buy'&&command.kind!=='cancel')||!uuid.test(command.listingId))throw new TradeError('invalid');
  const request=JSON.stringify(command.kind==='list'?[command.kind,command.itemId,command.price]:[command.kind,command.listingId]);
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const previous=this.db.prepare('SELECT command,result FROM auction_receipts WHERE actor=? AND operation_id=?').get(actor,operationId);
   if(previous&&previous.command!==request)throw new TradeError('operation_conflict');
   if(this.balance(actor)===undefined)throw new TradeError('forbidden');
   const result=previous?JSON.parse(String(previous.result)) as Receipt:this.execute(actor,operationId,command,now);
   if(!previous)this.db.prepare('INSERT INTO auction_receipts VALUES (?,?,?,?)').run(actor,operationId,request,JSON.stringify(result));
   this.db.exec('COMMIT');
   return result;
  }catch(error){
   this.db.exec('ROLLBACK');
   throw error;
  }
 }

 private execute(actor:string,operationId:string,command:TradeCommand,at:number):Receipt{
  if(command.kind==='list'){
   const item=this.db.prepare(`SELECT id FROM auction_items i WHERE id=? AND owner=? AND NOT EXISTS(
    SELECT 1 FROM auction_listings l WHERE l.item_id=i.id AND l.state='open'
   )`).get(command.itemId,actor);
   if(!item)throw new TradeError('unavailable');
   const listingId=randomUUID();
   this.db.prepare("INSERT INTO auction_listings VALUES (?,?,?,?,'open')").run(listingId,command.itemId,actor,command.price);
   return {operationId,kind:command.kind,listingId,itemId:command.itemId,price:command.price,at};
  }
  const listing=this.db.prepare('SELECT id,item_id AS itemId,seller,price,state FROM auction_listings WHERE id=?')
   .get(command.listingId) as Listing|undefined;
  if(!listing||listing.state!=='open')throw new TradeError('unavailable');
  if(command.kind==='cancel'){
   if(actor!==listing.seller)throw new TradeError('forbidden');
   this.db.prepare("UPDATE auction_listings SET state='cancelled' WHERE id=?").run(listing.id);
  }else{
   if(actor===listing.seller)throw new TradeError('forbidden');
   const debit=this.db.prepare('UPDATE auction_wallets SET balance=balance-? WHERE player=? AND balance>=?')
    .run(listing.price,actor,listing.price);
   if(!debit.changes)throw new TradeError('funds');
   const credit=this.db.prepare('UPDATE auction_wallets SET balance=balance+? WHERE player=? AND balance<=?')
    .run(listing.price,listing.seller,maxBalance-listing.price);
   if(!credit.changes)throw new TradeError('funds');
   const delivery=this.db.prepare('UPDATE auction_items SET owner=? WHERE id=? AND owner=?').run(actor,listing.itemId,listing.seller);
   if(!delivery.changes)throw new TradeError('unavailable');
   this.db.prepare("UPDATE auction_listings SET state='sold' WHERE id=?").run(listing.id);
  }
  return {operationId,kind:command.kind,listingId:listing.id,itemId:listing.itemId,price:listing.price,at};
 }
}
