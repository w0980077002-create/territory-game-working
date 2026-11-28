import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validAdReceipt} from '../supabase/functions/_shared/assortment';

test('rewarded ad callback is bound to the provider receipt and server attempt', async () => {
  const bytes=new TextEncoder();
  const secret='isolated-test-secret';
  const key=await crypto.subtle.importKey('raw',bytes.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const mac=await crypto.subtle.sign('HMAC',key,bytes.encode('vvr-ad:attempt:provider-1'));
  const signature=Buffer.from(mac).toString('hex');
  assert.equal(await validAdReceipt(secret,'attempt','provider-1',signature),true);
  assert.equal(await validAdReceipt(secret,'attempt','provider-2',signature),false);
  assert.equal(await validAdReceipt(secret,'another','provider-1',signature),false);
  assert.equal(await validAdReceipt('','attempt','provider-1',signature),false);
});
