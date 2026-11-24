import './community.css';
import {useEffect,useRef,useState} from 'react';
import {community,CommunityError,connectCommunity,type Chat,type Market,type Metric,type Ranking,type Trade} from '../community/client';
import {tg} from '../core/telegram';
import {lang} from '../i18n';

const l=(ru:string,en:string)=>lang==='en'?en:ru;
const tabNames={auction:l('Аукцион','Auction'),chat:l('Общий чат','Global chat'),ranking:l('Рейтинги','Rankings')};
const tradeNames={buy:l('Покупка','Purchase'),list:l('Размещение','Listing'),cancel:l('Снятие лота','Cancellation')};
const format=(n:number)=>n.toLocaleString(lang);
const label=(catalog:string)=>({
 weapon:l('Оружие','Weapon'),shield:l('Щит','Shield'),ring:l('Кольцо','Ring'),
}[catalog]??catalog);
type Tab=keyof typeof tabNames;
type View=Market|Chat|Ranking;

function explain(error:unknown){
 const status=error instanceof CommunityError?error.status:0;
 if(status===401)return l('Откройте игру в Telegram заново, чтобы войти.','Reopen the game in Telegram to sign in.');
 if(status===403)return l('Действие недоступно.','This action is unavailable.');
 if(status===429)return l('Подождите перед отправкой следующего сообщения.','Wait before sending another message.');
 if(status===400)return l('Проверьте введённые данные.','Check the values you entered.');
 if(status===409)return l('Действие отклонено. Данные обновлены.','Action rejected. The data was refreshed.');
 return l('Связь прервана. Попробуйте ещё раз.','Connection interrupted. Try again.');
}

