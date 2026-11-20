import {eventMail,claimEvent,chestNames} from './soloEvents';
import {eventSchedule,windowFromKey} from './soloCalendar';
import type {SoloResource} from './soloEconomy';
import type {Player, Slot} from '../core/types';
import {carnivalMailPeriods, carnivalMailPrizes, prepareCarnivalClaim} from './carnival';
import type {Reward} from './rewards';
import {boxOf, peekBox} from './save';

// Store read letters only. Actual attachments and their receipts live in carnival saves.
type ReadLetters = Record<string, number>;
const readLetters = (p: Player) => peekBox<ReadLetters>(p, 'mail');

interface MailLetter {
  id: string;
  date: number;
  read: boolean;
  pending: boolean;
  reward: Reward;
  title?: string;
  chests?: string[];
  gear?: ReturnType<typeof carnivalMailPrizes>[number]['gear'];
}

export function unreadMail(p: Player, now: number) {
  const read = readLetters(p);
  return carnivalMailPeriods(p, now).filter(period => read?.[period.id] !== period.endAt).length
    +eventMail(p,now).filter(letter=>read?.[letter.id]!==letter.date).length;
}

function totalReward(prizes: {reward:Reward}[]): Reward {
  const total: Reward = {};
  for (const {reward} of prizes) {
    for (const key of ['gold','gems','horn','chaosite','tokens','xp'] as const) {
      if (reward[key]) total[key] = (total[key] ?? 0) + reward[key];
    }
    if (reward.mats) {
      total.mats ??= {};
      for (const [id, amount] of Object.entries(reward.mats)) total.mats[id] = (total.mats[id] ?? 0) + amount;
    }
    if(reward.solo){
      total.solo??={};
      for(const key of Object.keys(reward.solo) as SoloResource[])total.solo[key]=(total.solo[key]??0)+(reward.solo[key]??0);
    }
    if (reward.res) {
      total.res ??= {};
      for (const id of Object.keys(reward.res) as (keyof NonNullable<Reward['res']>)[]) {
        total.res[id] = (total.res[id] ?? 0) + (reward.res[id] ?? 0);
      }
    }
  }
  return total;
}

export function mailbox(p: Player, now: number): MailLetter[] {
  const read = readLetters(p);
  const pending:MailLetter[] = carnivalMailPeriods(p, now).map(period => {
    const prizes = carnivalMailPrizes(period);
    return {id:period.id, date:period.endAt, read:read?.[period.id] === period.endAt, pending:true,
      reward:totalReward(prizes), gear:prizes.find(prize => prize.gear)?.gear};
  });
  pending.push(...eventMail(p,now).map(({id,date,title,prizes})=>({id,date,title,read:read?.[id]===date,pending:true,
    reward:totalReward(prizes),chests:prizes.flatMap(prize=>prize.chest?[chestNames[prize.chest]]:[])})));
  const ids = new Set(pending.map(letter => letter.id));
  const history = Object.entries(read ?? {}).flatMap(([id,date]) =>
    !ids.has(id) && (/^\d{4}-\d{2}$/.test(id)||windowFromKey(id)) && Number.isSafeInteger(date) && date > 0 && date < 8.64e15
      ? [{id, date, read:true, pending:false, reward:{}, title:windowFromKey(id)?eventSchedule[windowFromKey(id)!.id].name:undefined}] : []);
  return [...pending, ...history].sort((a,b) => b.date-a.date);
}

export type MailAction =
  | {kind:'read'; id:string}
  | {kind:'claim'; id:string; slot?:Slot}
  | {kind:'claimAll'}
  | {kind:'deleteRead'};

export function applyMail(p: Player, action: MailAction, now: number, rewardNow: number) {
  const pending = carnivalMailPeriods(p, now);
  const solo=eventMail(p,now);
  if (action.kind === 'deleteRead') {
    const ids = new Set([...pending,...solo].map(period => period.id));
    const read = readLetters(p);
    let removed = 0;
    for (const id of Object.keys(read ?? {})) {
      if (!ids.has(id)) {
        delete read![id];
        removed++;
      }
    }
    return removed ? 'Прочитанные письма удалены' : undefined;
  }

  const selected = action.kind === 'claimAll' ? pending : pending.filter(period => period.id === action.id);
  if (action.kind === 'read') {
    const period = selected[0];
    const local=solo.find(letter=>letter.id===action.id);
    if (period||local) boxOf<ReadLetters>(p, 'mail', () => ({}))[action.id] = period?.endAt??local!.date;
    return;
  }
  let delivered = false, needsSlot = false, needsHorn = false, sentToStorage = false;
  for (const period of selected) {
    for (const prize of carnivalMailPrizes(period)) {
      const claim = prepareCarnivalClaim(p, period.id, prize.id, action.kind === 'claim' ? action.slot : undefined, rewardNow);
      if (claim.status === 'choose_slot') needsSlot = true;
      if (claim.status === 'horn_full') needsHorn = true;
      if (claim.status !== 'payable') continue;
      const result = claim.apply(p);
      if (result.status !== 'claimed' && result.status !== 'partial') continue;
      needsHorn ||= result.status === 'partial';
      sentToStorage ||= result.item?.destination === 'storage';
      if (result.status === 'claimed' || Object.values(result.reward).some(Boolean)) {
        boxOf<ReadLetters>(p, 'mail', () => ({}))[period.id] = period.endAt;
        delivered = true;
      }
    }
  }
  for(const letter of solo){
    if(action.kind==='claim'&&action.id!==letter.id)continue;
    for(const prize of letter.prizes){
      if(!claimEvent(p,letter.id,prize.index,'mail',now))continue;
      delivered=true;
      boxOf<ReadLetters>(p,'mail',()=>({}))[letter.id]=letter.date;
    }
  }
  const messages = [
    delivered && 'Вложения получены',
    sentToStorage && 'Предмет на хранении',
    needsSlot && 'Выберите слот для снаряжения в письме',
    needsHorn && 'Остаток зарядов ждёт места в Роге',
  ].filter(Boolean);
  return messages.length ? messages.join(' · ') : undefined;
}
