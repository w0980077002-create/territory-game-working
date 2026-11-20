import type {Player} from '../core/types';
import {stats} from '../core/formulas';
import {useGame} from '../core/store';
import {art} from '../data/catalog';
import {balanceOf,soloResources} from '../saga/soloEconomy';
import {heroTracks,trackClaimed,claimTrack,wingRank,wingRules,wingBonuses,growWings,wingLooks} from '../saga/soloProgress';
import {soloAction} from '../saga/soloAction';
import {RewardArt} from './RewardArt';

export function HeroTracks({p}:{p:Player}){
 const open=useGame(s=>s.open);
 return <section>
  <p>Награды за развитие героя. Все дорожки доступны за игровой прогресс.</p>
  {heroTracks.map(track=><details className="saga-disclosure" key={track.id}><summary>{track.name} · {track.value(p)}</summary>
   <button className="action secondary" onClick={()=>open(track.route)}>Перейти к условию</button>
   <div className="bonus-card">{track.targets.map((target,i)=>{
    const filled=track.value(p)>=target,claimed=trackClaimed(p,track.id,i);
    return <div className="skill-card" key={target}><b>{Math.min(track.value(p),target)} / {target}</b> <RewardArt reward={track.reward(i)} names/>
     <button className="action secondary" disabled={!filled||claimed} onClick={()=>soloAction(draft=>claimTrack(draft,track.id,i),'Награда получена')}>{claimed?'Получено':'Забрать'}</button>
    </div>;
   })}</div>
  </details>)}
 </section>;
}
export function WingGrowth({p}:{p:Player}){
 const open=useGame(s=>s.open),claim=useGame(s=>s.claim);
 const rank=wingRank(p),value=balanceOf(p,'wing'),cost=wingRules.cost[rank],current=wingBonuses(rank),next=wingBonuses(rank+(cost?1:0));
 return <section>
  {!p.claimed.includes('wings')&&<button className="action" onClick={()=>claim('wings')}>Получить первые крылья бесплатно</button>}
  <button className="action secondary" onClick={()=>open('gear:wings')}>Открыть слот крыльев</button>
  {p.equipment.wings&&<>
   <div className="bonus-card"><b>{p.equipment.wings.name} · рост {rank}/{wingRules.cost.length}</b>
    {(['hp','attack','defense'] as const).map((key,i)=>{
     const base=p.equipment.wings?.percent?.[key]??0;
     return <span key={key}>{['Здоровье','Атака','Защита'][i]} · +{(base+current[key]).toFixed(1)}%{cost?' → +'+(base+next[key]).toFixed(1)+'%':''}</span>;
    })}
   </div>
   <p>{soloResources.wing.name} · {value}. {soloResources.wing.source}.</p>
   {!!cost&&<button className="action" disabled={value<cost} onClick={()=>soloAction(draft=>growWings(draft,rank),'Крылья усилены')}>Усилить · {cost} перьев</button>}
   <details className="saga-disclosure"><summary>Внешний вид</summary>
    <p>Выбор видимости сохраняет характеристики.</p>
    <div className="rune-options">{wingLooks.map((name,i)=><button key={name} aria-pressed={p.wingVisible===(i===0)} className={p.wingVisible===(i===0)?'selected':''} onClick={()=>soloAction(draft=>{draft.wingVisible=i===0;return true})}>{i===0&&<img width="42" height="42" src={art('ui-wings')} alt=""/>}{name}</button>)}</div>
   </details>
  </>}
  <button className="action secondary" onClick={()=>open('hero-path')}>Награды за рост</button>
 </section>;
}

export function DetailedStats({p}:{p:Player}){
 const s=stats(p);
 const percent=(value:number)=>(value*100).toLocaleString('ru',{maximumFractionDigits:1})+'%';
 return <details className="saga-disclosure"><summary>Основные и вторичные характеристики</summary>
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
