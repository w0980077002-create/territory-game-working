import {rarityColors,rarityNames} from '../data/catalog';
import {SagaItemLines} from './SagaPanels';
import {useState} from 'react';
import type {Item,Player,UniqueId} from '../core/types';
import {useGame,compareItem,bestUpgrade} from '../core/store';
import {uniqueOf,effectText,equippedUniques,uniques,gearRules,huntModes,buildGuides,type HuntMode} from '../core/gear';
import {upgradePreview} from '../core/forge';
import {stats} from '../core/formulas';
import {compareLootEffects} from '../core/lootEffects';
import {gearIcon,Icon} from './Icon';
import {battle} from '../game/Battle';
import {forgeFeedback} from './SagaUI';
export function UniqueEffect({item}:{item:Item}){const def=uniqueOf(item);return def?<div className={`unique-effect effect-${def.effect}`}><strong>✦ {def.tag}</strong><p>{effectText(def.effect)}</p><small>Свойство работает только на надетом предмете. Ситуационный эффект не входит в CP.</small></div>:null}
export function EffectComparison({item,p}:{item:Item;p:Player}){
 const {properties,bonuses}=compareLootEffects(item,p);
 if(!properties.length&&!bonuses.length)return null;
 return <div className="effect-comparison">
  <strong>Эффекты при замене</strong>
  {properties.map(({id,change,tag,text})=><p key={id}><b>{change} · {tag}</b><br/>{text}</p>)}
  {bonuses.map(({id,name,from,to,thresholds})=><div key={id}>
   <p><b>{name}</b> · {from===to?`${to}/6 сохраняется`:`${from}/6 → ${to}/6`}</p>
   {thresholds.map(({pieces,bonus,gained})=><p key={pieces}>{gained?'Получите':'Потеряете'} · {pieces} {pieces===2||pieces===4?'вещи':'вещей'} · {bonus}</p>)}
  </div>)}
  <small>CP отражает характеристики героя. Свойства могут менять тактику даже при меньшей силе.</small>
 </div>;
}
/** A new piece usually arrives at +0 while the worn one is sharpened: show the honest comparison after sharpening it
 * to the worn level, with the gold it costs. Display only — no economy change. */
