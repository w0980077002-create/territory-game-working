import {DatabaseSync} from 'node:sqlite';

const messageInterval=2_000;
const operationId=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const blockedLinks=/(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/|startapp\s*=)/iu;
type Message={id:number;name:string;text:string;at:number};

export class ChatError extends Error {
 constructor(readonly status:400|403|404|409|429){super(String(status));}
}

export class ChatRoom {
 private readonly db:DatabaseSync;

 constructor(path:string,private readonly moderators:ReadonlySet<string>){
  this.db=new DatabaseSync(path);
  this.db.exec(`
   PRAGMA busy_timeout=5000;
   PRAGMA journal_mode=WAL;
   PRAGMA foreign_keys=ON;
   CREATE TABLE IF NOT EXISTS chat_members (
    player TEXT PRIMARY KEY, name TEXT NOT NULL, last_post INTEGER
   ) STRICT;
   CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, player TEXT NOT NULL REFERENCES chat_members(player),
    operation TEXT NOT NULL, name TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)), UNIQUE(player,operation)
   ) STRICT;
   CREATE TABLE IF NOT EXISTS chat_moderation (
    message INTEGER PRIMARY KEY REFERENCES chat_messages(id), moderator TEXT NOT NULL,
    at INTEGER NOT NULL
   ) STRICT;
  `);
 }

 close(){this.db.close()}

 /** The caller supplies identity only after signature verification. */
 authenticate({id,name}:{id:string;name:string}){
  this.db.prepare('INSERT INTO chat_members(player,name) VALUES(?,?) ON CONFLICT(player) DO UPDATE SET name=excluded.name')
   .run(id,name);
 }

 messages(){
  return this.db.prepare('SELECT id,name,text,at FROM chat_messages WHERE hidden=0 ORDER BY id DESC LIMIT 50')
   .all().map(row=>({id:Number(row.id),name:String(row.name),text:String(row.text),at:Number(row.at)})).reverse();
 }

 send(player:string,operation:string,raw:string,now:number):Message{
  const body=raw.normalize('NFKC').replace(/\p{Cf}/gu,'').replace(/[\p{Cc}\s]+/gu,' ').trim();
  if(!operationId.test(operation)||!body||Array.from(body).length>240||blockedLinks.test(body))throw new ChatError(400);
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const member=this.db.prepare('SELECT name,last_post FROM chat_members WHERE player=?').get(player);
   if(!member)throw new ChatError(403);
   const previous=this.db.prepare('SELECT id,name,text,at,hidden FROM chat_messages WHERE player=? AND operation=?').get(player,operation);
   if(previous&&previous.text!==body)throw new ChatError(409);
   if(previous?.hidden)throw new ChatError(404);
   let result:Message;
   if(previous){
    result={id:Number(previous.id),name:String(previous.name),text:body,at:Number(previous.at)};
   }else{
    if(member.last_post!==null&&now-Number(member.last_post)<messageInterval)throw new ChatError(429);
    const inserted=this.db.prepare('INSERT INTO chat_messages(player,operation,name,text,at) VALUES(?,?,?,?,?)')
     .run(player,operation,String(member.name),body,now);
    this.db.prepare('UPDATE chat_members SET last_post=? WHERE player=?').run(now,player);
    result={id:Number(inserted.lastInsertRowid),name:String(member.name),text:body,at:now};
   }
   this.db.exec('COMMIT');
   return result;
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }

 hide(player:string,message:number,now:number){
  if(!this.moderators.has(player))throw new ChatError(403);
  if(!Number.isSafeInteger(message)||message<=0)throw new ChatError(400);
  this.db.exec('BEGIN IMMEDIATE');
  try{
   if(!this.db.prepare('UPDATE chat_messages SET hidden=1 WHERE id=?').run(message).changes)throw new ChatError(404);
   this.db.prepare('INSERT OR IGNORE INTO chat_moderation VALUES(?,?,?)').run(message,player,now);
   this.db.exec('COMMIT');
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
}
