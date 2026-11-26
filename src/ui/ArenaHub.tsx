import {useEffect,useState} from 'react';
import {tg} from '../core/telegram';
import {useGame} from '../core/store';
import {art,heroArt} from '../data/catalog';
import {CardDialog} from './SagaUI';
import type {HeroClass,Player} from '../core/types';
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

type Podium=Ranking&{points:number;wins:number;teamLosses:number;serverNow?:string;heroes?: (HeroClass|null)[];rewards?:{place:string;description:string}[]};
const showNumber=(value:number)=>value.toLocaleString('ru-RU');
function seasonTime(ms:number){
 if(ms<=0)return 'Завершён';
 const minutes=Math.ceil(ms/60_000),hours=Math.floor(minutes/60),days=Math.floor(hours/24);
 return days?`${days} д ${hours%24} ч`:hours?`${hours} ч ${minutes%60} мин`:`${minutes} мин`;
}
const arenaArt=(file:string)=>import.meta.env.BASE_URL+'art/arena/'+file;

export function ArenaHub({player,onMode,pending,pendingMode,notice,onResume,recent,onPast,beltLocked=false}:{
 player:Player;onMode:(mode:ArenaMode)=>void;pending:boolean;pendingMode?:ArenaMode;notice:string;onResume?:()=>void;recent:RecentBattle[];onPast:(id:string)=>void;beltLocked?:boolean;
}){
 const open=useGame(state=>state.open);
 const [rulesOpen,setRulesOpen]=useState(false),[podium,setPodium]=useState<Podium>();
 const [card,setCard]=useState<'ranking'|'rewards'>(),[time,setTime]=useState(Date.now),[unavailable,setUnavailable]=useState(false);
 const signed=communityEnabled&&!!tg()?.initData;
 useEffect(()=>{
  if(!signed)return;
  let active=true,offset=0;
  const refresh=()=>requestTeamArena<Podium>({action:'podium'}).then(data=>{
   if(!active)return;
   const server=Date.parse(data.serverNow??'');
   offset=Number.isFinite(server)?server-Date.now():0;
   setTime(Date.now()+offset);setPodium(data);setUnavailable(false);
  }).catch(()=>{if(active)setUnavailable(true)});
  void refresh();
  const timer=setInterval(()=>{
   setTime(Date.now()+offset);
  },15_000);
  const poll=setInterval(()=>void refresh(),60_000);
  return ()=>{active=false;clearInterval(timer);clearInterval(poll)};
 },[signed]);
 const season=podium?.season,rows=podium?.rows??[];
 const empty=unavailable?'Рейтинг временно недоступен':podium?(season?'В этом сезоне пока нет побед':'Нет активного сезона'):signed?'Загружаем рейтинг…':'Войдите через Telegram для просмотра рейтинга';
 return <section className="vvr-arena" aria-label="Арена">
  <div className="vvr-arena-banner">
   <button type="button" className="vvr-banner-city" aria-label="Город" onClick={()=>open('port')}/>
   <button type="button" className="vvr-banner-rules" aria-label="Правила Арены" aria-expanded={rulesOpen} onClick={()=>setRulesOpen(open=>!open)}/>
  </div>
  <div className="vvr-arena-stats" aria-label="Статистика Арены">
   {[['Рейтинг',podium?.points,'trophy'],['Победы',podium?.wins,'laurel'],['Поражения',podium?.teamLosses,'skull']].map(([label,value,icon])=>
    <div key={label}><img alt="" src={arenaArt('icon-'+icon+'.svg')}/><strong>{typeof value==='number'?showNumber(value):'—'}</strong><small title={icon==='skull'?'Поражения в командных боях':undefined}>{label}</small></div>)}
  </div>
  {rulesOpen&&<div className="vvr-arena-rules">
   <p>Поиск соперников вашего уровня ±7 длится 20 секунд. Затем свободные места занимают боты. Рейтинг начисляется за победу в завершённом бою среди игроков. Чат открыт ещё 30 минут после боя.</p>
  </div>}
  <section className="vvr-arena-podium" aria-label="ТОП-50 Арены">
   <header className="vvr-podium-head">
    <h3><Icon name="crown"/> ТОП-50 Арены</h3>
    <button type="button" className="vvr-podium-rewards" aria-label="Награды сезона" onClick={()=>setCard('rewards')}><Icon name="gift"/></button>
    {season&&<time title={season.name} aria-label="До конца сезона" dateTime={season.ends_at}>{seasonTime(Date.parse(season.ends_at)-time)}</time>}
   </header>
   <ol className="vvr-podium">{[0,1,2].map(index=>{
    const row=rows[index],hero=podium?.heroes?.[index]??(row?.mine?player.heroClass:undefined);
    return <li key={index} className={row?'':'vvr-podium-empty'}>
     <small>{row?.rank??index+1}</small>
     <div className="vvr-podium-avatar">{row&&hero&&Object.hasOwn(heroArt,hero)?<img src={art(heroArt[hero])} alt=""/>:<Icon name={row?'shield':'arena'}/>}</div>
     <strong title={row?.name}>{row?.name??'—'}</strong>
     <b>{row?showNumber(row.points)+' очк.':'—'}</b>
    </li>;
   })}</ol>
   {!rows.length&&<p className="vvr-podium-note">{empty}</p>}
   <button className="vvr-ranking-button" type="button" onClick={()=>setCard('ranking')}>Полный рейтинг (1–50) ›</button>
  </section>
  {card==='ranking'&&<CardDialog title="Полный рейтинг Арены" onClose={()=>setCard(undefined)}>
   {season&&<p>{season.name}</p>}
   {rows.length?<ol className="vvr-ranking-rows">{rows.map((row,index)=><li key={index} aria-current={row.mine?'true':undefined}>
    <span>{row.rank}</span><strong>{row.name}</strong><b>{showNumber(row.points)}</b>
   </li>)}</ol>:<p>{empty}</p>}
  </CardDialog>}
  {card==='rewards'&&<CardDialog title="Награды сезона" onClose={()=>setCard(undefined)}>
   {season&&<p>{season.name} · {seasonTime(Date.parse(season.ends_at)-time)}</p>}
   {podium?.rewards?.length?<ul>{podium.rewards.map(reward=><li key={reward.place}><strong>{reward.place}</strong> · {reward.description}</li>)}</ul>:
    <p>{season?'Призы за места в рейтинге для этого сезона не опубликованы.':empty}</p>}
  </CardDialog>}
    {!!recent.length&&<details className="vvr-arena-rules">
   <summary>Чаты завершённых боёв</summary>
   <ul>{recent.map(item=><li key={item.id}><button type="button" className="vvr-leave" onClick={()=>onPast(item.id)}>
    {arenaModes[item.mode].title} · {new Date(item.chatDeadline-30*60_000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
   </button></li>)}</ul>
  </details>}
  {notice&&<p role="status" className="online-status">{notice}</p>}
  {pending&&pendingMode&&<span role="status">Подключение · {arenaModes[pendingMode].size}</span>}
  {onResume&&<button className="action secondary" type="button" onClick={onResume}>Чат прошлого боя</button>}
  <div className="vvr-arena-modes" aria-label="Режимы боя">{Object.values(arenaModes).map(item=>
   <article key={item.id} className={'vvr-arena-mode mode-'+item.id}>
    <img src={arenaArt(item.art+'.webp')} alt=""/><strong>{item.title} <b>{item.size}</b></strong>
    <button className="vvr-mode-start" type="button" aria-label={item.title+' '+item.size+' · Начать бой'} disabled={pending} onClick={()=>onMode(item.id)}>Начать бой</button>
   </article>)}</div>
  <BeltEditor player={player} locked={beltLocked}/>
 </section>;
}
