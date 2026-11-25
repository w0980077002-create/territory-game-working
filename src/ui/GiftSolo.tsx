import {useCallback,useEffect,useState} from 'react';
import {syncGiftSolo} from '../community/giftSolo';
import type {BrotherhoodResources} from '../community/client';
import {useGame} from '../core/store';
import {BrotherResources} from './Brotherhood';

export function GiftSolo({onWallet,awardCount}:{onWallet:(wallet:BrotherhoodResources)=>void;awardCount:number}){
 const [data,setData]=useState<Awaited<ReturnType<typeof syncGiftSolo>>>();
 const [busy,setBusy]=useState(false);
 const [failed,setFailed]=useState(false);
 const notice=useGame(state=>state.notice);
 const load=useCallback(async(transfer=false)=>{
  setBusy(true);
  setFailed(false);
  try{
   const result=await syncGiftSolo(transfer);
   setData(result);
   onWallet(result.wallet);
   if(result.delivered)notice('Подарки братства перенесены в Solo');
  }catch{setFailed(true);}
  finally{setBusy(false);}
 },[notice,onWallet]);
 useEffect(()=>{
  const refresh=()=>void load();
  refresh();
  window.addEventListener('online',refresh);
  return ()=>window.removeEventListener('online',refresh);
 },[load,awardCount]);
 if(failed)return <button type="button" className="action secondary" disabled={busy} onClick={()=>void load()}>
  Проверить перенос подарков
 </button>;
 if(!data||(!data.pending&&!Object.keys(data.available).length))return null;
 return <>
  <p>{data.pending?'Подарки ждут сохранения в Solo.':'После переноса подарки доступны в Solo. Перенос односторонний.'}</p>
  <BrotherResources resources={data.pending?.item.resources??data.available}/>
  <button type="button" className="action secondary" disabled={busy} onClick={()=>void load(!data.pending)}>
   {data.pending?'Продолжить перенос подарков':'Перенести подарки в Solo'}
  </button>
 </>;
}
