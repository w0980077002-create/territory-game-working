import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleWebhook, webhookSecret} from '../supabase/functions/_shared/stars';

test('signed Stars webhook verifies XTR and routes checkout and confirmed ship refunds', async t => {
  const secret = 'isolated-test-session';
  const calls: {name: string; value: unknown}[] = [];
  const rpc = async (name: string, value: unknown) => {
    calls.push({name, value});
    return {ok: true, data: true};
  };
  t.mock.method(globalThis, 'fetch', async () => Response.json({ok: true}));
  const order = '00000000-0000-4000-8000-000000000007';
  const request = async (body: unknown, authenticated = true) => handleWebhook(
    new Request('https://example.test/stars-webhook', {method: 'POST',
      headers: {'x-telegram-bot-api-secret-token': authenticated ? await webhookSecret(secret) : 'invalid'},
      body: JSON.stringify(body)}), secret, 'no-live-token', rpc);
  const pre_checkout_query = {id: 'provider-query', from: {id: 51002}, currency: 'XTR', total_amount: 250, invoice_payload: order};
  assert.equal((await request({pre_checkout_query}, false)).status, 401);
  assert.equal(calls.length, 0);
  await request({pre_checkout_query: {...pre_checkout_query, currency: 'USD'}});
  assert.equal(calls.length, 0);
  await request({pre_checkout_query});
  assert.deepEqual(calls.pop(), {name: 'vvr_shipyard_precheck',
    value: {p_order: order, p_telegram: '51002', p_stars: 250, p_query: 'provider-query'}});
  const payment = {invoice_payload: order, currency: 'XTR', total_amount: 250, telegram_payment_charge_id: 'test-charge'};
  await request({message: {from: {id: 51002}, successful_payment: {...payment, currency: 'USD'}}});
  assert.equal(calls.length, 0);
  await request({message: {from: {id: 51002}, successful_payment: payment}});
  assert.equal(calls.pop()?.name, 'vvr_stars_paid');
  await request({message: {from: {id: 9000}, chat: {id: 51002, type: 'private'}, refunded_payment: payment}});
  assert.deepEqual(calls.pop(), {name: 'vvr_shipyard_refunded',
    value: {p_order: order, p_telegram: '51002', p_stars: 250, p_charge: 'test-charge'}});
});
