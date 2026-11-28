import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freshPlayer, campaignBossReward, makeItem, parseSave} from '../src/core/store';
import {previewMine} from '../src/core/mine';
import {roomReward} from '../src/dark/realm';
import {shopOffers, shopStatus} from '../src/saga/shop';
import {upgradePreview} from '../src/core/forge';
import oldBalance from '../config/test-balance.v1.json';

test('an old save preserves wallets, trophy rewards, loot and receipts across repeated loads', () => {
 const p = freshPlayer();
 const trophy = makeItem('weapon', 17, 4);
 Object.assign(p, {
  gold:1_234_567,gems:765,chaosite:272,redDiamonds:987,tokens:543,
  stage:29,wave:2,level:17,xp:1000,bosses:28,mission:27,
  inventory:[trophy],claimed:['first-boss-relic'],seasonClaims:[1,2],
  rewardOffer:{encounterId:'old-trophy',itemId:trophy.id,resolved:false,
   bossReward:{gold:2135,gems:15,xp:70,horn:2,mats:{ice:3}}},
 });
 const once = parseSave(JSON.stringify(p), true);
 const twice = parseSave(JSON.stringify(once), true);
 assert.ok(once && twice);
 for (const key of ['gold','gems','chaosite','redDiamonds','tokens','stage','level','xp','claimed','inventory','rewardOffer','seasonClaims'] as const) {
  assert.deepEqual(once[key],p[key]);
  assert.deepEqual(twice[key],p[key]);
 }
});

test('starter grants retain value and renewable supplies leave free daily choices', () => {
 const p = freshPlayer();
 const base=oldBalance.test_rewards.boss_win_gems;
 assert.equal(campaignBossReward(p).gems,base);
 assert.equal(campaignBossReward({...p,stage:2}).gems,Math.round(base/2));
 assert.equal(roomReward(1,6,true).gems,25);
 assert.equal(roomReward(1,6,false).gems,3);
 const mine=previewMine(0,86_400_000);
 assert.equal(mine.gold,3600);
 assert.equal(mine.chaosite,10);
 const quote=shopOffers({...p,gold:350}).find(o=>o.id==='mine-reserve')!;
 assert.equal(quote.price,350);
 assert.equal(quote.reward.chaosite,5);
 assert.equal(shopStatus({...p,gold:350},quote,Date.now()),undefined);
 assert.equal(upgradePreview(makeItem('weapon',1,1)).cost,oldBalance.forge_test_settings.upgrade_gold_cost_base);
});
