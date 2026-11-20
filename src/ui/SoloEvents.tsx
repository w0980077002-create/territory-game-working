import {useRepeatAction} from './useRepeatAction';
import {useEffect,useState} from 'react';
import type {Player} from '../core/types';
import {useGame} from '../core/store';
import {carnivalNow} from '../core/profile';
import {companions} from '../dark/rules';
import {claimEvent,rollEvent,seaBoard,fortuneBoard,eventPrizes,wasClaimed,savedChests,openChest,chestOptions,chestNames,tradeJackpot,fortuneExchange} from '../saga/soloEvents';
import {eventSchedule,eventWindow,eventPeriod,soloEventIds,type SoloEventId} from '../saga/soloCalendar';
import {balanceOf,dailyVictoryRewards,soloResources} from '../saga/soloEconomy';
import {soloAction} from '../saga/soloAction';
import {count} from '../saga/save';
import {RewardArt} from './RewardArt';
import {CardDialog} from './SagaUI';
import {Icon} from './Icon';
import './soloEvents.css';

const dateTime=new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:'UTC'});
function boardCell(index:number,length:number){
 const edge=length/4;
 if(index<=edge)return {gridRow:1,gridColumn:index+1};
 if(index<=2*edge)return {gridRow:index-edge+1,gridColumn:edge+1};
 if(index<=3*edge)return {gridRow:edge+1,gridColumn:3*edge-index+1};
 return {gridRow:length-index+1,gridColumn:1};
}
const icons={followers:'people',runes:'rune',monopoly:'ship',fortune:'chest'};
const dailyWins=(p:Player,now:number)=>Math.floor(now/86_400_000)===count(p,'solo:lastVictoryDay')?count(p,'solo:dailyWins'):0;
export function SoloEvents({p}:{p:Player}){
 const repeat=useRepeatAction();
 const open=useGame(s=>s.open);
 const [now,setNow]=useState(carnivalNow);
 const [selected,setSelected]=useState<SoloEventId|null>(null),[round,setRound]=useState(0);
 const [skip,setSkip]=useState(p.reducedMotion===true),[played,setPlayed]=useState(0);
 const [chest,setChest]=useState<string|null>(null),[species,setSpecies]=useState('');
 useEffect(()=>{const tick=setInterval(()=>setNow(carnivalNow()),1000);return ()=>clearInterval(tick)},[]);
 const chests=savedChests(p),selectedChest=chests.find(([key])=>key===chest),wins=dailyWins(p,now);
 const active=selected&&eventWindow(selected,now).active?selected:null;
 const jackpot=balanceOf(p,'jackpot');
 const openReward=(key:string)=>{if(soloAction(draft=>openChest(draft,key,species),'Сундук открыт')){setChest(null);setSpecies('')}};
 return <section className="solo-events">
  <details className="saga-disclosure"><summary>Календарь и дневные припасы</summary>
   <p>Даты по UTC. Дневные награды начисляются после побед автоматически.</p>
   <div className="bonus-card"><span>Карнавал · 1–7 число</span>{soloEventIds.map(id=><span key={id}>{eventSchedule[id].name} · {eventSchedule[id].first}–{eventSchedule[id].last} число</span>)}</div>
   {dailyVictoryRewards.map(({win,...reward})=><div className="skill-card" key={win}><b>Победа {Math.min(wins,win)}/{win}</b><RewardArt reward={{solo:reward}} names/></div>)}
   <button className="action secondary" onClick={()=>open('shop')}>Дневные и недельные предложения</button>
  </details>
  {soloEventIds.filter(id=>eventWindow(id,now).active).map(id=><button key={id} className="action" onClick={()=>{setRound(0);setSelected(id);setPlayed(0)}}><Icon name={icons[id]}/> {eventSchedule[id].name}</button>)}
  {chests.map(([key,type])=><button key={key} className="action secondary" onClick={()=>{setChest(key);setSpecies('')}}>{chestNames[type]} · открыть сундук</button>)}
  {jackpot>0&&<details className="saga-disclosure"><summary>Жетоны джекпота · {jackpot}</summary>
   <button className="action" onClick={()=>soloAction(draft=>tradeJackpot(draft,jackpot,'awake'),'Камень получен')}>1 жетон → {fortuneExchange.stones} камень пробуждения</button>
   <button className="action secondary" disabled={!p.equipment.wings} onClick={()=>soloAction(draft=>tradeJackpot(draft,jackpot,'wing'),'Перья получены')}>1 жетон → {fortuneExchange.feathers} перьев</button>
   {!p.equipment.wings&&<button className="action secondary" onClick={()=>open('wings')}>Сначала наденьте крылья</button>}
  </details>}
  {active&&(()=>{
   const window=eventWindow(active,now),period=eventPeriod(p,window.key);
   const sprint=active==='followers'||active==='runes';
   const board=active==='monopoly'?seaBoard:fortuneBoard;
   const prizes=eventPrizes[active];
   const points=sprint?prizes.slice(round*5,round*5+5):prizes;
   return <CardDialog title={eventSchedule[active].name} onClose={()=>setSelected(null)}>
    <p>До {dateTime.format(window.end)} UTC · осталось {Math.floor((window.end-now)/86_400_000)} дн. {Math.floor((window.end-now)/3_600_000)%24} ч. {Math.floor((window.end-now)/60_000)%60} мин. Незабранные награды придут в Почту.</p>
    {sprint?<><p>Потрачено · {period.progress} {active==='followers'?'Душ на покупку спутников':'свитков на призыв и усиление'}</p>
     <div className="tabs">{[0,1,2,3,4].map(i=><button key={i} className={round===i?'selected':''} onClick={()=>setRound(i)} aria-label={'Раунд '+(i+1)}>{i+1}</button>)}</div>
     <p>Раунд {round+1}/5</p>
    </>:<>
     <p>{active==='monopoly'?'Круги':'Потрачено билетов'} · {period.progress}. Билеты · {balanceOf(p,active)}.</p>
     <ol className={'solo-board '+active} aria-label="Игровая дорожка">{board.map((cell,i)=><li key={i} className={period.position===i?'current':''} aria-current={period.position===i?'step':undefined} title={cell.name} style={boardCell(i,board.length)}>
      {period.position===i?<Icon key={played} name={active==='monopoly'?'ship':'chest'} className={played&&!skip?'solo-roll':''}/>:i+1}
     </li>)}</ol>
     {period.last!==null&&<p role="status">{active==='monopoly'?'Кубик · '+period.last+'. ':''}{board[period.position]?.name}</p>}
     <p>Дневные победы {Math.min(wins,5)}/5 · {dailyVictoryRewards.map(reward=>'+'+reward[active]+' за победу №'+reward.win).join(', ')}.</p>
     <label><input type="checkbox" checked={skip} onChange={e=>setSkip(e.target.checked)}/> Пропускать анимацию</label>
     <button className="action" disabled={!balanceOf(p,active)} onClick={()=>{if(repeat(()=>soloAction(draft=>rollEvent(draft,active,period.revision),'Награда сохранена')))setPlayed(n=>n+1)}}>{active==='monopoly'?'Бросить кубик':'Разыграть приз'} · 1 билет</button>
     <details className="saga-disclosure"><summary>Клетки и шансы</summary><ol>{board.map((cell,i)=><li key={i}>{cell.name}{'weight' in cell?' · '+cell.weight+'%':''} <RewardArt reward={cell.reward}/></li>)}</ol>{active==='monopoly'&&<p>Каждое значение кубика имеет шанс 1 из 6.</p>}</details>
    </>}
    <div className="bonus-card">{points.map((prize,i)=>{
     const index=sprint?round*5+i:i,claimed=wasClaimed(period.claims,index);
     return <div key={prize.at} className="skill-card"><b>{prize.at}</b> <RewardArt reward={prize.reward} names/>{prize.chest&&<p>{chestNames[prize.chest]}</p>}
      <button className="action secondary" disabled={claimed||period.progress<prize.at} onClick={()=>soloAction(draft=>claimEvent(draft,window.key,index,'event'),'Награда получена')}>{claimed?'Получено':period.progress<prize.at?'В процессе':'Забрать'}</button>
     </div>;
    })}</div>
    {active==='followers'&&round===4&&<p>После закрытия при 5200 потраченных Душах Почта вернёт 545 Душ.</p>}
   </CardDialog>;
  })()}
  {selectedChest&&<CardDialog title={chestNames[selectedChest[1]]} onClose={()=>setChest(null)} actions={<button className="action" disabled={selectedChest[1]==='legendary'&&!species} onClick={()=>openReward(selectedChest[0])}>Открыть</button>}>
   {selectedChest[1]==='legendary'?<label>Спутник <select value={species} onChange={e=>setSpecies(e.target.value)}><option value="">Выберите спутника</option>{chestOptions(selectedChest[1]).map(id=><option key={id} value={id}>{companions[id].name}</option>)}</select></label>:<p>Содержимое определяется при открытии. Сундук останется, если награду нельзя получить.</p>}
  </CardDialog>}
 </section>;
}
