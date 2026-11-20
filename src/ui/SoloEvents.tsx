import {useEffect,useState} from 'react';
import type {Player} from '../core/types';
import {useGame} from '../core/store';
import {carnivalNow} from '../core/profile';
import {companions} from '../dark/rules';
import {claimEvent,rollEvent,seaBoard,fortuneBoard,eventPrizes,wasClaimed,savedChests,openChest,chestOptions,chestNames,tradeJackpot,fortuneExchange,eligiblePrizes} from '../saga/soloEvents';
import {eventSchedule,eventWindow,eventPeriod,soloEventIds,type SoloEventId} from '../saga/soloCalendar';
import {balanceOf,dailyVictoryRewards,soloResources,utcDay} from '../saga/soloEconomy';
import {soloAction} from '../saga/soloAction';
import {count} from '../saga/save';
import {SEASON_STEPS,seasonGoals} from '../saga/events';
import {RewardArt,RewardDetails,rewardParts,soloIcons} from './RewardArt';
import {CardDialog} from './SagaUI';
import {Icon} from './Icon';
import {GameTile,GameTiles} from './CompactGame';
import {CompactFilter} from './CompactFilter';
import {CarnivalEntry} from './carnival/CarnivalPanel';
import {useRepeatAction} from './useRepeatAction';
import './soloEvents.css';

const dateTime=new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:'UTC'});
const icons={followers:'people',runes:'rune',monopoly:'ship',fortune:'chest'};
const timeLeft=(ms:number)=>ms>=86_400_000?Math.floor(ms/86_400_000)+' д. '+Math.floor(ms/3_600_000)%24+' ч.':Math.floor(ms/3_600_000)+' ч. '+Math.floor(ms/60_000)%60+' мин.';
function boardCell(index:number,length:number){
 const edge=length/4;
 if(index<=edge)return {gridRow:1,gridColumn:index+1};
 if(index<=2*edge)return {gridRow:index-edge+1,gridColumn:edge+1};
 if(index<=3*edge)return {gridRow:edge+1,gridColumn:3*edge-index+1};
 return {gridRow:length-index+1,gridColumn:1};
}

