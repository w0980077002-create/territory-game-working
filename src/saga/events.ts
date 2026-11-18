import balance from '../../config/test-balance.v1.json';
import economy from '../../config/solo-economy.v1.json';
import type {Player} from '../core/types';
import {counter, dayOf} from './quests';
import {availableHorn} from './shop';
import {boxOf, hasFlag, peekBox, setFlag} from './save';
import {grant, type Reward} from './rewards';

const DAY_MS = 86_400_000;
const DAYS_PER_WEEK = 7;
export const SEASON_STEPS = 10;
const maxHorn = balance.horn_test_settings.maximum_charges;

export function dailyGift(now = Date.now()) {
  const index = Math.floor(now / DAY_MS) % economy.dailyExtras.length;
  const extra: Reward = economy.dailyExtras[index];
  return {
    day: dayOf(now),
    base: {gold:balance.test_rewards.daily_login_gold, gems:balance.test_rewards.daily_login_gems, horn:5},
    extra,
  };
}

/** Rewards can fill the Horn, but its existing capacity still applies. */
export const actualReward = (p: Pick<Player,'horn'|'hornAt'>, reward: Reward, now = Date.now()): Reward =>
  reward.horn ? {...reward, horn:Math.min(reward.horn, maxHorn - availableHorn(p, now))} : reward;

interface DailyReceipts { days?: string[] }
const dailyReceipts = (p: Player) => {
  const days = peekBox<DailyReceipts>(p, 'daily-gifts')?.days;
  return Array.isArray(days) ? days.filter(day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)) : [];
};

export function dailyCalendar(p: Player, now = Date.now()) {
  const today = dayOf(now);
  const monday = Math.floor(now / DAY_MS) * DAY_MS - ((new Date(now).getUTCDay() + 6) % DAYS_PER_WEEK) * DAY_MS;
  const received = new Set([...dailyReceipts(p), p.daily]);
  return Array.from({length:DAYS_PER_WEEK}, (_, index) => {
    const gift = dailyGift(monday + index * DAY_MS);
    return {...gift, claimed:received.has(gift.day), current:gift.day === today};
  });
}

export function claimDailyGift(p: Player, now: number) {
  const {day, base, extra} = dailyGift(now);
  const receipts = dailyReceipts(p);
  if (p.daily === day || receipts.includes(day)) return null;
  const earliest = dayOf(now - (DAYS_PER_WEEK - 1) * DAY_MS);
  boxOf<DailyReceipts>(p, 'daily-gifts', () => ({})).days =
    [...new Set([...receipts, p.daily, day])].filter(date => date >= earliest && date <= day).sort();
  p.daily = day;
  const main = actualReward(p, base, now);
  grant(p, main, now);
  grant(p, extra, now);
  return {main, extra};
}

const goals = [
  {id:'lair', text:'Победы над хозяевами Логова', key:'win:dungeon', route:'dungeon'},
  {id:'arena', text:'Победы на Арене', key:'stat:arena', route:'arena'},
  {id:'realm', text:'Первые прохождения этажей Царства тьмы', key:'stat:dark', route:'realm'},
] as const;

export const seasonTierReward = (tier: number): Reward => ({gems:10*tier, horn:3});

export function seasonGoals(p: Player) {
  return goals.map(def => {
    const {goal, reward} = economy.seasonGoals[def.id];
    return {...def, goal, reward, progress:Math.min(goal,counter(p,def.key)), claimed:hasFlag(p,`season:goal:${def.id}`)};
  });
}

export function claimSeason(p: Player, id: string, now: number) {
  if (id.startsWith('season:goal:')) {
    const goal = seasonGoals(p).find(goal => id === `season:goal:${goal.id}`);
    if (!goal || goal.claimed || goal.progress < goal.goal || !setFlag(p, id)) return null;
    grant(p, goal.reward, now);
    return goal.reward;
  }
  const tier = Number(id.slice('season:'.length));
  if (!Number.isInteger(tier) || tier < 1 || tier > SEASON_STEPS || p.seasonClaims.includes(tier) || p.bosses < tier) return null;
  p.seasonClaims.push(tier);
  const reward = actualReward(p, seasonTierReward(tier), now);
  grant(p, reward, now);
  return reward;
}

export const seasonBadge = (p: Player) =>
  Math.min(p.bosses, SEASON_STEPS) > p.seasonClaims.filter(tier => tier <= p.bosses).length ||
  seasonGoals(p).some(goal => goal.progress >= goal.goal && !goal.claimed);
