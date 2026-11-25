import {useEffect,useRef,useState} from 'react';
import {classNames,skillData,slotNames} from '../data/catalog';
import {tg} from '../core/telegram';
import {arenaApiOrigin} from '../arena/staging';
import type {Player} from '../core/types';
import {gearBonusLabels,soloArenaPreview} from '../arena/soloPreview';
import {
 arenaKits,arenaSkills,gearSlots,zones,MATCH_WAIT_MS,
 type ArenaCommand,type ArenaHero,type ArenaKit,
 type ArenaMatchView,type ArenaSkill,type ArenaView,type ArenaZone,
} from '../arena/protocol';
import {Icon} from './Icon';
import {ArenaBelt,BattleStage,RoomMessages} from './ArenaBattleParts';
import {ArenaHub} from './ArenaHub';
import './onlineArena.css';

const sessionKey='vvr-arena-session';
let tabId:string;
const noConnection='Нет связи с Ареной. Восстанавливаем подключение…';
const reasons={hp:'Решило здоровье',time:'Лимит раундов',afk:'Пропущен ход',disconnect:'Связь с игроком потеряна',leave:'Игрок покинул бой'};
const outcomes={win:'Победа',loss:'Поражение',draw:'Ничья'};
const zoneIds=Object.keys(zones) as ArenaZone[];
const secondsLeft=(until:number,now:number)=>Math.max(0,Math.ceil((until-now)/1000));

class ArenaRequestError extends Error{
 constructor(readonly status:number,message:string){super(message)}
}
function savedSession(){
 try{return sessionStorage.getItem(sessionKey)??''}catch{return ''}
}
function saveSession(token:string){
 try{if(token)sessionStorage.setItem(sessionKey,token);else sessionStorage.removeItem(sessionKey)}catch{/* Keep the active in-memory session. */}
}
async function request<T>(path:string,token='',data?:Record<string,unknown>):Promise<T>{
 const response=await fetch(arenaApiOrigin+'/arena-api/'+path,{
  method:data?'POST':'GET',signal:AbortSignal.timeout(4500),cache:'no-store',
  headers:{...(token?{Authorization:'Bearer '+token,'X-Arena-Tab':tabId??=crypto.randomUUID()}:{}),
   ...(data?{'Content-Type':'application/json'}:{})},
  body:data?JSON.stringify(data):undefined,
 });
 const result=await response.json();
 if(!response.ok)throw new ArenaRequestError(response.status,result.error??'Арена временно недоступна');
 return result as T;
}
async function launchData(){
 const initData=tg()?.initData;
 if(initData)return initData;
 const person=new URLSearchParams(location.search).get('arenaLocal');
 if(!arenaApiOrigin&&location.hostname==='127.0.0.1'&&(person==='alice'||person==='boris'))
  return (await request<{initData:string}>('local?user='+person)).initData;
 throw new Error('Откройте эту сборку в Telegram.');
}

function RoundControls({match,now,pending,act}:{match:ArenaMatchView;now:number;pending:boolean;act:(action:ArenaCommand)=>void}){
 const [attack,setAttack]=useState<ArenaZone>('head');
 const [blocks,setBlocks]=useState<ArenaZone[]>([]);
 const [skill,setSkill]=useState<ArenaSkill|null>(null);
 const locked=pending||match.you.moved||!secondsLeft(match.deadline,now);
 const chooseBlock=(zone:ArenaZone)=>setBlocks(current=>current.includes(zone)?current.filter(id=>id!==zone):[...current.slice(-1),zone]);
 return <>
  <button className="action secondary" type="button" disabled={pending} aria-pressed={match.auto} onClick={()=>act({kind:'auto',enabled:!match.auto})}>
   Автобой {match.auto?'вкл.':'выкл.'}
  </button>
  {!match.auto&&<>
   <fieldset disabled={locked}><legend>Удар · 1 зона</legend>
    <div className="online-zones">{zoneIds.map(id=><button key={id} type="button" className="action secondary" aria-pressed={attack===id}
     onClick={()=>setAttack(id)}>{zones[id].label}</button>)}</div>
   </fieldset>
   <fieldset disabled={locked}><legend>Защита · 2 зоны</legend>
    <div className="online-zones">{zoneIds.map(id=><button key={id} type="button" className="action secondary" aria-pressed={blocks.includes(id)}
     onClick={()=>chooseBlock(id)}>{zones[id].label}</button>)}</div>
   </fieldset>
   <details className="online-details"><summary>Умение героя</summary>
    <div className="online-skills">{arenaSkills.map((id,i)=><button key={id} type="button" className="action secondary" aria-pressed={skill===id}
     disabled={locked||match.ready[id]>now} onClick={()=>setSkill(skill===id?null:id)}><Icon name={skillData[i].icon}/>{skillData[i].name}</button>)}</div>
   </details>
   <button className="action" type="button" disabled={locked||blocks.length!==2||!!(skill&&match.ready[skill]>now)}
    onClick={()=>act({kind:'move',move:{attack,blocks:[blocks[0],blocks[1]],skill}})}>{match.you.moved?'Ход принят':'Подтвердить ход'}</button>
  </>}
  <details className="online-details"><summary>Пояс эликсиров</summary>
   <ArenaBelt belt={match.belt} readyAt={match.itemReadyAt} now={now} disabled={pending}
    fullHealth={match.you.hp===match.you.maxHp} onItem={item=>act({kind:'item',item})}/>
  </details>
 </>;
}

