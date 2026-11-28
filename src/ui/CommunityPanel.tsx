import './community.css';
import {useEffect,useRef,useState} from 'react';
import {community,CommunityError,connectCommunity,type Chat,type GuildChange,type GuildState,type Market,type Metric,type Ranking,type Trade} from '../community/client';
import {tg} from '../core/telegram';
import {lang} from '../i18n';
import {MarketWorkbench, marketNames} from './MarketWorkbench';

const l=(ru:string,en:string)=>lang==='en'?en:ru;
const tradeNames={buy:l('Покупка','Purchase'),list:l('Размещение','Listing'),cancel:l('Снятие лота','Cancellation'),request:l('Заявка','Buy order'),withdraw:l('Отмена заявки','Order cancellation'),fulfill:l('Сделка по заявке','Order filled')};
const format=(n:number)=>n.toLocaleString(lang);
const label=(catalog:string)=>marketNames[catalog]??({
 'world-boss-trophy':l('Клинок победителя','Boss trophy blade'),
 weapon:l('Оружие','Weapon'),shield:l('Щит','Shield'),ring:l('Кольцо','Ring'),
}[catalog]??catalog);
type Section='auction'|'ranking'|'guild';
type View=Market|Chat|Ranking|GuildState;
const guildRole={leader:l('Глава','Leader'),member:l('Участник','Member')};

function explain(error:unknown){
 const status=error instanceof CommunityError?error.status:0;
 if(status===401)return l('Откройте игру в Telegram заново, чтобы войти.','Reopen the game in Telegram to sign in.');
 if(status===403)return l('Действие недоступно.','This action is unavailable.');
 if(status===429)return l('Подождите перед отправкой следующего сообщения.','Wait before sending another message.');
 if(status===400)return l('Проверьте введённые данные.','Check the values you entered.');
 if(status===409)return l('Действие отклонено. Данные обновлены.','Action rejected. The data was refreshed.');
 return l('Связь прервана. Попробуйте ещё раз.','Connection interrupted. Try again.');
}

