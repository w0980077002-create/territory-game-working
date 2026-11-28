import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {community} from '../community/client';

const flags={
 stars_shop:'Покупки за Telegram Stars',arena_ranked:'Рейтинговая Арена',arena_team:'Командная Арена',auction_trade:'Аукцион и обмен',
 chat:'Чат',world_boss:'Мировой босс',premium_shop:'Покупки за платные самоцветы',
};
const sanctions={chat_mute:'Запрет чата',trade_ban:'Запрет торговли',network_ban:'Запрет сетевых функций'};
const resultText:Record<string,string>={
 ok:'Готово.',resource_spent:'Нельзя подтвердить, что выданные заряды Рога остались нетронутыми.',
 already_refunded:'Покупка уже отменена.',unknown_purchase:'Покупка не найдена.',
 sanction_role_mismatch:'Ограничение может изменить роль, которая его установила.',
 premium_requires_b5:'Покупки останутся закрыты до B5.',
};
type Feature=keyof typeof flags;
type Sanction=keyof typeof sanctions;
type Entry={id:number;occurred_at:string;actor_role:string;actor_telegram:string;kind:string;reason:string};
type Status={role:string;flags:Record<Feature,boolean>;history:Entry[]};
type Player={id:string;name:string;paidGems:number;
 orders:{operation_id:string;sku:string;price:number;amount:number;created_at:string;refunded_at:string|null}[];
 sanctions:{kind:Sanction;reason:string;expires_at:string|null;assigned_role:string}[]};

const TAPS=5,TAP_WINDOW_MS=3000;

/** Hidden entrance: five taps on the «Меню» title, then login and password checked by W066. */
export function AdminGate(){
 const [open,setOpen]=useState(false);
 const [unlocked,setUnlocked]=useState(false);
 const [login,setLogin]=useState('');
 const [password,setPassword]=useState('');
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false);
 const taps=useRef<number[]>([]);
 useEffect(()=>{
  const tap=(event:Event)=>{
   if((event as CustomEvent).detail!=='menu')return;
   const now=Date.now();
   taps.current=[...taps.current.filter(at=>now-at<TAP_WINDOW_MS),now];
   if(taps.current.length>=TAPS){taps.current=[];setOpen(true);}
  };
  window.addEventListener('vvr:title-tap',tap);
  return ()=>window.removeEventListener('vvr:title-tap',tap);
 },[]);
 const exit=useCallback(()=>{setUnlocked(false);setOpen(false);},[]);
 if(!open)return null;
 if(unlocked)return <NetworkAdmin onExit={exit}/>;
 async function submit(event:FormEvent){
  event.preventDefault();
  setBusy(true);
  setNotice('');
  try{
   const result=await community<{status:string;until?:string}>('admin_unlock',{login,password});
   setPassword('');
   if(result.status==='ok'){setLogin('');setUnlocked(true);}
   else setNotice(result.status==='locked'?'Слишком много попыток. Повторите позже.':'Неверный логин или пароль.');
  }catch{setNotice('Вход временно недоступен.');}
  finally{setBusy(false);}
 }
 return <form className="wb-admin admin-login" onSubmit={event=>void submit(event)}>
  <label>Логин<input autoComplete="username" autoCapitalize="none" maxLength={32} required value={login} onChange={event=>setLogin(event.target.value)}/></label>
  <label>Пароль<input type="password" autoComplete="current-password" maxLength={72} required value={password} onChange={event=>setPassword(event.target.value)}/></label>
  <button className="action secondary" disabled={busy}>Войти</button>
  <button type="button" className="action secondary" onClick={()=>{setOpen(false);setNotice('');setPassword('');}}>Отмена</button>
  {notice&&<p role="status">{notice}</p>}
 </form>;
}

type Report={days:number;newPlayers:number;activePlayers:number;funnel:{m5:number;m15:number;m30:number};
 d1:{eligible:number;returned:number};d7:{eligible:number;returned:number};
 battles:Record<string,{count:number;wins:number}>;purchases:{sku:string;currency:string;count:number;total:number}[];
 errors:{code:string;count:number;players:number;example?:string}[]};
