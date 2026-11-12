/** Living World UI: one compact road-event card in the ribbon slot, a sound chip and the chronicle rows. */
import {useGame} from '../core/store';
import {useWorld} from '../game/worldUi';
import {battle} from '../game/Battle';
import {unlockAudio} from '../game/Sound';
import {feats,eventNames,boonById} from '../data/world-variants';
import {planLeg} from '../game/WorldEvents';
import {districts} from '../game/Journey';
import './world.css';
export function toggleSound(){const g=useGame.getState(),next=!g.p.sound;unlockAudio(next);g.mutate(p=>{p.sound=next});battle?.audioFrame()}
export function WorldHud(){
 const w=useWorld(),panel=useGame(s=>s.panel),sound=useGame(s=>s.p.sound),card=w.card;
 if(panel)return null;
 return <>
  <button className={`sound-chip ${sound?'on':''}`} onClick={toggleSound} aria-label={sound?'Выключить звук':'Включить звук'} aria-pressed={sound}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9Z" fill="currentColor"/>{sound?<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>:<path d="m16.5 9.5 5 5m0-5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>}</svg></button>
  {card&&<section className={`world-card kind-${card.kind}`} aria-label={card.title}>
   <header><small>{card.tag}</small><strong>{card.title}</strong><span>{card.text}</span></header>
   {(card.options.length>0||card.pass)&&<div className="world-options">
    {card.options.map(o=><button key={o.id} style={o.color?{'--tone':o.color} as React.CSSProperties:undefined} onClick={()=>battle?.director.choose(o.id)}><b>{o.label}</b><i>{o.detail}</i></button>)}
    {card.pass&&<button className="world-pass" onClick={()=>battle?.director.choose('pass')}>{card.pass}</button>}
   </div>}
   {card.total>0&&<div className="world-timer" aria-hidden="true"><i style={{width:`${Math.max(0,card.left/card.total*100)}%`}}/></div>}
  </section>}
 </>;
}
/** Suffix for Codex's status pill so an active blessing is always visible without a new HUD element. */
export function useRoadStatus(){const w=useWorld();return (w.boon?` · ${w.boon.name}`:'')+(w.gift?' · Зелье торговки':'')}
const rumours:Record<string,string>={cache:'пёс тянет носом к обочине',caravan:'на дороге слышен скрип саней и крики',ambush:'птицы над дорогой неспокойны',altar:'в воздухе звенят руны',omen:'у цитадели дурные приметы'};
/** Compact rows inside the existing «Путь героя» panel: next lead, achievements, last chronicle lines. */
export function Chronicle(){
 const p=useGame(s=>s.p),weather=useWorld(s=>s.weather),world=p.world,plan=planLeg(world,p.stage,p.wave),boon=boonById(world?.boon?.id);
 return <div className="chronicle">
  <h3>Дорога впереди</h3>
  <p className="lead"><b>{districts[(p.wave-1)%5]}</b>{weather?` · ${weather}`:''}<br/>{plan?`Говорят, ${rumours[plan.kind]}.`:'Дорога спокойна — враг ждёт на месте.'}{boon&&<><br/>Активна {boon.name}: {boon.short}.</>}</p>
  <h3>Достижения пути · {world?.feats.length??0}/{feats.length}</h3>
  <ul>{feats.map(f=>{const done=!!world?.feats.includes(f.id),n=Math.min(f.goal,world?.counts[f.count]??0);return <li key={f.id} className={done?'done':''}><b>{done?'✓':'○'} {f.title}</b><span>{f.detail}</span><i>{done?'получено':`${n}/${f.goal}`} · {f.gold?`${f.gold} золота`:''}{f.gold&&f.gems?' + ':''}{f.gems?`${f.gems} самоцв.`:''}</i></li>})}</ul>
  {!!world?.log.length&&<><h3>Летопись</h3><ol>{[...world.log].reverse().map((line,n)=><li key={n}>{line}</li>)}</ol></>}
  <p className="hint">События дороги: {Object.values(eventNames).join(', ').toLowerCase()}. Награды тестовые (TEST_ONLY) и выдаются один раз.</p>
 </div>;
}
