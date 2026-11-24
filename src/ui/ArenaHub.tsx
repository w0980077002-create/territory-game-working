import {useEffect,useRef,useState,type ReactNode} from 'react';
import {classNames} from '../data/catalog';
import {tg} from '../core/telegram';
import type {Player} from '../core/types';
import {useGame} from '../core/store';
import {CommunityError,communityEnabled,requestTeamArena,type Ranking} from '../community/client';
import {arenaHeroes,zones,type ArenaElixir,type ArenaHero,type ArenaMessage,type ArenaZone} from '../arena/protocol';
import {ArenaBelt,BattleStage,RoomMessages} from './ArenaBattleParts';
import {Icon} from './Icon';
import './arenaHub.css';

const modes=[
 {id:'duel',title:'Дуэль',size:'1×1',desc:'Один на один',art:'duel'},
 {id:'team',title:'Отряд',size:'3×3',desc:'Бой двух отрядов',art:'squad'},
 {id:'chaos',title:'Хаос',size:'20×20',desc:'Большое сражение',art:'chaos'},
] as const;
type Mode=typeof modes[number]['id'];
type TeamMode=Exclude<Mode,'duel'>;
type Podium=Ranking&{points:number;wins:number;teamLosses:number};
type Fighter={id:string;side:0|1;name:string;hero:ArenaHero;hp:number;maxHp:number;damage:number;kills:number;bot?:true};
type TeamBattle={
 id:string;mode:TeamMode;training:boolean;rankAwarded?:boolean;sideDeadline:[number,number];chatDeadline:number|null;log:ArenaMessage[];chat:ArenaMessage[];
 players:Fighter[];you:{id:string;side:0|1;auto:boolean;belt:Record<ArenaElixir,number>;itemReadyAt:Partial<Record<ArenaElixir,number>>;
 nextStrikeAt:number;nextSequence:number};
 result?:{winner:0|1|null;reason:'hp'|'time'|'afk';finishedAt:number};
};
type TeamSearch={id:string;mode:TeamMode;closesAt:string;queued:number;roster:{id:string;name:string}[]};
type Reply={accepted:boolean;view:TeamBattle|TeamSearch};
type Action={kind:'strike';target:string;attack:ArenaZone;blocks:[ArenaZone,ArenaZone]}|
 {kind:'auto';enabled:boolean}|{kind:'item';item:ArenaElixir}|{kind:'chat';text:string};
const zoneIds=Object.keys(zones) as ArenaZone[];
const left=(until:number,now:number)=>Math.max(0,Math.ceil((until-now)/1000));
const isSearch=(view:TeamSearch|TeamBattle):view is TeamSearch=>'queued' in view;