const share=(part:number,whole:number)=>whole?`${part} из ${whole} · ${Math.round(part/whole*100)} %`:'нет данных';

/** Launch metrics from W066: first-session funnel, D1/D7, battles, purchases and client errors. */
function AdminAnalytics(){
 const [days,setDays]=useState(14);
 const [report,setReport]=useState<Report>();
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false);
 async function load(range:number){
  setDays(range);setBusy(true);setNotice('');
  try{setReport(await community<Report>('admin_analytics',{days:range}));}
  catch{setNotice('Отчёт временно недоступен. Войдите в администрирование снова.');}
  finally{setBusy(false);}
 }
 return <details className="saga-disclosure" onToggle={event=>{if((event.target as HTMLDetailsElement).open&&!report&&!busy)void load(days)}}>
  <summary>Аналитика</summary>
  <div className="admin-analytics">
   {[1,7,14,30].map(range=><button type="button" key={range} className="action secondary" disabled={busy}
    aria-pressed={days===range} onClick={()=>void load(range)}>{range===1?'Сутки':range+' дн.'}</button>)}
   {report&&<>
    <p>Новых игроков · {report.newPlayers} · активных · {report.activePlayers}</p>
    <p>Первая сессия ≥5 мин · {share(report.funnel.m5,report.newPlayers)}</p>
    <p>≥15 мин · {share(report.funnel.m15,report.newPlayers)}</p>
    <p>≥30 мин · {share(report.funnel.m30,report.newPlayers)}</p>
    <p>Вернулись на 1-й день · {share(report.d1.returned,report.d1.eligible)}</p>
    <p>Вернулись на 7-й день · {share(report.d7.returned,report.d7.eligible)}</p>
    <h3>Бои</h3>
    {Object.keys(report.battles).length?Object.entries(report.battles).map(([mode,b])=><p key={mode}>{mode} · {b.count} · побед {share(b.wins,b.count)}</p>):<p>Боёв пока нет.</p>}
    <h3>Покупки</h3>
    {report.purchases.length?report.purchases.map(p=><p key={p.sku+p.currency}>{p.sku} · {p.currency} · {p.count} шт. · {p.total}</p>):<p>Покупок пока нет.</p>}
    <h3>Ошибки клиента</h3>
    {report.errors.length?report.errors.map(e=><p key={e.code}>{e.code} · {e.count} раз · игроков {e.players}{e.example?' · '+e.example:''}</p>):<p>Ошибок нет.</p>}
   </>}
   {notice&&<p role="status">{notice}</p>}
  </div>
 </details>;
}

type Bot={status:string;bot:string|null;webhook:{ours:boolean;url:string;pending:number;lastError:string|null};stars:{amount?:number}|number|null;current?:string;error?:string};
type Finance={sales:number;support:number;refunds:number;test:number;testCount:number;earned:number;withdrawable:number;payers:number;pending:number;
 orders:{id:string;sku:string;stars:number;gems:number;status:string;created_at:string;telegram:string}[]};
/** Estimated owner revenue per Star in USD; Telegram's withdrawal rate is shown by Fragment and may change. */
const STAR_USD=0.013;
const orderStatus:Record<string,string>={paid:'оплачен',refunded:'возвращён',refunding:'возврат…'};
const refundText:Record<string,string>={refunded:'Stars возвращены игроку.',restored:'Telegram не выполнил возврат · самоцветы возвращены игроку.',
 gems_spent:'Самоцветы уже потрачены · возврат невозможен.',not_paid:'Заказ уже не в статусе «оплачен».'};

