import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cloudLoad,cloudSave} from '../src/core/telegram';
test('cloud backups use bounded alternating banks and restore UTF-8 without splitting characters',async()=>{const data=new Map<string,string>();Object.defineProperty(globalThis,'window',{value:{Telegram:{WebApp:{initData:'test-init',CloudStorage:{getItem:(k:string,cb:(e:unknown,v:string)=>void)=>cb(null,data.get(k)??''),setItem:(k:string,v:string,cb?:(e:unknown)=>void)=>{assert.ok(new TextEncoder().encode(v).length<4000);data.set(k,v);cb?.(null)}}}}},configurable:true});const raw=JSON.stringify({test:'Крылья 🪽'.repeat(1000)});for(let i=0;i<50;i++)cloudSave(raw);assert.ok(data.size<20);assert.equal(await cloudLoad(),raw)});
