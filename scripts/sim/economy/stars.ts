import {readFileSync} from 'node:fs';

export const starsSource = 'supabase/migrations/20261128000000_vvr_stars.sql';
const source = readFileSync(starsSource, 'utf8');
export const starOffers = Array.from(source.matchAll(
  /^\s*\('([\w-]+)','(test|gems|support)','([^']+)',(\d+),(\d+),(true|false),\d+,true\)/gm,
), ([, id, kind, name, stars, gems, first]) => ({
  id, kind, name, stars: Number(stars), gems: Number(gems), firstBonus: first === 'true',
}));
if (starOffers.length !== 11) throw new Error('Review the Stars migration before updating the audit.');

export const usdPerStar = 0.02; // model assumption, not a conversion shown to players
export const months = [1, 31, 61, 91, 121, 151, 181, 211, 241, 271, 301, 331];
export function buyMonthlyPack(usdBudget: number, bought: Set<string>) {
  const xtrBudget = Math.floor(usdBudget / usdPerStar);
  const offer = starOffers.filter(row => row.kind === 'gems' && row.stars <= xtrBudget).at(-1);
  if (!offer) return;
  const gems = offer.gems * (offer.firstBonus && !bought.has(offer.id) ? 2 : 1);
  bought.add(offer.id);
  return {...offer, gems};
}