/** Owner finance: bot payment webhook, Stars income, refunds and the net result. */
function AdminFinance({owner}:{owner:boolean}){
 const [bot,setBot]=useState<Bot>();
 const [finance,setFinance]=useState<Finance>();
 const [treasury,setTreasury]=useState<{ton:string;linkedWallets:number}>();
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false);
 async function load(connect=false){
  setBusy(true);setNotice('');
  try{
   const [b,f,t]=await Promise.all([community<Bot>('admin_bot',connect?{connect:true}:{}),community<Finance>('admin_finance',{days:3650}),
    community<{ton:string;linkedWallets:number}>('admin_treasury').catch(()=>undefined)]);
   setBot(b);setFinance(f);setTreasury(t);
   if(b.status==='webhook_in_use')setNotice('У бота уже есть другой обработчик · подключение отменено, чтобы его не сломать.');
   else if(b.status==='failed')setNotice('Telegram отклонил подключение: '+(b.error??''));
  }catch{setNotice('Финансы временно недоступны. Войдите в администрирование снова.');}
  finally{setBusy(false);}
 }
 async function refund(order:string){
  if(busy||!window.confirm('Вернуть Stars игроку и списать начисленные самоцветы?'))return;
  setBusy(true);
  try{const r=await community<{status:string}>('admin_stars_refund',{order});setNotice(refundText[r.status]??'Возврат отклонён.');}
  catch{setNotice('Возврат не выполнен · попробуйте ещё раз.');}
  finally{setBusy(false);void load();}
 }
 const balance=typeof bot?.stars==='number'?bot.stars:bot?.stars?.amount;
 return <details className="saga-disclosure" onToggle={event=>{if((event.target as HTMLDetailsElement).open&&!finance&&!busy)void load()}}>
  <summary>Финансы и Stars</summary>
  <div className="admin-analytics">
   {bot&&<>
    <p>@{bot.bot??'?'} · платежи {bot.webhook.ours?'✓':'не подключены'}{balance!==undefined?` · баланс бота ⭐ ${balance}`:''}{bot.webhook.pending?` · в очереди ${bot.webhook.pending}`:''}</p>
    {bot.webhook.lastError&&<p>Ошибка Telegram · {bot.webhook.lastError}</p>}
    {owner&&!bot.webhook.ours&&<button type="button" className="action secondary" disabled={busy} onClick={()=>void load(true)}>Подключить приём платежей</button>}
   </>}
   {finance&&<>
    <p>Заработано ⭐ {finance.earned} · к выводу ⭐ {finance.withdrawable} ≈ ${(finance.withdrawable*STAR_USD).toFixed(2)}</p>
    <p>Продажи ⭐ {finance.sales} · поддержка ⭐ {finance.support} · возвраты ⭐ {finance.refunds} · платящих {finance.payers}</p>
    <p className="hint">К выводу — Stars старше 21 дня (правило Telegram), вывод через Fragment от 1000 ⭐; $ — оценка.{finance.testCount?` Тестовых покупок: ${finance.testCount}, в итоги не входят.`:''}</p>
    {treasury&&<p>Казна TON · <code>{treasury.ton.slice(0,6)}…{treasury.ton.slice(-6)}</code> · кошельков игроков {treasury.linkedWallets}</p>}
    <details className="saga-disclosure"><summary>Заказы · {finance.orders.length}</summary>
    {finance.orders.map(o=><div key={o.id}>
     <p>{new Date(o.created_at).toLocaleString()} · {o.sku} · ⭐ {o.stars} · {o.gems} самоц. · {orderStatus[o.status]??o.status} · игрок {o.telegram}</p>
     {owner&&o.status==='paid'&&<button type="button" className="action secondary" disabled={busy} onClick={()=>void refund(o.id)}>Вернуть Stars</button>}
    </div>)}
    </details>
   </>}
   <button type="button" className="action secondary" disabled={busy} onClick={()=>void load()}>Обновить</button>
   {notice&&<p role="status">{notice}</p>}
  </div>
 </details>;
}

const passwordText:Record<string,string>={
 ok:'Логин и пароль изменены.',invalid:'Текущий пароль неверен.',
 weak_password:'Новый пароль: от 8 до 72 символов и не совпадает со старым.',
 bad_login:'Логин: 3–32 символа, латиница в нижнем регистре, цифры, «_», «.», «-».',
};

