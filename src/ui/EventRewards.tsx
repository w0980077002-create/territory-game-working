import {useState} from 'react';
import type {Player} from '../core/types';
import {useGame} from '../core/store';
import {battle} from '../game/Battle';
import {actualReward, dailyCalendar, dailyGift, SEASON_STEPS, seasonGoals, seasonTierReward} from '../saga/events';
import {Icon} from './Icon';
import {RewardArt, rewardParts} from './RewardArt';
import './eventRewards.css';

const weekdays = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const dayLabel = (day: string) => day.slice(8) + '.' + day.slice(5,7);

export function DailyRewards({p}: {p: Player}) {
  const claim = useGame(state => state.claim);
  const open = useGame(state => state.open);
  const calendar = dailyCalendar(p);
  const today = calendar.find(gift => gift.current)!;
  const [day, selectDay] = useState(today.day);
  const selected = calendar.find(gift => gift.day === day) ?? today;
  const next = dailyGift(Date.parse(today.day) + 86_400_000);
  const base = selected.current && !selected.claimed ? actualReward(p, selected.base) : selected.base;
  return <section className="reward-window daily-window">
    <div className="reward-hero daily-hero">
      <div><small>Семь дней</small><h3>Дары зимнего очага</h3></div>
    </div>
    <div className="day-calendar" role="group" aria-label="Календарь подарков">
      {calendar.map((gift,index) => {
        const bonus = rewardParts(gift.extra)[0];
        const status = gift.claimed ? 'Получено' : gift.current ? 'Сегодня' : gift.day > today.day ? 'Скоро' : 'Нет отметки';
        return <button key={gift.day} className={'calendar-day ' + (gift.claimed ? 'received' : gift.current ? 'ready' : '')}
          aria-pressed={gift.day === selected.day} aria-label={weekdays[index] + ' ' + dayLabel(gift.day) + ' · ' + status}
          onClick={() => selectDay(gift.day)}>
          <strong>{weekdays[index]}</strong><Icon name={bonus?.icon ?? 'gift'}/>
          <span>{bonus ? '×' + bonus.count : '—'}</span><small>{gift.claimed ? '✓' : gift.current ? 'Сегодня' : dayLabel(gift.day)}</small>
        </button>;
      })}
    </div>
    <article className="reward-plaque daily-preview">
      <div className="reward-plaque-head">
        <strong>{selected.current ? 'Сегодняшний подарок' : selected.day === next.day ? 'Следующий подарок' : 'Подарок · ' + dayLabel(selected.day)}</strong>
        {selected.claimed && <small>✓ Получено</small>}
      </div>
      <div className="daily-contents">
        <RewardArt reward={base} names/>
        <div className="daily-bonus"><span>Бонус дня</span><RewardArt reward={selected.extra} names/></div>
      </div>
      {selected.current && !selected.claimed && !base.horn && <p>Рог заполнен. Остальные ресурсы можно забрать.</p>}
      {selected.current && <button className="action" disabled={selected.claimed}
        onClick={() => claim('daily')}>{selected.claimed ? 'Сегодня уже получено' : 'Забрать подарок'}</button>}
      {selected.day < today.day && !selected.claimed && <p>Для этой даты в сохранении нет отметки.</p>}
      {selected.day > today.day && <p>Будет доступен с 00:00 UTC в этот день.</p>}
    </article>
    <div className="reward-plaque next-gift">
      <div><strong>Завтра · {dayLabel(next.day)}</strong><small>С 00:00 UTC</small></div>
      <div className="next-gift-contents"><RewardArt reward={next.base}/><RewardArt reward={next.extra}/></div>
    </div>
    <button className="action secondary" onClick={() => open('wings')}>Крылья начинающего героя</button>
  </section>;
}

export function SeasonRewards({p}: {p: Player}) {
  const claim = useGame(state => state.claim);
  const open = useGame(state => state.open);
  const [selection,select] = useState<number>();
  const progress = Math.min(SEASON_STEPS,p.bosses);
  const tiers = Array.from({length:SEASON_STEPS},(_, index) => index + 1);
  const tier = selection ?? tiers.find(id => id <= progress && !p.seasonClaims.includes(id))
    ?? Math.min(SEASON_STEPS,progress + 1);
  const claimed = p.seasonClaims.includes(tier);
  const ready = progress >= tier;
  const reward = seasonTierReward(tier);
  return <section className="reward-window season-window">
    <div className="reward-hero season-hero"><div><small>Северный сезон</small><h3>Поход за сиянием</h3></div></div>
    <div className="season-progress">
      <div><strong>Боссы главы</strong><b>{progress} / {SEASON_STEPS}</b></div>
      <progress value={progress} max={SEASON_STEPS} aria-label="Победы над боссами главы"/>
    </div>
    <div className="season-trail" role="group" aria-label="Этапы Северного сезона">
      {tiers.map(id => {
        const received = p.seasonClaims.includes(id);
        const available = id <= progress;
        const status = received ? 'Получено' : available ? 'Можно забрать' : 'Впереди';
        const prize = seasonTierReward(id);
        return <button key={id} className={'season-step' + (received ? ' received' : available ? ' ready' : '') + (id === SEASON_STEPS ? ' finale' : '')}
          aria-label={'Этап ' + id + ' · ' + status} aria-pressed={tier === id} onClick={() => select(id)}>
          <span>{received ? '✓' : id}</span><Icon name={id === SEASON_STEPS ? 'chest' : 'gem'}/>
          <b>{id === SEASON_STEPS && <Icon name="gem" className="finale-gem"/>}{prize.gems}</b><small>{id === SEASON_STEPS ? 'Финал' : available && !received ? 'Готово' : ''}</small>
        </button>;
      })}
    </div>
    <article className={'reward-plaque season-preview' + (tier === SEASON_STEPS ? ' finale' : '')}>
      <div className="reward-plaque-head"><strong>{tier === SEASON_STEPS ? 'Финальная награда' : 'Награда этапа ' + tier}</strong>
        <small>{claimed ? '✓ Получено' : ready ? 'Можно забрать' : 'Победы · ' + progress + '/' + tier}</small>
      </div>
      <RewardArt reward={ready && !claimed ? actualReward(p,reward) : reward} names/>
      {ready && !claimed && <button className="action" onClick={() => {select(tier);claim('season:'+tier)}}>Забрать награду</button>}
    </article>
    <h3>Дополнительные испытания</h3>
    <div className="season-goals">
      {seasonGoals(p).map(goal => {
        const complete = goal.progress >= goal.goal;
        return <article key={goal.id} className="reward-plaque season-goal">
          <div><strong>{goal.text}</strong><small>{goal.progress} / {goal.goal}</small></div>
          <RewardArt reward={goal.reward}/>
          <button className={'action' + (complete ? '' : ' secondary')} disabled={goal.claimed}
            onClick={() => complete ? claim('season:goal:'+goal.id) : goal.route === 'dungeon' ? battle?.startMode('dungeon') : open(goal.route)}>
            {goal.claimed ? 'Получено' : complete ? 'Забрать' : 'Перейти'}
          </button>
        </article>;
      })}
    </div>
  </section>;
}