export function ArenaHub({player,duel}:{player:Player;duel:ReactNode}){
 const open=useGame(state=>state.open);
 const [rulesOpen,setRulesOpen]=useState(false);
 const [mode,setMode]=useState<Mode>(),[podium,setPodium]=useState<Podium>(),[notice,setNotice]=useState('');
 const [room,setRoom]=useState<Reply['view']>(),[hero,setHero]=useState<ArenaHero>(player.heroClass),[busy,setBusy]=useState(false);
 const [now,setNow]=useState(Date.now()), flight=useRef(false),revision=useRef(0);
 const signed=communityEnabled&&!!tg()?.initData;
 const roomId=room?.id;
 useEffect(()=>{
  if(!signed||mode)return;
  let alive=true;
  requestTeamArena<Podium>({action:'podium'}).then(data=>{if(alive)setPodium(data)}).catch(()=>{if(alive)setNotice('Рейтинг временно недоступен')});
  requestTeamArena<Reply|null>({action:'current'}).then(data=>{if(alive)setRoom(data?.view)}).catch(()=>{});
  return ()=>{alive=false};
 },[mode,signed]);
 useEffect(()=>{
  if(!mode||mode==='duel'||!roomId)return;
  let closed=false, timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{
   const version=revision.current;
   if(!flight.current)try{
    const next=await requestTeamArena<Reply>({action:'room',room:roomId});
    if(!closed&&version===revision.current){setRoom(next.view);setNow(Date.now());setNotice(current=>current==='Восстанавливаем связь с Ареной…'?'':current);}
   }catch(error){
    if(!closed&&version===revision.current){
     if(error instanceof CommunityError&&error.status===403){setRoom(undefined);setNotice('Комната закрыта. Можно начать новый поиск.');}
     else setNotice('Восстанавливаем связь с Ареной…');
    }
   }
   if(!closed)timer=setTimeout(poll,1200);
  };
  timer=setTimeout(poll,500);
  return ()=>{closed=true;clearTimeout(timer);};
 },[mode,roomId]);
 const perform=async(work:()=>Promise<boolean>)=>{
  if(flight.current)return false;
  flight.current=true;revision.current++;setBusy(true);setNotice('');
  try{return await work();}
  catch{setNotice('Арена временно недоступна. Попробуйте ещё раз.');return false;}
  finally{flight.current=false;setBusy(false);}
 };
 const choose=(next:Mode)=>{setMode(next);setNotice('');};
 const start=()=>perform(async()=>{
  if(!mode||mode==='duel')return false;
  const next=await requestTeamArena<Reply>({action:'join',mode,hero});
  setMode(next.view.mode);setRoom(next.view);setNow(Date.now());return true;
 });
 const cancel=()=>perform(async()=>{
  if(!roomId)return false;
  const response=await requestTeamArena<{accepted:boolean}>({action:'cancel',room:roomId});
  if(response.accepted){setRoom(undefined);setMode(undefined);}
  return response.accepted;
 });
 const send=(action:Action)=>perform(async()=>{
  if(!room||isSearch(room))return false;
  const command={action:'command',room:room.id,command:{...action,sequence:room.you.nextSequence}};
  for(let attempt=0;;attempt++){
   try{
    const result=await requestTeamArena<Reply>(command);
    setRoom(result.view);setNow(Date.now());
    if(!result.accepted)setNotice('Действие сейчас недоступно');
    return result.accepted;
   }catch(error){
    if(!(error instanceof CommunityError)||error.status!==409||attempt===4)throw error;
    await new Promise(resolve=>setTimeout(resolve,80+Math.random()*180));
   }
  }
 });
 if(mode)return <section className="vvr-arena" aria-label="Арена">
  <button className="vvr-arena-back" type="button" disabled={busy} onClick={()=>chooseLobby()}>‹ Арена</button>
  {mode==='duel'?duel:<section className="online-arena" aria-label={mode==='team'?'Арена 3×3':'Хаос 20×20'}>
   {notice&&<p role="status" className="online-status">{notice}</p>}
   {room&&room.mode===mode&&!isSearch(room)?<TeamScene key={room.id} match={room} now={now} busy={busy} send={send}/>:
    room&&room.mode===mode&&isSearch(room)?<div className="vvr-arena-search">
     <strong>Поиск соперников · {left(Date.parse(room.closesAt),now)} с</strong>
     <p>Участники · {room.queued}/{mode==='team'?6:40}</p>
     <ul>{room.roster.map(entry=><li key={entry.id}>{entry.name}</li>)}</ul>
     <button type="button" className="action secondary" disabled={busy} onClick={cancel}>Отменить поиск</button>
    </div>:<>
     <label className="online-class">Класс героя <select value={hero} onChange={event=>setHero(event.target.value as ArenaHero)}>
      {arenaHeroes.map(id=><option key={id} value={id}>{classNames[id]}</option>)}
     </select></label>
     <p>Сила атаки берётся из серверного профиля W066 и снаряжения. Свободные места займут тренировочные боты.</p>
     <button className="action" type="button" disabled={!signed||busy} onClick={start}>Начать поиск</button>
     {!signed&&<small>Откройте игру в Telegram, чтобы начать сетевой бой.</small>}
    </>}
  </section>}
 </section>;
 function chooseLobby(){setMode(undefined);setNotice('');}
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
   <p>Поиск длится 20 секунд в Дуэли и Отряде и 30 секунд в Хаосе. Сетевые бои не расходуют энергию. Бой с ботами — тренировка. Рейтинговое очко получает победитель завершённого боя с игроками. Чат доступен во время боя и ещё 30 минут.</p>
  </div>}
  <section className="vvr-arena-podium" aria-label="ТОП-50 Арены">
   <h3><Icon name="crown"/> ТОП-50 Арены</h3>
   {podium?.rows.length?<><ol className="vvr-podium">{podium.rows.slice(0,3).map((row,index)=>
    <li key={index}><small>№ {row.rank}</small><strong>{row.name}</strong><b>{row.points}</b></li>)}</ol>
    {podium.rows.length>3&&<details className="vvr-arena-rules"><summary>Весь рейтинг</summary>
     <ol start={4}>{podium.rows.slice(3).map((row,index)=><li key={index} aria-current={row.mine?'true':undefined}>{row.rank}. {row.name} · {row.points}</li>)}</ol>
    </details>}</>:<small>{notice||(podium?'В этом сезоне пока нет побед':'Сезонный рейтинг доступен через Telegram')}</small>}
  </section>
  {room&&<button className="action secondary" type="button" onClick={()=>choose(room.mode)}>
   {!isSearch(room)&&room.result?'Чат последнего командного боя':'Вернуться к командной Арене'}
  </button>}
  <div className="vvr-arena-modes" aria-label="Режимы боя">{modes.map(item=>
   <button type="button" key={item.id} className={'vvr-arena-mode mode-'+item.id} onClick={()=>choose(item.id)}>
    <img src={arenaArt(item.art+'.webp')} alt=""/><strong>{item.title}</strong><b>{item.size}</b><small>{item.desc}</small>
   </button>)}</div>
 </section>;
}

