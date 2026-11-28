import {useEffect,useState} from 'react';
import {community,CommunityError} from '../community/client';
import {SAVE_KEY,useGame} from '../core/store';
import {tg} from '../core/telegram';
import {track} from '../core/analyticsBus';
import {Icon} from './Icon';

type Offer={sku:string;kind:'gems'|'support'|'test';title:string;stars:number;gems:number};
type Catalog={open:boolean;admin:boolean;balance:number;offers:Offer[]};
type Transfer={operationId:string;amount:number};
const transferKey=SAVE_KEY+':premium-transfer';
const receipt=(operationId:string)=>'paidgems:'+operationId;

function readPending():Transfer|null{try{return JSON.parse(localStorage.getItem(transferKey)??'null')}catch{return null}}
function savePending(value:Transfer|null){try{value?localStorage.setItem(transferKey,JSON.stringify(value)):localStorage.removeItem(transferKey)}catch{/* retried from memory */}}

/** Applies a confirmed server transfer to the hero once; the receipt in the save blocks a second credit. */
function applyTransfer(t:Transfer){
 const g=useGame.getState();
 if(g.p.claimed.includes(receipt(t.operationId)))return true;
 return g.mutate(p=>{if(!p.claimed.includes(receipt(t.operationId))){p.gems+=t.amount;p.claimed.push(receipt(t.operationId))}});
}

/** Telegram Stars: gem packs, voluntary support and moving account gems to the hero. */
export function StarsStore(){
 const [catalog,setCatalog]=useState<Catalog>(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const load=()=>community<Catalog>('stars_offers').then(setCatalog,error=>setMessage(error instanceof CommunityError&&error.status===401
  ?'Покупки за Stars доступны после входа через Telegram':'Магазин Stars временно недоступен'));
 useEffect(()=>{
  void load();
  const pending=readPending();
  if(pending)void finishTransfer(pending);
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 async function finishTransfer(t:Transfer){
  setBusy(true);
  try{
   const result=await community<{status:string;amount?:number;balance:number}>('premium_transfer',t);
   if(result.status!=='ok'){savePending(null);setMessage('На аккаунте недостаточно самоцветов');}
   else if(applyTransfer(t)){savePending(null);setMessage(`Герой получил ${t.amount.toLocaleString('ru')} самоцветов`);}
   else setMessage('Самоцветы списаны с аккаунта · освободите место для сохранения, перенос завершится автоматически');
   setCatalog(c=>c&&{...c,balance:result.balance});
  }catch{setMessage('Перенос не подтверждён · повторим при следующем открытии Лавки');}
  finally{setBusy(false)}
 }
 async function buy(offer:Offer){
  const open=tg()?.openInvoice;
  if(busy||!open){if(!open)setMessage('Оплата Stars доступна в приложении Telegram');return}
  setBusy(true);setMessage('');
  try{
   const result=await community<{status:string;link?:string}>('stars_invoice',{sku:offer.sku});
   if(result.status!=='ok'||!result.link){setMessage(result.status==='unavailable'?'Покупки за Stars скоро откроются':'Предложение недоступно');setBusy(false);return}
   open(result.link,status=>{
    setBusy(false);
    if(status==='paid'){
     if(offer.kind!=='test')track('purchase',{sku:offer.sku,currency:'stars',price:offer.stars});
     setMessage(offer.kind==='support'?'Спасибо за поддержку проекта!':'Оплата прошла · самоцветы зачисляются на аккаунт');
     // Telegram confirms to the server separately; refresh until the balance arrives.
     for(const delay of [1500,4000,9000])setTimeout(()=>void load(),delay);
    }else if(status==='failed')setMessage('Оплата не прошла');
   });
  }catch{setBusy(false);setMessage('Не удалось создать счёт · попробуйте ещё раз');}
 }
 function transfer(){
  if(!catalog?.balance||busy)return;
  const t={operationId:crypto.randomUUID(),amount:catalog.balance};
  savePending(t);
  void finishTransfer(t);
 }
 if(!catalog)return message?<p className="hint">{message}</p>:null;
 const gems=catalog.offers.filter(o=>o.kind!=='support'),support=catalog.offers.filter(o=>o.kind==='support');
 const available=catalog.open||catalog.admin;
 return <section className="premium-gems stars-store" aria-label="Telegram Stars">
  <header><Icon name="gem"/><strong>Самоцветы за Telegram Stars</strong><b>{catalog.balance.toLocaleString('ru')}</b></header>
  {catalog.balance>0&&<button type="button" className="action" disabled={busy} onClick={transfer}>Перенести {catalog.balance.toLocaleString('ru')} самоцветов герою</button>}
  {!catalog.open&&<p className="hint">{catalog.admin?'Продажи закрыты для игроков · вам доступна проверка оплаты.':'Покупки за Stars скоро откроются.'}</p>}
  {available&&<div className="premium-offers">{gems.map(o=><button key={o.sku} type="button" className="action secondary" disabled={busy}
   onClick={()=>void buy(o)}>{o.gems.toLocaleString('ru')} самоцветов · ⭐ {o.stars.toLocaleString('ru')}</button>)}</div>}
  {available&&support.length>0&&<details className="saga-disclosure"><summary>Поддержать проект</summary>
   <p className="hint">Добровольная поддержка разработки. Не даёт игровых преимуществ.</p>
   <div className="premium-offers">{support.map(o=><button key={o.sku} type="button" className="action secondary" disabled={busy}
    onClick={()=>void buy(o)}>⭐ {o.stars.toLocaleString('ru')}</button>)}</div>
  </details>}
  <p className="hint">Самоцветы хранятся на аккаунте Telegram и переносятся герою по кнопке. Неиспользованную покупку можно вернуть в течение 14 дней: /paysupport в чате бота.</p>
  {message&&<p role="status">{message}</p>}
 </section>;
}
