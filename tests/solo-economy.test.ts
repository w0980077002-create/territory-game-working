import assert from 'node:assert/strict';
import {test} from 'node:test';
import {installHeadless} from '../scripts/sim/bot';
import {freshPlayer, parseSave, SAVE_KEY, useGame} from '../src/core/store';
import {shopOffers, shopQuote, shopSold, shopStatus} from '../src/saga/shop';
import {claimDailyGift, claimSeason, dailyCalendar, dailyGift, seasonBadge} from '../src/saga/events';
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

test('the calendar remembers legacy and new receipts without granting an old gift', () => {
  const monday = Date.UTC(2026,10,16), tuesday = Date.UTC(2026,10,17), wednesday = Date.UTC(2026,10,18);
  const p = freshPlayer();
  p.daily = dailyGift(tuesday).day;
  const before = dailyCalendar(p,wednesday);
  assert.equal(before.length,7);
  assert.equal(before[0].day,dailyGift(monday).day);
  assert.equal(before[0].claimed,false);
  assert.equal(before[1].claimed,true);
  assert.equal(before[2].current,true);
  assert.equal(claimDailyGift(p,tuesday),null);
  assert.ok(claimDailyGift(p,wednesday));
  const restored = parseSave(JSON.stringify(p))!;
  const after = dailyCalendar(restored,wednesday);
  assert.deepEqual(after.slice(0,4).map(day=>day.claimed),[false,true,true,false]);
  assert.equal(claimDailyGift(restored,wednesday),null);
  assert.equal(claimDailyGift(restored,tuesday),null);
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

test('new stock respects progression, daily limits and Horn capacity', () => {
  const now = Date.UTC(2026,10,18);
  const p = freshPlayer();
  const gated = ['previous-region','dark-stock','relic-workshop'];
  const openingOffers = shopOffers(p,now);
  assert.ok(gated.every(id => !openingOffers.some(offer => offer.id === id)));

  p.stage = 11;
  p.bosses = 3;
  p.darkFloor = 2;
  p.horn = 50;
  const offers = shopOffers(p,now);
  const offer = (id:string) => offers.find(row => row.id === id)!;
  assert.ok(gated.every(id => offer(id).limit === 'daily'));
  assert.deepEqual(offer('previous-region').reward.mats,{ice:3});
  assert.deepEqual(offer('forge-parcel').reward.mats,{harbor:2});
  assert.equal(shopStatus(p,offer('horn-kit'),now),'Освободите место в Роге');
});
