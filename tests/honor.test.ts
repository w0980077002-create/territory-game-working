import assert from 'node:assert/strict';
import {test} from 'node:test';
import {installHeadless} from '../scripts/sim/bot';
import {stats} from '../src/core/formulas';
import {freshPlayer, parseSave, SAVE_KEY, useGame} from '../src/core/store';
import {honorRank, honorRanks} from '../src/saga/honor';

installHeadless();
const game = useGame.getState;

function loadHero(p = freshPlayer()) {
  localStorage.removeItem(SAVE_KEY);
  useGame.setState({p, storageError:false, recoveryRequired:false, panel:null});
}

test('the first title counts a boss victory, not the four waves or reaching the boss', () => {
  loadHero();
  for (let wave = 1; wave <= 4; wave++) assert.equal(game().win('campaign', `honor-first-${wave}`), true);
  assert.equal(game().p.wave, 5);
  assert.equal(game().claimHonor(1), false);
  assert.equal(game().win('campaign', 'honor-first-boss'), true);
  const afterVictory = game().p;
  assert.equal(afterVictory.stage, 2);
  assert.equal(afterVictory.level, 2);
  assert.equal(game().claimHonor(2), false, 'cannot skip a rank');
  assert.equal(game().claimHonor(1), true);
  assert.equal(game().p.gold, afterVictory.gold - 100);
  assert.equal(game().claimHonor(1), false, 'the old button is no longer payable');
});

test('existing heroes keep their progress and can claim the seven exact bonuses in sequence', () => {
  const old = {...freshPlayer(), stage:61, level:25, gold:87650};
  const restored = parseSave(JSON.stringify(old), true);
  assert.ok(restored);
  loadHero(restored);
  const before = stats(restored);
  assert.equal(honorRank(restored), 0);
  assert.deepEqual(stats(restored, 0), before);
  const tiers = [
    [100, 1, 1, 1], [350, 1.5, 2, 1.5], [1200, 2, 3, 2], [5000, 3, 4, 2.5],
    [18000, 4, 5, 3], [27000, 5, 6, 4], [36000, 6, 8, 5],
  ];
  let gold = old.gold;
  for (const [index, [price, attack, hp, defense]] of tiers.entries()) {
    const rank = index + 1;
    const preview = stats(game().p, rank);
    assert.equal(game().claimHonor(rank), true);
    gold -= price;
    const reloaded = parseSave(localStorage.getItem(SAVE_KEY), true);
    assert.ok(reloaded);
    assert.equal(honorRank(reloaded), rank);
    assert.equal(reloaded.gold, gold);
    assert.equal(reloaded.stage, old.stage);
    assert.equal(reloaded.level, old.level);
    assert.deepEqual(reloaded.equipment, old.equipment);
    assert.deepEqual(stats(reloaded), preview);
    for (const [attr, bonus] of Object.entries({attack, hp, defense}) as ['attack' | 'hp' | 'defense', number][]) {
      assert.ok(Math.abs(preview[attr] - before[attr] * (1 + bonus / 100)) < 2, `${rank} ${attr}`);
    }
    useGame.setState({p:reloaded});
    assert.equal(game().claimHonor(rank), false);
    assert.equal(game().p.gold, gold);
  }
  assert.equal(game().claimHonor(honorRanks.length), false);
  assert.equal(game().p.gold, 0);
  assert.equal(stats(game().p).skillDamage, before.skillDamage);
  assert.equal(stats(game().p).reduction, before.reduction);
});

test('insufficient level, insufficient gold and a failed write cannot grant a title', t => {
  t.mock.timers.enable({apis:['setTimeout']});
  loadHero({...freshPlayer(), stage:2, level:1, gold:100});
  assert.equal(game().claimHonor(1), false);
  assert.equal(game().mutate(p => {p.level = 2; p.gold = 99}), true);
  assert.equal(game().claimHonor(1), false);
  assert.equal(game().mutate(p => {p.gold = 100}), true);
  const before = localStorage.getItem(SAVE_KEY);
  const write = localStorage.setItem;
  localStorage.setItem = () => {throw new Error('Storage full')};
  try {
    assert.equal(game().claimHonor(1), false);
    assert.equal(honorRank(game().p), 0);
    assert.equal(game().p.gold, 100);
    assert.equal(localStorage.getItem(SAVE_KEY), before);
  } finally {
    localStorage.setItem = write;
  }
  assert.equal(game().claimHonor(1), true);
  assert.equal(game().p.gold, 0);
});
