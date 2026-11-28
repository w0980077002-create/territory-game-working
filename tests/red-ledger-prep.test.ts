import {test} from 'node:test';
import assert from 'node:assert/strict';
import {apply, freshLedger} from '../docs/economy/red-ledger/model';

test('funding, fractional purchase, hold, reviewed withdrawal and duplicate tx', () => {
  const fund = {kind:'fund', principal:200_000n, fees:1_000n, ref:'a'.repeat(64)} as const;
  const funded = apply(freshLedger(), 'deposit', fund);
  assert.equal(apply(funded, 'deposit', fund), funded);
  assert.throws(() => apply(funded,'duplicate',fund), /duplicate_funding/);
  assert.throws(() => apply(funded,'award-over',{kind:'award',player:'a',amount:200_001n,event:'bad'}), /unfunded/);
  const awarded = apply(funded,'award',{kind:'award',player:'a',amount:80_000n,event:'first'});
  assert.throws(() => apply(awarded,'replay',{kind:'award',player:'a',amount:80_000n,event:'first'}), /duplicate_award/);
  const spent = apply(awarded,'cosmetic',{kind:'spend',player:'a',sku:'appearance',amount:300n});
  const held = apply(spent,'withdraw',{kind:'request',player:'a',amount:50_000n,destination:'validated-address',at:100});
  assert.deepEqual(held.wallets.a, {available:29_700n, held:50_000n});
  assert.throws(() => apply(held,'early',{kind:'settle',request:'withdraw',tx:'b'.repeat(64),fee:30n}), /settlement_unavailable/);
  const reviewed = apply(held,'review',{kind:'approve',request:'withdraw',at:200});
  const settled = apply(reviewed,'done',{kind:'settle',request:'withdraw',tx:'b'.repeat(64),fee:30n});
  assert.equal(settled.reserve,150_000n);
  assert.equal(settled.feeReserve,970n);
  assert.equal(settled.wallets.a.held,0n);
  assert.throws(() => apply(settled,'retry-different',{kind:'settle',request:'withdraw',tx:'b'.repeat(64),fee:30n}), /settlement_unavailable/);
});

test('expired review can be rejected and releases the entire hold', () => {
  const funded = apply(freshLedger(),'fund',{kind:'fund',principal:50_000n,fees:0n,ref:'c'.repeat(64)});
  const awarded = apply(funded,'award',{kind:'award',player:'p',amount:50_000n,event:'open'});
  const held = apply(awarded,'request',{kind:'request',player:'p',amount:50_000n,destination:'wallet',at:1});
  assert.throws(() => apply(held,'approve',{kind:'approve',request:'request',at:15*86_400_000}), /approval_unavailable/);
  const released = apply(held,'reject',{kind:'reject',request:'request',at:15*86_400_000});
  assert.deepEqual(released.wallets.p,{available:50_000n,held:0n});
  assert.equal(released.reserve,50_000n);
});
