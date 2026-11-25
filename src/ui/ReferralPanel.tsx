import {useEffect,useState} from 'react';
import {claimBrotherhood,communityEnabled,readReferrals,type BrotherhoodPair,type ReferralState} from '../community/client';
import {telegramProfile} from '../core/profile';
import {useGame} from '../core/store';
import {tg} from '../core/telegram';
import {lang} from '../i18n';
import {BrotherAward,BrotherResources,BrotherhoodMilestones,BrotherhoodOath,BrotherhoodLevels} from './Brotherhood';
import {Icon} from './Icon';

const gameUrl='https://t.me/VikingRomeGame';
const referralsAvailable=communityEnabled&&!!telegramProfile;
type PageRequest={before:string|null};

export function ReferralPanel({mode}:{mode:'invite'|'friends'}){
 const open=useGame(state=>state.open);
 const notice=useGame(state=>state.notice);
 const [query,setQuery]=useState<PageRequest>({before:null});
 const [view,setView]=useState<{query:PageRequest;data:ReferralState|null;failed:boolean}>();
 const [manualAddress,setManualAddress]=useState('');
 const [pending,setPending]=useState<string|null>(null);
 useEffect(()=>{
  if(!referralsAvailable)return;
  let active=true;
  void readReferrals(query.before).then(data=>{
   if(!active)return;
   setView(previous=>{
    if(!query.before||!previous?.data)return {query,failed:false,data};
    const oldBrotherhood=previous.data.brotherhood,newBrotherhood=data.brotherhood;
    return {query,failed:false,data:{...data,rows:[...previous.data.rows,...data.rows],
     brotherhood:oldBrotherhood&&newBrotherhood
      ?{...newBrotherhood,outgoing:[...oldBrotherhood.outgoing,...newBrotherhood.outgoing]}:newBrotherhood}};
   });
  },()=>{
   if(active)setView(previous=>({query,failed:true,data:previous?.data??null}));
  });
  return()=>{active=false};
 },[query]);
 const {data,failed}=view??{};
 const brotherhood=data?.brotherhood;
 const busy=referralsAvailable&&view?.query!==query;
 const personalUrl=data?gameUrl+'?startapp='+encodeURIComponent(data.startParam):null;
 const shareUrl=referralsAvailable?personalUrl:gameUrl;

 function share(){
  if(!personalUrl)return;
  const text=lang==='en'
   ?'Join my Battle Brotherhood in Viking vs Rome! Your first verified campaign boss victory unlocks a chest for you and gems for me. We can both earn rewards by completing team Arena battles or World Boss guild quests on the same days.'
   :'Вступай в моё Боевое братство в Viking vs Rome! После первой подтверждённой победы над боссом кампании тебе откроется сундук, а мне — самоцветы. Завершая командные бои Арены или задания гильдии в одни и те же дни, мы оба получим награды.';
  const url='https://t.me/share/url?'+new URLSearchParams({url:personalUrl,text});
  const webApp=tg();
  if(webApp?.openTelegramLink)webApp.openTelegramLink(url);
  else window.open(url,'_blank','noopener,noreferrer');
 }

 async function copyLink(){
  if(!shareUrl)return;
  try{
   await navigator.clipboard.writeText(shareUrl);
   setManualAddress('');
   notice(personalUrl?'Личная ссылка скопирована':'Ссылка на игру скопирована');
  }catch{setManualAddress(shareUrl)}
 }

 async function claim(award:string){
  setPending(award);
  try{
   const result=await claimBrotherhood(award);
   if(result.status==='received'){
    const mark=(pair:BrotherhoodPair)=>({...pair,awards:pair.awards.map(item=>item.id===award?{...item,received:true}:item)});
    setView(previous=>{
     const state=previous?.data?.brotherhood;
     if(!previous?.data||!state)return previous;
     return {...previous,data:{...previous.data,brotherhood:{...state,wallet:result.wallet,
      incoming:state.incoming?mark(state.incoming):null,outgoing:state.outgoing.map(mark),
      legendAwards:state.legendAwards?.map(item=>item.id===award?{...item,received:true}:item)}}};
    });
    notice('Награда братства в сетевом кошельке');
   }else notice(result.status==='paused'?'Выдача приостановлена':'Награда недоступна');
  }catch{notice('Не удалось получить награду · попробуйте ещё раз');}
  finally{setPending(null);}
 }

 const controls={enabled:brotherhood?.enabled===true&&!busy,pending,claim:(id:string)=>void claim(id)};
 const incoming=brotherhood?.incoming;
 const chest=incoming?.awards.find(award=>award.kind==='welcome');
 const showAddress=manualAddress===shareUrl||mode==='invite'&&!!brotherhood;
 return <>
  {mode==='invite'&&referralsAvailable&&!brotherhood&&<p>Приглашение подтвердится, когда друг впервые зарегистрируется в игре через Telegram.</p>}
  {!referralsAvailable&&<p>Откройте игру в Telegram, чтобы получить личную ссылку и увидеть подтверждённые приглашения.</p>}
  {brotherhood&&(mode==='invite'||incoming)&&<section className="brother-card" aria-label="Дар братства">
   <h3><Icon name="chest"/>Дар братства</h3>
   {incoming&&<p>{'Вас пригласил игрок · '+incoming.name}</p>}
   {!chest&&<p>Сундук открывается после подтверждённой победы над первым боссом кампании.</p>}
   {chest?<BrotherAward award={chest} {...controls}/>:<BrotherResources resources={brotherhood.rewards.welcome.invitee}/>}
   <h4>Награда пригласившему</h4>
   <BrotherResources resources={brotherhood.rewards.welcome.inviter}/>
  </section>}
  {mode==='invite'&&brotherhood&&personalUrl&&<button type="button" className="action" onClick={share}>Пригласить друга</button>}
  {(mode==='invite'||!referralsAvailable)&&shareUrl&&<button type="button" className="action secondary" onClick={()=>void copyLink()}>
   {personalUrl?'Скопировать личную ссылку':'Скопировать ссылку на игру'}
  </button>}
  {showAddress&&shareUrl&&<label>{manualAddress===shareUrl?'Адрес для копирования':'Персональная ссылка'}
   <input type="url" readOnly value={shareUrl} onFocus={event=>event.currentTarget.select()}/>
  </label>}
  {brotherhood&&!brotherhood.enabled&&<p role="status">Выдача приостановлена</p>}
  {brotherhood&&incoming&&<div className="brother-card"><BrotherhoodLevels pair={incoming} rewards={brotherhood.rewards} {...controls}/><BrotherhoodOath pair={incoming} rewards={brotherhood.rewards} {...controls}/></div>}
  {mode==='friends'&&data&&<>
   <h3>Подтверждённые приглашения</h3>
   {brotherhood&&<>
    <p>{'Приглашено · '+brotherhood.invited+' · Активных друзей · '+brotherhood.active}</p>
    <p>Активность подтверждает завершённый командный бой Арены, задание гильдии или ранее открытый сундук.</p>
   </>}
   {data.rows.length===0?<p>Подтверждённых приглашений пока нет.</p>:<ul className="confirmed-referrals">
    {data.rows.map(row=>{
     const pair=brotherhood?.outgoing.find(friend=>friend.id===row.id);
     const welcome=pair?.awards.find(award=>award.kind==='welcome');
     return <li key={row.id}>
      <strong>{row.name}</strong>
      <span>{row.status==='rewarded'?'Награда начислена':'Приглашение подтверждено'}</span>
      {pair&&brotherhood&&<details className="saga-disclosure">
       <summary>{'Совместных дней · '+pair.days+' / 7'}</summary>
       {welcome?<div><h4>Дар братства</h4><BrotherAward award={welcome} {...controls}/></div>
        :<p>Сундук открывается после подтверждённой победы над первым боссом кампании.</p>}
       <BrotherhoodLevels pair={pair} rewards={brotherhood.rewards} {...controls}/><BrotherhoodOath pair={pair} rewards={brotherhood.rewards} {...controls}/>
      </details>}
     </li>;
    })}
   </ul>}
   {!failed&&data.next&&<button type="button" className="action secondary" disabled={busy||pending!==null}
    onClick={()=>setQuery({before:data.next})}>Показать ещё</button>}
   {brotherhood&&<BrotherhoodMilestones rewards={brotherhood.rewards} qualified={brotherhood.qualifiedFriends??0} awards={brotherhood.legendAwards??[]} {...controls}/>}
  </>}
  {brotherhood&&Object.keys(brotherhood.wallet).length>0&&<details className="saga-disclosure">
   <summary>Сетевой кошелёк</summary>
   <BrotherResources resources={brotherhood.wallet}/>
   {!!brotherhood.wallet.horn&&<p>Подарочные заряды хранятся в сетевом кошельке даже при полном Роге. Подарочным зарядом можно протрубить в Роге Трофеев.</p>}
  </details>}
  {busy&&<p role="status">Загружаем приглашения…</p>}
  {failed&&!busy&&<p role="status">Приглашения недоступны. Если ошибка повторится, откройте игру заново в Telegram.</p>}
  {referralsAvailable&&(failed||data&&(mode==='friends'||incoming))&&<button type="button" className="action secondary" disabled={busy||pending!==null}
   onClick={()=>setQuery({before:failed?query.before:null})}>{failed?'Попробовать ещё раз':'Обновить'}</button>}
  <button type="button" className="action secondary" onClick={()=>open(mode==='invite'?'friends':'invite')}>
   {mode==='invite'?'Друзья':'Приглашение'}
  </button>
 </>;
}
