import {createHash} from 'node:crypto';
import type {Sql,TransactionSql} from 'postgres';
import {parseSave} from '../../src/core/store';

export const MAX_SAVE_BYTES=2*1024*1024;
export class SaveError extends Error {
 constructor(readonly status:number,message:string){super(message)}
}
type Revision={revision:number;raw:string;checksum:string;restoredFrom:number|null;createdAt:Date};
type Metadata=Omit<Revision,'raw'>;
type Write={expected:number;requestId:string}&({raw:string;restore?:never}|{raw?:never;restore:number});
const hash=(raw:string)=>createHash('sha256').update(raw,'utf8').digest('hex');
const metadata=({revision,checksum,restoredFrom,createdAt}:Revision):Metadata=>({revision,checksum,restoredFrom,createdAt});
function checkIntegrity(row:Revision){
 if(hash(row.raw)!==row.checksum)throw new SaveError(503,'Нарушена целостность копии. Выберите предыдущую версию.');
 return row;
}

export class PlayerSaves {
 constructor(private readonly sql:Sql){}

 close(){return this.sql.end({timeout:5})}

 private player<T>(telegramId:string,work:(tx:TransactionSql,playerId:string)=>Promise<T>){
  return this.sql.begin(async tx=>{
   await tx`select set_config('vvr.telegram_id',${telegramId},true),
    set_config('statement_timeout','5s',true), set_config('lock_timeout','3s',true)`;
   // Serializes first import and later writes from independent devices, across server processes.
   await tx`select pg_advisory_xact_lock(hashtextextended(${telegramId},22641))`;
   await tx`insert into vvr.players(telegram_id) values (${telegramId}) on conflict (telegram_id) do nothing`;
   const [account]=await tx<{id:string}[]>`select id from vvr.players where telegram_id=${telegramId}`;
   return work(tx,account.id);
  });
 }

 read(telegramId:string,revision?:number){
  return this.player(telegramId,async(tx,playerId)=>{
   const versions=await tx<Metadata[]>`
    select revision, checksum, restored_from as "restoredFrom", created_at as "createdAt"
    from vvr.solo_snapshots where player_id=${playerId}
    order by revision desc limit 20`;
   const latest=versions[0]?.revision??0;
   const [row]=await tx<Revision[]>`
    select revision, raw, checksum, restored_from as "restoredFrom", created_at as "createdAt"
    from vvr.solo_snapshots where player_id=${playerId} and revision=${revision??latest}`;
   if(!row&&revision!==undefined)throw new SaveError(404,'Копия не найдена');
   // Keep the backup list available even when the current version fails its checksum.
   const corrupt=!!row&&hash(row.raw)!==row.checksum;
   return {playerId,revision:latest,snapshot:row&&!corrupt?row:null,corrupt,backups:versions};
  });
 }

 write(telegramId:string,write:Write){
  const raw=write.raw;
  if(raw!==undefined&&(
   Buffer.byteLength(raw)>MAX_SAVE_BYTES||Buffer.from(raw).toString()!==raw||!parseSave(raw,true)
  ))throw new SaveError(400,'Некорректная копия Solo');
  return this.player(telegramId,async(tx,playerId)=>{
   const [previous]=await tx<Revision[]>`
    select revision, raw, checksum, restored_from as "restoredFrom", created_at as "createdAt"
    from vvr.solo_snapshots where player_id=${playerId} and request_id=${write.requestId}`;
   if(previous){
    if(previous.revision!==write.expected+1||previous.restoredFrom!==(write.restore??null)||
     (raw!==undefined&&raw!==previous.raw))throw new SaveError(409,'Номер запроса уже использован');
    return {playerId,...metadata(checkIntegrity(previous))};
   }
   const [latest]=await tx<{revision:number}[]>`
    select revision from vvr.solo_snapshots where player_id=${playerId} order by revision desc limit 1`;
   if((latest?.revision??0)!==write.expected)throw new SaveError(409,'Есть более свежая версия. Загрузите её перед записью.');
   let snapshot=raw;
   if(write.restore!==undefined){
    const [backup]=await tx<Revision[]>`
     select revision, raw, checksum, restored_from as "restoredFrom", created_at as "createdAt"
     from vvr.solo_snapshots where player_id=${playerId} and revision=${write.restore}`;
    if(!backup)throw new SaveError(404,'Копия не найдена');
    snapshot=checkIntegrity(backup).raw;
    if(!parseSave(snapshot,true))throw new SaveError(409,'Эта версия несовместима с текущей игрой');
   }
   if(snapshot===undefined)throw new SaveError(400,'Укажите копию Solo');
   const [saved]=await tx<Metadata[]>`
    insert into vvr.solo_snapshots (player_id, revision, request_id, raw, checksum, restored_from)
    values (${playerId}, ${write.expected+1}, ${write.requestId}, ${snapshot}, ${hash(snapshot)}, ${write.restore??null})
    returning revision, checksum, restored_from as "restoredFrom", created_at as "createdAt"`;
   return {playerId,...saved};
  });
 }
}
