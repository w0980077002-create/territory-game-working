import {useState,type ReactNode} from 'react';
import {GameTabs,GameTile,GameTiles} from './CompactGame';
import {CardDialog} from './SagaUI';
import {Icon} from './Icon';
import type {Player} from '../core/types';
import {stats} from '../core/formulas';
import {useGame} from '../core/store';
import {art} from '../data/catalog';
import {balanceOf,soloResources} from '../saga/soloEconomy';
import {heroTracks,trackClaimed,claimTrack,wingRank,wingRules,wingBonuses,growWings,wingLooks} from '../saga/soloProgress';
import {soloAction} from '../saga/soloAction';
import {RewardDetails} from './RewardArt';

export function HeroTracks({p,onGo}:{p:Player;onGo?:(route:string)=>void}){
 const open=useGame(s=>s.open),[selected,setSelected]=useState<string|null>(null);
 const icons=['book','gem','crown','map','arena','wings'];
 const track=heroTracks.find(track=>track.id===selected);
 return <>
  <GameTiles columns={2}>{heroTracks.map((track,i)=>{
   const progress=track.value(p),next=track.targets.findIndex((_,i)=>!trackClaimed(p,track.id,i));
   return <GameTile key={track.id} label={track.name} icon={icons[i]} ready={next>=0&&progress>=track.targets[next]} value={next<0?'✓ Получено':Math.min(track.targets[next],progress)+'/'+track.targets[next]} onClick={()=>setSelected(track.id)}/>;
  })}</GameTiles>
  {track&&<CardDialog className="game-detail fund-detail" title={track.name} onClose={()=>setSelected(null)} actions={<button className="action secondary" onClick={()=>{setSelected(null);(onGo??open)(track.route)}}>Перейти к условию</button>}>
   <div className="event-thresholds">{track.targets.map((target,i)=>{
    const filled=track.value(p)>=target,claimed=trackClaimed(p,track.id,i);
    return <div className="event-threshold" key={target} data-ready={filled&&!claimed||undefined}><b>{Math.min(track.value(p),target)}/{target}</b><RewardDetails reward={track.reward(i)}/>
     {filled&&!claimed?<button className="action secondary" onClick={()=>soloAction(draft=>claimTrack(draft,track.id,i),'Награда получена')}>Забрать</button>:<small>{claimed?'✓':'Закрыто'}</small>}
    </div>;
   })}</div>
  </CardDialog>}
 </>;
}
const wingTabs=[['gear','Экипировка'],['grow','Рост'],['looks','Внешность']] as const;
export function WingGrowth({p,gear}:{p:Player;gear:ReactNode}){
 const open=useGame(s=>s.open),claim=useGame(s=>s.claim);
 const [tab,setTab]=useState<typeof wingTabs[number][0]>('gear');
 const rank=wingRank(p),value=balanceOf(p,'wing'),cost=wingRules.cost[rank],current=wingBonuses(rank),next=wingBonuses(rank+(cost?1:0));
 const wings=p.equipment.wings;
 const labels=['Здоровье','Атака','Защита'],icons=['heart','axe','shield'];
 return <section>
  <div className="wear-summary"><img src={art('ui-wings')} alt=""/><div><strong>{wings?.name??'Слот свободен'}</strong><small>{wings?'Ур. '+wings.level+' · +'+wings.upgrade+' · '+(p.wingVisible?'видны':'скрыты'):'Крылья'}</small></div></div>
  {wings&&<div className="game-metrics">{(['hp','attack','defense'] as const).map((key,i)=><span className="game-metric" key={key} aria-label={labels[i]}><Icon name={icons[i]}/> +{((wings.percent?.[key]??0)+current[key]).toLocaleString('ru',{maximumFractionDigits:1})}%</span>)}</div>}
  <GameTabs label="Развитие крыльев" value={tab} items={wingTabs} onChange={setTab}/>
  {tab==='gear'&&<>{!p.claimed.includes('wings')&&<button className="action" onClick={()=>claim('wings')}>Получить первые крылья бесплатно</button>}{gear}</>}
  {tab==='grow'&&(wings?<><div className="game-metrics"><span className="game-metric"><Icon name="wings"/>{value} перьев</span><span>Рост {rank}/{wingRules.cost.length}</span></div>
   <div className="bonus-card">{(['hp','attack','defense'] as const).map((key,i)=>{const base=wings.percent?.[key]??0;return <span key={key}>{labels[i]} · +{(base+current[key]).toFixed(1)}%{cost?' → +'+(base+next[key]).toFixed(1)+'%':''}</span>})}</div>
   <div className="game-actions">{!!cost&&<button className="action" disabled={value<cost} onClick={()=>soloAction(draft=>growWings(draft,rank),'Крылья усилены')}>Усилить · {cost} перьев</button>}<button className="action secondary" onClick={()=>open('hero-path')}>Награды за рост</button></div>
   <details className="saga-disclosure"><summary>Где получить перья</summary><p>{soloResources.wing.source}.</p></details>
   {!!cost&&value<cost&&<small>Не хватает {cost-value} перьев.</small>}
  </>:<p>Наденьте крылья, чтобы открыть рост.</p>)}
  {tab==='looks'&&(wings?<><GameTiles columns={2}>{wingLooks.map((name,i)=><GameTile key={name} label={name} icon={i===0?'wings':'cloak'} active={p.wingVisible===(i===0)} onClick={()=>soloAction(draft=>{draft.wingVisible=i===0;return true})}/>)}</GameTiles><small>Внешний вид сохраняется отдельно от силы.</small></>:<p>Сначала наденьте крылья.</p>)}
 </section>;
}

export function DetailedStats({p}:{p:Player}){
 const s=stats(p);
 const percent=(value:number)=>(value*100).toLocaleString('ru',{maximumFractionDigits:1})+'%';
 return <details className="saga-disclosure"><summary><Icon name="chart"/><span>Характеристики</span></summary>
  <div className="bonus-card">
   <b>Основные</b>
   <span>Здоровье {s.hp} · уровень, снаряжение, стойкость, крылья и дружина.</span>
   <span>Атака {s.attack} · уровень, оружие, ярость, крылья, реликвии и руны.</span>
   <span>Защита {s.defense} · уровень, доспехи, стойкость и крылья. Снижает входящий урон с учётом уровня врага.</span>
   <b>Вторичные</b>
   <span>Крит {percent(s.crit)} · шанс нанести {percent(s.critDamage)} обычного урона. Вклад дают класс, ярость, комплекты, руны и камни.</span>
   <span>Скорость {s.aspd.toLocaleString('ru')} удара/с. Её меняют класс и комплект бури.</span>
   <span>Вампиризм {percent(s.lifesteal)} · доля урона обычного удара, возвращаемая здоровьем. Вклад дают класс, комплект углей и камни.</span>
   <span>Уклонение {percent(s.dodge)}, снижение урона {percent(s.reduction)} · стойкость, крылья Сумрака, тёмные вещи, руны и спутники.</span>
   <span>Урон навыков ×{s.skillDamage.toLocaleString('ru',{maximumFractionDigits:2})} от класса, комплектов и рунического резонанса. Ранги выбранных рун учитываются при применении.</span>
  </div>
 </details>;
}