function AdminPassword(){
 const [oldPassword,setOld]=useState('');
 const [login,setLogin]=useState('');
 const [password,setPassword]=useState('');
 const [repeat,setRepeat]=useState('');
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false);
 async function submit(event:FormEvent){
  event.preventDefault();
  if(password!==repeat){setNotice('Пароли не совпадают.');return;}
  setBusy(true);
  setNotice('');
  try{
   const result=await community<{status:string}>('admin_password',{oldPassword,login,password});
   setNotice(passwordText[result.status]??'Изменение отклонено.');
   if(result.status==='ok'){setOld('');setPassword('');setRepeat('');}
  }catch{setNotice('Изменение временно недоступно. Войдите снова.');}
  finally{setBusy(false);}
 }
 return <details className="saga-disclosure"><summary>Логин и пароль</summary>
  <form onSubmit={event=>void submit(event)}>
   <label>Текущий пароль<input type="password" autoComplete="current-password" maxLength={72} required value={oldPassword} onChange={event=>setOld(event.target.value)}/></label>
   <label>Новый логин<input autoComplete="username" autoCapitalize="none" maxLength={32} required value={login} onChange={event=>setLogin(event.target.value)}/></label>
   <label>Новый пароль<input type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={event=>setPassword(event.target.value)}/></label>
   <label>Повторите пароль<input type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={repeat} onChange={event=>setRepeat(event.target.value)}/></label>
   <button className="action secondary" disabled={busy}>Сохранить</button>
   {notice&&<p role="status">{notice}</p>}
  </form>
 </details>;
}

