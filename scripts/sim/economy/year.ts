/** Isolated sessions using the Solo engine, the existing headless adapter and store actions. */
import {installHeadless, seedRandom} from '../bot';
import {freshPlayer, useGame} from '../../../src/core/store';
import {mountBattle, battle} from '../../../src/game/Battle';
import {freshWorld} from '../../../src/core/world';
import {stats, xpNeeded} from '../../../src/core/formulas';
import {upgradePreview} from '../../../src/core/forge';
import {shopOffers, shopQuote, shopStatus} from '../../../src/saga/shop';
import {dailyView, weeklyView, storyQuests, claimBoard, claimStory} from '../../../src/saga/quests';
import {activityView, claimActivity} from '../../../src/saga/activity';
import {learnProfession, practiceProfession} from '../../../src/saga/actions';
import {personalWorkshop} from '../../../src/saga/professions';
import {materialIds, matCount, setIds} from '../../../src/saga/gear';
import {stageGold} from '../../../src/saga/regions';
import {runeState, applyRuneAction, runeRules} from '../../../src/saga/runes';
import {collectRealmReward, realmStart, darkEquip, darkSalvageMany, relicUnlock, relicUpgrade} from '../../../src/dark/actions';
import {realmRun, realmLast} from '../../../src/dark/realm';
import {darkState, darkScore, relicIds, relicLevel, squadState, resCount} from '../../../src/dark/rules';
import {exchangeSeal, followerMarket, buyFollower, refreshFollowers} from '../../../src/dark/followerMarket';
import type {HeroClass, Player, Slot} from '../../../src/core/types';
import {buyMonthlyPack, months} from './stars';

const minutes = Number(process.argv[2] ?? 90);
const dollars = Number(process.argv[3] ?? 0);
const seed = Number(process.argv[4] ?? 17);
const hero = (process.argv[5] ?? 'berserker') as HeroClass;
const days = Number(process.env.SIM_DAYS ?? 365);
const lateSecondsPerMinute = Number(process.env.SIM_LATE_SECONDS_PER_MINUTE ?? 60);
if (!(lateSecondsPerMinute > 0 && lateSecondsPerMinute <= 60)) throw new Error('Invalid late mode time');
if (![30,90,180].includes(minutes) || ![0,5,20,50,100].includes(dollars) ||
    !['berserker','ranger','runologist'].includes(hero) || !Number.isInteger(days) || days < 1 || days > 365) {
  throw new Error('Expected minutes, USD per month, seed, hero, and SIM_DAYS=1–365');
}
const checkpoints = new Set([1,7,14,30,60,90,180,365,days]);
const stopAtLevel100 = process.env.SIM_STOP_AT_100 === '1';
const fullSessions = process.env.SIM_FULL_SESSIONS === '1';
const game = () => useGame.getState();
const player = () => game().p;
const origin = Date.UTC(2026, 0, 1, 10);
let now = origin;
installHeadless();
seedRandom(seed);
Date.now = () => now;
Object.defineProperty(globalThis.performance, "now", {value: () => now - origin + 1000});
let serial = 0;
Object.defineProperty(globalThis.crypto, 'randomUUID', {
  value: () => '00000000-0000-4000-8000-' + (++serial).toString(16).padStart(12, '0'),
});
const initial = freshPlayer();
initial.world = freshWorld(seed);
initial.sound = false;
useGame.setState({p:initial,panel:null,selected:null,back:null,recoveryRequired:false,storageError:false,
  speed:1,auto:true,stopOnDeath:true,continueOnVictory:true,autoSalvageWeaker:false});
game().setClass(hero);
const unmount = mountBattle({getContext: () => ({}), addEventListener(){}, removeEventListener(){}} as unknown as HTMLCanvasElement);
const engine = battle!;
const currencies = ['gold','gems','tokens','chaosite','redDiamonds'] as const;
const flow: Record<string, Record<string, {earned:number; spent:number}>> = {};
const bought = new Set<string>();
const result: object[] = [];
const activity = {wins:0, defeats:0, caveWins:0, caveDefeats:0, seconds:0, skippedSeconds:0, stars:0, gemsPurchased:0};
let day100: number|null = null;
let dailyStreakDefeats = 0;

