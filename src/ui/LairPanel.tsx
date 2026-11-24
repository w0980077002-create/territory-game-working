import {useState} from 'react';
import {CardDialog} from './SagaUI';
import {GameTile,GameTiles} from './CompactGame';
import {Icon} from './Icon';
import {useRepeatAction} from './useRepeatAction';
import type {Player} from '../core/types';
import {raidLair,useGame} from '../core/store';
import {carnivalNow} from '../core/profile';
import {art,miniIds} from '../data/catalog';
import {battle} from '../game/Battle';
import {lairAvailable,lairCleared,lairRules,raidDay,selectLair,lairTrophy,lairRecord,lairTrialView,lairTrialReady,claimLairTrial} from '../saga/lair';
import {rewardText} from '../saga/rewards';
import {nameOf,planFor} from '../saga/encounters';
import {regionOf} from '../saga/regions';
import {soloAction} from '../saga/soloAction';
import {RewardArt} from './RewardArt';

import {perks} from '../saga/gear';
const fmtTime=(tenths:number)=>(tenths/10).toFixed(1).replace('.',',')+' с';
import './lair.css';
export function LairPanel({p}:{p:Player}){
 const repeat=useRepeatAction(),[selected,setSelected]=useState<string|null>(null);
 const [confirmAbandon,setConfirmAbandon]=useState<string|null>(null);
 const raid=raidDay(p,carnivalNow()),region=regionOf(p.stage);
 const waiting=!!p.rewardOffer&&!p.rewardOffer.resolved;
 const active=p.lairAttempt;
 return <section>
  <div className="game-metrics"><span className="game-metric"><Icon name="rune"/>{lairRules.entry} за вход</span><span>Рейды {raid.total}/{lairRules.perDay}</span></div>
  {active&&<>
   <p>Оплаченная попытка · {nameOf(active.units[0].id)} · {active.phase==='defeat'?'Поражение':'Бой на паузе'}</p>
   <button className="action" disabled={waiting} onClick={()=>battle?.resumeLair(active.id)}>Продолжить</button>
   <button className="action secondary" onClick={()=>setConfirmAbandon(active.id)}>Завершить попытку</button>
  </>}
  {confirmAbandon&&<CardDialog title="Завершить попытку Логова?" onClose={()=>setConfirmAbandon(null)}>
   <p>Вход уже оплачен. Хаосит не возвращается, а новый бой потребует {lairRules.entry} Хаосита.</p>
   <button className="action" onClick={()=>{if(battle?.abandonLair(confirmAbandon))setConfirmAbandon(null)}}>Подтвердить завершение</button>
   <button className="action secondary" onClick={()=>setConfirmAbandon(null)}>Отмена</button>
  </CardDialog>}
  <GameTiles>{miniIds.map((id,i)=><GameTile key={id} picture={art(id)} label={nameOf(id)} value={lairAvailable(p,id)?(raid.keeper[id]??0)+'/'+lairRules.perKeeper+' рейда':'Этап '+lairRules.keeperSpawns[i]} ready={lairTrialReady(p,id)||lairCleared(p,id)&&(raid.keeper[id]??0)<lairRules.perKeeper&&raid.total<lairRules.perDay} locked={!lairAvailable(p,id)} onClick={()=>setSelected(id)}/>)}</GameTiles>
  {selected&&(()=>{
   const id=selected,i=miniIds.indexOf(id);
   const available=lairAvailable(p,id),cleared=lairCleared(p,id),used=raid.keeper[id]??0;
   const trophy=lairTrophy(id);
   const target=planFor(p,'dungeon',id).units[0];
   return <CardDialog className="game-detail" title={nameOf(id)} onClose={()=>setSelected(null)}>
    <div className="wear-summary"><img src={art(id)} alt=""/><b>{region.name} · {region.districts[i]}</b></div>
    <p>Здоровье {Math.round(target.hp)} · атака {Math.round(target.atk)}. {available?'':'Откроется на этапе '+lairRules.keeperSpawns[i]+'.'}</p>
    <p>За бой · предмет, золото, самоцветы, опыт и осколки реликвий. {cleared?'Страж уже побеждён.':trophy?'Первый трофей · '+perks[trophy].name+'.':''}</p>
    <button className="action" disabled={!!active||waiting||!available||p.chaosite<lairRules.entry} onClick={()=>{
     if(soloAction(draft=>selectLair(draft,id))){setSelected(null);battle?.startMode('dungeon',true)}
    }}>{cleared?'Сразиться снова':'Выбрать бой'}</button>
    <section className="lair-record" aria-label="Личный рекорд">
     <h4><Icon name="crown"/>Личный рекорд · {lairRecord(p,id)?fmtTime(lairRecord(p,id)):'ещё нет'}</h4>
     <small>Лучшее время победы в бою. Каждое испытание награждает один раз; бой можно повторять сколько угодно.</small>
     <ul>{lairTrialView(p,id).map(t=><li key={t.index} className={t.claimed?'claimed':t.done?'ready':''}>
      <span>Победить быстрее {t.seconds} с</span><RewardArt reward={t.reward}/>
      {t.claimed?<em>✓ Получено</em>:<button className="action secondary" disabled={!t.done} onClick={()=>{let got='';if(soloAction(draft=>{const r=claimLairTrial(draft,id,t.index);if(r)got=rewardText(r);return !!r}))useGame.getState().notice('Испытание пройдено: '+got)}}>{t.done?'Забрать':'Не пройдено'}</button>}
     </li>)}</ul>
    </section>
    <details className="saga-disclosure"><summary>Дневной рейд · {used}/{lairRules.perKeeper}</summary>
     <p>{cleared?'Случайный предмет и припасы за '+lairRules.entry+' Хаосита.':'Сначала победите этого стража в бою.'}</p>
     <RewardArt reward={lairRules.raidReward} names/>
     <button className="action secondary" disabled={!cleared||waiting||raid.total>=lairRules.perDay||used>=lairRules.perKeeper||p.chaosite<lairRules.entry} onClick={()=>repeat(()=>raidLair(id,raid.total))}>Совершить рейд</button>
    </details>
   </CardDialog>;
  })()}
 </section>;
}
