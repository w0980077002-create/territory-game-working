import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAnalytics,cleanErrorMessage,ANALYTICS_BATCH} from '../src/community/analytics';

test('client analytics sends bounded batches with relative times and retries after a failure',async()=>{
 let now=1_000_000;const sent:object[][]=[];let fail=false;
 const a=createAnalytics(async events=>{if(fail)throw new Error('offline');sent.push(events)},()=>now);
 for(let i=0;i<30;i++)a.add('battle',{mode:'Campaign',win:true,seconds:12,stage:i+1});
 now+=5000;
 await a.flush();
 assert.equal(sent.length,1);
 assert.equal(sent[0].length,ANALYTICS_BATCH);
 assert.deepEqual(sent[0][0],{kind:'battle',session:a.session,ago:5,mode:'campaign',win:true,seconds:12,stage:1});
 fail=true;await a.flush();
 assert.equal(a.queue.length,5,'failed batch stays queued');
 fail=false;await a.flush();
 assert.equal(sent.length,1,'retry waits a minute');
 now+=60_000;await a.flush();
 assert.equal(sent.length,2);assert.equal(a.queue.length,0);
});

test('client errors carry no addresses or ids and are capped per code',()=>{
 assert.equal(cleanErrorMessage('Failed https://x.example/api?id=1 for user@mail.com id 123456789'),'Failed <url> for <email> id #');
 const a=createAnalytics(async()=>{});
 for(let i=0;i<8;i++)a.add('error',{code:'TypeError',message:'x '+i});
 assert.equal(a.queue.length,5);
 assert.deepEqual(a.queue[0].data,{code:'typeerror',message:'x 0'});
});