function Gear({match}:{match:ArenaMatchView}){
 return <details className="online-details"><summary>Тренировочная экипировка · 7 ячеек</summary>
  <div className="online-gear">
   <span></span><strong>Вы</strong><strong>Соперник</strong>
   {gearSlots.map((id,i)=><div className="online-gear-row" key={id}>
    <span><Icon name={id}/> {slotNames[id]} <small>· {gearBonusLabels[i]}</small></span>
    <span>+{match.you.gear[i]}</span><span>+{match.opponent.gear[i]}</span>
   </div>)}
  </div>
 </details>;
}

function SoloPreview({player}:{player:Player}){
 const preview=soloArenaPreview(player);
 return <details className="online-details"><summary>Сила вашего героя</summary>
  <p>Сравнение для справки: сетевой бой идёт на выбранном комплекте ниже.</p>
  <p>{classNames[preview.hero]} · ур. {preview.level}</p>
  <p>Показатели для Арены · HP {preview.hp} · атака {preview.attack} · защита {preview.defense} · крит {preview.crit}%</p>
  <ul>
   {preview.skillLevels.map((level,index)=><li key={skillData[index].name}>{skillData[index].name} · ур. {level}</li>)}
  </ul>
  <ul aria-label="Вклад 7 предметов">
   {preview.gear.map(({slot,contribution,cap},index)=><li key={slot}>
    {slotNames[slot]} · {gearBonusLabels[index]} · {contribution} из {cap}
   </li>)}
  </ul>
 </details>;
}

