import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import postgres from 'postgres';
import {createArenaServer} from '../../server/arena/http';
import {openPlayerSaves,saveDatabaseUrl} from '../../server/saves/config';
import {freshPlayer} from '../../src/core/store';

const botToken='vvr-pg-fixture-only';
const sessionKey='vvr-pg-test-session-key-at-least-32-characters';
const allowlist=new Set(['2101','2102']);
const fixturePassword='vvr-save-local-only';
const actorTab=()=>randomUUID();

function signed(id:number){
 const fields=new URLSearchParams({
  auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'Игрок '+id}),
 });
 const key=createHmac('sha256','WebAppData').update(botToken).digest();
 const text=[...fields].map(([name,value])=>name+'='+value).join('\n');
 fields.set('hash',createHmac('sha256',key).update(text).digest('hex'));
 return fields.toString();
}

test('database configuration only accepts the dedicated role, project and verified TLS endpoint',()=>{
 const ref='cemifozgxyhnbknsexzt';
 const direct='postgresql://vvr_save_login:fixture@db.'+ref+'.supabase.co:5432/postgres';
 assert.equal(saveDatabaseUrl(direct,ref,false),direct);
 const pooler='postgresql://vvr_save_login.'+ref+':fixture@aws-0-eu-1.pooler.supabase.com:5432/postgres';
 assert.equal(saveDatabaseUrl(pooler,ref,false),pooler);
 for(const invalid of [
  direct.replace('vvr_save_login','postgres'),direct.replace(ref,'zzzzzzzzzzzzzzzzzzzz'),
  direct.replace('supabase.co','other.invalid'),pooler.replace(':5432',':6543'),direct+'?sslmode=disable',
 ])assert.throws(()=>saveDatabaseUrl(invalid,ref,false));
 assert.throws(()=>saveDatabaseUrl(direct,ref,true));
 const other='abcdefghijabcdefghij';
 assert.throws(()=>saveDatabaseUrl(direct.replace(ref,other),other,false));
});

