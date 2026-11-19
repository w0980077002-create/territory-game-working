import type {Player, Slot} from '../core/types';
import type {SetId} from './gear';
import {materialIds, setOfRegion} from './gear';
import {slots} from '../data/catalog';
import {stageGold, regionIndex} from './regions';
import {counter} from './quests';
import {availableHorn} from './shop';
import {grant, type Reward} from './rewards';
import {addLoot, asSetItem, makeItem} from '../core/store';
import balance from '../../config/test-balance.v1.json';
import {
  CARNIVAL_DAYS, CARNIVAL_START_DAY, CARNIVAL_TASK_POINTS, CARNIVAL_RULES_VERSION,
  carnivalDays, carnivalMilestones, type CarnivalObjective,
} from './carnivalRules';

const DAY = 86_400_000;
const tasks = carnivalDays.flatMap((day, i) => day.tasks.map((task, j) =>
  ({...task, day:i+1, index:i*day.tasks.length+j, id:`task:${i+1}:${j+1}`, reward:day.reward})));
const milestones = carnivalMilestones.map(tier => ({...tier, id:`tier:${tier.points}`}));
const countKeys = [...new Set(tasks.flatMap(task => [...task.primary.keys, ...(task.alternative?.keys ?? [])]))];
const maxHorn = balance.horn_test_settings.maximum_charges;
const gearSlots: readonly Slot[] = slots.filter(slot => slot !== 'wings');
const gearRarity = 4;
const gearLevel = (period: PeriodSave) => period.level + 3;
const finalPoints = carnivalMilestones[carnivalMilestones.length-1].points;
const getGear = (period: PeriodSave) => ({
  slots:gearSlots, rarity:gearRarity, level:gearLevel(period), set:setOfRegion(regionIndex(period.stage)),
});

interface Schedule {id: string; startAt: number; endAt: number}
interface PeriodSave extends Schedule {
  v: 1;
  stage: number;
  level: number;
  progress: number[];
  /** Absent = untouched, -1 = collected, 0+ = other rewards collected and this many Horn charges issued. */
  claims: Record<string, number>;
}
export interface CarnivalSave {
  day: number;
  latest: PeriodSave;
  past: PeriodSave[];
}
const dayNumber = (now: number) => Math.floor(now/DAY);
const monthId = (now: number) => new Date(now).toISOString().slice(0,7);
const openDays = (period: Schedule, now: number) => Math.max(0, Math.min(CARNIVAL_DAYS, dayNumber(now)-dayNumber(period.startAt)+1));

function schedule(now: number, monthOffset = 0): Schedule {
  const date = new Date(now);
  const startAt = Date.UTC(date.getUTCFullYear(), date.getUTCMonth()+monthOffset, CARNIVAL_START_DAY);
  return {id:monthId(startAt), startAt, endAt:startAt+CARNIVAL_DAYS*DAY};
}

function currentWindow(now: number, latest?: PeriodSave): Schedule {
  const expected = schedule(now);
  return latest?.id === expected.id ? latest : expected;
}

function newPeriod(p: Player, window: Schedule): PeriodSave {
  return {...window, v:CARNIVAL_RULES_VERSION, stage:p.stage, level:p.level, progress:tasks.flatMap(() => [0,0]), claims:{}};
}

const validInteger = (n: unknown, min: number, max = Number.MAX_SAFE_INTEGER): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= min && n <= max;

function parsePeriod(raw: unknown): PeriodSave | undefined {
  const p = raw as Partial<PeriodSave> | null;
  if (!p || p.v !== CARNIVAL_RULES_VERSION || !validInteger(p.startAt,0,8.64e15-CARNIVAL_DAYS*DAY)
    || p.startAt%DAY !== 0 || p.id !== monthId(p.startAt) || p.endAt !== p.startAt+CARNIVAL_DAYS*DAY
    || !validInteger(p.stage,1) || !validInteger(p.level,1) || !Array.isArray(p.progress)) return;
  const progress = tasks.flatMap(task => {
    const primary = p.progress![task.index*2], alternative = p.progress![task.index*2+1];
    return [validInteger(primary,0,task.primary.target) ? primary : 0,
      validInteger(alternative,0,task.alternative?.target ?? 0) ? alternative : 0];
  });
  const claims: PeriodSave['claims'] = {};
  for (const entry of [...tasks, ...milestones]) {
    const received = p.claims?.[entry.id];
    if (validInteger(received,-1,(entry.reward.horn ?? 0)-1)) claims[entry.id] = received;
  }
  return {id:p.id,startAt:p.startAt,endAt:p.endAt,v:p.v,stage:p.stage,level:p.level,progress,claims};
}

