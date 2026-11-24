import {useEffect,useRef,useState} from 'react';
import {classNames,heroArt,art,skillData,slotNames} from '../data/catalog';
import {telegramAccountId,tg} from '../core/telegram';
import {exportSave,parseSave,useGame} from '../core/store';
import {localArenaActor} from '../arena/staging';
import type {Player} from '../core/types';
import {gearBonusLabels,soloArenaPreview} from '../arena/soloPreview';
import {
 arenaElixirs,arenaKits,arenaSkills,gearSlots,zones,MATCH_WAIT_MS,
 type ArenaCommand,type ArenaElixir,type ArenaFighter,type ArenaHero,type ArenaKit,
 type ArenaMatchView,type ArenaSkill,type ArenaView,type ArenaZone,
} from '../arena/protocol';
import {Icon} from './Icon';
import './onlineArena.css';

let tabId:string;
const noConnection='Нет связи с Ареной. Восстанавливаем подключение…';
const reasons={hp:'Решило здоровье',time:'Лимит раундов',afk:'Пропущен ход',disconnect:'Связь с игроком потеряна',leave:'Игрок покинул бой'};
const outcomes={win:'Победа',loss:'Поражение',draw:'Ничья'};
const zoneIds=Object.keys(zones) as ArenaZone[];
const elixirIds=Object.keys(arenaElixirs) as ArenaElixir[];
const secondsLeft=(until:number,now:number)=>Math.max(0,Math.ceil((until-now)/1000));