export function SoloEvents({p}:{p:Player}){
 const repeat=useRepeatAction(),open=useGame(s=>s.open);
 const [now,setNow]=useState(carnivalNow);
 const [selected,setSelected]=useState<SoloEventId|null>(null),[selectedRound,setRound]=useState<number|null>(null);
 const [overlay,setOverlay]=useState<'calendar'|'supplies'|'jackpot'|null>(null);
 const [focus,setFocus]=useState<number|null>(null),[rules,setRules]=useState(false);
 const [skip,setSkip]=useState(p.reducedMotion===true),[played,setPlayed]=useState(0);
 const [chest,setChest]=useState<string|null>(null),[species,setSpecies]=useState('');
 useEffect(()=>{const tick=setInterval(()=>setNow(carnivalNow()),1000);return ()=>clearInterval(tick)},[]);
 const chests=savedChests(p),selectedChest=chests.find(([key])=>key===chest);
 const wins=utcDay(now)===count(p,'solo:lastVictoryDay')?count(p,'solo:dailyWins'):0;
 const active=selected&&eventWindow(selected,now).active?selected:null;
 const jackpot=balanceOf(p,'jackpot'),season=Math.min(SEASON_STEPS,p.bosses);
 const seasonReady=p.seasonClaims.filter(id=>id<=season).length<season||seasonGoals(p).some(goal=>!goal.claimed&&goal.progress>=goal.goal);
 const openReward=(key:string)=>{if(soloAction(draft=>openChest(draft,key,species),'Сундук открыт')){setChest(null);setSpecies('')}};
 const showEvent=(id:SoloEventId)=>{setSelected(id);setRound(null);setFocus(null);setRules(false);setPlayed(0)};

 return <section className="solo-events">
  <CarnivalEntry/>
  <GameTiles columns={2}>
   {soloEventIds.filter(id=>eventWindow(id,now).active).map(id=>{
    const window=eventWindow(id,now),progress=eventPeriod(p,window.key).progress;
    return <GameTile key={id} label={eventSchedule[id].name} icon={icons[id]} value={progress+' · '+timeLeft(window.end-now)} ready={eligiblePrizes(p,window.key).some(prize=>!prize.after)} onClick={()=>showEvent(id)}/>;
   })}
   <GameTile label="Северный сезон" icon="banner" value={season+'/'+SEASON_STEPS} ready={seasonReady} onClick={()=>open('season')}/>
   <GameTile label="Календарь" icon="book" value="UTC" onClick={()=>setOverlay('calendar')}/>
   <GameTile label="Дневные припасы" icon="chest" value={Math.min(wins,5)+'/5 побед'} onClick={()=>setOverlay('supplies')}/>
   {chests.map(([key,type])=><GameTile key={key} label={chestNames[type]} icon="chest" ready onClick={()=>{setChest(key);setSpecies('')}}/>)}
   {jackpot>0&&<GameTile label="Жетон джекпота" icon={soloIcons.jackpot} value={jackpot} onClick={()=>setOverlay('jackpot')}/>}
  </GameTiles>
  {overlay==='calendar'&&<CardDialog className="game-detail" title="Календарь · UTC" onClose={()=>setOverlay(null)}>
   <div className="bonus-card"><span>Карнавал · 1–7 число</span>{soloEventIds.map(id=><span key={id}>{eventSchedule[id].name} · {eventSchedule[id].first}–{eventSchedule[id].last} число</span>)}</div>
   <p>Пороговые награды ждут в Почте после закрытия события.</p>
  </CardDialog>}
  {overlay==='supplies'&&<CardDialog className="game-detail" title="Дневные припасы" onClose={()=>setOverlay(null)} actions={<button className="action secondary" onClick={()=>open('shop')}>Предложения Лавки</button>}>
   <p>Начисляются автоматически после побед. Сброс в 00:00 UTC.</p>
   {dailyVictoryRewards.map(({win,...reward})=><div className="skill-card" key={win}><b>Победа {Math.min(wins,win)}/{win}</b><RewardArt reward={{solo:reward}} names/></div>)}
  </CardDialog>}
  {overlay==='jackpot'&&<CardDialog className="game-detail" title={'Жетоны джекпота · '+jackpot} onClose={()=>setOverlay(null)}>
   <p>{soloResources.jackpot.source}. {soloResources.jackpot.use}.</p>
   <div className="game-actions"><button className="action" disabled={!jackpot} onClick={()=>soloAction(draft=>tradeJackpot(draft,jackpot,'awake'),'Камень получен')}>1 → {fortuneExchange.stones} камень</button>
   <button className="action secondary" disabled={!jackpot||!p.equipment.wings} onClick={()=>soloAction(draft=>tradeJackpot(draft,jackpot,'wing'),'Перья получены')}>1 → {fortuneExchange.feathers} перьев</button></div>
   {!p.equipment.wings&&<button className="action secondary" onClick={()=>open('wings')}>Сначала наденьте крылья</button>}
  </CardDialog>}
  {active&&(()=>{
   const window=eventWindow(active,now),period=eventPeriod(p,window.key);
   const sprint=active==='followers'||active==='runes',prizes=eventPrizes[active];
   const firstPending=prizes.findIndex((prize,index)=>!prize.after&&!wasClaimed(period.claims,index));
   const round=selectedRound??(firstPending<0?4:Math.min(4,Math.floor(firstPending/5)));
   const points=sprint?prizes.slice(round*5,round*5+5):prizes;
   const board=active==='monopoly'?seaBoard:fortuneBoard;
   const boardEvent=active==='monopoly'||active==='fortune'?active:null;
   const tickets=boardEvent?balanceOf(p,boardEvent):0;
   const selectedCell=focus!==null?board[focus]:null;
   const roll=()=>{
    if(boardEvent&&repeat(()=>soloAction(draft=>rollEvent(draft,boardEvent,period.revision),'Награда сохранена'))){setPlayed(n=>n+1);setFocus(null)}
   };
   return <CardDialog className="game-detail event-detail" title={eventSchedule[active].name} onClose={()=>setSelected(null)}>
    <div className="event-top"><small>{timeLeft(window.end-now)}</small><button className="game-metric" onClick={()=>{setRules(!rules);setFocus(null)}}>Правила</button></div>
    {rules&&<div className="bonus-card"><span>Окончание · {dateTime.format(window.end)} UTC. Незабранное перейдёт в Почту.</span>
     {sprint?<span>{active==='followers'?'Учитываются покупки спутников за Души.':'Учитывается расход свитков на призыв и усиление.'}</span>:boardEvent&&<><span>{dailyVictoryRewards.map(r=>'+'+r[boardEvent]+' бил. за победу №'+r.win).join(', ')}.</span><span>{boardEvent==='monopoly'?'Равный шанс 1 из 6 для каждой грани.':'Шанс указан по нажатию на клетку.'}</span><label><input type="checkbox" checked={skip} onChange={e=>setSkip(e.target.checked)}/> Пропускать анимацию</label></>}
     {active==='followers'&&<span>При 5200 Душах Почта вернёт 545 после закрытия.</span>}
    </div>}
    {sprint?<><div className="event-top"><b>Потрачено · {period.progress}</b><span>Раунд {round+1}/5</span></div>
     <progress className="game-progress" max={points.at(-1)!.at} value={Math.min(period.progress,points.at(-1)!.at)} aria-label="Прогресс раунда"/>
     <div className="tabs compact-tabs">{[0,1,2,3,4].map(i=><button key={i} className={round===i?'selected':''} aria-pressed={round===i} onClick={()=>setRound(i)} aria-label={'Раунд '+(i+1)}>{i+1}</button>)}</div>
    </>:boardEvent&&<>
     <div className={'solo-board '+boardEvent} role="group" aria-label="Игровая дорожка">
      {board.map((cell,i)=>{
       const part=rewardParts(cell.reward)[0],current=period.last!==null&&period.position===i;
       return <button key={i} type="button" className={'board-cell'+(current?' current':'')} aria-label={'Клетка '+(i+1)+' · '+cell.name} aria-current={current?'step':undefined} aria-pressed={focus===i} style={boardCell(i,board.length)} onClick={()=>{setFocus(focus===i?null:i);setRules(false)}}>
        <Icon name={part?.icon??soloIcons.jackpot}/><small>{part?.count??1}</small>
        {current&&boardEvent==='monopoly'&&<Icon name="ship" className={'board-marker '+(played&&!skip?'solo-roll':'')} key={played}/>}
       </button>;
      })}
      <div className="board-centre">
       <Icon name={icons[boardEvent]}/>
       <div><Icon name={soloIcons[boardEvent]}/> {tickets} · {boardEvent==='monopoly'?'круги':'броски'} {period.progress}</div>
       <button className="action" disabled={!tickets} onClick={roll}>{boardEvent==='monopoly'?'Бросить кубик':'Разыграть приз'}</button>
       {period.last!==null&&<small role="status" className={played&&!skip?'solo-roll':''} key={played}>{boardEvent==='monopoly'?'Грань '+period.last+' · ':''}{board[period.position]?.name}</small>}
       {tickets===0&&<small>Билеты за дневные победы</small>}
      </div>
     </div>
     {selectedCell&&<div className="board-inspect"><span>{selectedCell.name}{'weight' in selectedCell?' · '+selectedCell.weight+'%':''}</span><RewardArt reward={rewardParts(selectedCell.reward).length?selectedCell.reward:{solo:{jackpot:1}}} names/></div>}
    </>}
    <div className="event-thresholds">{points.map((prize,i)=>{
     const index=sprint?round*5+i:i,claimed=wasClaimed(period.claims,index),ready=!claimed&&period.progress>=prize.at;
     return <div key={prize.at} className="event-threshold" data-ready={ready||undefined}>
      <b>{prize.at}</b><RewardDetails reward={prize.reward} extra={prize.chest?chestNames[prize.chest]:undefined}/>
      {ready?<button className="action secondary" onClick={()=>soloAction(draft=>claimEvent(draft,window.key,index,'event'),'Награда получена')}>Забрать</button>:<small>{claimed?'✓ Получено':'Закрыто'}</small>}
     </div>;
    })}</div>
   </CardDialog>;
  })()}
  {selectedChest&&<CardDialog className="game-detail" title={chestNames[selectedChest[1]]} onClose={()=>setChest(null)} actions={<button className="action" disabled={selectedChest[1]==='legendary'&&!species} onClick={()=>openReward(selectedChest[0])}>Открыть</button>}>
   {selectedChest[1]==='legendary'?<CompactFilter label="Спутник" value={species} options={[{value:'',label:'Выберите спутника',icon:'people'},...chestOptions(selectedChest[1]).map(id=>({value:id,label:companions[id].name,icon:'people'}))]} onChange={setSpecies}/>:<p>Содержимое определяется при открытии. Сундук останется, если награду нельзя получить.</p>}
  </CardDialog>}
 </section>;
}
