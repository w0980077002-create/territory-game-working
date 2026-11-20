import {useEffect,useId,useState} from 'react';
import type {Slot} from '../../core/types';
import {art,heroArt,rarityNames,slotNames} from '../../data/catalog';
import {carnivalNow} from '../../core/profile';
import {claimCarnivalReward,useGame} from '../../core/store';
import {battle} from '../../game/Battle';
import {carnivalView,type CarnivalView} from '../../saga/carnival';
import type {CarnivalRoute} from '../../saga/carnivalRules';
import {sets} from '../../saga/gear';
import {rewardText} from '../../saga/rewards';
import {Icon} from '../Icon';
import {RewardArt,rewardParts} from '../RewardArt';
import {Bunting,CarnivalTent,CarnivalToken,Firework} from './CarnivalArt';
import {countdown,shortCountdown} from './model';
import '../eventRewards.css';
import './carnival.css';

type Period = NonNullable<CarnivalView['period']>;
type Milestone = Period['milestones'][number];
type Task = Period['days'][number]['tasks'][number];
type Objective = Task['primary'];

function useCarnival() {
  const player=useGame(state=>state.p);
  const [now,setNow]=useState(carnivalNow);
  useEffect(()=>{
    const tick=()=>setNow(carnivalNow());
    const timer=window.setInterval(tick,1000);
    document.addEventListener('visibilitychange',tick);
    return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick)};
  },[]);
  return {event:carnivalView(player,now),hero:heroArt[player.heroClass],now};
}

const nextDate=(time:number)=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(time);
function timerText(event:CarnivalView,now:number,archived=false){
  if(event.clockBlocked)return 'Проверьте дату и время устройства';
  if(archived)return 'Награды прошлых карнавалов';
  if(event.remainingMs!==null)return 'Осталось '+countdown(event.remainingMs);
  return 'До начала '+countdown(event.nextStartAt-now);
}

function Hero({timer,active,hero}:{timer:string;active:boolean;hero:string}) {
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
      <span className={'carnival-timer' + (active ? '' : ' muted')} role="timer" aria-live="off">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8.5" fill="#fff3c4" stroke="#3b2214" strokeWidth="2.4"/><path d="M12 8.5V13l3 2M9 2.5h6" stroke="#3b2214" strokeWidth="2.4" strokeLinecap="round" fill="none"/></svg>
        {timer}
      </span>
    </div>
    <i className="confetti" aria-hidden="true">{Array.from({length: 14}, (_, i) => <b key={i} style={{'--i': i} as React.CSSProperties}/>)}</i>
  </div>;
}

function displayReward(prize:Milestone|Task){
  return prize.partiallyClaimed?{horn:prize.hornRemaining}:prize.reward;
}

function TierTrack({period,selected,select}:{period:Period;selected:number;select:(points:number)=>void}){
  const fill=Math.min(100,period.points/period.targetPoints*100);
  return <div className="carnival-track">
    <div className="carnival-points" aria-label={'Очки карнавала: '+period.points}><CarnivalToken/><b>{period.points}</b><small>очков</small></div>
    <div className="track-lane">
      <div className="track-bar" aria-hidden="true"><i style={{width:fill+'%'}}/></div>
      <div className="track-nodes" role="group" aria-label="Награды за очки карнавала">
        {period.milestones.map(tier=>{
          const final=!!tier.gear,claimed=tier.status==='claimed',ready=tier.status==='claimable';
          const piece=rewardParts(displayReward(tier))[0];
          const status=claimed?'Получено':ready?'Можно забрать':'Нужно '+tier.points+' очков';
          return <button key={tier.id} type="button" className={'tier-node '+(claimed?'claimed':ready?'ready':'')+(final?' final':'')}
            style={{'--at':(tier.points/period.targetPoints*100)+'%'} as React.CSSProperties} aria-pressed={selected===tier.points}
            aria-label={(final?'Главный приз · ':'Порог ')+tier.points+' · '+status} onClick={()=>select(tier.points)}>
            <span className="tier-box"><Icon name={final?'chest':piece?.icon??'gift'}/>{claimed&&<em aria-hidden="true">✓</em>}</span><b>{tier.points}</b>
          </button>;
        })}
      </div>
    </div>
  </div>;
}

function PrizeButton({prize,claim,label}:{prize:Milestone|Task;claim:()=>void;label?:string}){
  if(prize.status==='claimed')return <span className="carnival-btn done">✓ Получено</span>;
  if(prize.status!=='claimable')return null;
  return <button type="button" className="carnival-btn claim" onClick={claim}
    aria-label={label}>{prize.partiallyClaimed?'Забрать заряды':'Забрать'}</button>;
}