class ArenaRequestError extends Error{
 constructor(readonly status:number,message:string){super(message)}
}
function arenaSessionKey(){
 const launch=tg()?.initData;
 if(launch){
  const id=telegramAccountId(),hash=new URLSearchParams(launch).get('hash');
  return id&&hash&&/^[a-f0-9]{64}$/i.test(hash)?'vvr-arena-session:'+id+':'+hash:undefined;
 }
 const actor=localArenaActor();
 return actor?'vvr-arena-session:local:'+actor:undefined;
}
function savedSession(){
 try{const key=arenaSessionKey();return key?sessionStorage.getItem(key)??'':''}catch{return ''}
}
function saveSession(token:string){
 try{
  const key=arenaSessionKey();
  if(key){if(token)sessionStorage.setItem(key,token);else sessionStorage.removeItem(key)}
 }catch{/* Keep the active in-memory session. */}
}
async function request<T>(path:string,token='',data?:Record<string,unknown>):Promise<T>{
 const response=await fetch('/arena-api/'+path,{
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
 const person=localArenaActor();
 if(person)
  return (await request<{initData:string}>('local?user='+person)).initData;
 throw new Error('Откройте эту сборку в Telegram.');
}

function Fighter({fighter,label}:{fighter:ArenaFighter;label:string}){
 return <div className="online-fighter">
  <img src={art(heroArt[fighter.hero])} alt=""/>
  <strong>{fighter.name}</strong>
  <small>{label} · ур. {fighter.level}</small>
  <progress aria-label={'Здоровье · '+label} value={fighter.hp} max={fighter.maxHp}/>
  <small>{fighter.hp}/{fighter.maxHp} HP{!fighter.online&&' · без связи'}</small>
 </div>;
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
   <div className="online-supply">{elixirIds.map(id=>{
    const cooldown=secondsLeft(match.itemReadyAt[id]??0,now);
    return <div key={id}>
    <button className="action secondary" type="button" title={arenaElixirs[id].detail}
     disabled={pending||!match.belt[id]||cooldown>0||
       ((id==='heal_small'||id==='heal_large')&&match.you.hp===match.you.maxHp)}
     onClick={()=>act({kind:'item',item:id})}>{arenaElixirs[id].label} {id==='adrenaline'?'· 3×3':match.belt[id]}
     {cooldown>0&&' · '+cooldown+' с'}</button>
    </div>;
   })}</div>
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
 return <details className="online-details"><summary>Предпросмотр героя Solo</summary>
  <p>Расчёт по локальной копии героя на этом устройстве. Он не влияет на сетевой бой.</p>
  <p>{classNames[preview.hero]} · ур. {preview.level}</p>
  <p>Нормализованные показатели · HP {preview.hp} · атака {preview.attack} · защита {preview.defense} · крит {preview.crit}%</p>
  <ul>
   {preview.skillLevels.map((level,index)=><li key={skillData[index].name}>{skillData[index].name} · ур. {level}</li>)}
  </ul>
  <ul aria-label="Предпросмотр вклада 7 предметов">
   {preview.gear.map(({slot,contribution,cap},index)=><li key={slot}>
    {slotNames[slot]} · {gearBonusLabels[index]} · {contribution} из {cap}
   </li>)}
  </ul>
 </details>;
}

function RoomMessages({match,now,pending,send}:{match:ArenaMatchView;now:number;pending:boolean;send:(text:string)=>Promise<boolean>}){
 const [channel,setChannel]=useState<'log'|'chat'>('log');
 const [draft,setDraft]=useState('');
 const messageBox=useRef<HTMLDivElement>(null), stick=useRef(true);
 const messages=match[channel];
 const lastMessage=messages.at(-1)?.id;
 useEffect(()=>{
  const node=messageBox.current;
  if(node&&stick.current)node.scrollTop=node.scrollHeight;
 },[channel,lastMessage]);
 const remain=match.chatDeadline===null?null:secondsLeft(match.chatDeadline,now);
 return <div className="online-messages">
  <div className="online-message-tabs">
   <button className="action secondary" type="button" aria-pressed={channel==='log'} onClick={()=>{stick.current=true;setChannel('log')}}>Журнал боя</button>
   <button className="action secondary" type="button" aria-pressed={channel==='chat'} onClick={()=>{stick.current=true;setChannel('chat')}}>Боевой чат</button>
  </div>
  {channel==='chat'&&remain!==null&&<small>До закрытия чата · {Math.floor(remain/60)}:{String(remain%60).padStart(2,'0')}</small>}
  <div className="online-message-box" aria-label={channel==='chat'?'Сообщения комнаты':'События боя'} ref={messageBox} onScroll={e=>{
   const node=e.currentTarget;
   stick.current=node.scrollHeight-node.clientHeight-node.scrollTop<35;
  }}>
   {messages.length===0&&<small>Пока тихо</small>}
   {messages.map(event=><p key={event.id}>{event.author&&<strong>{event.author}: </strong>}{event.text}</p>)}
  </div>
  {channel==='chat'&&<form onSubmit={async event=>{
   event.preventDefault();
   const text=draft.trim();
   if(text&&await send(text))setDraft(current=>current===draft?'':current);
  }}>
   <input aria-label="Сообщение" placeholder="Написать…" maxLength={200} value={draft} disabled={remain===0} onChange={e=>setDraft(e.target.value)}/>
   <button className="action" type="submit" disabled={pending||remain===0||!draft.trim()}>Отправить</button>
  </form>}
 </div>;
}

type SaveCopy={
 revision:number;corrupt:boolean;snapshot:{revision:number;raw:string;checksum:string}|null;
 backups:{revision:number}[];
};
type CopyUpload={expected:number;requestId:string;raw:string};

function ArenaSaveCopies({token}:{token:string}){
 const [copy,setCopy]=useState<SaveCopy>();
 const [selected,setSelected]=useState<number>();
 const [upload,setUpload]=useState<CopyUpload>();
 const [confirm,setConfirm]=useState(false);
 const [busy,setBusy]=useState(false);
 const [feedback,setFeedback]=useState('');
 const lock=useRef(false);

 const perform=async(work:()=>Promise<void>)=>{
  if(lock.current)return;
  lock.current=true;setBusy(true);setFeedback('');
  try{await work()}
  catch(error){
   if(error instanceof ArenaRequestError&&error.status===409){
    setUpload(undefined);setCopy(undefined);
   }
   setFeedback(error instanceof ArenaRequestError
    ?(error.status===404?'Хранилище копий недоступно.':error.message)
    :'Нет связи с хранилищем. Локальная копия сохранена.');
  }finally{lock.current=false;setBusy(false)}
 };
 const load=(version?:number)=>perform(async()=>{
  setConfirm(false);
  const next=await request<SaveCopy>('save'+(version===undefined?'':'?revision='+version),token);
  setCopy(next);setSelected(version??next.revision);
  if(next.corrupt)setFeedback('Контрольная сумма не совпала. Выберите другую версию.');
 });
 const save=()=>perform(async()=>{
  const command=upload??(copy&&{expected:copy.revision,raw:exportSave(),requestId:crypto.randomUUID()});
  if(!command)return;
  setUpload(command);
  const saved=await request<{revision:number}>('save',token,command);
  setUpload(undefined);setCopy(undefined);setFeedback('Копия записана · версия '+saved.revision);
 });
 const restore=()=>perform(async()=>{
  const snapshot=copy?.snapshot;
  if(!snapshot)return;
  setConfirm(false);
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(snapshot.raw));
  const checksum=Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
  const parsed=checksum===snapshot.checksum?parseSave(snapshot.raw,true):null;
  if(!parsed){setFeedback('Копия повреждена или несовместима. Прогресс на устройстве сохранён.');return}
  if(useGame.getState().importSave(parsed))setFeedback('Версия '+snapshot.revision+' восстановлена на устройстве.');
  else setFeedback('Не удалось восстановить копию. Текущий прогресс сохранён.');
 });
 return <details className="online-details">
  <summary>Облачная копия Solo</summary>
  <p>Копии относятся к этому тренировочному профилю. Восстановление сохраняет прежнюю копию на устройстве.</p>
  {feedback&&<p role="status" className="online-status">{feedback}</p>}
  <button className="action secondary" disabled={busy||!!upload} onClick={()=>void load()}>Проверить копии</button>
  {copy&&<p>{copy.revision?'Текущая версия в облаке · '+copy.revision:'Облачных копий пока нет'}</p>}
  {copy&&copy.backups.length>1&&<label className="online-class">Версия копии
   <select value={selected} disabled={busy||!!upload||confirm} onChange={e=>void load(Number(e.target.value))}>
    {copy.backups.map(entry=><option key={entry.revision} value={entry.revision}>{entry.revision}</option>)}
   </select>
  </label>}
  {(upload||copy&&selected===copy.revision&&!copy.corrupt)&&
   <button className="action" disabled={busy||confirm} onClick={()=>void save()}>
    {upload?'Повторить отправку':'Сохранить копию'}
   </button>}
  {upload&&<button className="action secondary" disabled={busy} onClick={()=>{
   setUpload(undefined);setCopy(undefined);setFeedback('');
  }}>Отменить повтор</button>}
  {copy?.snapshot&&!upload&&(confirm?<div className="online-message-tabs">
   <button className="action secondary" disabled={busy} onClick={()=>setConfirm(false)}>Отмена</button>
   <button className="action" disabled={busy} onClick={()=>void restore()}>Подтвердить восстановление</button>
  </div>:<button className="action secondary" disabled={busy} onClick={()=>setConfirm(true)}>
   Восстановить версию {copy.snapshot.revision}
  </button>)}
 </details>;
}

export function OnlineArena({player}:{player:Player}){
 const [active,setActive]=useState(false),[view,setView]=useState<ArenaView>(),[token,setToken]=useState(savedSession);
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
  <p>Тренировочные поединки · без рейтинга и наград Solo</p>
  {view&&<small>Тренировочный уровень {view.level} · тестовые очки {view.points}</small>}
  {!queued&&!live&&<SoloPreview player={player}/>}
  {message&&<p role="status" className="online-status">{message}</p>}
  {!token&&<button className="action" disabled={pending} onClick={login}>Войти через Telegram</button>}
  {token&&!view&&!message&&<p role="status">Подключение к Арене…</p>}
  {view&&!queued&&!live&&<>
   <ArenaSaveCopies key={token} token={token}/>
   <label className="online-class">Класс бойца <select value={hero} onChange={e=>setHero(e.target.value as ArenaHero)}>
    {Object.entries(classNames).map(([id,name])=><option value={id} key={id}>{name}</option>)}
   </select></label>
   <label className="online-class">Тренировочный комплект <select value={kit} onChange={e=>setKit(e.target.value as ArenaKit)}>
    {Object.entries(arenaKits).map(([id,data])=><option value={id} key={id}>{data.label} · +{data.weapon} атака / +{data.armor} защита</option>)}
   </select></label>
   <button className="action" disabled={pending} onClick={()=>{setPrevious(undefined);void command('join',{hero,kit})}}>Найти соперника</button>
  </>}
  {queued&&<>
   <p className="online-clock">Поиск · уровни ±7 · {secondsLeft(queued.since+MATCH_WAIT_MS,now)} с</p>
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
   <div className="online-clock">{shown.bot?'Тренировочный бот':'Игрок против игрока'}</div>
   <div className="online-fighters"><Fighter fighter={shown.you} label="Вы"/><Fighter fighter={shown.opponent} label="Соперник"/></div>
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