export function NetworkAdmin({onExit}:{onExit:()=>void}){
 const [status,setStatus]=useState<Status>();
 const [history,setHistory]=useState<Entry[]>([]);
 const [player,setPlayer]=useState<Player|null>();
 const [telegramId,setTelegramId]=useState('');
 const [reason,setReason]=useState('');
 const [amount,setAmount]=useState('');
 const [sanction,setSanction]=useState<Sanction>('chat_mute');
 const [expires,setExpires]=useState('');
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false);
 const retry=useRef<{key:string;operationId:string}|undefined>(undefined);
 const target=useRef('');
 useEffect(()=>{
  const abort=new AbortController();
  void community<Status>('admin_status',{},abort.signal).then(setStatus,()=>{if(!abort.signal.aborted)onExit();});
  return ()=>abort.abort();
 },[onExit]);
 if(!status)return null;

 async function find(event:FormEvent){
  event.preventDefault();
  target.current='';
  setPlayer(undefined);
  setBusy(true);
  setNotice('');
  try{
   const found=await community<Player|null>('admin_find_player',{telegramId});
   target.current=telegramId;
   setPlayer(found);
   setStatus(await community<Status>('admin_status'));
   setHistory([]);
  }catch{setNotice('Поиск временно недоступен.');}
  finally{setBusy(false);}
 }
 async function action(kind:string,payload:object){
  if(busy||reason.trim().length<3)return;
  const key=JSON.stringify({kind,payload,reason});
  const operationId=retry.current?.key===key?retry.current.operationId:crypto.randomUUID();
  retry.current={key,operationId};
  setBusy(true);
  setNotice('');
  try{
   const result=await community<{status:string}>('admin_apply',{kind,payload,reason,operationId});
   retry.current=undefined;
   setNotice(resultText[result.status]??'Операция отклонена.');
   if(result.status==='ok')setReason('');
   try{
    if(target.current)setPlayer(await community<Player|null>('admin_find_player',{telegramId:target.current}));
    setStatus(await community<Status>('admin_status'));
    setHistory([]);
   }catch{setNotice((resultText[result.status]??'Операция отклонена.')+' Обновите данные игрока через поиск.');}
  }catch{setNotice('Проверьте связь и повторите то же действие.');}
  finally{setBusy(false);}
 }
 async function older(){
  const entries=history.length?history:status?.history??[];
  const before=entries.at(-1)?.id;
  if(!before)return;
  try{
   const page=await community<Status>('admin_status',{before});
   if(page.history.length)setHistory(current=>[...current,...page.history]);
   else setNotice('Более ранних записей нет.');
  }catch{setNotice('Журнал временно недоступен.');}
 }
 const disabled=busy||reason.trim().length<3;
 return <details className="saga-disclosure" open>
  <summary>Администрирование</summary>
  <div className="wb-admin">
   <form onSubmit={event=>void find(event)}>
    <label>Telegram ID<input inputMode="numeric" pattern="[1-9][0-9]{0,15}" required
     value={telegramId} onChange={event=>setTelegramId(event.target.value)}/></label>
    <button className="action secondary" disabled={busy}>Найти игрока</button>
   </form>
   <label>Причина действия<input value={reason} maxLength={280} onChange={event=>setReason(event.target.value)}/></label>
   {player===null&&<p>Игрок не найден.</p>}
   {player&&<>
    <h3>{player.name}</h3>
    <p>Платные самоцветы · {player.paidGems}</p>
    <form onSubmit={event=>{event.preventDefault();void action('credit',{player:player.id,amount:Number(amount)});}}>
     <label>Компенсация за подтверждённый сбой<input type="number" min={1} max={1_000_000} step={1}
      required value={amount} onChange={event=>setAmount(event.target.value)}/></label>
     <button className="action secondary" disabled={disabled}>Начислить</button>
    </form>
    {player.orders.length>0&&<details className="saga-disclosure"><summary>Последние покупки</summary>
     {player.orders.map(order=><div key={order.operation_id}>
      <p>{order.sku} · {order.price} · {new Date(order.created_at).toLocaleString()}</p>
      {order.refunded_at?<span>Отменена</span>:<button type="button" className="action secondary" disabled={disabled}
       onClick={()=>void action('cancel_purchase',{player:player.id,purchase:order.operation_id})}>Отменить покупку</button>}
     </div>)}
    </details>}
    <form onSubmit={event=>{
     event.preventDefault();
     const expiresAt=expires?new Date(expires):null;
     if(expiresAt&&(!Number.isFinite(expiresAt.getTime())||expiresAt.getTime()<=Date.now())){
      setNotice('Укажите будущую дату окончания.');return;
     }
     void action('sanction',{player:player.id,kind:sanction,expiresAt:expiresAt?.toISOString()??null});
    }}>
     <label>Ограничение<select value={sanction} onChange={event=>setSanction(event.target.value as Sanction)}>
      {Object.entries(sanctions).map(([key,name])=><option key={key} value={key}>{name}</option>)}
     </select></label>
     <label>До (пусто — бессрочно)<input type="datetime-local" value={expires} onChange={event=>setExpires(event.target.value)}/></label>
     <button className="action secondary" disabled={disabled}>Установить</button>
    </form>
    {player.sanctions.map(entry=><div key={entry.kind}>
     <p>{sanctions[entry.kind]} · {entry.expires_at?new Date(entry.expires_at).toLocaleString():'бессрочно'} · {entry.reason}</p>
     <button type="button" className="action secondary" disabled={disabled||entry.assigned_role!==status.role}
      onClick={()=>void action('lift',{player:player.id,kind:entry.kind})}>Снять</button>
    </div>)}
   </>}
   <details className="saga-disclosure"><summary>Сетевые функции</summary>
    {(Object.keys(flags) as Feature[]).map(name=><button type="button" key={name} className="action secondary"
     disabled={disabled||name==='premium_shop'&&!status.flags[name]}
     onClick={()=>void action('flag',{name,enabled:!status.flags[name]})}>{flags[name]} · {status.flags[name]?'вкл':'выкл'}</button>)}
   </details>
   <details className="saga-disclosure"><summary>Журнал действий</summary>
    <ul>{[...status.history,...history].map(entry=><li key={entry.id}>
     {new Date(entry.occurred_at).toLocaleString()} · {entry.actor_role} · {entry.actor_telegram} · {entry.kind} · {entry.reason}
    </li>)}</ul>
    {status.history.length>=30&&<button type="button" className="action secondary" onClick={()=>void older()}>Предыдущие записи</button>}
   </details>
   <AdminFinance owner={status.role==='owner'}/>
   <AdminAnalytics/>
   <AdminPassword/>
   <button type="button" className="action secondary" onClick={()=>{void community('admin_lock').catch(()=>{});onExit();}}>Выйти из администрирования</button>
   {notice&&<p role="status">{notice}</p>}
  </div>
 </details>;
}
