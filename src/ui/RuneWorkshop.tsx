import {useRepeatAction} from './useRepeatAction';
import {useState} from 'react';
import type {Player} from '../core/types';
import {skillData} from '../data/catalog';
import {applyRuneAction,runeBonuses,runeRules,runeState,runeUpgradeCost} from '../saga/runes';
import {balanceOf,dailyVictoryRewards} from '../saga/soloEconomy';
import {soloAction} from '../saga/soloAction';
import {CardDialog} from './SagaUI';
import {Icon} from './Icon';

export function RuneWorkshop({p}:{p:Player}){
 const repeat=useRepeatAction();
 const [tab,setTab]=useState<'runes'|'passives'|'resonance'>('runes');
 const [selected,setSelected]=useState<number|null>(null);
 const state=runeState(p),{rank}=runeBonuses(p),scrolls=balanceOf(p,'scroll');
 const apply=(action:Parameters<typeof applyRuneAction>[1],message:string)=>soloAction(draft=>applyRuneAction(draft,action,state.revision),message);
 const groups=[['runes','Руны'],['passives','Пассивы'],['resonance','Резонанс']] as const;
 return <section className="skill-card">
  <div className="tabs">{groups.map(([id,name])=><button key={id} aria-pressed={tab===id} className={tab===id?'selected':''} onClick={()=>setTab(id)}>{name}</button>)}</div>
  {tab==='runes'&&<>
   <h3><Icon name="rune"/> Таинственные свитки · {scrolls}</h3>
   <p>{dailyVictoryRewards.map(reward=>'+'+reward.scroll+' за победу №'+reward.win).join(', ')} каждый день (UTC). Шанс каждой руны 1 из 9, повтор даёт пыль. Пыль · {state.dust}.</p>
   <button className="action" disabled={scrolls<runeRules.summon} onClick={()=>repeat(()=>apply({kind:'summon'},'Результат призыва сохранён'))}>Призвать руну · {runeRules.summon} свитков</button>
   {state.last!==null&&<p>Последний призыв · {skillData[Math.floor(state.last/3)].runes[state.last%3]}</p>}
   <div className="bonus-card">{state.ranks.map((level,id)=>{
    const skill=skillData[Math.floor(id/3)],cost=runeUpgradeCost(level,state.dust);
    return <div className="skill-card" key={id}><b>{skill.runes[id%3]}</b><p>{skill.name} · {p.runes[Math.floor(id/3)]===id%3?'выбрана':'в запасе'} · бонус {Math.round(level*runeRules.upgradeEffect*100)}%{level<runeRules.rankCosts.length?' → '+Math.round((level+1)*runeRules.upgradeEffect*100)+'%':''}</p>
     {!level?<button className="action secondary" disabled={state.dust<runeRules.unlockDust} onClick={()=>apply({kind:'craft',id},'Руна открыта')}>Открыть · {runeRules.unlockDust} пыли</button>:cost?<button className="action secondary" disabled={scrolls<cost.scrolls} onClick={()=>repeat(()=>apply({kind:'rank',id},'Руна усилена'))}>Усилить · {cost.scrolls} свитков{cost.dust>0?' и '+cost.dust+' пыли':''}</button>:<span>Максимальный ранг</span>}
    </div>;
   })}</div>
  </>}
  {tab==='passives'&&<div className="bonus-card">{runeRules.passives.map((rule,id)=><span key={rule.name}>
   <b>{rule.name}</b> {rule.text} · ур. героя {rule.level}
   <button className="action secondary" disabled={p.level<rule.level||state.passive===id} onClick={()=>setSelected(id)}>{state.passive===id?'Выбран':'Выбрать'}</button>
  </span>)}</div>}
  {tab==='resonance'&&<><h3>Уровень резонанса · {rank}</h3><p>Сумма рангов всех открытых рун.</p><ol className="bonus-card">{runeRules.resonance.map(rule=><li key={rule.ranks}>{rank>=rule.ranks?'✓':'○'} {rule.ranks} · {rule.name} +{(rule.amount*100).toLocaleString('ru')}%</li>)}</ol></>}
  {selected!==null&&<CardDialog title="Выбор пассивного навыка" onClose={()=>setSelected(null)} actions={<button className="action" onClick={()=>{if(apply({kind:'passive',id:selected},'Пассивный навык выбран'))setSelected(null)}}>Подтвердить</button>}>
   <p>{runeRules.passives[selected].name} · {runeRules.passives[selected].text}. Выбор заменяет прежний пассивный навык.</p><button className="action secondary" onClick={()=>setSelected(null)}>Отмена</button>
  </CardDialog>}
 </section>;
}