function DuelArena({player,initiallyOpen=false}:{player:Player;initiallyOpen?:boolean}){
 const [active,setActive]=useState(initiallyOpen),[view,setView]=useState<ArenaView>(),[token,setToken]=useState(savedSession);
 const [hero,setHero]=useState<ArenaHero>(player.heroClass),[kit,setKit]=useState<ArenaKit>('balanced');
 const [message,setMessage]=useState(''),[pending,setPending]=useState(false);
 const [previous,setPrevious]=useState<ArenaMatchView>();
 const [leaving,setLeaving]=useState(false);
 const commandInFlight=useRef(false),revision=useRef(0);
 const previousId=previous?.id;
 useEffect(()=>{
  if(!active||!token)return;
  let stopped=false,timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{
   const version=revision.current;
   if(!commandInFlight.current){
    try{
     const next=await request<ArenaView>('state',token);
     if(!stopped&&version===revision.current){
      setView(next);setMessage(old=>old===noConnection?'':old);
     }
     if(previousId&&!stopped){
      const past=await request<ArenaMatchView>('room?match='+previousId,token);
      if(!stopped&&version===revision.current)setPrevious(past);
     }
    }catch(error){
     if(!stopped&&version===revision.current){
      if(error instanceof ArenaRequestError&&error.status===401){setToken('');saveSession('');setView(undefined);setPrevious(undefined);setMessage(error.message)}
      else if(error instanceof ArenaRequestError&&error.status===404&&previousId)setPrevious(undefined);
      else setMessage(noConnection);
     }
    }
   }
   if(!stopped)timer=setTimeout(poll,500);
  };
  void poll();
  return ()=>{stopped=true;clearTimeout(timer)};
 },[active,token,previousId]);

 const perform=async(work:()=>Promise<void>)=>{
  if(commandInFlight.current)return false;
  commandInFlight.current=true;revision.current++;setPending(true);setMessage('');
  try{await work();return true}
  catch(error){
   if(error instanceof ArenaRequestError&&error.status===401){setToken('');saveSession('');setView(undefined);setPrevious(undefined)}
   setMessage(error instanceof ArenaRequestError||error instanceof Error&&error.message.startsWith('Откройте')?error.message:noConnection);
   return false;
  }finally{commandInFlight.current=false;setPending(false)}
 };
 const login=()=>perform(async()=>{
  const session=await request<{token:string}>('auth','',{initData:await launchData()});
  saveSession(session.token);setToken(session.token);
 });
 const command=(path:string,data:Record<string,unknown>={})=>perform(async()=>setView(await request(path,token,data)));
 const controlCommand=(path:'resume'|'leave',target:{id:string;controlRevision:number})=>
  command(path,{target:target.id,revision:target.controlRevision});
 const act=(action:ArenaCommand)=>perform(async()=>{
  if(!view?.match)return;
  const {id,round,nextSequence,controlRevision}=view.match;
  const reply=await request<{accepted:boolean;view:ArenaView}>('act',token,{target:id,revision:controlRevision,action,round,sequence:nextSequence});
  setView(reply.view);
  if(!reply.accepted)setMessage('Действие недоступно. Проверьте раунд, ход или перезарядку.');
 });
 const send=(id:string,text:string)=>perform(async()=>{
  const updated=await request<ArenaMatchView>('chat',token,{match:id,text});
  if(previousId===id)setPrevious(updated);
  else setView(current=>current?.match?.id===id?{...current,match:updated}:current);
 });
 if(!active)return <button className="action" onClick={()=>setActive(true)}><Icon name="arena"/> Сетевая Арена 1×1</button>;
 const {match,queued,now=0,lastResult}=view??{};
 const live=match&&!match.result;
 const shown=previous??match;
 return <section className="online-arena" aria-label="Сетевая Арена 1×1">
  <div className="online-heading"><Icon name="arena"/><strong>Сетевая Арена 1×1</strong></div>
  <p>Поединки 1×1. Если соперник не найден за 20 секунд, начнётся тренировка с ботом.</p>
  {view&&<small>Тренировочный уровень {view.level} · очки тренировки {view.points}</small>}
  {!queued&&!live&&<SoloPreview player={player}/>}
  {message&&<p role="status" className="online-status">{message}</p>}
  {!token&&<button className="action" disabled={pending} onClick={login}>Войти через Telegram</button>}
  {token&&!view&&!message&&<p role="status">Подключение к Арене…</p>}
  {view&&!queued&&!live&&<>
   <label className="online-class">Класс бойца <select value={hero} onChange={e=>setHero(e.target.value as ArenaHero)}>
    {Object.entries(classNames).map(([id,name])=><option value={id} key={id}>{name}</option>)}
   </select></label>
   <label className="online-class">Тренировочный комплект <select value={kit} onChange={e=>setKit(e.target.value as ArenaKit)}>
    {Object.entries(arenaKits).map(([id,data])=><option value={id} key={id}>{data.label} · +{data.weapon} атака / +{data.armor} защита</option>)}
   </select></label>
   <button className="action" disabled={pending} onClick={()=>{setPrevious(undefined);void command('join',{hero,kit})}}>Найти соперника</button>
  </>}
  {queued&&<>
   <div className="vvr-arena-search">
    <strong>Поиск · уровни ±7 · {secondsLeft(queued.since+MATCH_WAIT_MS,now)} с</strong>
    <ul><li>Вы · {classNames[hero]}</li><li>Подбираем соперника…</li></ul>
   </div>
   {!queued.control?<button className="action" disabled={pending} onClick={()=>controlCommand('resume',queued)}>Продолжить в этой вкладке</button>:
    <button className="action secondary" disabled={pending} onClick={()=>controlCommand('leave',queued)}>Отменить поиск</button>}
  </>}
  {previous?<button className="action secondary" onClick={()=>setPrevious(undefined)}>К текущей Арене</button>:
   lastResult&&<button className="action secondary" disabled={pending} onClick={()=>perform(async()=>{
    setPrevious(await request<ArenaMatchView>('room?match='+lastResult.id,token));
   })}>Чат прошлого боя</button>}
  {shown&&<>
   {shown.result?<div role="status" className="online-status">
    <strong>{outcomes[shown.result.outcome]}</strong> · {reasons[shown.result.reason]}
    {shown.result.points>0&&<> · +{shown.result.points} тестовое очко</>}
   </div>:<div className="online-clock">Раунд {shown.round} · {secondsLeft(shown.deadline,now)} с</div>}
   <div className="online-clock">{shown.bot?'Тренировочный бот':shown.training?'Тренировка без рейтинга':'Игрок против игрока'}</div>
   <BattleStage you={shown.you} opponent={shown.opponent}/>
   {!shown.result&&(!shown.control?<button className="action" disabled={pending} onClick={()=>controlCommand('resume',shown)}>Продолжить в этой вкладке</button>:
    <RoundControls key={shown.id+':'+shown.round} match={shown} now={now} pending={pending} act={act}/>)}
   <Gear match={shown}/>
   <RoomMessages key={shown.id} match={shown} now={now} pending={pending} send={text=>send(shown.id,text)}/>
   {!shown.result&&shown.control&&(!leaving?<button className="action secondary" onClick={()=>setLeaving(true)}>Покинуть поединок</button>:
    <div className="online-message-tabs">
     <button className="action secondary" disabled={pending} onClick={()=>setLeaving(false)}>Остаться</button>
     <button className="action" disabled={pending} onClick={()=>{setLeaving(false);void controlCommand('leave',shown)}}>Подтвердить выход</button>
    </div>)}
  </>}
 </section>;
}


export function OnlineArena({player,initiallyOpen=false}:{player:Player;initiallyOpen?:boolean}){
 if(!initiallyOpen)return <DuelArena player={player}/>;
 return <ArenaHub player={player} duel={<DuelArena player={player} initiallyOpen/>}/>;
}
