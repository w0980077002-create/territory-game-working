import assert from 'node:assert/strict';
import {test} from 'node:test';
import {firstBossVictory} from '../server/campaign/firstBoss';
import {makeCampaignHandler} from '../supabase/functions/vvr-campaign/handler';
import {parseProofCommands} from '../src/game/campaignProof';
import {useGame} from '../src/core/store';
import {issueVvrSession,readVvrSession} from '../supabase/functions/_shared/vvr-identity';

const start=Date.UTC(2026,10,25,9);
const hero='88800000-0000-4000-8000-000000000001';
const other='88800000-0000-4000-8000-000000000002';
const ticket='88800000-0000-4000-8000-000000000003';
const secret='isolated-campaign-test-session-secret';
const origin='https://isolated-game.example';

test('replaying the first campaign boss uses actual combat for each class and restores the isolated runtime',()=>{
 const state=useGame.getState(),clock=Date.now,random=Math.random;
 const storage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 for(const selected of ['berserker','ranger','runologist'] as const){
  const ticks=firstBossVictory(selected,17,[],start);
  assert.ok(ticks&&ticks>=300&&ticks<=600,selected);
  assert.equal(firstBossVictory(selected,17,[],start),ticks);
 }
 assert.equal(firstBossVictory('ranger',17,[[0,'auto_off']],start),null);
 assert.equal(firstBossVictory('ranger',17,[[0,'auto_off'],[1,'auto_on']],start),
  firstBossVictory('ranger',17,[],start));
 assert.equal(useGame.getState(),state);
 assert.equal(Date.now,clock);
 assert.equal(Math.random,random);
 assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'localStorage'),storage);
});

test('the campaign Edge API accepts a typed replay, never a client outcome or a foreign ticket',async()=>{
 const finished:{name:string;args:Record<string,unknown>}[]=[];
 const rpc=async(name:string,args:Record<string,unknown>)=>{
  if(name==='vvr_campaign_boss_begin')return {status:'started',ticket};
  if(name==='vvr_campaign_boss_check'){
   return args.p_player===hero&&args.p_ticket===ticket
    ?{status:'check',hero:'ranger',seed:17,startedAt:start}:{status:'ineligible'};
  }
  finished.push({name,args});
  return {status:'verified'};
 };
 const handle=makeCampaignHandler(rpc,token=>readVvrSession(token,secret,start),firstBossVictory,origin);
 const session=await issueVvrSession(hero,secret,start);
 const otherSession=await issueVvrSession(other,secret,start);
 const post=(body:object,token?:string)=>handle(new Request(origin,{
  method:'POST',body:JSON.stringify(body),headers:token?{Authorization:'Bearer '+token}:{},
 }));
 assert.equal((await post({action:'replay',ticket,commands:[]})).status,401);
 for(const invalid of [
  {action:'replay',ticket,won:true},
  {action:'replay',ticket,commands:[],level:100},
  {action:'replay',ticket,commands:[[0,'set_hp']]},
  {action:'replay',ticket,commands:[[20,'sword'],[5,'hammer']]},
  {action:'replay',ticket,commands:Array(161).fill([0,'sword'])},
 ])assert.equal((await post(invalid,session)).status,400);
 assert.equal(parseProofCommands([[0,'sword'],[500,'hammer']])?.length,2);
 assert.deepEqual(await (await post({action:'replay',ticket,commands:[]},otherSession)).json(),{status:'ineligible'});
 assert.deepEqual(await (await post({action:'replay',ticket,commands:[[0,'auto_off']]},session)).json(),{status:'unverified'});
 assert.equal(finished.length,0);
 assert.deepEqual(await (await post({action:'replay',ticket,commands:[]},session)).json(),{status:'verified'});
 assert.deepEqual(finished,[{name:'vvr_campaign_boss_finish',
  args:{p_player:hero,p_ticket:ticket,p_victory_ticks:firstBossVictory('ranger',17,[],start)}}]);
});