export function normalizeCarnival(raw: unknown): CarnivalSave | undefined {
  const p = raw as Partial<CarnivalSave> | null;
  const latest = parsePeriod(p?.latest);
  if (!latest || !validInteger(p?.day,dayNumber(latest.startAt),dayNumber(8.64e15))) return;
  const previous = Array.isArray(p.past) ? p.past : [];
  const seen = new Set([latest.id]);
  const past = previous.flatMap(value => {
    const entry = parsePeriod(value);
    if (!entry || entry.startAt >= latest.startAt || seen.has(entry.id) || !hasPending(entry)) return [];
    seen.add(entry.id);
    return [entry];
  }).sort((a,b) => b.startAt-a.startAt);
  return {day:p.day,latest,past};
}

const complete = (period: PeriodSave, task: typeof tasks[number]) =>
  period.progress[task.index*2] >= task.primary.target
    || !!task.alternative && period.progress[task.index*2+1] >= task.alternative.target;
const points = (period: PeriodSave) =>
  tasks.filter(task => complete(period,task)).length * CARNIVAL_TASK_POINTS;
const hasPending = (period: PeriodSave) =>
  tasks.some(task => complete(period,task) && period.claims[task.id] !== -1)
  || milestones.some(tier => tier.points <= points(period) && period.claims[tier.id] !== -1);

export function carnivalRefreshDue(p: Player, now = Date.now()) {
  const latest = p.carnival;
  if (latest) return dayNumber(now) > latest.day;
  const period = schedule(now);
  return now >= period.startAt && now < period.endAt;
}

/** Capture successful mutations and the UTC day together with the existing profile save. */
export function updateCarnival(before: Player, after: Player, now: number): CarnivalSave | undefined {
  const save = after.carnival;
  const day = dayNumber(now);
  if (save && day < save.day) return save;
  const window = currentWindow(now,save?.latest);
  if (now < window.startAt || now >= window.endAt) return save && day > save.day ? {...save,day} : save;

  const previous = save?.latest;
  const period = previous?.id === window.id ? previous : newPeriod(before,window);
  const visit = !save || save.day < day;
  if (!visit && period === previous && before.saga === after.saga
    && before.world === after.world && before.bosses === after.bosses) return save;
  const deltas = new Map(countKeys.map(key => {
    if (key === 'carnival:visit') return [key, Number(visit)];
    return [key, Math.max(0,counter(after,key)-counter(before,key))];
  }));
  const delta = (objective: CarnivalObjective) => objective.keys.reduce((n,key) => n+(deltas.get(key) ?? 0),0);
  const progress = [...period.progress];
  let advanced = false;
  const unlocked = openDays(period,now);
  for (const task of tasks) {
    if (task.day > unlocked || complete(period,task)) continue;
    const i = task.index*2;
    progress[i] = Math.min(task.primary.target,progress[i]+delta(task.primary));
    if (task.alternative) progress[i+1] = Math.min(task.alternative.target,progress[i+1]+delta(task.alternative));
    advanced ||= progress[i] !== period.progress[i] || progress[i+1] !== period.progress[i+1];
  }
  if (save && period === previous && !advanced && !visit) return save;
  const past = save?.past ?? [];
  // The final chest freezes its item level when it becomes earned.
  const level = points(period) < finalPoints ? after.level : period.level;
  return {day,latest:advanced ? {...period,progress,level} : period,
    past:previous && period !== previous && hasPending(previous) ? [previous,...past] : past};
}

type RewardTemplate = Reward & {bossGold?: number; regionMaterials?: number};
function resolveReward(period: PeriodSave, {bossGold, regionMaterials, ...reward}: RewardTemplate): Reward {
  return {...reward,
    ...(bossGold ? {gold:Math.round(stageGold(period.stage,true)*bossGold)} : {}),
    ...(regionMaterials ? {mats:{[materialIds[regionIndex(period.stage)%6]]:regionMaterials}} : {}),
  };
}

