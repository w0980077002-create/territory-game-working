import {useEffect,useRef,useState} from 'react';
import {art,heroArt} from '../data/catalog';
import type {ArenaFighter,ArenaMatchView} from '../arena/protocol';

const secondsLeft=(until:number,now:number)=>Math.max(0,Math.ceil((until-now)/1000));

function Fighter({fighter,label}:{fighter:ArenaFighter;label:string}){
 return <div className="online-fighter">
  <div className="vvr-fighter-art">
   <img className="vvr-companion" src={art(label==='Вы'?'goose_aviator':'brown_white_dog')} alt=""/>
   <img src={art(heroArt[fighter.hero])} alt=""/>
  </div>
  <strong>{fighter.name}</strong>
  <small>{label} · ур. {fighter.level}</small>
  <progress aria-label={'Здоровье · '+label} value={fighter.hp} max={fighter.maxHp}/>
  <small>{fighter.hp}/{fighter.maxHp} HP{!fighter.online&&' · без связи'}</small>
 </div>;
}

export function BattleStage({you,opponent}:{you:ArenaFighter;opponent:ArenaFighter}){
 return <div className="online-fighters vvr-battle-stage"><Fighter fighter={you} label="Вы"/><Fighter fighter={opponent} label="Соперник"/></div>;
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