function track(before: Player, name: string) {
  const after = player();
  if (before === after) return;
  for (const currency of currencies) {
    const delta = (after[currency] ?? 0) - (before[currency] ?? 0);
    if (!delta) continue;
    const source = flow[name] ??= {};
    const row = source[currency] ??= {earned:0,spent:0};
    if (delta > 0) row.earned += delta;
    else row.spent -= delta;
  }
}
function action(name: string, callback: () => unknown) {
  const before = player();
  const outcome = callback();
  track(before, name);
  return outcome;
}
function buy(id: string) {
  const offer = shopOffers(player(), now).find(row => row.id === id);
  if (offer) action('shop:' + id, () => game().buy(id, shopQuote(offer)));
}
function quests() {
  for (const [kind, rows] of [['day',dailyView(player(),now)],['week',weeklyView(player(),now)]] as const) {
    for (const q of rows) if (q.done && !q.claimed) {
      action('quest:' + kind, () => game().mutate(p => !!claimBoard(p, kind, q.def.id, now)));
    }
  }
  for (const q of storyQuests(player())) if (q.done && !q.claimed) {
    action('quest:story', () => game().mutate(p => !!claimStory(p, q.id)));
  }
  activityView(player(),now).forEach((row, index) => {
    if (row.reached && !row.claimed) action('activity', () => game().mutate(p => !!claimActivity(p,index,now)));
  });
}
function upkeep(day: number) {
  if (player().stage >= 11) {
    if (!personalWorkshop(player())) learnProfession('smith');
    const workshop = personalWorkshop(player());
    if (workshop) action('profession', () => practiceProfession(setIds[(day - 1) % setIds.length],workshop.xp));
  }
  quests();
  for (const id of ['rune-scrolls','summon-seal','relic-shards','long-march']) buy(id);
  if (dollars) for (const id of ['squad-rations','relic-workshop','relic-expedition','dark-stock','workshop-kit','forge-parcel']) buy(id);
  const runes = runeState(player());
  const lowestRank = runes.ranks.indexOf(Math.min(...runes.ranks));
  action('runes', () => game().mutate(p => applyRuneAction(
    p,runes.ranks[lowestRank] ? {kind:'rank',id:lowestRank} : {kind:'summon'},runes.revision,
  )));
  for (let row = 0; row < runeRules.path.length; row++) {
    const state = runeState(player());
    if (state.path?.[row] === null && player().level >= runeRules.path[row].level) {
      action('runes:path', () => game().mutate(p => applyRuneAction(p,{kind:'path',row,id:0},state.revision)));
    }
  }
  const seals = resCount(player(),'seal');
  if (seals) action('summon:exchange', () => exchangeSeal(seals,seals));
  const market = followerMarket(player(),now);
  action('summon:buy', () => buyFollower(0,market.revision,now));
  if (day % 7 === 1) action('summon:refresh', () => refreshFollowers(followerMarket(player(),now).revision,false,now));
  const dark = darkState(player());
  for (const item of dark.inv) {
    const worn = darkState(player()).eq[item.s];
    if (!worn || darkScore(item) > darkScore(worn)) darkEquip(item.id);
  }
  darkSalvageMany(0,3);
  for (const id of relicIds.slice(1)) {
    action('relic', () => relicLevel(player(),id) ? relicUpgrade(id) : relicUnlock(id));
  }
}
function manageStage(boss: boolean) {
  if (boss) {
    action('chapter', () => game().claim('mission',player().mission));
    if (!player().claimed.includes('wings')) game().claim('wings');
  }
  while (player().talents.reduce((sum,n) => sum+n,0) < player().level-1) {
    const [attack, defense] = player().talents;
    if (!game().train('talent', attack <= defense*1.5 ? 0 : 1)) break;
  }
  game().equipBest();
  const p = player();
  if (p.inventory.length > 56) {
    for (const item of p.inventory.filter(i => !i.uniqueId && !i.perk && !i.set).slice(0,18)) {
      action('salvage', () => game().salvage(item.id,true));
    }
  }
  if (boss) {
    const reserve = p.gold * .20;
    for (let n = 0; n < 32; n++) {
      const current = player();
      const options = [
        {cost:100*current.forge, key:'forge', pay:() => game().train('forge')},
        ...[0,2].map(i => ({cost:120*current.skills[i], key:'skill', pay:() => game().train('skill',i)})),
        ...[0,1].filter(i => current.companions[i] < 25).map(i => (
          {cost:120*current.companions[i], key:'companion', pay:() => game().train('companion',i)}
        )),
        ...Object.entries(current.equipment).filter(([slot]) => slot !== 'wings').map(([slot,item]) => (
          {cost:upgradePreview(item).cost, key:'sharpen', pay:() => game().upgrade(slot as Slot)}
        )),
      ].sort((a,b) => a.cost-b.cost);
      const next = options.find(row => row.cost > 0 && row.cost <= current.gold-reserve);
      if (!next) break;
      action(next.key,next.pay);
      if (player().gold >= current.gold) break;
    }
  }
  if (game().panel) game().open(null);
}

function finishCave() {
  const last = realmLast(player());
  if (!last || last.ack) return;
  if (last.win) activity.caveWins++;
  else activity.caveDefeats++;
  action('cave:reward',collectRealmReward);
  game().open(null);
}