type RewardStatus = 'locked'|'in_progress'|'claimable'|'claimed';
interface PrizeView {
  id: string;
  status: RewardStatus;
  reward: Reward;
  hornRemaining: number;
  partiallyClaimed: boolean;
  gear?: {slots: readonly Slot[]; rarity: number; level: number; set: SetId};
}
function prize(period: PeriodSave, id: string, reward: Reward, status: RewardStatus): PrizeView {
  const paid = period.claims[id];
  return {id, status:paid === -1 ? 'claimed' : status, reward,
    partiallyClaimed:paid !== undefined && paid !== -1,
    hornRemaining:paid === -1 ? 0 : (reward.horn ?? 0)-(paid ?? 0)};
}
function periodView(period: PeriodSave, visibleDays: number, acceptsProgress: boolean) {
  const score = points(period);
  const days = carnivalDays.map((day,index) => {
    const number = index+1;
    const unlocked = number <= visibleDays;
    return {day:number, title:day.title, unlockAt:period.startAt+index*DAY, unlocked,
      tasks:tasks.filter(task => task.day === number).map(task => {
        const done = complete(period,task);
        const progress = period.progress[task.index*2];
        const alternative = task.alternative && {...task.alternative,progress:period.progress[task.index*2+1]};
        return {...prize(period,task.id,resolveReward(period,task.reward),done ? 'claimable' : unlocked ? 'in_progress' : 'locked'),
          points:CARNIVAL_TASK_POINTS, primary:{...task.primary,progress}, alternative, acceptsProgress:acceptsProgress && unlocked && !done};
      })};
  });
  return {id:period.id, startAt:period.startAt, endAt:period.endAt, days, points:score,
    maxPoints:tasks.length*CARNIVAL_TASK_POINTS, targetPoints:finalPoints,
    milestones:milestones.map(tier => ({...prize(period,tier.id,resolveReward(period,tier.reward),score >= tier.points ? 'claimable' : 'locked'),
      points:tier.points, gear:tier.gear ? getGear(period) : undefined})),
  };
}

export function carnivalView(p: Player, now = Date.now()) {
  const save = p.carnival;
  const clockBlocked = !!save && dayNumber(now) < save.day;
  const effective = clockBlocked ? save.day*DAY : now;
  const latest = save?.latest;
  const window = currentWindow(effective,latest);
  const active = effective >= window.startAt && effective < window.endAt;
  const current = latest?.id === window.id ? latest : active ? newPeriod(p,window) : undefined;
  const archived = [...(latest && latest !== current ? [latest] : []), ...(save?.past ?? [])].filter(hasPending);
  return {phase:active ? 'active' as const : 'between' as const, clockBlocked,
    remainingMs:active && !clockBlocked ? window.endAt-now : null,
    nextStartAt:effective < window.startAt ? window.startAt : schedule(effective,1).startAt,
    period:current ? periodView(current,openDays(current,effective),active && !clockBlocked) : null,
    past:archived.map(period => periodView(period,CARNIVAL_DAYS,false)),
    hasClaimable:!!current && hasPending(current) || archived.length > 0};
}

export type CarnivalView = ReturnType<typeof carnivalView>;
export type CarnivalClaimResult =
  | {status:'claimed'|'partial'; reward:Reward; item?:{name:string; destination:'backpack'|'storage'}}
  | {status:'unavailable'|'horn_full'|'choose_slot'|'save_failed'};

export function prepareCarnivalClaim(p: Player, periodId: string, rewardId: string, slot: Slot | undefined, now: number) {
  const save = p.carnival;
  const period = save?.latest.id === periodId ? save.latest : save?.past.find(entry => entry.id === periodId);
  if (!save || !period || period.claims[rewardId] === -1) return {status:'unavailable'} as const;
  const task = tasks.find(entry => entry.id === rewardId);
  const tier = milestones.find(entry => entry.id === rewardId);
  if (task ? !complete(period,task) : !tier || tier.points > points(period)) return {status:'unavailable'} as const;
  if (tier?.gear && (!slot || !gearSlots.includes(slot))) return {status:'choose_slot'} as const;

  const template = (task ?? tier)!.reward;
  const alreadyPaid = period.claims[rewardId];
  const dueHorn = (template.horn ?? 0)-(alreadyPaid ?? 0);
  const horn = Math.min(dueHorn, maxHorn-availableHorn(p,now));
  if (alreadyPaid !== undefined && horn === 0) return {status:'horn_full'} as const;
  const reward = alreadyPaid === undefined ? {...resolveReward(period,template),horn:horn || undefined} : {horn};
  return {
    status:'payable' as const,
    apply(draft: Player): CarnivalClaimResult {
      const state = draft.carnival!;
      const entry = state.latest.id === periodId ? state.latest : state.past.find(past => past.id === periodId)!;
      grant(draft,reward,now);
      let item: Extract<CarnivalClaimResult,{status:'claimed'|'partial'}>['item'];
      if (tier?.gear && slot) {
        const gear = asSetItem(makeItem(slot,gearLevel(entry),gearRarity),getGear(entry).set);
        gear.origin = `Награда карнавала · ${entry.id}`;
        item = {name:gear.name,destination:addLoot(draft,gear) ? 'backpack' : 'storage'};
      }
      const settled = horn === dueHorn;
      entry.claims[rewardId] = settled ? -1 : (alreadyPaid ?? 0)+horn;
      if (entry !== state.latest && !hasPending(entry)) state.past = state.past.filter(past => past !== entry);
      return {status:settled ? 'claimed' : 'partial',reward,item};
    },
  };
}
