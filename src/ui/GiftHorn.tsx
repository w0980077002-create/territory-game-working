import {useCallback,useEffect,useState} from 'react';
import {giftHornEnabled,syncGiftHorn} from '../community/giftHorn';

export function GiftHorn(){
 const [state,setState]=useState<{charges:number;pending:unknown}>();
 const [busy,setBusy]=useState(false);
 const [failed,setFailed]=useState(false);
 const load=useCallback(async(open=false)=>{
  setBusy(true);
  setFailed(false);
  try{setState(await syncGiftHorn(open));}
  catch{setFailed(true);}
  finally{setBusy(false);}
 },[]);
 useEffect(()=>{
  if(!giftHornEnabled)return;
  const update=()=>void load();
  update();
  window.addEventListener('online',update);
  return ()=>window.removeEventListener('online',update);
 },[load]);
 if(!giftHornEnabled)return null;
 if(failed)return <button type="button" className="action secondary" onClick={()=>void load()}>
  Проверить подарочные заряды
 </button>;
 if(!state||(!state.charges&&!state.pending))return null;
 return <button type="button" className="action secondary" disabled={busy} onClick={()=>void load(!state.pending)}>
  {state.pending?'Забрать добычу из подарочного Рога':'Протрубить подарочным зарядом · '+state.charges}
 </button>;
}