export function CommunityPanel({section}:{section:Section}){
 const [tradingChat,setTradingChat]=useState(false),[metric,setMetric]=useState<Metric>('world_boss_damage');
 const [season,setSeason]=useState(''),[version,refresh]=useState(0),[signed,setSigned]=useState(false);
 const [result,setResult]=useState<{key:string;value:View}|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [item,setItem]=useState(''),[price,setPrice]=useState(''),[text,setText]=useState('');
 const [guildName,setGuildName]=useState('');
 const [offer,setOffer]=useState<Market['listings'][number]|null>(null);
 const pending=useRef<{key:string;id:string}|undefined>(undefined),running=useRef(false);
 const tab=section==='auction'&&tradingChat?'chat':section;
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

 // Inside Telegram the game already holds (or is opening) a community session: join it without a manual tap.
 // The «Sign in with Telegram» button stays as the fallback if this silent attempt fails.
 useEffect(()=>{
  if(!tg()?.initData)return;
  let live=true;
  connectCommunity().then(()=>{if(live)setSigned(true);}).catch(()=>{ /* manual sign-in remains available */ });
  return ()=>{live=false;};
 },[]);

 const login=async()=>{
  if(running.current)return;
  running.current=true;setBusy(true);setError('');
  try{await connectCommunity();setSigned(true);}
  catch(failure){setError(explain(failure));}
  finally{running.current=false;setBusy(false);}
 };
 const send=async(action:'trade'|'post'|'hide'|'guild_roster'|'guild_boss_claim'|'equip'|'unequip'|'enhance',body:Trade|GuildChange|{text:string}|{message:number}|{eventId:string}|{item:string;expectedRank?:number},done:()=>void)=>{
  if(running.current)return;
  const fingerprint=JSON.stringify([action,body]);
  const operation=pending.current?.key===fingerprint?pending.current.id:crypto.randomUUID();
  pending.current={key:fingerprint,id:operation};
  running.current=true;setBusy(true);setError('');
  try{
   await community(action,action==='trade'||action==='post'||action==='enhance'?{...body,operationId:operation}:body);
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
 const guildView=tab==='guild'?view as GuildState|null:null;
 const guild=guildView?.guild;
 const roster=(action:GuildChange)=>void send('guild_roster',action,()=>setGuildName(''));
 const validPrice=Number.isInteger(Number(price))&&Number(price)>=10&&Number(price)<=1_000_000_000;
 return <section className="vvr-community">
  {section==='auction'&&<div className="tabs wrap" role="group" aria-label={l('Разделы аукциона','Auction sections')}>
   <button type="button" aria-pressed={!tradingChat} className={!tradingChat?'selected':''} disabled={busy}
    onClick={()=>{setTradingChat(false);setError('');}}>{l('Лоты','Listings')}</button>
   <button type="button" aria-pressed={tradingChat} className={tradingChat?'selected':''} disabled={busy}
    onClick={()=>{setTradingChat(true);setOffer(null);setError('');}}>{l('Торговый чат','Trade chat')}</button>
  </div>}
  <button type="button" className="action secondary" disabled={busy} onClick={()=>{setError('');refresh(v=>v+1);}}>{l('Обновить','Refresh')}</button>
  {error&&<p role="alert">{error}</p>}
  {!view&&!error&&<p role="status">{l('Загрузка…','Loading…')}</p>}
  {market&&<>
   <p>{l('Золото для торговли','Trading gold')} · {format(market.gold)}</p>
   {market.equipment&&<>
    <p>{l('Сила атаки героя','Hero attack power')} · {format(market.equipment.attack)}</p>
    {market.items.some(piece=>piece.catalogId==='world-boss-trophy'||piece.catalogId.startsWith('workshop-'))&&<details className="saga-disclosure">
     <summary>{l('Серверная экипировка','Online equipment')}</summary>
     <ul>{market.items.filter(piece=>piece.catalogId==='world-boss-trophy'||piece.catalogId.startsWith('workshop-')).map(piece=>{
      const equipped=piece.id===market.equipment?.equipped;
      const enhancement=market.equipment?.enhancements?.[piece.id];
      return <li key={piece.id}><span>{label(piece.catalogId)}{enhancement&&' +'+enhancement.rank}</span>
       <button type="button" className="action secondary" disabled={busy}
        onClick={()=>void send(equipped?'unequip':'equip',{item:piece.id},()=>setItem(''))}>
        {equipped?l('Снять','Unequip'):l('Надеть','Equip')}
       </button>
       {enhancement?.cost!=null&&<button type="button" className="action secondary"
        disabled={busy||market.gold<enhancement.cost}
        onClick={()=>void send('enhance',{item:piece.id,expectedRank:enhancement.rank},()=>{})}>
        {l('Усилить','Enhance')} · {format(enhancement.cost)} {l('золота','gold')}
       </button>}
      </li>;
     })}</ul>
    </details>}
   </>}
   {market.items.some(piece=>piece.id!==market.equipment?.equipped)&&<form onSubmit={event=>{event.preventDefault();if(validPrice&&item)void send('trade',{kind:'list',itemId:item,price:Number(price)},()=>{setItem('');setPrice('');});}}>
    <label>{l('Выставить предмет','Item to list')} <select value={item} onChange={event=>setItem(event.target.value)}>
     <option value="">{l('Выбрать','Choose')}</option>{market.items.filter(piece=>piece.id!==market.equipment?.equipped).map(i=><option key={i.id} value={i.id}>{label(i.catalogId)}</option>)}</select></label>
    <label>{l('Цена в золоте','Price in gold')} <input type="number" min="10" max="1000000000" value={price} onChange={event=>setPrice(event.target.value)}/></label>
    <button className="action" disabled={busy||!validPrice||!item}>{l('Выставить','List item')}</button>
   </form>}
   {market.requests&&<MarketWorkbench market={market} busy={busy}
    trade={command=>void send('trade',command,()=>{})} refresh={()=>refresh(n=>n+1)} />}
   {validPrice&&item&&market.requests&&<p>{l('Продавец получит','Seller receives')} · {format(Number(price)-Math.ceil(Number(price)/10))} {l('золота','gold')}</p>}
   <h3>{l('Лоты','Listings')}</h3>
   {market.listings.length===0&&<p>{l('Открытых лотов пока нет.','There are no open listings yet.')}</p>}
   <ul>{market.listings.map(listing=><li key={listing.id}>
    <span>{label(listing.catalogId)}{(listing.rank??0)>0&&' +'+listing.rank} · {format(listing.price)}{listing.expired&&' · '+l('Истёк','Expired')}</span>
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
    <ul>{market.history.map(entry=><li key={entry.operationId+entry.at}>{entry.kind==='enhance'?l('Усиление','Enhancement'):tradeNames[entry.kind]} · {format(entry.price)}{entry.commission!=null&&' · '+l('Комиссия','Fee')+' '+format(entry.commission)} · {new Date(entry.at).toLocaleString(lang)}</li>)}</ul>
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
  {guildView&&(guild?<section aria-label={l('Моя гильдия','My guild')}>
    <h3>{guild.name}</h3>
    <ul>{guild.members.map((member,index)=><li key={index}>{member.name} · {guildRole[member.role]}</li>)}</ul>
    {guild.role==='leader'&&guild.applications.length>0&&<>
     <h4>{l('Заявки на вступление','Applications')}</h4>
     <ul>{guild.applications.map(applicant=><li key={applicant.id}>{applicant.name}
      <button type="button" className="action secondary" disabled={busy}
       onClick={()=>roster({kind:'accept',guild:guild.id,applicant:applicant.id})}>{l('Принять','Accept')}</button>
      <button type="button" className="action secondary" disabled={busy}
       onClick={()=>roster({kind:'reject',guild:guild.id,applicant:applicant.id})}>{l('Отклонить','Decline')}</button>
     </li>)}</ul>
    </>}
    <details className="saga-disclosure">
     <summary>{l('Покинуть гильдию','Leave guild')}</summary>
     <button type="button" className="action secondary" disabled={busy}
      onClick={()=>roster({kind:'leave'})}>{l('Подтвердить выход','Confirm departure')}</button>
    </details>
   </section>:<>
    <form onSubmit={event=>{event.preventDefault();roster({kind:'create',name:guildName.trim()});}}>
     <label>{l('Название гильдии','Guild name')} <input required minLength={3} maxLength={32}
      value={guildName} onChange={event=>setGuildName(event.target.value)}/></label>
     <button className="action" disabled={busy||guildName.trim().length<3}>{l('Создать гильдию','Create guild')}</button>
    </form>
    <h3>{l('Список гильдий','Guild directory')}</h3>
    {guildView.directory.length===0&&<p>{l('Гильдий пока нет.','There are no guilds yet.')}</p>}
    <ul>{guildView.directory.map(entry=><li key={entry.id}>{entry.name} · {format(entry.members)}
     <button type="button" className="action secondary" disabled={busy}
      onClick={()=>roster({kind:entry.applied?'withdraw':'apply',guild:entry.id})}>
      {entry.applied?l('Отозвать заявку','Withdraw application'):l('Подать заявку','Apply')}
     </button>
    </li>)}</ul>
   </>)}
  {!!guildView?.quests?.length&&<section aria-label={l('Задания гильдии','Guild quests')}>
   <h3>{l('Задания гильдии','Guild quests')}</h3>
   <ul>{guildView.quests.map(quest=><li key={quest.id}>
    <strong>{quest.name}</strong>
    <span>{l('Общий урон','Combined damage')} · {format(quest.damage)} / {format(quest.target)}</span>
    <span>{l('Награда','Reward')} · {format(quest.gold)} {l('золота','gold')}</span>
    {quest.claimed&&<span>{l('Награда получена','Reward claimed')}</span>}
    {quest.canClaim&&<button type="button" className="action" disabled={busy}
     onClick={()=>void send('guild_boss_claim',{eventId:quest.id},()=>{})}>{l('Получить награду','Claim reward')}</button>}
   </li>)}</ul>
  </section>}
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
