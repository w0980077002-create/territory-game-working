import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {community} from '../community/client';

const flags={
 arena_ranked:'Рейтинговая Арена',arena_team:'Командная Арена',auction_trade:'Аукцион и обмен',
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
   <AdminPassword/>
   <button type="button" className="action secondary" onClick={()=>{void community('admin_lock').catch(()=>{});onExit();}}>Выйти из администрирования</button>
   {notice&&<p role="status">{notice}</p>}
  </div>
 </details>;
}
