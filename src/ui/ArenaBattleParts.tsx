import {useEffect,useRef,useState,type ReactNode} from 'react';
import {art,heroArt} from '../data/catalog';
import {arenaElixirs,zones,type ArenaElixir,type ArenaFighter,type ArenaMatchView,type ArenaZone} from '../arena/protocol';
import {Icon} from './Icon';

const secondsLeft=(until:number,now:number)=>Math.max(0,Math.ceil((until-now)/1000));

/** Battle layout adapted from TERRITORY BattleScene: defense column · fighters with compact HP plates · attack column,
 * on the painted arena. Only presentation: every action still goes through the existing server commands. */
type SceneFighter=Pick<ArenaFighter,'name'|'hero'|'level'|'hp'|'maxHp'|'online'>;
const zoneIds=Object.keys(zones) as ArenaZone[];

function Plate({fighter,label,ally}:{fighter:SceneFighter;label:string;ally:boolean}){
 const pct=Math.max(0,Math.min(100,fighter.hp/fighter.maxHp*100));
 return <div className={'vvr-plate'+(ally?' ally':' foe')+(pct<30?' low':'')}>
  <strong>{fighter.name}</strong>
  <small>{label} · ур. {fighter.level}</small>
  <i role="progressbar" aria-label={'Здоровье · '+label} aria-valuemin={0} aria-valuemax={fighter.maxHp} aria-valuenow={fighter.hp}><b style={{width:pct+'%'}}/></i>
  <small className="vvr-plate-hp">{fighter.hp}/{fighter.maxHp} HP{!fighter.online&&' · без связи'}</small>
 </div>;
}

function Figure({fighter,ally}:{fighter:SceneFighter;ally:boolean}){
 return <div className={'vvr-figure'+(ally?'':' foe')+(fighter.hp<=0?' fallen':'')}>
  <img className="vvr-companion" src={art(ally?'goose_aviator':'brown_white_dog')} alt=""/>
  <img key={fighter.hp} className="vvr-hero" src={art(heroArt[fighter.hero])} alt=""/>
 </div>;
}

export function FightScene({you,opponent,attack,blocks,onAttack,onBlock,locked,status,result,children}:{
 you:SceneFighter;opponent:SceneFighter;attack:ArenaZone;blocks:ArenaZone[];onAttack:(zone:ArenaZone)=>void;onBlock:(zone:ArenaZone)=>void;
 locked:boolean;status?:string;result?:ReactNode;children?:ReactNode;
}){
 return <div className="vvr-battle-stage vvr-fight">
  <div className={'vvr-fight-grid'+(result?' finished':'')}>
   {!result&&<div className="vvr-zone-col def" role="group" aria-label="Защита · 2 зоны">
    <small>Защита {blocks.length}/2</small>
    {zoneIds.map(id=><button key={id} type="button" disabled={locked} aria-pressed={blocks.includes(id)} onClick={()=>onBlock(id)}><Icon name="shield"/>{zones[id].label}</button>)}
   </div>}
   <div className="vvr-fight-center">
    <div className="vvr-fight-plates"><Plate fighter={you} label="Вы" ally/><Plate fighter={opponent} label="Соперник" ally={false}/></div>
    <div className="vvr-fight-figures"><Figure fighter={you} ally/><Figure fighter={opponent} ally={false}/></div>
    {status&&!result&&<span className="vvr-fight-status" role="status">{status}</span>}
   </div>
   {!result&&<div className="vvr-zone-col atk" role="group" aria-label="Удар · 1 зона">
    <small>Удар</small>
    {zoneIds.map(id=><button key={id} type="button" disabled={locked} aria-pressed={attack===id} onClick={()=>onAttack(id)}><Icon name="axe"/>{zones[id].label}</button>)}
   </div>}
  </div>
  {result&&<div className="vvr-fight-result">{result}</div>}
  {children&&<div className="vvr-fight-actions">{children}</div>}
 </div>;
}

