import {combatAura} from '../dark/rules';
import {useState} from 'react';
import type {Player} from '../core/types';
import {useGame} from '../core/store';
import {odinCallSeconds,odinCallMaxLevel,skillPowerMultiplier,stats} from '../core/formulas';
import {skillData} from '../data/catalog';
import {runeName,applyRuneAction,runeBonuses,runeRules,runeState,runeUpgradeCost,runeMultiplier} from '../saga/runes';
import {balanceOf,dailyVictoryRewards} from '../saga/soloEconomy';
import {soloAction} from '../saga/soloAction';
import {bumpCount} from '../saga/save';
import {hasPerk,setCounts} from '../saga/gear';
import {specId} from '../saga/specs';
import {sound,unlockAudio} from '../game/Sound';
import {CardDialog} from './SagaUI';
import {Icon} from './Icon';
import {GameTabs,GameTile,GameTiles} from './CompactGame';
import {useRepeatAction} from './useRepeatAction';

const groups=[['skills','Навыки'],['runes','Руны'],['passives','Пассивы'],['resonance','Резонанс']] as const;
const skillIcons=['axe','horn','lightning'],runeIcons=['fire','lightning','potion','crown','shield','refresh','axe','lightning','coins'];
const passiveIcons=['heart','axes','armor'],resonanceIcons=['axes','heart','lightning','shield','rune','armor'];
const number=(value:number)=>value.toLocaleString('ru',{maximumFractionDigits:1});
type Detail={kind:'skill'|'rune'|'passive'|'resonance';id:number}|{kind:'summon'|'dust'};

