import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cloudDigest,cloudLoad,cloudSave,readCloud,CLOUD_ABANDON_MS,CLOUD_WRITE_TIMEOUT_MS} from '../src/core/telegram';
const tick=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setTimeout(r,5))};
/** Deterministic text that gzip cannot shrink much, so uploads still span several chunks. */
const noise=(n:number,seed=7)=>{const abc=[...'АБВГДЕЖЗabcdefgh0123456789🪽'];let x=seed>>>0,out='';for(let i=0;i<n;i++){x=(Math.imul(x,1103515245)+12345)>>>0;out+=abc[(x>>>16)%abc.length]}return out};
/** Lets queued uploads finish packing, then completes every pending write until nothing is left. */
const drain=async(pending:{key:string;value:string;done:(e:unknown)=>void}[],data:Map<string,string>)=>{for(let k=0;k<20;k++){await tick();if(!pending.length)return;while(pending.length){const row=pending.shift()!;data.set(row.key,row.value);row.done(null)}}};
test('cloud backups use bounded alternating banks and restore UTF-8 without splitting characters',async()=>{const data=new Map<string,string>();Object.defineProperty(globalThis,'window',{value:{Telegram:{WebApp:{initData:'test-init',CloudStorage:{getItem:(k:string,cb:(e:unknown,v:string)=>void)=>cb(null,data.get(k)??''),setItem:(k:string,v:string,cb?:(e:unknown)=>void)=>{assert.ok(new TextEncoder().encode(v).length<4000);data.set(k,v);cb?.(null)}}}}},configurable:true});const raw=JSON.stringify({test:'Крылья 🪽'.repeat(1000)});const saves=[];for(let i=0;i<50;i++)saves.push(cloudSave(raw));await Promise.all(saves);assert.ok(data.size<20);assert.equal(await cloudLoad(),raw)});

test('a failed chunk keeps its bank locked until all callbacks finish',async()=>{
 const data=new Map<string,string>();let pending:{key:string;value:string;done:(e:unknown)=>void}[]=[];
 Object.defineProperty(globalThis,'window',{value:{Telegram:{WebApp:{initData:'test',CloudStorage:{getItem:(key:string,cb:(e:unknown,v:string)=>void)=>cb(null,data.get(key)??''),setItem:(key:string,value:string,done:(e:unknown)=>void)=>pending.push({key,value,done})}}}},configurable:true});
 await cloudSave(noise(30000));assert.ok(pending.length>1);
 const first=pending.shift()!;first.done(new Error('offline'));const count=pending.length;
 await cloudSave('new save');assert.equal(pending.length,count,'older chunks are still in flight');
 for(const row of pending.splice(0)){data.set(row.key,row.value);row.done(null)}
 assert.equal(data.has('save_meta'),false,'partial upload must never be committed');
 await cloudSave('latest save');
 await drain(pending,data);
 assert.equal(await cloudLoad(),'latest save');
});

test('invalid cloud banks and throwing clients resolve safely',async()=>{
 Object.defineProperty(globalThis,'window',{value:{Telegram:{WebApp:{initData:'test',CloudStorage:{getItem:(_k:string,cb:(e:unknown,v:string)=>void)=>cb(null,JSON.stringify({generation:'garbage',count:1})),setItem:()=>{throw Error('unavailable')}}}}},configurable:true});
 assert.equal(await cloudLoad(),null);await assert.doesNotReject(cloudSave('save'));
 window.Telegram!.WebApp!.CloudStorage!.getItem=()=>{throw Error('unavailable')};
 assert.equal(await cloudLoad(),null);
});


