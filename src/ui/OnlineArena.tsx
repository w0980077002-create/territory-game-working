import {useEffect,useRef,useState} from 'react';
import {classNames} from '../data/catalog';
import {tg} from '../core/telegram';
import {rewardLocalArenaDuel,useGame} from '../core/store';
import type {Player} from '../core/types';
import {arenaApiOrigin,onlineArenaEnabled} from '../arena/staging';
import {arenaBuild} from '../arena/hero';
import {localArena,SOLO_ACTOR,startLocalArena,updateLocalArena} from '../arena/local';
import {capacities,nextLiveWake,viewLive,type ArenaMode,type LiveAction,type LiveBattle,type LiveSearch,type LiveView,type RecentBattle} from '../arena/match';
import {healingPotion} from '../arena/potion';
import {CHAT_MS,MATCH_WAIT_MS,type ArenaZone} from '../arena/protocol';
import {ArenaBattleView,ArenaResult,FighterList} from './ArenaBattle';
import {ArenaHub,arenaModes} from './ArenaHub';
import './onlineArena.css';

const sessionKey='vvr-arena-session';
const noConnection='Нет связи с Ареной. Восстанавливаем подключение…';
const reasons={hp:'Решило здоровье',time:'Время боя вышло',afk:'Пропущен ход',disconnect:'Связь с игроком потеряна',leave:'Игрок покинул бой'};
const left=(until:number,now:number)=>Math.max(0,Math.ceil((until-now)/1000));
let tabId:string;
class ArenaRequestError extends Error{
 constructor(readonly status:number,message:string){super(message)}
}
function tokenFromSession(){try{return sessionStorage.getItem(sessionKey)??''}catch{return ''}}
function saveSession(token:string){try{sessionStorage.setItem(sessionKey,token)}catch{/* In-memory session is still active. */}}
const localFixture=()=>!arenaApiOrigin&&location.hostname==='127.0.0.1'?
 new URLSearchParams(location.search).get('arenaLocal'):null;