test('two signed sessions use isolated accounts and versioned PostgreSQL saves across devices and restart',async()=>{
 const target=new URL(process.env.VVR_TEST_DB_ADMIN_URL??'');
 // This suite provisions roles. It only accepts an explicitly named disposable loopback database.
 assert.equal(target.hostname,'127.0.0.1');
 assert.equal(target.pathname,'/vvr_test');
 assert.equal(target.username,'postgres');
 target.username='vvr_save_login';
 target.password=fixturePassword;
 const appUrl=target.toString();
 const admin=postgres(process.env.VVR_TEST_DB_ADMIN_URL!,{max:4});
 const root=mkdtempSync(join(tmpdir(),'vvr-pg-http-'));
 const servers:ReturnType<typeof createArenaServer>[]=[];
 const request=async(base:string,path:string,data?:Record<string,unknown>,token?:string,tab=actorTab())=>{
  const response=await fetch(base+path,{
   method:data?'POST':'GET',
   headers:{...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token,'X-Arena-Tab':tab}:{})},
   body:data?JSON.stringify(data):undefined,
  });
  return {status:response.status,body:await response.json()};
 };
 const close=(server:ReturnType<typeof createArenaServer>)=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 async function start(){
  const saves=openPlayerSaves(appUrl,undefined,true)!;
  const server=createArenaServer({dbPath:join(root,'arena.sqlite'),botToken,sessionKey,allowedUsers:allowlist,saves});
  servers.push(server);
  await new Promise<void>((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const addr=server.address();
  assert.ok(addr&&typeof addr!=='string');
  return {server,saves,base:'http://127.0.0.1:'+addr.port+'/arena-api/'};
 }
 try{
  await admin.unsafe('create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls');
  const directory='supabase/migrations';
  for(const file of readdirSync(directory).filter(name=>name.endsWith('.sql')).sort())
   await admin.begin(tx=>tx.unsafe(readFileSync(join(directory,file),'utf8')));
  const [index]=await admin`select indexdef from pg_indexes where schemaname='vvr'
   and indexname='solo_snapshots_player_id_restored_from_idx'`;
  assert.match(index.indexdef,/USING btree \(player_id, restored_from\)/);
  await admin.unsafe("create role vvr_save_login login in role vvr_save_api password 'vvr-save-local-only'");
  const a=await start(),b=await start();
  const logIn=async(id:number)=>{
   const result=await request(a.base,'auth',{initData:signed(id)});
   assert.equal(result.status,200);
   return result.body.token as string;
  };
  const edited=new URLSearchParams(signed(2101));
  edited.set('user',JSON.stringify({id:2102,first_name:'Другой игрок'}));
  assert.equal((await request(a.base,'auth',{initData:edited.toString()})).status,401);
  assert.equal((await request(a.base,'auth',{initData:signed(2103)})).status,403);
  assert.equal((await request(a.base,'save')).status,401);
  const first=await logIn(2101),second=await logIn(2102);
  const tabA=actorTab(),tabB=actorTab();
  const raw=JSON.stringify({...freshPlayer(),gold:12_345},null,2);
  const newer=JSON.stringify({...freshPlayer(),gold:98_765});
  const initial={expected:0,requestId:randomUUID(),raw};
  assert.equal((await request(a.base,'save',{...initial,playerId:2102},first)).status,400);
  assert.equal((await request(a.base,'save',{...initial,raw:'{"version":1}'},first)).status,400);
  const firstWrite=await request(a.base,'save',initial,first,tabA);
  assert.equal(firstWrite.status,200);
  const {playerId,checksum}=firstWrite.body;
  assert.equal(checksum,createHash('sha256').update(raw).digest('hex'));
  const edits=[{expected:1,requestId:randomUUID(),raw:newer},{expected:1,requestId:randomUUID(),raw:raw+'\n'}];
  const race=await Promise.all([request(a.base,'save',edits[0],first,tabA),request(b.base,'save',edits[1],first,tabB)]);
  assert.deepEqual(race.map(x=>x.status).sort(),[200,409]);
  const winner=edits[race.findIndex(x=>x.status===200)];
  const retried=await request(b.base,'save',winner,first,tabB);
  assert.equal(retried.status,200);
  assert.equal(retried.body.revision,2);
  assert.equal((await request(b.base,'save',{...winner,raw:newer+'\n'},first)).status,409);
  const beforeRestore=(await request(b.base,'save',undefined,first)).body;
  assert.equal(beforeRestore.playerId,playerId);
  assert.equal(beforeRestore.snapshot.raw,winner.raw);
  const isolated=(await request(b.base,'save?revision=1',undefined,second));
  assert.equal(isolated.status,404);
  const other=(await request(b.base,'save',undefined,second)).body;
  assert.notEqual(other.playerId,playerId);
  assert.equal(other.snapshot,null);
  const restore={expected:2,requestId:randomUUID(),revision:1};
  const rolledBack=await request(b.base,'save/restore',restore,first);
  assert.equal(rolledBack.status,200);
  assert.equal(rolledBack.body.revision,3);
  assert.equal(rolledBack.body.restoredFrom,1);
  assert.deepEqual((await request(a.base,'save/restore',restore,first)).body,rolledBack.body);
  assert.equal((await request(a.base,'save?revision=2',undefined,first)).body.snapshot.raw,winner.raw);
  assert.equal((await request(b.base,'save',undefined,first)).body.snapshot.raw,raw);

  await admin.begin(async tx=>{
   await tx`set local role vvr_save_api`;
   await tx`select set_config('vvr.telegram_id','2102',true)`;
   assert.deepEqual([...(await tx`select id from vvr.players`)], [{id:other.playerId}]);
   assert.equal((await tx`select revision from vvr.solo_snapshots where player_id=${playerId}`).length,0);
  });
  await assert.rejects(admin.begin(async tx=>{
   await tx`set local role vvr_save_api`;
   await tx`select set_config('vvr.telegram_id','2102',true)`;
   await tx`insert into vvr.solo_snapshots (player_id, revision, request_id, raw, checksum)
    values (${playerId},4,${randomUUID()},${raw},${checksum})`;
  }),{code:'42501'});
  for(const command of ['update','delete']){
   await assert.rejects(admin.begin(async tx=>{
    await tx`set local role vvr_save_api`;
    await tx`select set_config('vvr.telegram_id','2102',true)`;
    if(command==='update')await tx`update vvr.solo_snapshots set raw=${raw} where player_id=${playerId}`;
    else await tx`delete from vvr.solo_snapshots where player_id=${playerId}`;
   }),{code:'42501'});
  }
  for(const role of ['anon','authenticated','service_role']){
   await assert.rejects(admin.begin(async tx=>{
    await tx`set local role ${tx(role)}`;
    await tx`select id from vvr.players`;
   }),{code:'42501'});
  }
  const event=randomUUID();
  await assert.rejects(admin.begin(async tx=>{
   await tx`set local role vvr_save_api`;
   await tx`select vvr.issue_resource(${playerId},'quest',${event},'gold',100)`;
  }),{code:'42501'});
  const issue=(amount:number,currency='gold')=>admin.begin(async tx=>{
   await tx`set local role vvr_reward_writer`;
   const [result]=await tx`select vvr.issue_resource(${playerId},'quest',${event},${currency},${amount}) as applied`;
   return result.applied;
  });
  assert.deepEqual((await Promise.all([issue(100),issue(100)])).sort(),[false,true]);
  await assert.rejects(issue(101),{code:'23505'});
  await assert.rejects(issue(100,'tokens'),{code:'23505'});
  const [ledger]=await admin`select count(*)::int as count,sum(amount)::int as total from vvr.resource_receipts`;
  assert.deepEqual(ledger,{count:1,total:100});
  await assert.rejects(admin`
   insert into vvr.solo_snapshots(player_id,revision,request_id,raw,checksum)
   values (${playerId},4,${randomUUID()},${raw},'incorrect')`,{code:'23514'});

  await a.saves.close();
  assert.equal((await request(a.base,'save',undefined,first)).status,503);
  assert.equal((await request(a.base,'state',undefined,first)).status,200);
  await close(a.server);
  const restarted=await start();
  const recovered=await request(restarted.base,'save',undefined,first);
  assert.equal(recovered.body.playerId,playerId);
  assert.equal(recovered.body.revision,3);
  assert.equal(recovered.body.snapshot.raw,raw);
  assert.deepEqual(recovered.body.backups.map((entry:{revision:number})=>entry.revision),[3,2,1]);
  assert.equal((await request(restarted.base,'join',{hero:'ranger',kit:'balanced',level:100,cp:1e30},first,tabA)).status,400);
  assert.ok((await request(restarted.base,'join',{hero:'ranger',kit:'balanced'},first,tabA)).body.queued);
  const duel=(await request(restarted.base,'join',{hero:'berserker',kit:'balanced'},second,tabB)).body.match;
  assert.equal(duel.opponent.level,1);
  assert.equal(duel.bot,false);
 }finally{
  for(const server of servers)if(server.listening)await close(server);
  await admin.end();
  rmSync(root,{recursive:true,force:true});
 }
});