function ObjectiveRow({objective,active,go}:{objective:Objective;active:boolean;go:(route:CarnivalRoute)=>void}){
  const route=objective.route;
  return <div className="carnival-objective">
    <strong>{objective.text}</strong>
    <div className="task-progress">
      <span className="task-bar" aria-hidden="true"><i style={{width:objective.progress/objective.target*100+'%'}}/></span>
      <small>{objective.progress} / {objective.target}</small>
    </div>
    {active&&route&&<button type="button" className="carnival-btn go"
      aria-label={'Перейти · '+objective.text} onClick={()=>go(route)}>Перейти</button>}
  </div>;
}

function TaskCard({task,claim,go}:{task:Task;claim:()=>void;go:(route:CarnivalRoute)=>void}){
  return <article className={'carnival-task '+task.status}>
    <span className="task-icon"><Icon name="star"/></span>
    <div className="task-main">
      <ObjectiveRow objective={task.primary} active={task.acceptsProgress} go={go}/>
      {task.alternative&&<><small className="carnival-or">или</small><ObjectiveRow objective={task.alternative} active={task.acceptsProgress} go={go}/></>}
      <div className="task-rewards">
        <span className="task-points" aria-label={'+'+task.points+' очков карнавала'}><CarnivalToken/>+{task.points}</span>
        <RewardArt reward={task.reward}/>
        <PrizeButton prize={task} claim={claim} label={'Забрать · '+task.primary.text}/>
      </div>
    </div>
  </article>;
}

function Finale({period,tier,hero,claim}:{period:Period;tier:Milestone;hero:string;claim:(slot:Slot)=>void}){
  const gear=tier.gear;
  const id=useId();
  const [slot,setSlot]=useState<Slot>('weapon');
  const fill=Math.min(100,period.points/tier.points*100);
  if(!gear)return null;
  return <section className={'carnival-finale '+(tier.status==='claimed'?'claimed':tier.status==='claimable'?'ready':'')} aria-label="Главный приз карнавала">
    <div className="finale-rays" aria-hidden="true"/>
    <div className="finale-art" aria-hidden="true"><img className="finale-hero" src={art(hero)} alt="" draggable={false}/><Icon name="chest" className="finale-chest"/></div>
    <div className="finale-copy">
      <small>Главный приз · {tier.points} очков</small>
      <strong>{sets[gear.set].name} · {rarityNames[gear.rarity]} · ур. {gear.level}</strong>
      <RewardArt reward={tier.reward}/>
      <div className="finale-progress" aria-label={'Очки: '+Math.min(period.points,tier.points)+' из '+tier.points}>
        <span><i style={{width:fill+'%'}}/></span><b>{Math.min(period.points,tier.points)}/{tier.points}</b>
      </div>
      {tier.status==='claimed'&&<span className="carnival-btn done">✓ Приз получен</span>}
      {tier.status==='claimable'&&<>
        <label htmlFor={id}>Место экипировки</label>
        <select id={id} value={slot} onChange={e=>{const choice=gear.slots.find(value=>value===e.target.value);if(choice)setSlot(choice)}}>
          {gear.slots.map(value=><option key={value} value={value}>{slotNames[value]}</option>)}
        </select>
        <button type="button" className="carnival-btn claim big" onClick={()=>claim(slot)}>Забрать главный приз</button>
      </>}
    </div>
  </section>;
}

