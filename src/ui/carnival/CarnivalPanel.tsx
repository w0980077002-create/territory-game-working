import {useEffect, useState} from 'react';
import {art} from '../../data/catalog';
import type {Reward} from '../../saga/rewards';
import {Icon} from '../Icon';
import {RewardArt, rewardParts} from '../RewardArt';
import {Bunting, CarnivalTent, CarnivalToken, Firework} from './CarnivalArt';
import {
  CARNIVAL_DAYS, carnivalPhase, countdown, currentDay, dayOpen, dayOpensAt, dayReady, shortCountdown, taskState, tierReady,
  type CarnivalActions, type CarnivalTask, type CarnivalTier, type CarnivalView,
} from './model';
import '../eventRewards.css';
import './carnival.css';

/** Ticks once a second while mounted; a fixed `now` (QA calendar) disables the timer. */
export function useCarnivalClock(fixed?: number) {
  const [now, setNow] = useState(() => fixed ?? Date.now());
  useEffect(() => {
    if (fixed !== undefined) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [fixed]);
  return fixed ?? now;
}

const firstPiece = (reward: Reward | undefined) => reward ? rewardParts(reward)[0] : undefined;
const short = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'M' : n >= 1e4 ? Math.round(n / 1000) + 'K' : String(n);

function Hero({view, now, hero}: {view: CarnivalView; now: number; hero: string}) {
  const phase = carnivalPhase(view, now);
  const timer = phase === 'soon' ? 'До начала ' + countdown(view.startsAt - now)
    : phase === 'live' ? 'Осталось ' + countdown(view.endsAt - now)
    : phase === 'claim' ? 'Призы ещё ' + countdown((view.claimUntil ?? view.endsAt) - now) : 'Карнавал завершён';
  return <div className="carnival-hero">
    <div className="carnival-sky" aria-hidden="true"/>
    <Firework color="#ffd35a" className="fw-a"/><Firework color="#ff6f7d" className="fw-b"/><Firework color="#6fe3f0" className="fw-c"/>
    <Bunting className="bunting-back" flags={11} sag={10}/>
    <Bunting className="bunting-front" flags={14} sag={18}/>
    <div className="carnival-stage" aria-hidden="true">
      <img className="cast cast-goose" src={art('goose_aviator')} alt="" draggable={false}/>
      <img className="cast cast-dog" src={art('brown_white_dog')} alt="" draggable={false}/>
      <img className="cast cast-hero" src={art(hero)} alt="" draggable={false}/>
    </div>
    <div className="carnival-title">
      <small>Семь дней праздника</small>
      <h3>Великий карнавал</h3>
      <span className={'carnival-timer' + (phase === 'live' ? '' : ' muted')} role="timer" aria-live="off">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8.5" fill="#fff3c4" stroke="#3b2214" strokeWidth="2.4"/><path d="M12 8.5V13l3 2M9 2.5h6" stroke="#3b2214" strokeWidth="2.4" strokeLinecap="round" fill="none"/></svg>
        {timer}
      </span>
    </div>
    <i className="confetti" aria-hidden="true">{Array.from({length: 14}, (_, i) => <b key={i} style={{'--i': i} as React.CSSProperties}/>)}</i>
  </div>;
}

function TierTrack({view, now, selected, select}: {view: CarnivalView; now: number; selected: number; select: (points: number) => void}) {
  const max = view.tiers.at(-1)?.points ?? 600;
  const fill = Math.min(100, view.points / max * 100);
  return <div className="carnival-track">
    <div className="carnival-points" aria-label={'Очки карнавала: ' + view.points}>
      <CarnivalToken/><b>{view.points}</b><small>очков</small>
    </div>
    <div className="track-lane">
      <div className="track-bar" aria-hidden="true"><i style={{width: fill + '%'}}/></div>
      <div className="track-nodes" role="group" aria-label="Награды за очки карнавала">
        {view.tiers.map((tier, index) => {
          const ready = tierReady(view, tier, now);
          const final = index === view.tiers.length - 1;
          const piece = firstPiece(tier.reward);
          const status = tier.claimed ? 'Получено' : ready ? 'Можно забрать' : 'Нужно ' + tier.points + ' очков';
          return <button key={tier.points} type="button"
            className={'tier-node' + (tier.claimed ? ' claimed' : ready ? ' ready' : '') + (final ? ' final' : '')}
            style={{'--at': (tier.points / max * 100) + '%'} as React.CSSProperties}
            aria-pressed={selected === tier.points} aria-label={(final ? 'Главный приз · ' : 'Порог ') + tier.points + ' · ' + status}
            onClick={() => select(tier.points)}>
            <span className="tier-box"><Icon name={final ? 'chest' : piece?.icon ?? 'gift'}/>{tier.claimed && <em aria-hidden="true">✓</em>}</span>
            <b>{tier.points}</b>
          </button>;
        })}
      </div>
    </div>
  </div>;
}

function TierPlaque({view, now, tier, final, busy, claim}: {view: CarnivalView; now: number; tier: CarnivalTier; final: boolean; busy: boolean; claim: () => void}) {
  const ready = tierReady(view, tier, now);
  const need = Math.max(0, tier.points - view.points);
  return <article className={'reward-plaque carnival-tier' + (final ? ' final' : '') + (ready ? ' ready' : '')}>
    <div className="reward-plaque-head">
      <strong>{final ? tier.title ?? 'Главный приз карнавала' : tier.title ?? 'Награда за ' + tier.points + ' очков'}</strong>
      <small>{tier.claimed ? '✓ Получено' : ready ? 'Готово!' : 'Ещё ' + need + ' очк.'}</small>
    </div>
    <div className="tier-row">
      <RewardArt reward={tier.reward} names/>
      {!tier.claimed && ready && <button type="button" className="carnival-btn claim" disabled={busy} onClick={claim}>Забрать</button>}
    </div>
  </article>;
}

function TaskCard({view, task, now, busy, actions, claim}: {view: CarnivalView; task: CarnivalTask; now: number; busy: boolean; actions: CarnivalActions; claim: () => void}) {
  const state = taskState(view, task, now);
  const progress = Math.min(task.progress, task.goal);
  const label = state === 'claimed' ? 'Получено' : state === 'ready' ? 'Забрать' : state === 'go' ? 'Перейти'
    : state === 'locked' ? 'Скоро' : 'Не успели';
  return <article className={'carnival-task ' + state}>
    <span className="task-icon"><Icon name={task.icon ?? 'star'}/></span>
    <div className="task-main">
      <strong>{task.text}</strong>
      <div className="task-progress">
        <span className="task-bar" aria-hidden="true"><i style={{width: progress / task.goal * 100 + '%'}}/></span>
        <small>{short(progress)} / {short(task.goal)}</small>
      </div>
      <div className="task-rewards">
        <span className="task-points" aria-label={'+' + task.points + ' очков карнавала'}><CarnivalToken/>+{task.points}</span>
        {task.reward && <RewardArt reward={task.reward}/>}
      </div>
    </div>
    {state === 'claimed'
      ? <span className="carnival-btn done" role="status">✓ Получено</span>
      : <button type="button" className={'carnival-btn ' + (state === 'ready' ? 'claim' : state === 'go' ? 'go' : 'idle')}
        disabled={busy || state === 'locked' || state === 'missed' || (state === 'go' && !task.route)}
        aria-label={label + ' · ' + task.text}
        onClick={() => state === 'ready' ? claim() : task.route && actions.go(task.route)}>{label}</button>}
  </article>;
}

function Finale({view, now, tier, hero, busy, claim}: {view: CarnivalView; now: number; tier: CarnivalTier; hero: string; busy: boolean; claim: () => void}) {
  const ready = tierReady(view, tier, now);
  const fill = Math.min(100, view.points / tier.points * 100);
  return <section className={'carnival-finale' + (tier.claimed ? ' claimed' : ready ? ' ready' : '')} aria-label="Главный приз карнавала">
    <div className="finale-rays" aria-hidden="true"/>
    <div className="finale-art" aria-hidden="true">
      <img className="finale-hero" src={art(hero)} alt="" draggable={false}/>
      <Icon name="chest" className="finale-chest"/>
    </div>
    <div className="finale-copy">
      <small>Главный приз · {tier.points} очков</small>
      <strong>{tier.title ?? 'Сундук Великого карнавала'}</strong>
      <RewardArt reward={tier.reward}/>
      <div className="finale-progress" aria-label={'Очки: ' + Math.min(view.points, tier.points) + ' из ' + tier.points}>
        <span><i style={{width: fill + '%'}}/></span><b>{Math.min(view.points, tier.points)}/{tier.points}</b>
      </div>
      {tier.claimed ? <span className="carnival-btn done" role="status">✓ Приз получен</span>
        : ready ? <button type="button" className="carnival-btn claim big" disabled={busy} onClick={claim}>Забрать главный приз</button>
        : null}
    </div>
  </section>;
}

export function CarnivalPanel({view, actions, now: fixedNow, hero = 'winged_helmet_warrior'}: {view: CarnivalView; actions: CarnivalActions; now?: number; hero?: string}) {
  const now = useCarnivalClock(fixedNow);
  const phase = carnivalPhase(view, now);
  const today = phase === 'soon' ? 1 : currentDay(view, now);
  const [day, setDay] = useState(today);
  const [tierSelection, selectTier] = useState<number>();
  // A tap disables only that control until the next committed view arrives (double-tap guard).
  const [pending, setPending] = useState<{view: CarnivalView; key: string} | null>(null);
  const busy = (key: string) => pending?.view === view && pending.key === key;
  const run = (key: string, fn: () => void) => {if (busy(key)) return; setPending({view, key}); fn()};

  const finalTier = view.tiers.at(-1)!;
  const tier = view.tiers.find(t => t.points === tierSelection)
    ?? view.tiers.find(t => tierReady(view, t, now))
    ?? view.tiers.find(t => !t.claimed && t.points > view.points) ?? finalTier;
  const tasks = view.tasks.filter(task => task.day === day);
  const done = tasks.filter(task => task.claimed).length;
  const open = dayOpen(view, day, now);

  return <section className="reward-window carnival-window">
    <Hero view={view} now={now} hero={hero}/>
    <TierTrack view={view} now={now} selected={tier.points} select={selectTier}/>
    {tier !== finalTier && <TierPlaque view={view} now={now} tier={tier} final={false}
      busy={busy('tier:' + tier.points)} claim={() => run('tier:' + tier.points, () => actions.claimTier(tier.points))}/>}
    <div className="carnival-days" role="tablist" aria-label="Дни карнавала">
      {Array.from({length: CARNIVAL_DAYS}, (_, i) => i + 1).map(n => {
        const opened = dayOpen(view, n, now), ready = dayReady(view, n, now);
        const all = view.tasks.filter(task => task.day === n);
        const complete = all.length > 0 && all.every(task => task.claimed);
        return <button key={n} type="button" role="tab" aria-selected={day === n}
          className={'carnival-day' + (n === today && phase === 'live' ? ' today' : '') + (opened ? '' : ' locked') + (complete ? ' complete' : '')}
          aria-label={'День ' + n + (ready ? ' · есть награды' : complete ? ' · всё получено' : opened ? '' : ' · откроется позже')}
          onClick={() => setDay(n)}>
          <small>День</small><b>{n}</b>
          {ready ? <i className="day-badge">!</i> : complete ? <i className="day-check">✓</i> : !opened ? <i className="day-lock" aria-hidden="true"/> : null}
        </button>;
      })}
    </div>
    <div className="carnival-day-head" role="tabpanel" aria-label={'Задания дня ' + day}>
      <strong>{day === today && phase === 'live' ? 'Сегодня · день ' + day : 'День ' + day}</strong>
      <small>{open ? 'Выполнено ' + done + ' из ' + tasks.length : 'Откроется через ' + shortCountdown(dayOpensAt(view, day) - now)}</small>
    </div>
    <div className="carnival-tasks">
      {tasks.map(task => <TaskCard key={task.id} view={view} task={task} now={now} actions={actions}
        busy={busy('task:' + task.id)} claim={() => run('task:' + task.id, () => actions.claimTask(task.id))}/>)}
    </div>
    {open && phase === 'live' && <p className="carnival-note">Открытые дни остаются доступными до конца карнавала.</p>}
    <Finale view={view} now={now} tier={finalTier} hero={hero}
      busy={busy('tier:' + finalTier.points)} claim={() => run('tier:' + finalTier.points, () => actions.claimTier(finalTier.points))}/>
  </section>;
}

/** Festive HUD medal; render it only while `carnivalVisible(view, now)` is true. */
export function CarnivalButton({view, onOpen, style, now: fixedNow}: {view: CarnivalView; onOpen: () => void; style?: React.CSSProperties; now?: number}) {
  const now = useCarnivalClock(fixedNow);
  const phase = carnivalPhase(view, now);
  const badge = view.tiers.some(t => tierReady(view, t, now)) || view.tasks.some(t => taskState(view, t, now) === 'ready');
  const left = phase === 'live' ? shortCountdown(view.endsAt - now) : 'Призы';
  return <button type="button" className="side side-right carnival-side" style={style}
    aria-label={'Великий карнавал · ' + (phase === 'live' ? 'осталось ' + left : 'заберите призы') + (badge ? ' · есть награды' : '')} onClick={onOpen}>
    <span className="carnival-medal"><CarnivalTent/>{badge && <i>!</i>}</span>
    <span className="carnival-label">Карнавал</span>
    <span className="carnival-chip">{left}</span>
  </button>;
}
