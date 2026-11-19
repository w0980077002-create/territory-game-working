/**
 * UI contract for the monthly seven-day carnival (issue #51, owner revision 48).
 *
 * The carnival window only reads this view and calls the three actions. Points, counters, claims,
 * grants, saves and the calendar table belong to Codex's core; nothing here mutates a Player.
 * The helpers below are presentation-only: they derive labels and button states from the view.
 */
import type {Reward} from '../../saga/rewards';

export const CARNIVAL_DAY_MS = 86_400_000;
export const CARNIVAL_DAYS = 7;

export interface CarnivalTask {
  /** Stable id; the core claim key is chosen by Codex (proposed `carnival:task:<id>`). */
  id: string;
  /** Calendar day 1..7. */
  day: number;
  text: string;
  /** Counter value since the period baseline, already clamped by the core. */
  progress: number;
  goal: number;
  /** Carnival points granted on claim. */
  points: number;
  /** Optional extra prize shown next to the points. */
  reward?: Reward;
  claimed: boolean;
  /** Existing panel id for «Перейти»; `dungeon`, `campaign` etc. are resolved by the caller. */
  route?: string;
  /** Existing Icon name. */
  icon?: string;
}

export interface CarnivalTier {
  /** Point threshold: 100, 200 … 600. */
  points: number;
  reward: Reward;
  claimed: boolean;
  /** Display name of a special prize, e.g. the final chest. */
  title?: string;
}

export interface CarnivalView {
  /** `YYYY-MM`. */
  periodId: string;
  /** UTC ms of day 1, 00:00. */
  startsAt: number;
  /** UTC ms when new points stop (startsAt + 7 days). */
  endsAt: number;
  /** UTC ms until earned prizes can still be claimed; defaults to endsAt. */
  claimUntil?: number;
  points: number;
  tiers: CarnivalTier[];
  tasks: CarnivalTask[];
}

export interface CarnivalActions {
  claimTask: (id: string) => void;
  claimTier: (points: number) => void;
  go: (route: string) => void;
}

export type CarnivalPhase = 'soon' | 'live' | 'claim' | 'over';
export type TaskState = 'locked' | 'go' | 'ready' | 'claimed' | 'missed';

export function carnivalPhase(view: CarnivalView, now: number): CarnivalPhase {
  if (now < view.startsAt) return 'soon';
  if (now < view.endsAt) return 'live';
  return now < (view.claimUntil ?? view.endsAt) ? 'claim' : 'over';
}

/** Days are calendar days from startsAt; an opened day stays open for catching up until the end. */
export const dayOpensAt = (view: CarnivalView, day: number) => view.startsAt + (day - 1) * CARNIVAL_DAY_MS;
export const dayOpen = (view: CarnivalView, day: number, now: number) => now >= dayOpensAt(view, day);
export const currentDay = (view: CarnivalView, now: number) =>
  Math.max(1, Math.min(CARNIVAL_DAYS, Math.floor((now - view.startsAt) / CARNIVAL_DAY_MS) + 1));

export function taskState(view: CarnivalView, task: CarnivalTask, now: number): TaskState {
  if (task.claimed) return 'claimed';
  if (!dayOpen(view, task.day, now)) return 'locked';
  const phase = carnivalPhase(view, now);
  if (task.progress >= task.goal) return phase === 'over' ? 'missed' : 'ready';
  return phase === 'live' ? 'go' : 'missed';
}

export const tierReady = (view: CarnivalView, tier: CarnivalTier, now: number) =>
  !tier.claimed && view.points >= tier.points && carnivalPhase(view, now) !== 'over' && carnivalPhase(view, now) !== 'soon';

export const dayReady = (view: CarnivalView, day: number, now: number) =>
  view.tasks.some(task => task.day === day && taskState(view, task, now) === 'ready');

/** Red «!» on the festive button: something can be claimed right now. */
export const carnivalBadge = (view: CarnivalView, now: number) =>
  view.tiers.some(tier => tierReady(view, tier, now)) || view.tasks.some(task => taskState(view, task, now) === 'ready');

/** The festive button is shown during the event and while earned prizes are still claimable. */
export const carnivalVisible = (view: CarnivalView | null | undefined, now: number): view is CarnivalView =>
  !!view && (carnivalPhase(view, now) === 'live' || (carnivalPhase(view, now) === 'claim' && carnivalBadge(view, now)));

const pad = (n: number) => String(n).padStart(2, '0');
/** «3д 12:15:08», «12:15:08». */
export function countdown(ms: number) {
  const left = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(left / 86_400), h = Math.floor(left % 86_400 / 3600), m = Math.floor(left % 3600 / 60), s = left % 60;
  return (days ? days + 'д ' : '') + pad(h) + ':' + pad(m) + ':' + pad(s);
}
/** Short form for the HUD chip: «3д 12ч», «5ч 20м», «18м». */
export function shortCountdown(ms: number) {
  const left = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(left / 1440), h = Math.floor(left % 1440 / 60), m = left % 60;
  return days ? days + 'д ' + h + 'ч' : h ? h + 'ч ' + m + 'м' : m + 'м';
}
