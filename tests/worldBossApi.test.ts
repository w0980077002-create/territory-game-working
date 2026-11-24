import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handle,verifyInitData,signInitData} from '../supabase/functions/_shared/worldBoss';

const token='test-bot-token',now=Date.UTC(2026,10,25,12);
const calls:[string,Record<string,unknown>][]=[];
const rpc=async(name:string,args:Record<string,unknown>)=>{calls.push([name,args]);if(args.p_kind==='rank'&&name.includes('claim'))throw new Error('ERROR: world_boss_no_reward');if(name.includes('admin_end'))throw new Error('connection reset');return {ok:name}};
const deps={botToken:token,rpc,now:()=>now};

test('Telegram initData is verified; forged, stale or foreign data has no identity',async()=>{
 const good=await signInitData({id:777,first_name:'Бьорн​'},token,now);
 assert.deepEqual(await verifyInitData(good,token,now),{telegramId:'777',name:'Бьорн'});
 assert.equal(await verifyInitData(good,'other-token',now),undefined);
 assert.equal(await verifyInitData(good.replace('777','778'),token,now),undefined,'tampered user');
 assert.equal(await verifyInitData(good,token,now+2*86_400_000),undefined,'too old');
 assert.equal(await verifyInitData(good+'&hash=00',token,now),undefined,'duplicate keys');
});
test('actions use only the verified id; inputs are validated; errors are mapped safely',async()=>{
 const initData=await signInitData({id:5,first_name:'Хельга'},token,now);
 assert.equal((await handle({action:'state'},deps)).status,401);
 assert.equal((await handle({action:'state',initData,telegramId:'999'},deps)).status,200);
 assert.deepEqual(calls.at(-1),['vvr_world_boss_state',{p_telegram_id:'5'}],'a client-sent id is ignored');
 assert.equal((await handle({action:'attack',initData,requestId:'nope'},deps)).status,400);
 const req='0b3c4f10-8f2d-4c3a-9d6e-1a2b3c4d5e6f';
 assert.equal((await handle({action:'attack',initData,requestId:req,damage:1e9},deps)).status,200);
 assert.deepEqual(calls.at(-1),['vvr_world_boss_attack',{p_telegram_id:'5',p_name:'Хельга',p_request_id:req}],'client damage is never forwarded');
 const claim=await handle({action:'claim',initData,eventId:req,kind:'rank'},deps);
 assert.deepEqual(claim,{status:409,body:{error:'world_boss_no_reward'}});
 assert.equal((await handle({action:'claim',initData,eventId:req,kind:'gems'},deps)).status,400);
 assert.deepEqual(await handle({action:'admin_end',initData,eventId:req},deps),{status:500,body:{error:'world_boss_unavailable'}},'internal errors are not leaked');
 assert.equal((await handle({action:'admin_start',initData,title:'X',boss:'not_a_boss',minutes:60,maxHp:1e6},deps)).status,400);
 assert.equal((await handle({action:'drop_table',initData},deps)).status,400);
});