export function RuneWorkshop({p}:{p:Player}){
 const game=useGame.getState(),repeat=useRepeatAction();
 const [tab,setTab]=useState<typeof groups[number][0]>('skills');
 const [detail,setDetail]=useState<Detail|null>(null),[confirm,setConfirm]=useState(false);
 const state=runeState(p),{rank}=runeBonuses(p),scrolls=balanceOf(p,'scroll');
 const inspect=(next:Detail)=>{setConfirm(false);setDetail(next)};
 const close=()=>setDetail(null);
 const apply=(action:Parameters<typeof applyRuneAction>[1],message:string)=>soloAction(draft=>applyRuneAction(draft,action,state.revision),message);
 const choose=(i:number,n:number)=>{
  if(p.runes[i]===n)return;
  if(game.mutate(draft=>{draft.runes[i]=n;bumpCount(draft,'carnival:rune')},true)){unlockAudio(p.sound);sound('rune',p.sound)}
 };
 const effect=(i:number,lv:number)=>i===1?number(odinCallSeconds(lv,hasPerk(p,'echo')))+' сек':number((i===0?2.2:1.2)*skillPowerMultiplier(lv)*runeMultiplier(p,i)*stats(p).skillDamage*100)+'% атаки за удар';
 const skillDetail=(id:number)=>{
  const skill=skillData[id],level=p.skills[id],max=id===1&&level>=odinCallMaxLevel,cost=120*level;
  const sets=setCounts(p),talent=specId(p);
  return <CardDialog className="game-detail" title={skill.name} onClose={close} actions={!max&&<button className="action" disabled={p.gold<cost} onClick={()=>game.train('skill',id)}>Улучшить · {number(cost)} золота</button>}>
   <p><strong>{id===1?level+'/'+odinCallMaxLevel+' · '+(max?'максимум длительности':'длительность'):'Ур. '+level}</strong> · {effect(id,level)}{!max&&' → '+effect(id,level+1)}</p>
   <p>Базовая перезарядка · {skill.cd} сек. {(sets.rune>=4||combatAura(p).cooldownRate>1)&&'С комплектом и реликвиями · '+number(skill.cd*(sets.rune>=4?.85:1)/combatAura(p).cooldownRate)+' сек.'}</p>
   {id===1&&<p>Обычные удары +{number(30*runeMultiplier(p,id))}% на время Клича. {hasPerk(p,'echo')?'Эхо добавляет 3 секунды и щит.':'Эхо может увеличить длительность на 3 секунды.'}</p>}
   {id===2&&<p>{sets.rune>=6?4:3} удара {talent==='chain'||p.runes[id]===1?'по одним–трём целям':'по одной цели'}.</p>}
   <p>{skill.runes[p.runes[id]]}{id===1&&p.runes[id]===2?' других навыков':''}.</p>
   {id===2&&p.runes[id]===2&&<p>До 20% базового золота за добивание и до 40% за победу. В Царстве Тьмы бонус не начисляется.</p>}
   {!max&&p.gold<cost&&<p className="hint">Не хватает {number(cost-p.gold)} золота</p>}
  </CardDialog>;
 };
 const runeDetail=(id:number)=>{
  const i=Math.floor(id/3),n=id%3,level=state.ranks[id],cost=runeUpgradeCost(level,state.dust),selected=p.runes[i]===n;
  return <CardDialog className="game-detail" title={runeName(id)} onClose={close}>
   <p>{skillData[i].name} · {skillData[i].runes[n]}</p>
   {i===2&&n===2&&<p>До 20% базового золота за добивание и до 40% за победу. В Царстве Тьмы бонус не начисляется.</p>}
   <p>{selected?'Выбран базовый вариант':'Можно выбрать бесплатно'} · {level?'Ранг '+level:'Ранг не открыт'}</p>
   <p>{i===1?'Бонус к силе Клича':'Бонус к урону навыка'} · +{number(level*runeRules.upgradeEffect*100)}%{level<runeRules.rankCosts.length?' → +'+number((level+1)*runeRules.upgradeEffect*100)+'%':' · максимум'}</p>
   <div className="game-actions"><button className="action secondary" disabled={selected} onClick={()=>choose(i,n)}>Выбрать вариант</button>
    {!level?<button className="action" disabled={state.dust<runeRules.unlockDust} onClick={()=>apply({kind:'craft',id},'Руна открыта')}>Открыть ранг · {runeRules.unlockDust} пыли</button>:cost&&<button className="action" disabled={scrolls<cost.scrolls} onClick={()=>repeat(()=>apply({kind:'rank',id},'Руна усилена'))}>Усилить · {cost.scrolls} свитков{cost.dust?' + '+cost.dust+' пыли':''}</button>}
   </div>
   {!level&&state.dust<runeRules.unlockDust&&<small>Пыль {state.dust}/{runeRules.unlockDust} · из повторных рун</small>}
   {cost&&scrolls<cost.scrolls&&<small>Свитки {scrolls}/{cost.scrolls}</small>}
  </CardDialog>;
 };
 return <>
  <GameTabs value={tab} items={groups} onChange={setTab} label="Развитие навыков"/>
  {tab==='skills'&&<div className="active-skill-list">{skillData.map((skill,i)=><div className="skill-card active-skill" key={skill.name}>
   <button className="game-metric" onClick={()=>inspect({kind:'skill',id:i})}><Icon name={skillIcons[i]}/><span>{skill.name}<br/><small>Ур. {p.skills[i]}{i===1?'/'+odinCallMaxLevel:''}</small></span></button>
   <div className="rune-options" aria-label={'Варианты · '+skill.name}>{skill.runes.map((r,n)=><button key={r} aria-label={r+' · бесплатно'} className={p.runes[i]===n?'selected':''} aria-pressed={p.runes[i]===n} onClick={()=>choose(i,n)}><Icon name={runeIcons[i*3+n]}/><small>{runeName(i*3+n)}</small></button>)}</div>
  </div>)}</div>}
  {tab==='runes'&&<>
   <div className="game-metrics"><button className="game-metric" aria-label={'Свитки · '+scrolls} onClick={()=>inspect({kind:'summon'})}><Icon name="scroll"/>{scrolls}</button>
    <button className="game-metric" aria-label={'Рунная пыль · '+state.dust} onClick={()=>inspect({kind:'dust'})}><Icon name="essence"/>{state.dust}</button>
    <button className="game-metric" onClick={()=>inspect({kind:'summon'})}><Icon name="rune"/>Призвать руну</button>
   </div>
   <GameTiles>{state.ranks.map((level,id)=><GameTile key={id} label={runeName(id)} icon={runeIcons[id]} value={level?'Ранг '+level:'Без ранга'} active={p.runes[Math.floor(id/3)]===id%3} onClick={()=>inspect({kind:'rune',id})}/>)}</GameTiles>
  </>}
  {tab==='passives'&&<GameTiles>{runeRules.passives.map((rule,id)=><GameTile key={id} label={rule.name} icon={passiveIcons[id]} value={p.level<rule.level?'Ур. '+rule.level:rule.text} active={state.passive===id} locked={p.level<rule.level} onClick={()=>inspect({kind:'passive',id})}/>)}</GameTiles>}
  {tab==='resonance'&&<><div className="rune-emblem"><Icon name="rune"/><b>Резонанс · {rank}</b></div><GameTiles>{runeRules.resonance.map((rule,id)=><GameTile key={id} label={rule.name} icon={resonanceIcons[id]} value={(rank>=rule.ranks?'✓ ':'')+rule.ranks} locked={rank<rule.ranks} onClick={()=>inspect({kind:'resonance',id})}/>)}</GameTiles></>}
  {detail?.kind==='skill'&&skillDetail(detail.id)}
  {detail?.kind==='rune'&&runeDetail(detail.id)}
  {detail?.kind==='passive'&&(()=>{
   const rule=runeRules.passives[detail.id],id=detail.id;
   return <CardDialog className="game-detail" title={rule.name} onClose={close} actions={<div className="game-actions">
    <button className="action" disabled={p.level<rule.level||state.passive===id} onClick={()=>{if(!confirm)setConfirm(true);else if(apply({kind:'passive',id},'Пассивный навык выбран'))close()}}>{confirm?'Подтвердить':'Выбрать'}</button>
    <button className="action secondary" onClick={close}>Отмена</button>
   </div>}><p>{rule.text} · ур. героя {rule.level}</p>{confirm&&<p>Заменить действующий пассивный навык?</p>}</CardDialog>;
  })()}
  {detail?.kind==='resonance'&&(()=>{const rule=runeRules.resonance[detail.id];return <CardDialog className="game-detail" title={rule.name} onClose={close}><p>+{number(rule.amount*100)}% · {Math.min(rank,rule.ranks)}/{rule.ranks} рангов</p><p>Учитываются ранги всех открытых рун.</p></CardDialog>})()}
  {detail?.kind==='summon'&&<CardDialog className="game-detail" title="Призыв рун" onClose={close} actions={<button className="action" disabled={scrolls<runeRules.summon} onClick={()=>repeat(()=>apply({kind:'summon'},'Результат призыва сохранён'))}>Призвать руну · {runeRules.summon} свитков</button>}>
   <p>Свитки {scrolls}/{runeRules.summon}. Шанс каждой руны 1 из 9. Повтор даёт пыль.</p>
   <p>{dailyVictoryRewards.map(reward=>'+'+reward.scroll+' за победу №'+reward.win).join(', ')} ежедневно. Свитки также продаются в Лавке.</p>
   {state.last!==null&&<p>Последний призыв · {runeName(state.last)}</p>}
  </CardDialog>}
  {detail?.kind==='dust'&&<CardDialog className="game-detail" title="Рунная пыль" onClose={close}><p>Запас · {state.dust}. Повторная руна даёт {runeRules.duplicateDust} пыль. {runeRules.unlockDust} пыли открывают выбранный ранг. При усилении пыль уменьшает расход свитков.</p></CardDialog>}
 </>;
}
