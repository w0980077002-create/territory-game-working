import {useEffect,useState} from 'react';
import {tg} from '../core/telegram';
import {useGame} from '../core/store';
import type {Player} from '../core/types';
import {communityEnabled,requestTeamArena,type Ranking} from '../community/client';
import type {ArenaMode,RecentBattle} from '../arena/match';
import {Icon} from './Icon';
import {BeltEditor} from './ArenaBattle';
import './arenaHub.css';

export const arenaModes={
 duel:{id:'duel',title:'Дуэль',size:'1×1',desc:'Один на один',art:'duel'},
 team:{id:'team',title:'Отряд',size:'3×3',desc:'Бой двух отрядов',art:'squad'},
 chaos:{id:'chaos',title:'Хаос',size:'20×20',desc:'Большое сражение',art:'chaos'},
} as const;

type Podium=Ranking&{points:number;wins:number;teamLosses:number};
const arenaArt=(file:string)=>import.meta.env.BASE_URL+'art/arena/'+file;

export function ArenaHub({player,onMode,pending,pendingMode,notice,onResume,recent,onPast,beltLocked=false}:{
 player:Player;onMode:(mode:ArenaMode)=>void;pending:boolean;pendingMode?:ArenaMode;notice:string;onResume?:()=>void;recent:RecentBattle[];onPast:(id:string)=>void;beltLocked?:boolean;
}){
 const open=useGame(state=>state.open);
 const [rulesOpen,setRulesOpen]=useState(false),[podium,setPodium]=useState<Podium>();
 const signed=communityEnabled&&!!tg()?.initData;
 useEffect(()=>{
  if(!signed)return;
  let active=true;
  requestTeamArena<Podium>({action:'podium'}).then(data=>{if(active)setPodium(data)}).catch(()=>{});
  return ()=>{active=false};
 },[signed]);
 return <section className="vvr-arena" aria-label="Арена">
  <div className="vvr-arena-banner">
   <button type="button" className="vvr-banner-city" aria-label="Город" onClick={()=>open('port')}/>
   <button type="button" className="vvr-banner-rules" aria-label="Правила Арены" aria-expanded={rulesOpen} onClick={()=>setRulesOpen(open=>!open)}/>
  </div>
  <div className="vvr-arena-stats" aria-label="Статистика Арены">
   {[['Рейтинг',podium?.points,'trophy'],['Победы',podium?.wins,'laurel'],['Поражения в отряде',podium?.teamLosses,'skull']].map(([label,value,icon])=>
    <div key={label}><img alt="" src={arenaArt('icon-'+icon+'.svg')}/><strong>{value??'—'}</strong><small>{label}</small></div>)}
  </div>
  {rulesOpen&&<div className="vvr-arena-rules">
   <p>Поиск соперников вашего уровня ±7 длится 20 секунд. Затем свободные места занимают боты. Рейтинг начисляется за победу в завершённом бою среди игроков. Чат открыт ещё 30 минут после боя.</p>
  </div>}
  <section className="vvr-arena-podium" aria-label="ТОП-50 Арены">
   <h3><Icon name="crown"/> ТОП-50 Арены</h3>
   {podium?.rows.length?<><ol className="vvr-podium">{podium.rows.slice(0,3).map((row,index)=>
    <li key={index}><small>№ {row.rank}</small><strong>{row.name}</strong><b>{row.points}</b></li>)}</ol>
    {podium.rows.length>3&&<details className="vvr-arena-rules"><summary>Весь рейтинг</summary>
     <ol start={4}>{podium.rows.slice(3).map((row,index)=><li key={index} aria-current={row.mine?'true':undefined}>{row.rank}. {row.name} · {row.points}</li>)}</ol>
    </details>}</>:<small>{podium?'В этом сезоне пока нет побед':'Сезонный рейтинг доступен через Telegram'}</small>}
  </section>
    {!!recent.length&&<details className="vvr-arena-rules">
   <summary>Чаты завершённых боёв</summary>
   <ul>{recent.map(item=><li key={item.id}><button type="button" className="vvr-leave" onClick={()=>onPast(item.id)}>
    {arenaModes[item.mode].title} · {new Date(item.chatDeadline-30*60_000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
   </button></li>)}</ul>
  </details>}
  <small>Уровень героя {player.level} · побед в одиночных дуэлях {player.arenaWins}</small>
  <BeltEditor player={player} locked={beltLocked}/>
  {notice&&<p role="status" className="online-status">{notice}</p>}
  {pending&&pendingMode&&<span role="status">Подключение · {arenaModes[pendingMode].size}</span>}
  {onResume&&<button className="action secondary" type="button" onClick={onResume}>Чат прошлого боя</button>}
  <div className="vvr-arena-modes" aria-label="Режимы боя">{Object.values(arenaModes).map(item=>
   <button type="button" key={item.id} className={'vvr-arena-mode mode-'+item.id} disabled={pending} onClick={()=>onMode(item.id)}>
    <img src={arenaArt(item.art+'.webp')} alt=""/><strong>{item.title}</strong><b>{item.size}</b><small>{item.desc}</small>
   </button>)}</div>
 </section>;
}