function PeriodPanel({period,active,now,hero}:{period:Period;active:boolean;now:number;hero:string}){
  const open=useGame(state=>state.open);
  const notice=useGame(state=>state.notice);
  const today=period.days.filter(day=>day.unlocked).at(-1)?.day??1;
  const [selection,setSelection]=useState({day:today,tier:0});
  const [hornFull,setHornFull]=useState(false);
  const day=period.days[selection.day-1];
  const tier=period.milestones.find(entry=>entry.points===selection.tier)
    ??period.milestones.find(entry=>entry.status==='claimable')
    ??period.milestones.find(entry=>entry.status==='locked')
    ??period.milestones[0];
  const finalTier=period.milestones.at(-1)!;
  const claim=(prize:Milestone|Task,slot?:Slot)=>{
    const result=claimCarnivalReward(period.id,prize.id,slot);
    setHornFull(result.status==='horn_full');
    switch(result.status){
      case 'claimed':
      case 'partial': {
        const item=result.item;
        const message=[rewardText(result.reward),item&&item.name+(item.destination==='storage'?' · на складе':' · в рюкзаке')].filter(Boolean).join(' · ');
        notice((message?'Получено: '+message:'')+(result.status==='partial'?' · Оставшиеся заряды можно забрать позже':''));
        break;
      }
      case 'horn_full': notice('Рог полон. Потратьте заряды и вернитесь за призом'); break;
      case 'save_failed': notice('Приз не сохранён. Повторите попытку'); break;
      case 'choose_slot': notice('Выберите место экипировки'); break;
    }
  };
  const go=(route:CarnivalRoute)=>{
    if(route==='campaign'||route==='farm')battle?.startMode(route);
    else if(route==='dungeon')open('lair');
    else open(route);
  };
  const done=day.tasks.filter(task=>task.status==='claimable'||task.status==='claimed').length;
  return <>
    <TierTrack period={period} selected={tier.points} select={points=>setSelection(current=>({...current,tier:points}))}/>
    {tier!==finalTier&&<article className="reward-plaque carnival-tier">
      <div className="reward-plaque-head"><strong>Награда за {tier.points} очков</strong>
        <small>{tier.status==='locked'?'Ещё '+(tier.points-period.points)+' очк.':tier.status==='claimed'?'Получено':'Можно забрать'}</small>
      </div>
      <div className="tier-row"><RewardArt reward={displayReward(tier)} names/>
        <PrizeButton prize={tier} claim={()=>claim(tier)}/></div>
      {hornFull&&tier.partiallyClaimed&&<button className="carnival-btn go" onClick={()=>open('loot')}>К Рогу Трофеев</button>}
    </article>}
    <div className="carnival-daybook">
    <div className="carnival-days" role="tablist" aria-orientation="vertical" aria-label="Дни карнавала">
      {period.days.map(entry=>{
        const ready=entry.tasks.some(task=>task.status==='claimable'),complete=entry.tasks.every(task=>task.status==='claimed');
        return <button key={entry.day} type="button" role="tab" aria-selected={day.day===entry.day}
          className={'carnival-day'+(entry.day===today&&active?' today':'')+(entry.unlocked?'':' locked')+(complete?' complete':'')}
          aria-label={'День '+entry.day+(ready?' · есть награды':complete?' · всё получено':entry.unlocked?'':' · откроется позже')}
          onClick={()=>setSelection(current=>({...current,day:entry.day}))}>
          <b>{entry.day}</b><small>DAY</small>
          {ready?<i className="day-badge">!</i>:complete?<i className="day-check">✓</i>:!entry.unlocked?<i className="day-lock" aria-hidden="true"/>:null}
        </button>;
      })}
    </div>
    <div className="carnival-daypage">
    <div className="carnival-day-head" role="tabpanel" aria-label={'Задания дня '+day.day}>
      <strong>{day.title}</strong>
      <small>{day.unlocked?'Выполнено '+done+' из '+day.tasks.length:'Откроется через '+shortCountdown(day.unlockAt-now)}</small>
    </div>
    <div className="carnival-tasks">{day.tasks.map(task=><TaskCard key={task.id} task={task} claim={()=>claim(task)} go={go}/>)}</div>
    </div>
    </div>
    <Finale period={period} tier={finalTier} hero={hero} claim={slot=>claim(finalTier,slot)}/>
  </>;
}

export function CarnivalPanel(){
  const {event,hero,now}=useCarnival();
  const [history,selectHistory]=useState<string>();
  const archived=event.past.find(period=>period.id===history);
  const period=archived??event.period??event.past[0];
  const active=!!event.period&&period===event.period&&event.remainingMs!==null;
  return <section className="reward-window carnival-window">
    <Hero timer={timerText(event,now,!!(period&&period!==event.period))} active={active} hero={hero}/>
    {event.past.length>0&&<label className="carnival-period">Период
      <select value={period?.id??''} onChange={e=>selectHistory(e.target.value)}>
        {event.period&&<option value={event.period.id}>{event.period.id} · текущий</option>}
        {event.past.map(previous=><option key={previous.id} value={previous.id}>{previous.id} · награды</option>)}
      </select>
    </label>}
    {period?<PeriodPanel key={period.id} period={period} active={active} now={now} hero={hero}/>
      :<p className="carnival-note">Следующий карнавал — {nextDate(event.nextStartAt)}, 00:00 UTC.</p>}
  </section>;
}

export function CarnivalEntry(){
  const {event,now}=useCarnival();
  const open=useGame(state=>state.open);
  const active=event.remainingMs!==null;
  return <button type="button" className="carnival-entry reward-plaque" onClick={()=>open('carnival')}>
    {active?<CarnivalTent/>:<Icon name="event"/>}
    <span><strong>Великий карнавал</strong><small>{timerText(event,now,!active&&event.hasClaimable)}</small></span>
    {event.hasClaimable&&<b aria-label="Есть награды">!</b>}
  </button>;
}
