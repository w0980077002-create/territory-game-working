import {useEffect,useRef,useState,type FormEvent} from 'react';
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

export function NetworkAdmin(){
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
  void community<Status>('admin_status',{},abort.signal).then(setStatus,()=>{});
  return ()=>abort.abort();
 },[]);
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
 return <details className="saga-disclosure">
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
   {notice&&<p role="status">{notice}</p>}
  </div>
 </details>;
}
