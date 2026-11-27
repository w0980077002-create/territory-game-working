import assert from 'node:assert/strict';
import {test} from 'node:test';
import balance from '../config/test-balance.v1.json';
import {installHeadless} from '../scripts/sim/bot';
import {claimCarnivalReward, freshPlayer, makeItem, parseSave, SAVE_KEY, useGame} from '../src/core/store';
import {carnivalView} from '../src/saga/carnival';
import {carnivalDays} from '../src/saga/carnivalRules';
import {mailbox,unreadMail} from '../src/saga/mail';
import {bumpCount} from '../src/saga/save';
import {resCount} from '../src/dark/rules';

installHeadless();
const state = useGame.getState;
const at = (month: number, day: number) => Date.UTC(2026,month,day);
const december = '2026-12';
const view = () => carnivalView(state().p);
const current = () => view().period!;
const task = (day: number, index: number) => current().days[day-1].tasks[index-1];
const tier = (points: number) => current().milestones.find(level => level.points === points)!;

function start(now: number, p = {...freshPlayer(),hornAt:now}) {
  localStorage.removeItem(SAVE_KEY);
  useGame.setState({p, storageError:false, recoveryRequired:false, panel:null, selected:null});
}
function reload() {
  const player = parseSave(localStorage.getItem(SAVE_KEY),true);
  assert.ok(player);
  useGame.setState({p:player,panel:null,selected:null});
}
function wins(mode: string,total: number,prefix: string) {
  for (let i=0;i<total;i++) assert.equal(state().win(mode,`${prefix}-${i}`),true);
}
function hornAndSalvage(total: number,salvage: number) {
  for (let i=0;i<total;i++) {
    state().open(null);
    state().hornLoot();
    const id = state().selected;
    assert.ok(id);
    if (i<salvage) state().salvage(id,true);
    state().open(null);
  }
}

test('UTC boundaries, real action deltas, old saves, catch-up, reload and backward time', t => {
  const startAt = at(11,1), endAt = at(11,8);
  t.mock.timers.enable({apis:['Date','setTimeout'],now:startAt-1});
  const player = freshPlayer();
  player.seasonClaims = [1];
  player.daily = '2026-11-30';
  bumpCount(player,'win:campaign',100);
  start(Date.now(),parseSave(JSON.stringify(player))!);
  assert.equal(view().phase,'between');
  assert.equal(view().nextStartAt,startAt);
  wins('campaign',1,'before');
  assert.equal(state().p.carnival,undefined);

  t.mock.timers.setTime(startAt);
  assert.equal(view().remainingMs,7*86_400_000);
  assert.equal(current().points,0);
  wins('campaign',1,'first');
  assert.equal(current().points,20);
  assert.equal(task(1,2).primary.progress,1);
  assert.equal(task(2,4).alternative?.progress,0);
  assert.equal(task(2,4).status,'locked');
  assert.equal(state().win('campaign','first-0'),false);
  reload();
  assert.equal(task(1,2).primary.progress,1);

  t.mock.timers.setTime(at(11,3));
  wins('campaign',2,'catch-up');
  assert.equal(task(1,2).status,'claimable');
  assert.equal(task(2,4).alternative?.progress,2);
  assert.equal(oldGiftAndSeason(),true);
  t.mock.timers.setTime(at(11,2));
  assert.equal(view().clockBlocked,true);
  wins('campaign',1,'clock-back');
  assert.equal(task(2,4).alternative?.progress,2);

  t.mock.timers.setTime(endAt-1);
  state().persist();
  assert.equal(view().remainingMs,1);
  t.mock.timers.setTime(endAt);
  state().persist();
  const closedScore = current().points;
  assert.equal(view().phase,'between');
  assert.equal(task(1,3).acceptsProgress,false);
  wins('campaign',5,'after');
  t.mock.timers.setTime(endAt-1);
  reload();
  assert.equal(view().phase,'between');
  assert.equal(current().points,closedScore);
  assert.equal(claimCarnivalReward(december,'task:1:2').status,'claimed');
  assert.equal(oldGiftAndSeason(),true);
});

function oldGiftAndSeason() {
  return state().p.daily === '2026-11-30' && state().p.seasonClaims.join() === '1';
}