try {
  for (let day = 1; day <= days; day++) {
    now = origin + (day - 1)*86_400_000;
    dailyStreakDefeats = 0;
    action('calendar', () => game().claim('daily'));
    action('mine', () => game().claim('mine'));
    action('ship:claim', () => game().shipAction('claim'));
    if (player().stage >= 20) {
      action('ship:build', () => game().shipAction('buy'));
      const weakest = [...(player().shipyard?.ships ?? [])].sort((a,b) => a.level-b.level)[0];
      if (weakest && weakest.level < 5) action('ship:upgrade', () => game().shipAction('upgrade',weakest.id));
    }
    // This action has a UI performance.now() debounce. The simulation runs one trade per day.
    action('ship:exchange', () => game().shipAction('trade'));
    const pack = months.includes(day) ? buyMonthlyPack(dollars,bought) : undefined;
    if (pack) {
      activity.stars += pack.stars;
      activity.gemsPurchased += pack.gems;
      action('shadow:Stars-transfer', () => game().mutate(p => {p.gems += pack.gems}));
    }
    upkeep(day);
    game().open(null);
    if (!engine.running) engine.toggle();
    const caveTarget = minutes >= 90 ? minutes / 90 : 0;
    let caveStarts = 0;
    const simulatedSeconds = minutes * (day === 1 ? 60 : lateSecondsPerMinute);
    const ticks = Math.round(simulatedSeconds * 20);
    activity.skippedSeconds += minutes*60 - simulatedSeconds;
    for (let tick = 0; tick < ticks; tick++) {
      const before = player();
      const oldPhase = engine.phase;
      const oldMode = engine.mode;
      now += 50;
      activity.seconds += .05;
      engine.update(.05,.05);
      track(before,'battle:' + oldMode);
      if (day100 === null && player().level >= 100) day100 = day;
      if (oldMode === 'darkness') {
        const run = realmRun(player());
        if (run?.stage.startsWith('CHOICE') && run.pair) engine.choosePortal(run.pair[0].id);
        if (!run) {
          finishCave();
          if (!engine.running) engine.toggle();
        }
      } else if (before.stage !== player().stage || before.wave !== player().wave) {
        const boss = before.stage !== player().stage;
        activity.wins++;
        dailyStreakDefeats = 0;
        if (player().rewardOffer && !player().rewardOffer!.resolved) action('trophy', () => game().keepReward());
        manageStage(boss);
        if (boss && tick < ticks*.75 && caveStarts < caveTarget && player().stage >= 14) {
          if (action('cave:entry', () => realmStart(1,'harvest'))) caveStarts++;
        }
      } else if (oldPhase !== 'defeat' && engine.phase === 'defeat') {
        activity.defeats++;
        dailyStreakDefeats++;
        if (!fullSessions && dailyStreakDefeats >= 3) {
          activity.skippedSeconds += (ticks-tick-1)*.05;
          break;
        }
        manageStage(true);
        engine.toggle();
      }
      const current = player();
      if (engine.phase === 'fight' && engine.intro <= 0 && engine.hp > 0 &&
          engine.hp < engine.maxHp*.25 && engine.potionCd <= 0 && current.gold >= engine.potionCost()) {
        action('healing', () => engine.heal());
      }
      if (game().recoveryRequired || game().storageError) throw new Error('Isolated save failed on day '+day);
      if (!engine.running && engine.phase !== 'defeat' && game().panel === null) engine.toggle();
    }
    quests();
    const reachedTarget = stopAtLevel100 && day100 !== null;
    if (!checkpoints.has(day) && !reachedTarget) continue;
    if (process.env.SIM_PROGRESS) console.error(`day=${day} stage=${player().stage} level=${player().level}`);
    const p = player();
    const workshop = personalWorkshop(p);
    result.push({
      day,level:p.level,xp:p.xp,nextXp:xpNeeded(p.level),stage:p.stage,wave:p.wave,cp:stats(p).cp,
      balances:Object.fromEntries(currencies.map(id => [id,p[id]??0])),
      activity:{...activity,seconds:Math.round(activity.seconds),skippedSeconds:day*minutes*60-Math.round(activity.seconds)},day100,
      equipment:Object.values(p.equipment).map(({id,slot,name,level,rarity,upgrade,origin,set,perk}) =>
        ({id,slot,name,level,rarity,upgrade,origin,set,perk})),
      darkEquipment:darkState(p).eq,companions:squadState(p).own,
      relics:Object.fromEntries(relicIds.map(id => [id,relicLevel(p,id)])),runes:runeState(p),
      profession:workshop ?? null, fleet:p.shipyard?.ships,
      materials:Object.fromEntries([...materialIds,'dusk','pearl'].map(id => [id,matCount(p,id)])),
      resources:Object.fromEntries((['ess','seal','shard'] as const).map(id => [id,resCount(p,id)])),
      purchasingPower:{
        coinsInStageBossAwards:+(p.gold/Math.max(1,stageGold(p.stage,true))).toFixed(2),
        gemsIn20GemSeals:Math.floor(p.gems/20),redInHarborSeals:Math.floor((p.redDiamonds??0)/20),
      },
      offers:shopOffers(p,now).map(o => ({id:o.id,currency:o.currency,price:o.price,status:shopStatus(p,o,now)??'available'})),
      flow:structuredClone(flow),
    });
    if (reachedTarget) break;
  }
} finally {
  unmount();
}
console.log(JSON.stringify({minutes,dollars,seed,hero,lateSecondsPerMinute,checkpoints:result}));
