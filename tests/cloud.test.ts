import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cloudLoad,cloudSave} from '../src/core/telegram';
test('cloud backups use bounded alternating banks and restore UTF-8 without splitting characters',async()=>{const data=new Map<string,string>();Object.defineProperty(globalThis,'window',{value:{Telegram:{WebApp:{initData:'test-init',CloudStorage:{getItem:(k:string,cb:(e:unknown,v:string)=>void)=>cb(null,data.get(k)??''),setItem:(k:string,v:string,cb?:(e:unknown)=>void)=>{assert.ok(new TextEncoder().encode(v).length<4000);data.set(k,v);cb?.(null)}}}}},configurable:true});const raw=JSON.stringify({test:'Крылья 🪽'.repeat(1000)});for(let i=0;i<50;i++)cloudSave(raw);assert.ok(data.size<20);assert.equal(await cloudLoad(),raw)});

test('a failed chunk keeps its bank locked until all callbacks finish',async()=>{
 const data=new Map<string,string>();let pending:{key:string;value:string;done:(e:unknown)=>void}[]=[];
 Object.defineProperty(globalThis,'window',{value:{Telegram:{WebApp:{initData:'test',CloudStorage:{getItem:(key:string,cb:(e:unknown,v:string)=>void)=>cb(null,data.get(key)??''),setItem:(key:string,value:string,done:(e:unknown)=>void)=>pending.push({key,value,done})}}}},configurable:true});
 cloudSave('А'.repeat(4000));assert.ok(pending.length>1);
 const first=pending.shift()!;first.done(new Error('offline'));const count=pending.length;
 cloudSave('new save');assert.equal(pending.length,count,'older chunks are still in flight');
 for(const row of pending.splice(0)){data.set(row.key,row.value);row.done(null)}
 assert.equal(data.has('save_meta'),false,'partial upload must never be committed');
 cloudSave('latest save');
 while(pending.length){const row=pending.shift()!;data.set(row.key,row.value);row.done(null)}
 assert.equal(await cloudLoad(),'latest save');
});

test('invalid cloud banks and throwing clients resolve safely',async()=>{
 Object.defineProperty(globalThis,'window',{value:{Telegram:{WebApp:{initData:'test',CloudStorage:{getItem:(_k:string,cb:(e:unknown,v:string)=>void)=>cb(null,JSON.stringify({generation:'garbage',count:1})),setItem:()=>{throw Error('unavailable')}}}}},configurable:true});
 assert.equal(await cloudLoad(),null);assert.doesNotThrow(()=>cloudSave('save'));
 window.Telegram!.WebApp!.CloudStorage!.getItem=()=>{throw Error('unavailable')};
 assert.equal(await cloudLoad(),null);
});