test('mail links real closed prizes, excludes direct claims and persists read state and payment atomically', t => {
  t.mock.timers.enable({apis:['Date','setTimeout'],now:at(11,1)});
  start(Date.now());
  // Update news letters are global text letters; these tests cover carnival prizes only.
  const mail = () => mailbox(state().p,Date.now()).filter(letter=>!letter.body);
  const unread = () => unreadMail(state().p,Date.now())-mailbox(state().p,Date.now()).filter(letter=>letter.body&&!letter.read).length;
  wins('campaign',3,'mail-chapter');
  assert.deepEqual(mail(), [], 'active prizes stay in the carnival');
  assert.equal(claimCarnivalReward(december,'task:1:1').status,'claimed');
  const due = task(1,2).reward.gold;
  t.mock.timers.setTime(at(11,8));
  state().persist();
  assert.equal(unread(), 1);
  assert.equal(mail()[0].reward.gold, due, 'the paid login prize is excluded');
  const before = state().p.gold;
  const saved = localStorage.getItem(SAVE_KEY);
  const write = localStorage.setItem;
  localStorage.setItem = () => {throw new Error('Storage full')};
  try {
    assert.equal(state().mailAction({kind:'read',id:december}), false);
    assert.equal(state().mailAction({kind:'claimAll'}), false);
    assert.equal(state().p.gold, before);
    assert.equal(unread(), 1);
    assert.equal(localStorage.getItem(SAVE_KEY), saved);
  } finally { localStorage.setItem = write; }

  assert.equal(state().mailAction({kind:'read',id:december}), true);
  assert.equal(state().mailAction({kind:'deleteRead'}), true);
  reload();
  assert.equal(unread(), 0);
  assert.equal(mail()[0].pending, true, 'a read letter with attachments is protected');
  assert.equal(state().mailAction({kind:'claim',id:december}), true);
  assert.equal(state().mailAction({kind:'claim',id:december}), true);
  reload();
  assert.equal(state().p.gold, before + due!);
  assert.equal(mail()[0].pending, false);
  assert.equal(claimCarnivalReward(december,'task:1:2').status,'unavailable');
  localStorage.setItem = () => {throw new Error('Storage full')};
  try {
    assert.equal(state().mailAction({kind:'deleteRead'}), false);
    assert.equal(mail().length, 1);
  } finally { localStorage.setItem = write; }
  state().mailAction({kind:'deleteRead'});
  reload();
  assert.deepEqual(mail(), []);
  assert.equal(state().p.gold, before + due!);
});

test('mail bulk claim preserves Horn overflow and slot choice and delivers gear to storage once', t => {
 const carnivalMail=()=>mailbox(state().p,Date.now()).filter(letter=>!letter.body);
  t.mock.timers.enable({apis:['Date','setTimeout'],now:at(11,7)});
  start(Date.now());
  state().persist();
  state().mutate(p => {
    const period = p.carnival!.latest;
    period.progress = carnivalDays.flatMap(day => day.tasks.flatMap(task => [task.primary.target,0]));
    period.claims = Object.fromEntries([...carnivalDays.flatMap((day,i) => day.tasks.map((_,j) => `task:${i+1}:${j+1}`)),
      'tier:100','tier:200','tier:400','tier:500'].map(id => [id,-1]));
    p.inventory = Array.from({length:balance.loot_test_settings.starter_inventory_capacity},() => makeItem('belt',1,0));
  });
  t.mock.timers.setTime(at(11,8));
  state().mutate(p => {p.horn=balance.horn_test_settings.maximum_charges;p.hornAt=Date.now()});
  const before = state().p.gems;
  state().mailAction({kind:'claimAll'});
  state().mailAction({kind:'claimAll'});
  reload();
  assert.equal(state().p.gems, before + 12);
  assert.equal(carnivalMail()[0].reward.horn, 6);
  assert.ok(carnivalMail()[0].gear);
  state().mailAction({kind:'deleteRead'});
  assert.equal(carnivalMail().length, 1);

  state().mailAction({kind:'claim',id:december,slot:'ring1'});
  reload();
  assert.equal(state().p.gems, before + 42);
  assert.equal(state().p.pendingLoot?.length, 1);
  assert.equal(state().p.pendingLoot?.[0].slot, 'ring1');
  assert.equal(carnivalMail()[0].pending, true);
  state().mutate(p => {p.horn-=6});
  state().mailAction({kind:'claimAll'});
  reload();
  assert.equal(state().p.horn, balance.horn_test_settings.maximum_charges);
  assert.equal(carnivalMail()[0].pending, false);
  assert.equal(state().p.pendingLoot?.length, 1);
});

