import {useEffect,useState} from 'react';
import {communityEnabled,readReferrals,type ReferralState} from '../community/client';
import {telegramProfile} from '../core/profile';
import {useGame} from '../core/store';

const gameUrl='https://t.me/VikingRomeGame';
const referralsAvailable=communityEnabled&&!!telegramProfile;
type PageRequest={before:string|null};

export function ReferralPanel({mode}:{mode:'invite'|'friends'}){
 const open=useGame(state=>state.open);
 const notice=useGame(state=>state.notice);
 const [query,setQuery]=useState<PageRequest>({before:null});
 const [view,setView]=useState<{query:PageRequest;data:ReferralState|null;failed:boolean}>();
 const [manualAddress,setManualAddress]=useState('');
 useEffect(()=>{
  if(!referralsAvailable)return;
  let active=true;
  void readReferrals(query.before).then(data=>{
   if(!active)return;
   setView(previous=>({query,failed:false,data:query.before&&previous?.data
    ?{...data,rows:[...previous.data.rows,...data.rows]}:data}));
  },()=>{
   if(active)setView(previous=>({query,failed:true,data:previous?.data??null}));
  });
  return()=>{active=false};
 },[query]);
 const {data,failed}=view??{};
 const busy=referralsAvailable&&view?.query!==query;
 const personalUrl=data?gameUrl+'?startapp='+encodeURIComponent(data.startParam):null;
 const shareUrl=referralsAvailable?personalUrl:gameUrl;
 async function copyLink(){
  if(!shareUrl)return;
  try{
   await navigator.clipboard.writeText(shareUrl);
   setManualAddress('');
   notice(personalUrl?'Личная ссылка скопирована':'Ссылка на игру скопирована');
  }catch{setManualAddress(shareUrl)}
 }
 return <>
  {mode==='invite'&&referralsAvailable&&<p>Приглашение подтвердится, когда друг впервые зарегистрируется в игре через Telegram.</p>}
  {!referralsAvailable&&<p>Откройте игру в Telegram, чтобы получить личную ссылку и увидеть подтверждённые приглашения.</p>}
  {(mode==='invite'||!referralsAvailable)&&shareUrl&&<button type="button" className="action" onClick={()=>void copyLink()}>
   {personalUrl?'Скопировать личную ссылку':'Скопировать ссылку на игру'}
  </button>}
  {manualAddress&&manualAddress===shareUrl&&<label>Адрес для копирования
   <input type="url" readOnly value={manualAddress} onFocus={event=>event.currentTarget.select()}/>
  </label>}
  {mode==='friends'&&data&&<>
   <h3>Подтверждённые приглашения</h3>
   {data.rows.length===0?<p>Подтверждённых приглашений пока нет.</p>:<ul className="confirmed-referrals">
    {data.rows.map(row=><li key={row.id}>
     <strong>{row.name}</strong>
     <span>{row.status==='rewarded'?'Награда начислена':'Приглашение подтверждено'}</span>
    </li>)}
   </ul>}
   {!failed&&data.next&&<button type="button" className="action secondary" disabled={busy}
    onClick={()=>setQuery({before:data.next})}>Показать ещё</button>}
  </>}
  {busy&&<p role="status">Загружаем приглашения…</p>}
  {failed&&!busy&&<p role="status">Приглашения недоступны. Если ошибка повторится, откройте игру заново в Telegram.</p>}
  {referralsAvailable&&(failed||mode==='friends'&&data)&&<button type="button" className="action secondary" disabled={busy}
   onClick={()=>setQuery({before:failed?query.before:null})}>{failed?'Попробовать ещё раз':'Обновить'}</button>}
  <button type="button" className="action secondary" onClick={()=>open(mode==='invite'?'friends':'invite')}>
   {mode==='invite'?'Друзья':'Приглашение'}
  </button>
 </>;
}