/** TERRITORY ArenaResultCard in VVR materials: outcome, reason, rating change and the open post-fight chat. */
export function ArenaResult({outcome,reason,extra,chatLeft,onLeave,leaveLabel='Вернуться на Арену'}:{
 outcome:'win'|'loss'|'draw';reason:string;extra?:string;chatLeft:number|null;onLeave?:()=>void;leaveLabel?:string;
}){
 const title={win:'Победа',loss:'Поражение',draw:'Ничья'}[outcome];
 return <div className={'vvr-result '+outcome} role="status">
  <Icon name={outcome==='win'?'crown':outcome==='draw'?'shield':'axes'}/>
  <strong>{title}</strong>
  <span>{reason}{extra&&<> · <b>{extra}</b></>}</span>
  {chatLeft!==null&&chatLeft>0&&<small>Чат открыт ещё {Math.floor(chatLeft/60)}:{String(chatLeft%60).padStart(2,'0')}</small>}
  {onLeave&&<button type="button" className="action" onClick={onLeave}>{leaveLabel}</button>}
 </div>;
}

/** TERRITORY FighterList: a folded HP strip per side; open it to see every fighter and pick a target. */
export function FighterList({title,ally,fighters,meId,targetId,onTarget}:{
 title:string;ally:boolean;fighters:{id:string;name:string;hp:number;maxHp:number;kills:number}[];meId?:string;targetId?:string;onTarget?:(id:string)=>void;
}){
 const alive=fighters.filter(f=>f.hp>0).length;
 return <details className={'vvr-fighters '+(ally?'ally':'foe')} open={!ally&&!!onTarget}>
  <summary><span>{title}</span><span className="vvr-fighters-strip" aria-hidden="true">{fighters.slice(0,20).map(f=><i key={f.id}><b style={{width:Math.max(0,f.hp/f.maxHp*100)+'%'}}/></i>)}</span><em>{alive}/{fighters.length}</em></summary>
  <ul>{fighters.map(f=>{const dead=f.hp<=0,me=f.id===meId,pick=!!onTarget&&!dead;
   return <li key={f.id} className={(f.id===targetId?'target ':'')+(dead?'dead ':'')+(me?'me':'')}>
    {pick?<button type="button" aria-pressed={f.id===targetId} aria-label={'Цель · '+f.name} onClick={()=>onTarget!(f.id)}>{f.name}</button>:<span>{f.name}{me&&' (вы)'}</span>}
    <i><b style={{width:Math.max(0,f.hp/f.maxHp*100)+'%'}}/></i><small>{f.hp}/{f.maxHp}</small>{f.kills>0&&<small>⚔ {f.kills}</small>}
   </li>})}</ul>
 </details>;
}

export function RoomMessages({match,now,pending,send}:{match:Pick<ArenaMatchView,'log'|'chat'|'chatDeadline'>;now:number;pending:boolean;send:(text:string)=>Promise<boolean>}){
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


const elixirIds=Object.keys(arenaElixirs) as ArenaElixir[];
const iconByElixir=['potion','potion','weapon','shield','crown','clock','heart'];

export function ArenaBelt({belt,readyAt,now,disabled,fullHealth,onItem}:{
 belt:Record<ArenaElixir,number>;readyAt:Partial<Record<ArenaElixir,number>>;now:number;
 disabled:boolean;fullHealth:boolean;onItem:(item:ArenaElixir)=>void;
}){
 return <div className="vvr-arena-belt" aria-label="Пояс эликсиров">{elixirIds.map((id,index)=>{
  const cooldown=secondsLeft(readyAt[id]??0,now);
  const label=arenaElixirs[id].label+' '+belt[id]+(cooldown?' · '+cooldown+' с':'');
  return <button type="button" key={id} title={label+'. '+arenaElixirs[id].detail} aria-label={label}
   disabled={disabled||!belt[id]||cooldown>0||(fullHealth&&(id==='heal_small'||id==='heal_large'))}
   onClick={()=>onItem(id)}><Icon name={iconByElixir[index]}/><small>{cooldown?cooldown+'с':belt[id]}</small></button>;
 })}</div>;
}