test('free route reaches 600 and atomically delivers the selected set piece to a full backpack through storage', t => {
  t.mock.timers.enable({apis:['Date','setTimeout'],now:at(11,1)});
  start(Date.now());
  wins('campaign',3,'opening');
  hornAndSalvage(2,2);
  state().hornLoot();
  state().equip(state().selected!);
  state().open(null);
  assert.equal(current().points,100);

  t.mock.timers.setTime(at(11,2));
  wins('farm',8,'day2farm');
  wins('campaign',5,'day2campaign');
  assert.equal(current().points,200);

  t.mock.timers.setTime(at(11,3));
  hornAndSalvage(7,4);
  wins('farm',6,'day3farm');
  assert.equal(current().points,300);

  t.mock.timers.setTime(at(11,4));
  hornAndSalvage(5,4);
  wins('farm',7,'day4farm');
  wins('campaign',3,'day4campaign');
  assert.equal(current().points,400);

  t.mock.timers.setTime(at(11,5));
  wins('farm',8,'day5farm');
  wins('campaign',5,'day5campaign');
  hornAndSalvage(4,0);
  assert.ok(current().points >= 480);

  t.mock.timers.setTime(at(11,6));
  wins('farm',10,'day6farm');
  wins('campaign',5,'day6campaign');
  hornAndSalvage(6,0);

  t.mock.timers.setTime(at(11,7));
  wins('farm',9,'day7farm');
  wins('campaign',6,'day7campaign');
  hornAndSalvage(6,5);
  assert.ok(current().points>=600);
  assert.equal(state().p.chaosite,freshPlayer().chaosite);
  assert.equal(state().p.bought.length,0);

  state().mutate(p => {
    while(p.inventory.length < balance.loot_test_settings.starter_inventory_capacity) p.inventory.push(makeItem('belt',1,0));
    p.pendingLoot = [makeItem('armor',7,3)];
  });
  const {gear} = tier(600);
  assert.equal(gear?.slots.length,12);
  assert.deepEqual(claimCarnivalReward(december,'tier:600'),{status:'choose_slot'});
  assert.deepEqual(claimCarnivalReward(december,'tier:600','wings'),{status:'choose_slot'});

  const before = localStorage.getItem(SAVE_KEY);
  const write = localStorage.setItem;
  localStorage.setItem = () => {throw new Error('Storage full')};
  try {
    assert.equal(claimCarnivalReward(december,'tier:600','ring1').status,'save_failed');
    assert.equal(tier(600).status,'claimable');
    assert.equal(state().p.pendingLoot?.length,1);
    assert.equal(localStorage.getItem(SAVE_KEY),before);
  } finally { localStorage.setItem = write; }
  const gems = state().p.gems;
  const result = claimCarnivalReward(december,'tier:600','ring1');
  assert.equal(result.status,'claimed');
  if (result.status === 'claimed') assert.equal(result.item?.destination,'storage');
  reload();
  assert.equal(claimCarnivalReward(december,'tier:600','ring1').status,'unavailable');
  const [original,prize] = state().p.pendingLoot!;
  assert.equal(original.level,7);
  assert.equal(prize.slot,'ring1');
  assert.equal(prize.set,gear?.set);
  assert.equal(prize.level,gear?.level);
  assert.equal(prize.rarity,gear?.rarity);
  assert.equal(state().p.gems,gems+30);
});

test('failed action and partially delivered Horn prize survive reload, next month and the new year', t => {
  t.mock.timers.enable({apis:['Date','setTimeout'],now:at(11,1)});
  start(Date.now());
  const write = localStorage.setItem;
  localStorage.setItem = () => {throw new Error('Write unavailable')};
  try {
    assert.equal(state().win('campaign','retry'),false);
    assert.equal(current().points,0);
    assert.equal(task(1,2).primary.progress,0);
  } finally { localStorage.setItem = write; }
  assert.equal(state().win('campaign','retry'),true);
  wins('campaign',2,'other');
  hornAndSalvage(2,2);
  state().hornLoot();
  state().equip(state().selected!);
  const gold = state().p.gold;
  const main = tier(100).reward.gold!;
  state().mutate(p=>{p.horn=50;p.hornAt=Date.now()});
  assert.equal(claimCarnivalReward(december,'tier:100').status,'partial');
  assert.equal(tier(100).hornRemaining,4);
  assert.equal(state().p.gold,gold+main);
  reload();
  assert.equal(claimCarnivalReward(december,'tier:100').status,'horn_full');

  t.mock.timers.setTime(Date.UTC(2027,0,1));
  state().persist();
  reload();
  assert.equal(current().id,'2027-01');
  assert.equal(current().points,20);
  assert.equal(view().past[0].id,december);
  assert.equal(view().past[0].milestones[0].hornRemaining,4);
  assert.equal(tier(100).status,'locked');

  state().mutate(p=>{p.horn=48;p.hornAt=Date.now()});
  assert.equal(claimCarnivalReward(december,'tier:100').status,'partial');
  assert.equal(state().p.horn,50);
  reload();
  state().mutate(p=>{p.horn=48;p.hornAt=Date.now()});
  assert.equal(claimCarnivalReward(december,'tier:100').status,'claimed');
  assert.equal(state().p.horn,50);
  assert.equal(state().p.gold,gold+main);
  assert.equal(claimCarnivalReward(december,'tier:100').status,'unavailable');
  for(const prize of view().past[0].days[0].tasks) assert.equal(claimCarnivalReward(december,prize.id).status,'claimed');
  assert.equal(view().past.length,0);
  t.mock.timers.setTime(at(11,7));
  reload();
  assert.equal(view().clockBlocked,true);
  assert.equal(current().id,'2027-01');
  assert.equal(claimCarnivalReward(december,'tier:100').status,'unavailable');
  assert.equal(resCount(state().p,'seal'),0);
});
