import {eventMail,claimEvent,chestNames} from './soloEvents';
import {eventSchedule,windowFromKey} from './soloCalendar';
import type {Player, Slot} from '../core/types';
import {carnivalMailPeriods, carnivalMailPrizes, prepareCarnivalClaim} from './carnival';
import {combineRewards,type Reward} from './rewards';
import {actualReward} from './events';
import {boxOf, peekBox} from './save';
import {isNews, newsLetters} from './news';

// Store read letters only. Actual attachments and their receipts live in carnival saves.
type ReadLetters = Record<string, number>;
const readLetters = (p: Player) => peekBox<ReadLetters>(p, 'mail');

interface MailLetter {
  id: string;
  date: number;
  read: boolean;
  pending: boolean;
  reward: Reward;
  claimableReward?: Reward;
  title?: string;
  chests?: string[];
  pendingHorn?: number;
  gear?: ReturnType<typeof carnivalMailPrizes>[number]['gear'];
  /** Update news: text only, no attachments. */
  body?: readonly string[];
}

export function unreadMail(p: Player, now: number) {
  const read = readLetters(p);
  return carnivalMailPeriods(p, now).filter(period => read?.[period.id] !== period.endAt).length
    +eventMail(p,now).filter(letter=>read?.[letter.id]!==letter.date).length
    +newsLetters.filter(letter=>letter.date<=now&&read?.[letter.id]===0).length;
}

export function mailbox(p: Player, now: number, rewardNow=Date.now()): MailLetter[] {
  const read = readLetters(p);
  const pending:MailLetter[] = carnivalMailPeriods(p, now).map(period => {
    const prizes = carnivalMailPrizes(period);
    const total=combineRewards(prizes.map(prize=>prize.reward)), reward=actualReward(p,total,rewardNow);
    return {id:period.id, date:period.endAt, read:read?.[period.id] === period.endAt, pending:true,
      reward:total, claimableReward:reward, pendingHorn:(total.horn??0)-(reward.horn??0), gear:prizes.find(prize => prize.gear)?.gear};
  });
  pending.push(...eventMail(p,now).map(({id,date,title,prizes})=>({id,date,title,read:read?.[id]===date,pending:true,
    reward:combineRewards(prizes.map(prize=>prize.reward)),chests:prizes.flatMap(prize=>prize.chest?[chestNames[prize.chest]]:[])})));
  const ids = new Set(pending.map(letter => letter.id));
  const history = Object.entries(read ?? {}).flatMap(([id,date]) =>
    !ids.has(id) && (/^\d{4}-\d{2}$/.test(id)||windowFromKey(id)) && Number.isSafeInteger(date) && date > 0 && date < 8.64e15
      ? [{id, date, read:true, pending:false, reward:{}, title:windowFromKey(id)?eventSchedule[windowFromKey(id)!.id].name:undefined}] : []);
  // A read news letter is deleted by storing its date negated, so it never comes back as unread.
  const news = newsLetters.filter(letter => letter.date <= now && (read?.[letter.id] === 0 || read?.[letter.id] === letter.date))
    .map(({id,date,title,body}) => ({id, date, title, body, read:read?.[id] === date, pending:false, reward:{}}));
  return [...pending, ...news, ...history].sort((a,b) => b.date-a.date);
}

export type MailAction =
  | {kind:'read'; id:string}
  | {kind:'claim'; id:string; slot?:Slot}
  | {kind:'claimAll'}
  | {kind:'deleteRead'};

export function applyMail(p: Player, action: MailAction, now: number, rewardNow: number, onReward?:(reward:Reward)=>void) {
  const pending = carnivalMailPeriods(p, now);
  const solo=eventMail(p,now);
  if (action.kind === 'deleteRead') {
    const ids = new Set([...pending,...solo].map(period => period.id));
    const read = readLetters(p);
    let removed = 0;
    for (const id of Object.keys(read ?? {})) {
      if (isNews(id)) {
        if (read![id] > 0) { read![id] = -read![id]; removed++; }
      } else if (!ids.has(id)) {
        delete read![id];
        removed++;
      }
    }
    return removed ? 'Прочитанные письма удалены' : undefined;
  }

  const selected = action.kind === 'claimAll' ? pending : pending.filter(period => period.id === action.id);
  if (action.kind === 'read') {
    const period = selected[0];
    const local=solo.find(letter=>letter.id===action.id),news=newsLetters.find(letter=>letter.id===action.id&&letter.date<=now);
    if (period||local) boxOf<ReadLetters>(p, 'mail', () => ({}))[action.id] = period?.endAt??local!.date;
    else if (news && peekBox<ReadLetters>(p,'mail')?.[news.id] === 0) boxOf<ReadLetters>(p, 'mail', () => ({}))[news.id] = news.date;
    return;
  }
  const rewards:Reward[]=[], items:string[]=[];
  let delivered = false, needsSlot = false, needsHorn = false, sentToStorage = false;
  for (const period of selected) {
    for (const prize of carnivalMailPrizes(period)) {
      const claim = prepareCarnivalClaim(p, period.id, prize.id, action.kind === 'claim' ? action.slot : undefined, rewardNow);
      if (claim.status === 'choose_slot') needsSlot = true;
      if (claim.status === 'horn_full') needsHorn = true;
      if (claim.status !== 'payable') continue;
      const result = claim.apply(p);
      if (result.status !== 'claimed' && result.status !== 'partial') continue;
      rewards.push(result.reward);
      if(result.item)items.push(result.item.name);
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
      rewards.push(prize.reward);
      if(prize.chest)items.push(chestNames[prize.chest]);
      delivered=true;
      boxOf<ReadLetters>(p,'mail',()=>({}))[letter.id]=letter.date;
    }
  }
  if(delivered)onReward?.(combineRewards(rewards));
  const messages = [
    delivered && 'Вложения получены',
    ...items,
    sentToStorage && 'Предмет на хранении',
    needsSlot && 'Выберите слот для снаряжения в письме',
    needsHorn && 'Остаток зарядов ждёт места в Роге',
  ].filter(Boolean);
  return messages.length ? messages.join(' · ') : undefined;
}
