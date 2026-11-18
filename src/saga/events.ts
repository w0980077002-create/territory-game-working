import balance from '../../config/test-balance.v1.json';
import economy from '../../config/solo-economy.v1.json';
import type {Player} from '../core/types';
import {counter, dayOf} from './quests';
import {availableHorn} from './shop';
import {hasFlag, setFlag} from './save';
import {grant, type Reward} from './rewards';

const DAY_MS = 86_400_000;
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

export function claimDailyGift(p: Player, now: number) {
  const {day, base, extra} = dailyGift(now);
  if (p.daily === day) return null;
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
  if (!Number.isInteger(tier) || tier < 1 || tier > 10 || p.seasonClaims.includes(tier) || p.bosses < tier) return null;
  p.seasonClaims.push(tier);
  const reward = actualReward(p, seasonTierReward(tier), now);
  grant(p, reward, now);
  return reward;
}

export const seasonBadge = (p: Player) =>
  Math.min(p.bosses, 10) > p.seasonClaims.filter(tier => tier <= p.bosses).length ||
  seasonGoals(p).some(goal => goal.progress >= goal.goal && !goal.claimed);