async function request<T>(path:string,token='',data?:Record<string,unknown>):Promise<T>{
 const response=await fetch(arenaApiOrigin+'/arena-api/'+path,{
  method:data?'POST':'GET',signal:AbortSignal.timeout(4500),cache:'no-store',
  headers:{...(token?{Authorization:'Bearer '+token,'X-Arena-Tab':tabId??=crypto.randomUUID()}:{}),
   ...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,
 });
 const result=await response.json();
 if(!response.ok)throw new ArenaRequestError(response.status,result.error??'Арена временно недоступна');
 return result as T;
}
async function login(){
 const fixture=localFixture();
 const initData=tg()?.initData||(fixture? (await request<{initData:string}>('local?user='+fixture)).initData:'');
 if(!initData)throw new Error('Войдите через Telegram');
 const session=await request<{token:string}>('auth','',{initData});
 saveSession(session.token);
 return session.token;
}

function BattleScene({battle,now,player,busy,send,resume,onLobby,rewarded}:{
 battle:LiveBattle;now:number;player:Player;busy:boolean;send:(action:LiveAction)=>Promise<boolean>;
 resume:()=>void;onLobby:()=>void;rewarded?:{seal:boolean};
}){
 const [selection,setSelection]=useState<{round?:number;attack:ArenaZone;blocks:ArenaZone[]}>({attack:'head',blocks:[]});
 const [target,setTarget]=useState(''),[leaving,setLeaving]=useState(false);
 const current=selection.round===battle.round?selection:{round:battle.round,attack:'head' as const,blocks:[]};
 const {attack,blocks}=current;
 const {result,you,mode,auto,control}=battle;
 const enemies=battle.players.filter(p=>p.side!==you.side),allies=battle.players.filter(p=>p.side===you.side);
 const opponent=enemies.find(p=>p.id===target&&p.hp>0)??enemies.find(p=>p.hp>0)??enemies[0];
 const delay=left(battle.nextStrikeAt,now);
 const locked=busy||!control||!you.hp||you.moved||!left(battle.deadline,now);
 const strike=()=>{
  if(blocks.length!==2)return;
  const zones:[ArenaZone,ArenaZone]=[blocks[0],blocks[1]];
  return send(mode==='duel'?{kind:'move',move:{attack,blocks:zones,skill:null}}:
   {kind:'strike',target:opponent.id,attack,blocks:zones});
 };
 const status=!control?undefined:!you.hp?'Вы пали':you.moved?'Ход принят · ждём соперника':auto?'Автобой':
  delay?'Следующий удар через '+delay+' с':blocks.length<2?'Защита: выберите ещё '+(2-blocks.length):undefined;
 const potionCost=battle.local?healingPotion.cost(player.stage):undefined;
 return <ArenaBattleView mode={arenaModes[mode].size+' · '+(battle.local?'Бой с ботами':battle.ranked?'Рейтинговый бой':'Сетевой бой')}
  round={battle.round} timer={result?null:left(battle.deadline,now)} you={you} opponent={opponent} look={player} now={now}
  zoneControls={result||auto||!control?null:{attack,blocks,locked,
   onAttack:zone=>setSelection({...current,attack:zone}),
   onBlock:zone=>setSelection({...current,blocks:blocks.includes(zone)?blocks.filter(id=>id!==zone):[...blocks.slice(-1),zone]})}}
  status={status} outcome={result?.outcome}
  result={result&&<ArenaResult outcome={result.outcome} reason={reasons[result.reason]}
   extra={result.points?'+1 к рейтингу':rewarded?'+100 золота · +10 жетонов · +30 опыта'+(rewarded.seal?' · печать призыва':''):undefined}
   onLeave={onLobby}/>}
  actions={result?undefined:!control?<button type="button" className="vvr-act strike" disabled={busy} onClick={resume}>Продолжить в этой вкладке</button>:<>
   <button type="button" className="vvr-act auto" disabled={busy||!you.hp} aria-pressed={auto}
    onClick={()=>void send({kind:'auto',enabled:!auto})}>Автобой</button>
   <button type="button" className="vvr-act reset" disabled={locked||auto||!blocks.length} aria-label="Сбросить выбор зон"
    onClick={()=>setSelection({round:battle.round,attack:'head',blocks:[]})}>Сброс</button>
   <button type="button" className="vvr-act strike" disabled={locked||auto||delay>0||blocks.length!==2} onClick={()=>void strike()}>
    {you.moved?'Ход принят':'Ударить'}
   </button>
  </>}
  belt={result?null:{belt:battle.belt,readyAt:battle.itemReadyAt,disabled:busy||!control||!you.hp||potionCost!==undefined&&player.gold<potionCost,
   fullHealth:you.hp===you.maxHp,cost:potionCost,onItem:item=>void send({kind:'item',item})}}
  dock={<>
   {mode!=='duel'&&<>
    <FighterList title={'Противники · '+opponent.name} ally={false} fighters={enemies} targetId={opponent.id} onTarget={result?undefined:setTarget}/>
    <FighterList title="Ваш отряд" ally fighters={allies} meId={you.id}/>
   </>}
   {!result&&control&&(!leaving?<button type="button" className="vvr-leave" onClick={()=>setLeaving(true)}>Покинуть бой</button>:
    <div className="vvr-leave-confirm"><button type="button" onClick={()=>setLeaving(false)}>Остаться</button>
     <button type="button" disabled={busy} onClick={()=>void send({kind:'leave'})}>Подтвердить выход</button></div>)}
  </>}
  feed={{log:battle.log,chat:battle.chat,chatDeadline:battle.chatDeadline,pending:busy||!control&&!result,send:text=>send({kind:'chat',text})}}/>;
}

export function OnlineArena({player}:{player:Player}){
 const mutate=useGame(s=>s.mutate);
 const liveLocal=localArena(player);
 const [token,setToken]=useState(tokenFromSession),[network,setNetwork]=useState<LiveView>();
 const [search,setSearch]=useState<LiveSearch>(),[mode,setMode]=useState<ArenaMode>();
 const [now,setNow]=useState(Date.now()),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [dismissed,setDismissed]=useState<string>();
 const [past,setPast]=useState<LiveBattle>(),[recent,setRecent]=useState<RecentBattle[]>([]);
 const flight=useRef(false),revision=useRef(0);
 const signed=onlineArenaEnabled&&(!!tg()?.initData||!!localFixture());
 const localId=liveLocal?.match.game.id;
 const networkMatch=network?.battle;
 const networkSearch=network?.search;
 const pollingFast=!!networkSearch||!!networkMatch&&!networkMatch.result;
 const localMatch=liveLocal&&(!liveLocal.match.game.result||now<liveLocal.match.game.result.finishedAt+CHAT_MS)?
  viewLive(liveLocal.match,SOLO_ACTOR,SOLO_ACTOR,now,true):undefined;
 const candidate=networkMatch&&!networkMatch.result?networkMatch:localMatch&&!localMatch.result?localMatch:
  [networkMatch,localMatch].filter((item):item is LiveBattle=>!!item).sort((a,b)=>(b.result?.finishedAt??0)-(a.result?.finishedAt??0))[0];
 const battle=past??(candidate&&candidate.id!==dismissed?candidate:undefined);
 const searching=networkSearch??search;
 const localActive=!!localMatch&&!localMatch.result;
 const showingLocal=!!battle?.local;
 const inLobby=!battle&&!searching;
 const pastId=past?.id;
 useEffect(()=>{
  if(!token||!inLobby)return;
  let active=true;
  request<RecentBattle[]>('live/recent',token).then(data=>{if(active&&Array.isArray(data))setRecent(data)}).catch(()=>{});
  return ()=>{active=false};
 },[token,inLobby]);

 useEffect(()=>{
  const timer=setInterval(()=>setNow(Date.now()),250);
  return ()=>clearInterval(timer);
 },[]);
 useEffect(()=>{
  if(!signed||showingLocal)return;
  let stopped=false,timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{
   const version=revision.current;
   if(!flight.current)try{
    const session=token||await login();
    const next=await request<LiveView>(pastId?'live/room?match='+pastId:'live/state',session);
    if(!stopped&&version===revision.current){
     if(!token)setToken(session);
     if(pastId)setPast(next.battle);else setNetwork(next);setNotice(old=>old===noConnection?'':old);
    }
   }catch(error){
    if(!stopped&&version===revision.current){
     if(error instanceof ArenaRequestError&&error.status===401){saveSession('');setToken('');}
     else if(pastId&&error instanceof ArenaRequestError&&error.status===404)setPast(undefined);
     else setNotice(noConnection);
    }
   }
   if(!stopped)timer=setTimeout(poll,pollingFast?750:3500);
  };
  void poll();
  return ()=>{stopped=true;clearTimeout(timer)};
 },[signed,token,pollingFast,showingLocal,pastId]);
 useEffect(()=>{
  const fallback=network?.local??(search&&now>=search.deadline?search:undefined);
  if(!fallback||localId===fallback.id||dismissed===fallback.id)return;
  if(mutate(p=>startLocalArena(p,fallback.id,fallback.mode,Date.now()),true)){
   setSearch(undefined);setMode(undefined);setNetwork(current=>current?{now:current.now}:undefined);
  }
 },[network?.local,search,now,localId,dismissed,mutate]);
 useEffect(()=>{
  if(!localId||!localActive)return;
  const timer=setInterval(()=>{
   const now=Date.now(),saved=localArena(useGame.getState().p);
   if(!saved||now<nextLiveWake(saved.match))return;
   mutate(p=>{
    if(!updateLocalArena(p,now))return false;
    award(p);
    return true;
   },true);
  },400);
  return ()=>clearInterval(timer);
 },[localId,localActive,mutate]);

 async function perform(work:()=>Promise<boolean>){
  if(flight.current)return false;
  flight.current=true;revision.current++;setBusy(true);setNotice('');
  try{return await work();}
  catch(error){
   if(error instanceof ArenaRequestError&&error.status===401){saveSession('');setToken('');}
   setNotice(error instanceof ArenaRequestError?error.message:noConnection);
   return false;
  }finally{flight.current=false;setBusy(false);}
 }

 function award(p:Player){
  const saved=localArena(p);
  if(saved?.match.mode==='duel'&&saved.match.game.result?.winner===SOLO_ACTOR&&!saved.reward){
   rewardLocalArenaDuel(p);saved.reward={seal:p.arenaWins%3===0};
  }
 }
 function choose(next:ArenaMode){
  setMode(next);setNotice('');setDismissed(candidate?.id);
  if(signed){
   void perform(async()=>{
    const session=token||await login();setToken(session);
    setNetwork(await request('live/join',session,{mode:next,build:arenaBuild(player)}));
    return true;
   });
  }else setSearch({id:crypto.randomUUID(),mode:next,deadline:Date.now()+MATCH_WAIT_MS,names:[classNames[player.heroClass]],control:true,revision:0});
 }
 function control(path:'cancel'|'resume',target:{id:string;revision:number}){
  void perform(async()=>{
   setNetwork(await request('live/'+path,token,{target:target.id,revision:target.revision}));
   if(path==='cancel')setMode(undefined);
   return true;
  });
 }
 function send(action:LiveAction){
  if(!battle)return Promise.resolve(false);
  if(battle.local){
   return Promise.resolve(mutate(p=>{
    if(localArena(p)?.match.game.id!==battle.id||!updateLocalArena(p,Date.now(),action))return false;
    award(p);
    return true;
   },true));
  }
  return perform(async()=>{
   const reply=await request<{accepted:boolean;view:LiveView}>('live/act',token,{
    target:battle.id,revision:battle.revision,round:battle.round??0,sequence:battle.nextSequence,action,
   });
   if(pastId)setPast(reply.view.battle);else setNetwork(reply.view);
   if(!reply.accepted)setNotice('Действие сейчас недоступно');
   return reply.accepted;
  });
 }
 if(searching)return <section className="vvr-arena" aria-label="Арена">
  <div className="vvr-arena-search">
   <span className="vvr-search-spinner" aria-hidden="true"/>
   <strong>Поиск · {arenaModes[searching.mode].size} · {left(searching.deadline,now)} с</strong>
   <small>Уровень {player.level} · соперники в пределах ±7</small>
   <p>Участники · {searching.names.length}/{capacities[searching.mode]}</p>
   <ul>{searching.names.map((name,i)=><li key={i}>{name}</li>)}</ul>
   {searching.control?<button type="button" className="action secondary" disabled={busy} onClick={()=>{
    if(networkSearch)control('cancel',searching);else {setSearch(undefined);setMode(undefined)}
   }}>Отменить поиск</button>:<button type="button" className="action" disabled={busy} onClick={()=>control('resume',searching)}>Продолжить в этой вкладке</button>}
  </div>
  {notice&&<p className="online-status" role="status">{notice}</p>}
 </section>;
 if(battle)return <section className="vvr-arena" aria-label="Арена">
  {notice&&<p className="online-status" role="status">{notice}</p>}
  <BattleScene key={battle.id} battle={battle} now={now} player={player} busy={busy}
   send={send} resume={()=>control('resume',battle)} onLobby={()=>{setDismissed(candidate?.id??battle.id);setMode(undefined);setPast(undefined)}} rewarded={battle.local?liveLocal?.reward:undefined}/>
 </section>;
 return <ArenaHub player={player} onMode={choose} pending={busy} notice={notice}
  pendingMode={mode} onResume={candidate?.local?()=>setDismissed(undefined):undefined}
  recent={recent.filter(item=>now<item.chatDeadline)} onPast={id=>void perform(async()=>{
   const view=await request<LiveView>('live/room?match='+id,token);
   setPast(view.battle);
   return !!view.battle;
  })}/>;
}
