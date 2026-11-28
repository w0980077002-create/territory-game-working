import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyNaval, navalSalvage, voyageReward} from '../src/core/naval';
import {HULLS, NAVAL, RIGS, ROUTES, type Hull} from '../src/core/navalBalance';
import {shipCapacity, shipRate, starterShipyard, validShipyard, type ShipyardState} from '../src/core/shipyard';
import {freshPlayer, parseSave} from '../src/core/store';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = 50 * DAY;

test('old saves keep all hulls, levels, fractional accrual and currencies', () => {
  const p = freshPlayer();
  const ships = [{id: 'drakkar-1', level: 2}, {id: 'drakkar-2', level: 4}, {id: 'drakkar-3', level: 5}];
  p.shipyard = {ships, stored: 43.25, lastAt: now};
  p.redDiamonds = 123_456;
  const copy = parseSave(JSON.stringify(p))!;
  assert.deepEqual(copy.shipyard, p.shipyard);
  assert.equal(copy.gold, p.gold);
  assert.equal(copy.gems, p.gems);
  assert.equal(copy.chaosite, p.chaosite);
  assert.equal(copy.redDiamonds, p.redDiamonds);
  assert.ok(applyNaval(copy, {type: 'launch', id: 'drakkar-2', hours: 4}, now));
  const migrated = parseSave(JSON.stringify(copy))!;
  assert.equal(migrated.shipyard?.stored, 43.25);
  assert.equal(shipCapacity(migrated.shipyard!), 132);
  assert.equal(migrated.shipyard?.ships[1].level, 4);
  assert.equal(migrated.redDiamonds, p.redDiamonds);
});

test('starter can run, collect, repair and finish a daily contract at zero gold', () => {
  const p = {stage: 1, gold: 0, redDiamonds: 1, shipyard: starterShipyard(now)};
  const id = 'drakkar-1';
  assert.ok(applyNaval(p, {type: 'launch', id, hours: 4}, now));
  assert.equal(applyNaval(p, {type: 'launch', id, hours: 4}, now), false);
  assert.equal(applyNaval(p, {type: 'claim', id}, now + 4 * HOUR - 1), false);
  const arrival = now + 4 * HOUR;
  assert.ok(applyNaval(p, {type: 'claim', id}, arrival));
  assert.equal(applyNaval(p, {type: 'claim', id}, arrival), false);
  assert.equal(applyNaval(p, {type: 'launch', id, hours: 4}, arrival), false);
  assert.ok(applyNaval(p, {type: 'repair', id}, arrival));
  assert.equal(applyNaval(p, {type: 'repair', id}, arrival), false);
  assert.ok(applyNaval(p, {type: 'contract'}, arrival));
  assert.equal(applyNaval(p, {type: 'contract'}, arrival), false);
  assert.equal(applyNaval(p, {type: 'contract'}, now + DAY), false);
  assert.equal(applyNaval(p, {type: 'launch', id, hours: 4}, now), false);
  assert.equal(p.gold, 320);
  assert.equal(p.redDiamonds, 1);
  assert.deepEqual([p.shipyard.naval?.materials, p.shipyard.naval?.seals], [3, 2]);
  assert.ok(validShipyard(p.shipyard));
});

test('all five hulls have positive gameside routes and the convoy hull reduces repair cost', () => {
  for (const hull of Object.keys(HULLS) as Hull[]) {
    for (const route of ROUTES) {
      let lastGold = 0;
      for (let level = 1; level <= 5; level++) {
        const reward = voyageReward({id: 'test', hull, level}, route.hours);
        assert.equal(reward.repair, hull === 'warship' ? Math.floor(route.repair * 0.9) : route.repair);
        assert.ok(reward.gold > Math.max(reward.repair, lastGold));
        lastGold = reward.gold;
      }
    }
  }
});

test('fleet growth and refit have costs and dismantle preserves collected loot without creating a build loop', () => {
  const shipyard: ShipyardState = {...starterShipyard(now), naval: {version: 1, serial: 0, contracts: 45, materials: 1_000, seals: 10}};
  const p = {stage: 19, gold: 100_000, shipyard};
  assert.equal(applyNaval(p, {type: 'build', hull: 'scout'}, now), false);
  p.stage++;
  for (const hull of ['merchant', 'warship', 'dragon', 'odin'] as const) assert.ok(applyNaval(p, {type: 'build', hull}, now));
  assert.equal(applyNaval(p, {type: 'build', hull: 'scout'}, now), false);
  const id = 'fleet-1';
  for (const cost of NAVAL.upgrades) {
    const gold = p.gold;
    assert.ok(applyNaval(p, {type: 'upgrade', id, level: p.shipyard.ships[1].level}, now));
    assert.equal(p.gold, gold - cost.gold);
  }
  assert.equal(applyNaval(p, {type: 'upgrade', id, level: p.shipyard.ships[1].level}, now), false);
  const seals = p.shipyard.naval!.seals;
  assert.ok(applyNaval(p, {type: 'outfit', id, rig: 'sails'}, now));
  assert.equal(p.shipyard.naval!.seals, seals - RIGS.sails.seals);
  assert.equal(applyNaval(p, {type: 'outfit', id, rig: 'sails'}, now), false);
  assert.equal(applyNaval(p, {type: 'salvage', id: 'drakkar-1', level: 1}, now), false);
  assert.ok(applyNaval(p, {type: 'launch', id, hours: 24}, now));
  assert.equal(applyNaval(p, {type: 'salvage', id, level: 5}, now), false);
  const arrival = now + DAY;
  assert.ok(applyNaval(p, {type: 'claim', id}, arrival));
  assert.ok(applyNaval(p, {type: 'repair', id}, arrival));
  assert.equal(applyNaval(p, {type: 'salvage', id, level: 4}, arrival), false);
  const collected = p.gold;
  const refund = navalSalvage(p.shipyard.ships[1])!;
  assert.deepEqual(refund, {gold: 6930, materials: 26});
  assert.ok(applyNaval(p, {type: 'salvage', id, level: 5}, arrival));
  assert.equal(p.gold, collected + refund.gold);
  assert.equal(applyNaval(p, {type: 'salvage', id, level: 5}, arrival), false);
  assert.ok(applyNaval(p, {type: 'build', hull: 'merchant'}, arrival));
  assert.equal(p.shipyard.ships.at(-1)?.id, 'fleet-5');
  assert.ok(p.gold < collected);
  assert.equal(shipRate(p.shipyard), 1);
  assert.ok(validShipyard(p.shipyard));
});