export function SharpenedComparison({item,old,p}:{item:Item;old?:Item;p:Player}){
 if(!old||item.percent||old.upgrade<=item.upgrade)return null;
 let next=item,gold=0;
 for(let n=item.upgrade;n<old.upgrade;n++){const step=upgradePreview(next);gold+=step.cost;next=step.next}
 const delta=compareItem(next,p);
 return <p className={`trophy-value sharpened ${delta>=0?'positive':'negative'}`}>{`После заточки до +${old.upgrade}: ${delta>=0?'+':''}${delta} CP`}<small>{` · ${gold.toLocaleString('ru')} золота`}</small></p>;
}
export function UpgradePlan({item,p}:{item:Item;p:Player}){const {cost,next}=upgradePreview(item);const [confirm,setConfirm]=useState(false);const g=useGame(),costly=cost>p.gold*.25;return <div className="upgrade-plan"><strong>Следующее усиление: +{next.upgrade}</strong><div className="upgrade-stats">{item.percent&&next.percent?<>HP {item.percent.hp}% → {next.percent.hp}% · Атака {item.percent.attack}% → {next.percent.attack}% · Защита {item.percent.defense}% → {next.percent.defense}%</>:<>Атака {item.attack} → {next.attack} · HP {item.hp} → {next.hp} · Защита {item.defense} → {next.defense}</>}</div><p>CP героя: {stats(p).cp} → {stats(p).cp+compareItem(next,p)} · цена {cost} золота<br/><small>Доступно: {Math.floor(p.gold)} золота</small></p><button className="action" disabled={p.gold<cost||!Number.isFinite(cost)} onClick={()=>{if(costly&&!confirm){setConfirm(true);return}const before=useGame.getState().p.equipment[item.slot];g.upgrade(item.slot,{id:item.id,upgrade:item.upgrade});if(before)forgeFeedback(before);setConfirm(false)}}>{p.gold<cost?'Недостаточно золота':confirm?`Подтвердить +${next.upgrade} · ${cost} золота`:`Усилить +${next.upgrade} · ${cost} золота`}</button>{confirm&&<button className="action secondary" onClick={()=>setConfirm(false)}>Отмена</button>}</div>}
/** What changes if `item` replaces `old`: every stat and the hero's CP, signed and coloured. */
export function StatDelta({item,old,p}:{item:Item;old?:Item;p:Player}){
 const wings=!!item.percent,rows=(wings?[['Атака',item.percent!.attack-(old?.percent?.attack??0)],['HP',item.percent!.hp-(old?.percent?.hp??0)],['Защита',item.percent!.defense-(old?.percent?.defense??0)]]:[['Атака',item.attack-(old?.attack??0)],['HP',item.hp-(old?.hp??0)],['Защита',item.defense-(old?.defense??0)]]) as [string,number][],cp=compareItem(item,p),sign=(v:number)=>v>0?'+'+v:v<0?'−'+Math.abs(v):'0';
 return <div className="stat-delta" role="group" aria-label="Изменение характеристик при замене">{rows.map(([label,v])=><span key={label} className={v>0?'up':v<0?'down':''}><small>{label}</small><b>{sign(v)}{wings?'%':''}</b></span>)}<span className={`cp ${cp>0?'up':cp<0?'down':''}`}><small>Сила</small><b>{sign(cp)}</b></span></div>;
}
/** The strongest backpack piece for the open slot with a one-tap swap. */
export function QuickSwap({slot,p}:{slot:Item['slot'];p:Player}){
 const g=useGame(),best=bestUpgrade(p,slot);if(!best)return null;const worn=p.equipment[slot],named=!!worn&&(!!uniqueOf(worn)||!!worn.perk);
 return <div className="quick-swap" style={{'--rarity':rarityColors[best.item.rarity]} as React.CSSProperties}><div className="quick-swap-head"><Icon name={gearIcon(slot,best.item)}/><div><small>ЛУЧШАЯ ЗАМЕНА В РЮКЗАКЕ</small><strong>{best.item.name}</strong><em>{rarityNames[best.item.rarity]} · ур.{best.item.level}{best.item.upgrade?` +${best.item.upgrade}`:''}</em></div></div><StatDelta item={best.item} old={worn} p={p}/>{named&&<p className="hint">Надетая вещь именная: её особое свойство не входит в силу — решите сами, стоит ли менять.</p>}<div className="quick-swap-actions"><button className="action" onClick={()=>g.equip(best.item.id)}>Надеть</button><button className="action secondary" onClick={()=>g.select(best.item.id)}>Подробнее</button></div></div>;
}
export function BuildGuide({p}:{p:Player}){const guide=buildGuides[p.heroClass];return <div className="build-guide"><h3>Сборка: {guide.title}</h3><p>{guide.detail}</p><small>Можно носить любым классом — это ориентир для экспериментов.</small><div className="active-gear">{equippedUniques(p).length?equippedUniques(p).map(({item,def})=><div key={item.id}><b>✦ {item.name}</b><small>{effectText(def.effect)}</small></div>):<p>Уникальные свойства пока не надеты. Найдите свой первый трофей.</p>}</div></div>}
export function HuntGoals({p}:{p:Player}){return <div className="hunt-goals"><h3>Цель охоты</h3><p className="hint">Четыре встречи: золото, опыт и {Math.round(gearRules.regular_equipment_chance*100)}% шанс обычного снаряжения. Боссы: предмет всегда, именной — по шансу ниже.</p>{!p.claimed.includes('first-boss-relic')&&<div className="story-goal"><strong>Первый Матриарх → Клинок ледяного шёлка</strong><small>Гарантирован один раз за профиль · морозное замедление.</small></div>}{(Object.keys(huntModes) as HuntMode[]).map(mode=><div className="hunt-source" key={mode}><strong>{huntModes[mode]}</strong>{gearRules.drops[mode].map(row=>{const def=uniques[row.id as UniqueId],owned=[...Object.values(p.equipment),...p.inventory,...(p.pendingLoot??[])].some(i=>uniqueOf(i)===def);return <div className="hunt-item" key={row.id}><Icon name={gearIcon(def.slot)}/><div><b>{def.name} {owned?'✓':''}</b><small>{def.tag} · {Math.round(row.chance*100)}% за победу</small><p>{effectText(def.effect)}</p></div></div>})}<button className="action secondary" onClick={()=>battle?.startMode(mode)}>Выбрать {mode==='campaign'?'главу':mode==='dungeon'?'Логово':'Тьму'}</button></div>)}<small>За победу выпадает максимум один предмет. Именные трофеи заменяют обычный дроп; Благословение улучшает качество обычных вещей, а не шанс именного.</small></div>}

/** Explicit summary + full-width effects. No implicit grid placement of perks or sets. */
export function ItemDetails({item}:{item:Item}){
 const p=useGame(s=>s.p);
 return <article className="item-card" style={{'--rarity':rarityColors[item.rarity]} as React.CSSProperties}>
  <div className="item-summary"><Icon name={gearIcon(item.slot,item)}/><div className="item-copy"><h4>{item.name}</h4><small>{rarityNames[item.rarity]} · ур.{item.level} +{item.upgrade}{item.origin&&<><br/>{item.origin}</>}</small></div></div>
  <dl className="item-stats">{(item.percent?[['Атака',item.percent.attack+'%'],['HP',item.percent.hp+'%'],['Защита',item.percent.defense+'%']]:[['Атака',item.attack],['HP',item.hp],['Защита',item.defense]]).map(([label,value])=><div key={label}><dt>{label}</dt><dd>+{value}</dd></div>)}</dl>
  <UniqueEffect item={item}/><SagaItemLines item={item} p={p}/>
 </article>;
}
