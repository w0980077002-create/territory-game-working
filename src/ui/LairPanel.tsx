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
import {lairAvailable,lairCleared,lairRules,raidDay,selectLair,lairTrophy} from '../saga/lair';
import {nameOf,planFor} from '../saga/encounters';
import {regionOf} from '../saga/regions';
import {soloAction} from '../saga/soloAction';
import {RewardArt} from './RewardArt';

import {perks} from '../saga/gear';
export function LairPanel({p}:{p:Player}){
 const repeat=useRepeatAction(),[selected,setSelected]=useState<string|null>(null);
 const open=useGame(s=>s.open);
 const raid=raidDay(p,carnivalNow()),region=regionOf(p.stage);
 const waiting=!!p.rewardOffer&&!p.rewardOffer.resolved;
 const active=p.encounter?.mode==='dungeon'&&p.encounter.entryPaid&&!p.encounter.rewarded&&['fight','walk','defeat'].includes(p.encounter.phase);
 return <section>
  <div className="game-metrics"><span className="game-metric"><Icon name="rune"/>{lairRules.entry} за вход</span><span>Рейды {raid.total}/{lairRules.perDay}</span></div>
  {active&&<button className="action secondary" onClick={()=>open(null)}>Вернуться к текущему бою</button>}
  <GameTiles>{miniIds.map((id,i)=><GameTile key={id} picture={art(id)} label={nameOf(id)} value={lairAvailable(p,id)?(raid.keeper[id]??0)+'/'+lairRules.perKeeper+' рейда':'Этап '+lairRules.keeperSpawns[i]} ready={lairCleared(p,id)&&(raid.keeper[id]??0)<lairRules.perKeeper&&raid.total<lairRules.perDay} locked={!lairAvailable(p,id)} onClick={()=>setSelected(id)}/>)}</GameTiles>
  {selected&&(()=>{
   const id=selected,i=miniIds.indexOf(id);
   const available=lairAvailable(p,id),cleared=lairCleared(p,id),used=raid.keeper[id]??0;
   const trophy=lairTrophy(id);
   const target=planFor(p,'dungeon',id).units[0];
   return <CardDialog className="game-detail" title={nameOf(id)} onClose={()=>setSelected(null)}>
    <div className="wear-summary"><img src={art(id)} alt=""/><b>{region.name} · {region.districts[i]}</b></div>
    <p>Здоровье {Math.round(target.hp)} · атака {Math.round(target.atk)}. {available?'':'Откроется на этапе '+lairRules.keeperSpawns[i]+'.'}</p>
    <p>За бой · предмет, золото, самоцветы, опыт и осколки реликвий. {cleared?'Страж уже побеждён.':trophy?'Первый трофей · '+perks[trophy].name+'.':''}</p>
    <button className="action" disabled={waiting||!available||p.chaosite<lairRules.entry} onClick={()=>{
     if(soloAction(draft=>selectLair(draft,id))){setSelected(null);battle?.startMode('dungeon',true)}
    }}>{active?'Выбрать новую попытку':'Выбрать бой'}</button>
    <details className="saga-disclosure"><summary>Дневной рейд · {used}/{lairRules.perKeeper}</summary>
     <p>{cleared?'Случайный предмет и припасы за '+lairRules.entry+' Хаосита.':'Сначала победите этого стража в бою.'}</p>
     <RewardArt reward={lairRules.raidReward} names/>
     <button className="action secondary" disabled={!cleared||waiting||raid.total>=lairRules.perDay||used>=lairRules.perKeeper||p.chaosite<lairRules.entry} onClick={()=>repeat(()=>raidLair(id,raid.total))}>Совершить рейд</button>
    </details>
   </CardDialog>;
  })()}
 </section>;
}
