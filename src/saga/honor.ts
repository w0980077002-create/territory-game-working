import type {Player, Stats} from '../core/types';
import {boxOf, peekBox} from './save';

type HonorBonuses = Pick<Stats, 'attack' | 'hp' | 'defense'>;
interface HonorRank {
  name: string;
  numeral: string;
  stage: number;
  level: number;
  gold: number;
  bonuses: HonorBonuses;
}

export const honorRanks: readonly HonorRank[] = [
  {name:'Без звания', numeral:'', stage:0, level:1, gold:0, bonuses:{attack:0, hp:0, defense:0}},
  {name:'Дружинник', numeral:'I', stage:1, level:2, gold:100, bonuses:{attack:1, hp:1, defense:1}},
  {name:'Страж перевала', numeral:'II', stage:10, level:10, gold:350, bonuses:{attack:1.5, hp:2, defense:1.5}},
  {name:'Защитник гаваней', numeral:'III', stage:20, level:15, gold:1200, bonuses:{attack:2, hp:3, defense:2}},
  {name:'Хранитель рун', numeral:'IV', stage:30, level:18, gold:5000, bonuses:{attack:3, hp:4, defense:2.5}},
  {name:'Ветеран Севера', numeral:'V', stage:40, level:21, gold:18000, bonuses:{attack:4, hp:5, defense:3}},
  {name:'Герой рубежа', numeral:'VI', stage:50, level:23, gold:27000, bonuses:{attack:5, hp:6, defense:4}},
  {name:'Легенда Севера', numeral:'VII', stage:60, level:25, gold:36000, bonuses:{attack:6, hp:8, defense:5}},
];

interface HonorSave {rank: number}

export function honorRank(p: Player) {
  const rank = peekBox<HonorSave>(p, 'honor')?.rank ?? 0;
  return Number.isInteger(rank) && rank >= 0 && rank < honorRanks.length ? rank : 0;
}

export function honorConditions(p: Player, rank: HonorRank) {
  // The campaign advances stage only after its boss is defeated.
  return {stage: p.stage > rank.stage, level: p.level >= rank.level, gold: p.gold >= rank.gold};
}

export function canClaimHonor(p: Player, expectedRank: number) {
  const next = honorRanks[expectedRank];
  return !!next && expectedRank === honorRank(p) + 1 && Object.values(honorConditions(p, next)).every(Boolean);
}

export function applyHonor(p: Player, expectedRank: number) {
  if (!canClaimHonor(p, expectedRank)) return false;
  p.gold -= honorRanks[expectedRank].gold;
  boxOf<HonorSave>(p, 'honor', () => ({rank:0})).rank = expectedRank;
  return true;
}