export function CommunityPanel(){
 const [tab,setTab]=useState<Tab>('auction'),[metric,setMetric]=useState<Metric>('world_boss_damage');
 const [season,setSeason]=useState(''),[version,refresh]=useState(0),[signed,setSigned]=useState(false);
 const [result,setResult]=useState<{key:string;value:View}|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [item,setItem]=useState(''),[price,setPrice]=useState(''),[text,setText]=useState('');
 const [offer,setOffer]=useState<Market['listings'][number]|null>(null);
 const pending=useRef<{key:string;id:string}|undefined>(undefined),running=useRef(false);
 const key=tab==='ranking'?[tab,metric,season].join(':'):tab;
 const view=result?.key===key?result.value:null;
 useEffect(()=>{
  if(!signed)return;
  const controller=new AbortController();
  let inFlight=false;
  const load=async()=>{
   if(inFlight||document.hidden||running.current)return;
   inFlight=true;
   try{
    const body=tab==='ranking'?{metric,...(season?{season}:{})}:{};
    const value=await community<View>(tab,body,controller.signal);
    if(!controller.signal.aborted)setResult({key,value});
   }catch(failure){
    if(controller.signal.aborted)return;
    setError(explain(failure));
    if(failure instanceof CommunityError&&failure.status===401)setSigned(false);
   }
   finally{inFlight=false;}
  };
  void load();
  const timer=tab==='chat'?window.setInterval(load,5000):undefined;
  document.addEventListener('visibilitychange',load);
  return ()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',load);};
 },[signed,tab,key,metric,season,version]);

 const login=async()=>{
  if(running.current)return;
  running.current=true;setBusy(true);setError('');
  try{await connectCommunity();setSigned(true);}
  catch(failure){setError(explain(failure));}
  finally{running.current=false;setBusy(false);}
 };
 const send=async(action:'trade'|'post'|'hide',body:Trade|{text:string}|{message:number},done:()=>void)=>{
  if(running.current)return;
  const fingerprint=JSON.stringify([action,body]);
  const operation=pending.current?.key===fingerprint?pending.current.id:crypto.randomUUID();
  pending.current={key:fingerprint,id:operation};
  running.current=true;setBusy(true);setError('');
  try{
   await community(action,action==='hide'?body:{...body,operationId:operation});
   pending.current=undefined;
   done();
  }catch(failure){
   if(failure instanceof CommunityError&&failure.status<500)pending.current=undefined;
   setError(explain(failure));
   if(failure instanceof CommunityError&&failure.status===401)setSigned(false);
  }finally{
   running.current=false;setBusy(false);refresh(v=>v+1);
  }
 };

 if(!signed)return <section aria-label={l('Вход в сообщество','Community sign-in')}>
  {error&&<p role="alert">{error}</p>}
  {tg()?.initData?<button type="button" className="action" disabled={busy} onClick={()=>void login()}>{l('Войти через Telegram','Sign in with Telegram')}</button>:
   <p>{l('Откройте игру в Telegram, чтобы войти.','Open the game in Telegram to sign in.')}</p>}
 </section>;
 const market=tab==='auction'?view as Market|null:null;
 const chat=tab==='chat'?view as Chat|null:null;
 const ranking=tab==='ranking'?view as Ranking|null:null;
 const validPrice=Number.isInteger(Number(price))&&Number(price)>=1&&Number(price)<=1_000_000_000;
 return <section className="vvr-community">
  <div className="tabs wrap" role="group" aria-label={l('Разделы сообщества','Community sections')}>
   {(Object.keys(tabNames) as Tab[]).map(id=><button key={id} type="button" aria-pressed={tab===id} className={tab===id?'selected':''} disabled={busy}
    onClick={()=>{setTab(id);setOffer(null);setError('');}}>{tabNames[id]}</button>)}
  </div>
  <button type="button" className="action secondary" disabled={busy} onClick={()=>{setError('');refresh(v=>v+1);}}>{l('Обновить','Refresh')}</button>
  {error&&<p role="alert">{error}</p>}
  {!view&&!error&&<p role="status">{l('Загрузка…','Loading…')}</p>}
  {market&&<>
   <p>{l('Золото для торговли','Trading gold')} · {format(market.gold)}</p>
   {market.items.length>0&&<form onSubmit={event=>{event.preventDefault();if(validPrice&&item)void send('trade',{kind:'list',itemId:item,price:Number(price)},()=>{setItem('');setPrice('');});}}>
    <label>{l('Выставить предмет','Item to list')} <select value={item} onChange={event=>setItem(event.target.value)}>
     <option value="">{l('Выбрать','Choose')}</option>{market.items.map(i=><option key={i.id} value={i.id}>{label(i.catalogId)}</option>)}</select></label>
    <label>{l('Цена в золоте','Price in gold')} <input type="number" min="1" max="1000000000" value={price} onChange={event=>setPrice(event.target.value)}/></label>
    <button className="action" disabled={busy||!validPrice||!item}>{l('Выставить','List item')}</button>
   </form>}
   <h3>{l('Лоты','Listings')}</h3>
   {market.listings.length===0&&<p>{l('Открытых лотов пока нет.','There are no open listings yet.')}</p>}
   <ul>{market.listings.map(listing=><li key={listing.id}>
    <span>{label(listing.catalogId)} · {format(listing.price)}</span>
    {listing.mine?<button type="button" className="action secondary" disabled={busy}
     onClick={()=>void send('trade',{kind:'cancel',listingId:listing.id},()=>{})}>{l('Снять лот','Cancel listing')}</button>:
     <button type="button" className="action secondary" disabled={busy||listing.price>market.gold}
      onClick={()=>setOffer(listing)}>{l('Купить','Buy')}</button>}
   </li>)}</ul>
   {offer&&<div><p>{label(offer.catalogId)} · {format(offer.price)} {l('золота','gold')}</p>
    <button type="button" className="action" disabled={busy} onClick={()=>void send('trade',{kind:'buy',listingId:offer.id},()=>setOffer(null))}>{l('Подтвердить покупку','Confirm purchase')}</button>
    <button type="button" className="action secondary" disabled={busy} onClick={()=>setOffer(null)}>{l('Отмена','Cancel')}</button>
   </div>}
   {market.history.length>0&&<details className="saga-disclosure"><summary>{l('История сделок','Trade history')}</summary>
    <ul>{market.history.map(entry=><li key={entry.operationId+entry.at}>{tradeNames[entry.kind]} · {format(entry.price)} · {new Date(entry.at).toLocaleString(lang)}</li>)}</ul>
   </details>}
  </>}
  {chat&&<>
   {chat.messages.length===0&&<p>{l('Сообщений пока нет.','There are no messages yet.')}</p>}
   <ol className="vvr-community-chat" aria-label={l('Сообщения','Messages')}>{chat.messages.map(message=><li key={message.id}>
    <p><strong>{message.name}</strong> · {message.text}</p>
    {chat.moderator&&<button type="button" className="action secondary" disabled={busy}
     onClick={()=>void send('hide',{message:message.id},()=>{})}>{l('Скрыть сообщение','Hide message')}</button>}
   </li>)}</ol>
   <form onSubmit={event=>{event.preventDefault();if(text.trim())void send('post',{text},()=>setText(''));}}>
    <label>{l('Сообщение','Message')} <textarea maxLength={240} value={text} onChange={event=>setText(event.target.value)}/></label>
    <button className="action" disabled={busy||!text.trim()}>{l('Отправить','Send')}</button>
   </form>
  </>}
  {tab==='ranking'&&<>
   <label>{l('Категория','Category')} <select value={metric} onChange={event=>setMetric(event.target.value as Metric)}>
    <option value="world_boss_damage">{l('Урон мировому боссу','World boss damage')}</option><option value="arena_wins">{l('Победы на Арене','Arena wins')}</option>
   </select></label>
   <label>{l('Сезон','Season')} <select value={season} onChange={event=>setSeason(event.target.value)}>
    <option value="">{l('Текущий сезон','Current season')}</option>
    {ranking?.seasons.map(entry=><option key={entry.id} value={entry.id}>{entry.name}</option>)}
   </select></label>
   {ranking&&(ranking.season?<><h3>{ranking.season.name}</h3>
    {ranking.rows.length===0?<p>{l('Результатов пока нет.','There are no results yet.')}</p>:
     <ol>{ranking.rows.map((row,index)=><li key={index} value={row.rank}>{row.name}{row.mine?' · '+l('Вы','You'):''} · {format(row.points)}</li>)}</ol>}
   </>:<p>{l('Активного сезона сейчас нет.','There is no active season.')}</p>)}
  </>}
 </section>;
}