const arenaArt=(file:string)=>import.meta.env.BASE_URL+'art/arena/'+file;
const display=(player:Fighter)=>({...player,level:1,online:true,moved:false,gear:[]});
function TeamScene({match,now,busy,send}:{match:TeamBattle;now:number;busy:boolean;send:(action:Action)=>Promise<boolean>}){
 const [target,setTarget]=useState(''),[attack,setAttack]=useState<ArenaZone>('head'),[blocks,setBlocks]=useState<ArenaZone[]>([]);
 const enemies=match.players.filter(player=>player.side!==match.you.side);
 const opponent=enemies.find(player=>player.id===target&&player.hp>0)??enemies.find(player=>player.hp>0)??enemies[0];
 const me=match.players.find(player=>player.id===match.you.id)!;
 const locked=busy||!me.hp||!!match.result;
 const result=match.result;
 return <>
  <div className="online-clock">{match.training?'Тренировка':'Бой игроков'} · {match.mode==='team'?'3×3':'20×20'}</div>
  {result?<p role="status" className="online-status">{result.winner===null?'Ничья':result.winner===me.side?'Победа':'Поражение'}
   {' · '}{result.reason==='afk'?'Команда пропустила время атаки':result.reason==='time'?'Итог по здоровью':'Команда повержена'}{match.rankAwarded&&' · +1 к рейтингу'}</p>:
   <div className="online-clock">Ваш отряд {left(match.sideDeadline[me.side],now)} с · соперники {left(match.sideDeadline[opponent.side],now)} с</div>}
  <BattleStage you={display(me)} opponent={display(opponent)}/>
  <label className="online-class">Цель <select value={opponent.id} disabled={locked} onChange={event=>setTarget(event.target.value)}>
   {enemies.map(player=><option key={player.id} value={player.id} disabled={!player.hp}>{player.name} · {player.hp}/{player.maxHp} HP</option>)}
  </select></label>
  {!result&&<>
   <fieldset disabled={locked||match.you.auto}><legend>Удар · 1 зона</legend><div className="online-zones">{zoneIds.map(id=>
    <button key={id} type="button" className="action secondary" aria-pressed={attack===id} onClick={()=>setAttack(id)}>{zones[id].label}</button>
   )}</div></fieldset>
   <fieldset disabled={locked||match.you.auto}><legend>Защита · 2 зоны</legend><div className="online-zones">{zoneIds.map(id=>
    <button key={id} type="button" className="action secondary" aria-pressed={blocks.includes(id)}
     onClick={()=>setBlocks(current=>current.includes(id)?current.filter(zone=>zone!==id):[...current.slice(-1),id])}>{zones[id].label}</button>
   )}</div></fieldset>
   <div className="online-message-tabs">
    <button type="button" className="action secondary" disabled={locked} aria-pressed={match.you.auto}
     onClick={()=>send({kind:'auto',enabled:!match.you.auto})}>Авто</button>
    <button type="button" className="action" disabled={locked||match.you.auto||blocks.length!==2||match.you.nextStrikeAt>now}
     onClick={()=>send({kind:'strike',target:opponent.id,attack,blocks:[blocks[0],blocks[1]]})}>Ударить</button>
   </div>
   <ArenaBelt belt={match.you.belt} readyAt={match.you.itemReadyAt} now={now}
    fullHealth={me.hp===me.maxHp} disabled={locked} onItem={item=>void send({kind:'item',item})}/>
  </>}
  <RoomMessages match={match} now={now} pending={busy} send={text=>send({kind:'chat',text})}/>
  <details className="online-details"><summary>Участники боя · {match.players.length}</summary>
   {[me.side,opponent.side].map(side=><ul key={side}>
    {match.players.filter(player=>player.side===side).map(player=><li key={player.id}>{player.name} · {player.hp}/{player.maxHp} HP · {player.kills} ⨯</li>)}
   </ul>)}
  </details>
 </>;
}
