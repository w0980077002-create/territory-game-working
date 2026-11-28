import {useEffect,useState} from 'react';
import {community,CommunityError} from '../community/client';
import {SAVE_KEY,useGame} from '../core/store';
import {tg} from '../core/telegram';
import {track} from '../core/analyticsBus';
import {Icon} from './Icon';

type Offer={sku:string;kind:'gems'|'support'|'test';title:string;stars:number;gems:number;bonus?:boolean};
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
 const available=catalog.open||catalog.admin;
 // New commercial kinds only need a card face here; payment and crediting stay on the server catalog.
 const card=(o:Offer)=>{
  const support=o.kind==='support';
  return <article className="shop-offer stars-offer" key={o.sku} data-offer={o.sku} data-value={o.bonus?'prime':support?'bundle':undefined}>
   {o.bonus&&<em className="shop-ribbon" title="Первая покупка ×2">×2</em>}
   <div className="shop-item">
    <span className="shop-item-picture"><Icon name={support?'gift':'gem'}/>{!support&&<b>×{o.gems.toLocaleString('ru')}</b>}</span>
    <strong>{support?'Поддержка проекта':o.kind==='test'?'Проверка':'Самоцветы'}</strong>
   </div>
   <button type="button" className="shop-buy" disabled={busy||!available} aria-label={`Купить · ${o.title} · ${o.stars} Stars`}
    onClick={()=>void buy(o)}><b>⭐ {o.stars.toLocaleString('ru')}</b></button>
  </article>;
 };
 return <section className="stars-store" aria-label="Telegram Stars">
  <div className="stars-account">
   <Icon name="gem"/><span>На аккаунте <b>{catalog.balance.toLocaleString('ru')}</b></span>
   {catalog.balance>0&&<button type="button" className="shop-buy stars-transfer" disabled={busy} onClick={transfer}>Герою</button>}
  </div>
  {!catalog.open&&<p className="hint">{catalog.admin?'Продажи закрыты для игроков · вам доступна проверка оплаты.':'Покупки за Stars скоро откроются.'}</p>}
  {available&&<div className="shop-grid">{catalog.offers.map(card)}</div>}
  <p className="hint">Оплата Telegram Stars · возврат неиспользованного 14 дней через /paysupport · поддержка не даёт преимуществ.</p>
  {message&&<p role="status">{message}</p>}
 </section>;
}
