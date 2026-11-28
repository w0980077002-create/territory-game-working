import {useEffect,useState} from 'react';
import {previewMine} from '../core/mine';
import {useGame} from '../core/store';

export function useCollectionClock(active=true){
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{
  if(!active)return;
  const refresh=()=>setNow(Date.now());
  refresh();
  const interval=window.setInterval(refresh,250);
  document.addEventListener('visibilitychange',refresh);
  return()=>{
   clearInterval(interval);
   document.removeEventListener('visibilitychange',refresh);
  };
 },[active]);
 return now;
}

function countdown(ms:number){
 const seconds=Math.ceil(ms/1000);
 const parts=[Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60];
 return (parts[0]?parts:parts.slice(1)).map(part=>String(part).padStart(2,'0')).join(':');
}

export function CollectionStatus({title,waitMs,progress,readyText}:{
 title:string;waitMs:number;progress:number;readyText:string;
}){
 return <div className="collection-status">
  <span>{waitMs>0?<>{title} через <strong>{countdown(waitMs)}</strong></>:readyText}</span>
  <progress aria-label={title} value={progress} max={1}/>
 </div>;
}

export function MineCollection({compact=false}:{compact?:boolean}){
 const lastAt=useGame(s=>s.p.mineAt),claim=useGame(s=>s.claim);
 const mine=previewMine(lastAt,useCollectionClock());
 return <div className="mine-collection">
  <div>
   {!compact&&<p className="mine-summary">Северная шахта · накопление ограничено запасом шахты</p>}
   <CollectionStatus title="Следующий сбор" {...mine} readyText={`К сбору · ${mine.gold} золота · ${mine.chaosite} Хаосита`}/>
  </div>
  <button className="action" aria-label={compact?undefined:'Собрать добычу шахтёров'} disabled={mine.waitMs>0} onClick={()=>claim('mine')}>
   {compact&&mine.waitMs>0?'Копится':'Собрать'}
  </button>
 </div>;
}
