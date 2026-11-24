import {createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {issueVvrSession,readVvrSession,verifyTelegramIdentity} from '../supabase/functions/_shared/vvr-identity';

test('W066 accepts only fresh Telegram signatures and resolves signed UUID sessions',async()=>{
 const now=172800000;
 const bot='isolated-bot-key',secret='independent-community-session-secret';
 const data=new URLSearchParams({auth_date:String(now/1000),user:JSON.stringify({id:101,first_name:'Алиса'})});
 const derived=createHmac('sha256','WebAppData').update(bot).digest();
 data.sort();
 data.set('hash',createHmac('sha256',derived).update([...data].map(([k,v])=>k+'='+v).join('\n')).digest('hex'));
 assert.deepEqual(await verifyTelegramIdentity(String(data),bot,now),{telegramId:'101',displayName:'Алиса'});
 assert.equal(await verifyTelegramIdentity(String(data)+'&user=2',bot,now),undefined);
 assert.equal(await verifyTelegramIdentity(String(data),bot,now+601000),undefined);
 assert.equal(await verifyTelegramIdentity(String(data),'another-bot',now),undefined);
 const uuid='11111111-1111-1111-1111-111111111111';
 const token=await issueVvrSession(uuid,secret,now);
 assert.equal(await readVvrSession(token,secret,now),uuid);
 assert.equal(await readVvrSession(token,bot,now),undefined);
 assert.equal(await readVvrSession(token,secret,now+12*60*60_000),undefined);
});