test('cloud save coalesces edits made mid-upload and restores the newest state',async()=>{
 const data=new Map<string,string>();
 const pending:{key:string;value:string;done:(e:unknown)=>void}[]=[];
 Object.defineProperty(globalThis,'window',{value:{Telegram:{WebApp:{initData:'test',CloudStorage:{
  getItem:(key:string,cb:(e:unknown,v:string)=>void)=>cb(null,data.get(key)??''),
  setItem:(key:string,value:string,done:(e:unknown)=>void)=>pending.push({key,value,done})
 }}}},configurable:true});
 const first=JSON.stringify({chapter:1,notes:noise(30000)});
 await cloudSave(first);
 const oldChunks=pending.length;
 assert.ok(oldChunks>1,'the initial upload must be in progress');
 await cloudSave(JSON.stringify({chapter:2}));
 const latest=JSON.stringify({chapter:3,loot:'Крылья 🪽'});
 await cloudSave(latest);
 assert.equal(pending.length,oldChunks,'new writes must wait for the old bank');
 for(const row of pending.splice(0)){data.set(row.key,row.value);row.done(null)}
 assert.equal(pending.length,1,'the old bank must publish its metadata before the queued upload');
 const oldMeta=pending.shift()!;
 assert.equal(oldMeta.key,'save_meta');
 data.set(oldMeta.key,oldMeta.value);oldMeta.done(null);
 await tick();
 assert.ok(pending.some(row=>row.key.startsWith('save_')),'the newest pending upload starts automatically');
 await drain(pending,data);
 assert.equal(await cloudLoad(),latest);
});

test('a successful read without a metadata key is distinct from a transport failure',async()=>{
 Object.defineProperty(globalThis,'window',{value:{Telegram:{WebApp:{initData:'test',CloudStorage:{
  getItem:(_key:string,done:(err:unknown)=>void)=>done(null)
 }}}},configurable:true});
 assert.deepEqual(await readCloud(),{status:'empty'});
 window.Telegram!.WebApp!.CloudStorage!.getItem=(_key,done)=>done(new Error('Offline'));
 assert.deepEqual(await readCloud(),{status:'unavailable'});
});


test('a timed-out chunk cannot commit metadata or release its bank into a competing write',async t=>{
 const data=new Map([['save_meta',JSON.stringify({generation:'0',count:1})],['save_0_0','previous']]);
 const pending:{key:string;value:string;done:(e:unknown)=>void}[]=[];
 let batchReads=0;
 Object.defineProperty(globalThis,'window',{value:{Telegram:{WebApp:{initData:'test',CloudStorage:{
  getItem:(key:string,cb:(err:unknown,value?:string)=>void)=>cb(null,data.get(key)),
  getItems:(keys:string[],cb:(err:unknown,values:Record<string,string>)=>void)=>{
   batchReads++;cb(null,Object.fromEntries(keys.map(key=>[key,data.get(key)??''])));
  },
  setItem:(key:string,value:string,done:(error:unknown)=>void)=>pending.push({key,value,done}),
 }}}},configurable:true});
 assert.equal(await cloudLoad(),'previous');assert.equal(batchReads,1);
 t.mock.timers.enable({apis:['setTimeout']});
 const results:boolean[]=[];
 await cloudSave('incomplete',ok=>results.push(ok));
 assert.equal(pending.length,1);
 t.mock.timers.tick(CLOUD_WRITE_TIMEOUT_MS);
 assert.deepEqual(results,[false]);
 await cloudSave('must wait',ok=>results.push(ok));
 assert.equal(pending.length,1);
 assert.deepEqual(results,[false,false]);
 assert.equal(await cloudLoad(),'previous');
 const complete=()=>{
  const row=pending.shift()!;
  data.set(row.key,row.value);row.done(null);
 };
 complete();
 assert.equal(pending.length,0,'expired chunks never authorize metadata');
 assert.equal(await cloudLoad(),'previous');
 await cloudSave('latest',ok=>results.push(ok));
 complete();complete();
 assert.deepEqual(results,[false,false,true]);
 assert.equal(await cloudLoad(),'latest');
});

