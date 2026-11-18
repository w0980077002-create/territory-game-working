import assert from 'node:assert/strict';
import {test} from 'node:test';
import {installHeadless} from '../scripts/sim/bot';
import {freshPlayer, parseSave, SAVE_KEY, useGame} from '../src/core/store';
import {shopOffers, shopQuote, shopSold, shopStatus} from '../src/saga/shop';
import {claimDailyGift, claimSeason, dailyGift, seasonBadge} from '../src/saga/events';
import {bumpCount} from '../src/saga/save';
import {resCount} from '../src/dark/rules';

installHeadless();
const game = useGame.getState;

test('shop commits payment, supplies and legacy receipts together, or rolls back', t => {
  t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.UTC(2026,10,18)});
  const p = freshPlayer();
  p.bought = ['test_special_pack_1'];
  p.horn = 0;
  p.gems = 40;
  useGame.setState({p,recoveryRequired:false,storageError:false});
  const wallet = p.gems;
  const offer = shopOffers(p).find(row => row.id === 'summon-seal')!;
  assert.equal(game().buy('test_special_pack_1'),false);
  assert.equal(game().buy(offer.id,'stale'),false);
  const write = localStorage.setItem;
  localStorage.setItem = () => {throw new Error('Storage full')};
  try {
    assert.equal(game().buy(offer.id,shopQuote(offer)),false);
    assert.equal(game().p.gems,wallet);
    assert.equal(resCount(game().p,'seal'),0);
  } finally {
    localStorage.setItem = write;
  }
  assert.equal(game().buy(offer.id,shopQuote(offer)),true);
  assert.equal(game().buy(offer.id,shopQuote(offer)),false);
  const reloaded = parseSave(localStorage.getItem(SAVE_KEY))!;
  assert.equal(reloaded.gems,wallet-offer.price);
  assert.equal(resCount(reloaded,'seal'),1);
  assert.equal(shopSold(reloaded,offer,Date.now()),true);
  assert.deepEqual(reloaded.bought,['test_special_pack_1']);
  t.mock.timers.tick(86_400_000);
  assert.equal(shopSold(reloaded,offer,Date.now()),false);
  reloaded.gems=0;
  assert.equal(shopStatus(reloaded,offer,Date.now()),'Недостаточно средств');
});

test('daily gifts preserve the original grant, rotate, and respect Horn capacity', () => {
  const now = Date.UTC(2026,10,18), p = freshPlayer();
  p.horn = 49;
  p.hornAt = now;
  const originalGold = p.gold;
  assert.ok(claimDailyGift(p,now));
  assert.equal(p.horn,50);
  assert.equal(p.gold,originalGold+200);
  assert.equal(claimDailyGift(p,now),null);
  assert.notDeepEqual(dailyGift(now).extra,dailyGift(now+86_400_000).extra);
  assert.ok(claimDailyGift(p,now+86_400_000));
});

test('season respects old receipts and rewards only completed goals', () => {
  const p = freshPlayer(), now = Date.now();
  p.bosses = 1;
  p.seasonClaims = [1];
  assert.equal(claimSeason(p,'season:1',now),null);
  assert.equal(seasonBadge(p),false);
  assert.equal(claimSeason(p,'season:goal:lair',now),null);
  bumpCount(p,'win:dungeon',2);
  assert.equal(seasonBadge(p),true);
  assert.ok(claimSeason(p,'season:goal:lair',now));
  assert.equal(resCount(p,'shard'),4);
  assert.equal(claimSeason(p,'season:goal:lair',now),null);
  assert.equal(seasonBadge(p),false);
});