test('a delayed metadata receipt acknowledges the actual commit exactly once',async t=>{
 const pending:{key:string;done:(err:unknown)=>void}[]=[];
 Object.defineProperty(globalThis,'window',{value:{Telegram:{WebApp:{initData:'test',CloudStorage:{
  setItem:(key:string,_value:string,done:(err:unknown)=>void)=>pending.push({key,done}),
 }}}},configurable:true});
 t.mock.timers.enable({apis:['setTimeout']});
 const results:boolean[]=[];let late=0;
 await cloudSave('metadata delay',ok=>results.push(ok),()=>late++);
 pending.shift()!.done(null);
 const meta=pending.shift()!;
 assert.equal(meta.key,'save_meta');
 t.mock.timers.tick(CLOUD_WRITE_TIMEOUT_MS);
 assert.deepEqual(results,[false]);
 meta.done(null);meta.done(null);
 assert.deepEqual(results,[false]);assert.equal(late,1);
});

test('a write Telegram never answers is abandoned, so later backups resume without a restart',async t=>{
 const data=new Map([['save_meta',JSON.stringify({generation:'0',count:1})],['save_0_0','previous']]);
 const pending:{key:string;value:string;done:(e:unknown)=>void}[]=[];
 Object.defineProperty(globalThis,'window',{value:{Telegram:{WebApp:{initData:'test',CloudStorage:{
  getItem:(key:string,cb:(err:unknown,value?:string)=>void)=>cb(null,data.get(key)),
  setItem:(key:string,value:string,done:(error:unknown)=>void)=>pending.push({key,value,done}),
 }}}},configurable:true});
 assert.equal(await cloudLoad(),'previous');
 t.mock.timers.enable({apis:['setTimeout']});
 const results:boolean[]=[];
 await cloudSave('lost',ok=>results.push(ok));
 const lost=pending.splice(0);
 assert.equal(lost.length,1);
 t.mock.timers.tick(CLOUD_WRITE_TIMEOUT_MS);
 await cloudSave('still blocked',ok=>results.push(ok));
 assert.deepEqual(results,[false,false],'the bank stays quarantined while Telegram may still answer');
 t.mock.timers.tick(CLOUD_ABANDON_MS);
 await cloudSave('resumed',ok=>results.push(ok));
 assert.equal(pending.length,1,'a new upload starts after the abandon window');
 const row=pending.shift()!;data.set(row.key,row.value);row.done(null);
 const meta=pending.shift()!;data.set(meta.key,meta.value);meta.done(null);
 assert.deepEqual(results,[false,false,true]);
 assert.equal(await cloudLoad(),'resumed');
 // The abandoned upload answers at last: it may overwrite its chunk, but it never writes metadata.
 data.set(lost[0].key,lost[0].value);lost[0].done(null);
 assert.equal(pending.length,0);
 const read=await readCloud();
 assert.equal(read.status,'damaged','a chunk from the abandoned upload is detected, not restored');
});

test('cloud metadata digest refuses mixed chunks and keeps older copies without a digest readable',async()=>{
 const data=new Map<string,string>();
 Object.defineProperty(globalThis,'window',{value:{Telegram:{WebApp:{initData:'test',CloudStorage:{
  getItem:(key:string,cb:(err:unknown,value?:string)=>void)=>cb(null,data.get(key)??''),
  setItem:(key:string,value:string,cb?:(e:unknown)=>void)=>{data.set(key,value);cb?.(null)},
 }}}},configurable:true});
 data.set('save_meta',JSON.stringify({generation:'1',count:2}));data.set('save_1_0','{"a":');data.set('save_1_1','1}');
 assert.equal(await cloudLoad(),'{"a":1}');
 data.set('save_meta',JSON.stringify({generation:'1',count:2,h:cloudDigest('{"a":1}')}));
 assert.equal(await cloudLoad(),'{"a":1}');
 data.set('save_1_1','2}');
 assert.deepEqual(await readCloud(),{status:'damaged'});
 const raw=JSON.stringify({fresh:noise(9000)});
 await cloudSave(raw);await tick();
 assert.equal(JSON.parse(data.get('save_meta')!).generation,'0','the next backup goes to the other bank');
 assert.equal(await cloudLoad(),raw);
});
