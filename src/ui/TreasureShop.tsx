import {useEffect,useState} from 'react';
import type {Player,Slot} from '../core/types';
import {slotNames} from '../data/catalog';
import {SAVE_KEY,useGame} from '../core/store';
import {expensiveOffer, shopCategories, shopCurrencies, shopEquipmentSlots, shopOffers, shopQuote, shopStatus, type ShopOffer} from '../saga/shop';
import {rewardText} from '../saga/rewards';
import {Icon,gearIcon} from './Icon';
import {CompactFilter} from './CompactFilter';
import {RewardArt, rewardParts} from './RewardArt';
import {ArenaRequestError,consumablesRequest,signedArena,type ConsumableOperation} from '../arena/client';
import {buyPremiumOffer,communityEnabled,CommunityError,readPremiumWallet,type PremiumOffer,type PremiumWallet} from '../community/client';
import {consumableIds,consumableStock,type ConsumableId,type ConsumablesQuote} from '../arena/potion';
/** Shop id → Arena consumable kind (the potion keeps its old id `arena-potion`). */
const arenaKind=(id:string)=>consumableIds.find(kind=>id===(kind==='potion'?'arena-potion':'arena-'+kind)) as ConsumableId|undefined;
import {CardDialog} from './SagaUI';
import './treasureShop.css';

const categories = [['all','Витрина'], ...shopCategories] as const;
const categoryIcons = {
  all:'chest', daily:'event', resources:'coins', materials:'mat-harbor',
  equipment:'helmet', growth:'skill', horn:'horn', elixirs:'elixir-valhalla-heart', supplies:'gift',
} satisfies Record<typeof categories[number][0],string>;
const featured = ['arena-potion','travel-stipend','region-supplies','expedition-kit','mine-reserve','summon-seal','forge-parcel','basic-equipment'];
const compactCoins = new Intl.NumberFormat('ru', {notation:'compact',maximumFractionDigits:1});
const priceText = (offer: ShopOffer) => `${offer.price.toLocaleString('ru')} ${shopCurrencies[offer.currency].unit}`;
const limitText = (offer: ShopOffer) => offer.limit === 'daily' ? 'Одна покупка в сутки · обновление в 00:00 UTC'
  : offer.limit === 'weekly' ? 'Одна покупка в неделю · с понедельника 00:00 UTC'
  : offer.limit === 'once' ? 'Одна покупка на героя' : arenaKind(offer.id)?'Одна порция за покупку':'Количество зависит от свободного места в Роге';

const premiumNames:Record<string,string>={horn:'Заряды Рога Трофеев'};
const premiumKey=SAVE_KEY+':premium-operation';
/** B5a: account gems kept by the server (W066). Shown only to signed players; Stars top-up arrives with B5. */
function PremiumGems(){
 const [wallet,setWallet]=useState<PremiumWallet>(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{
  let active=true;
  readPremiumWallet().then(value=>{if(active)setWallet(value)})
   .catch(error=>{if(active)setMessage(error instanceof CommunityError&&error.status===401?'Самоцветы аккаунта доступны после входа через Telegram':'Кошелёк самоцветов временно недоступен')});
  return ()=>{active=false};
 },[]);
 async function buy(offer:PremiumOffer){
  if(busy)return;
  let pending:{sku:string;operationId:string}|null=null;
  try{pending=JSON.parse(sessionStorage.getItem(premiumKey)??'null')}catch{/* fresh operation */}
  const order=pending?.sku===offer.sku?pending:{sku:offer.sku,operationId:crypto.randomUUID()};
  try{sessionStorage.setItem(premiumKey,JSON.stringify(order))}catch{/* retry stays possible in this dialog */}
  setBusy(true);setMessage('');
  try{
   const result=await buyPremiumOffer(order.sku,order.operationId);
   if(result.status==='ok')setMessage(`Получено: ${premiumNames[result.receipt.resource]??result.receipt.resource} × ${result.receipt.amount}`);
   else setMessage('Недостаточно самоцветов аккаунта');
   setWallet(current=>current&&{...current,balance:result.balance});
   try{sessionStorage.removeItem(premiumKey)}catch{/* nothing to clear */}
  }catch(error){
   if(error instanceof CommunityError&&[400,409,422].includes(error.status))try{sessionStorage.removeItem(premiumKey)}catch{/* nothing to clear */}
   setMessage('Не удалось подтвердить покупку · попробуйте ещё раз');
  }finally{setBusy(false)}
 }
 return <section className="premium-gems" aria-label="Самоцветы аккаунта">
  <header><Icon name="gem"/><strong>Самоцветы аккаунта</strong>{wallet&&<b>{wallet.balance.toLocaleString('ru')}</b>}</header>
  <p className="hint">Хранятся на сервере и не теряются при смене устройства. Пополнение через Telegram Stars появится позже.</p>
  {wallet&&<div className="premium-offers">{wallet.offers.map(offer=><button key={offer.sku} type="button" className="action secondary"
   disabled={busy||wallet.balance<offer.price} onClick={()=>void buy(offer)}>
   {`${premiumNames[offer.resource]??offer.resource} × ${offer.amount} · ${offer.price} самоцветов`}</button>)}</div>}
  {message&&<p role="status">{message}</p>}
 </section>;
}
function NetworkConsumable({item,localStock}:{item:ConsumableId;localStock:number}){
 const operationKey=SAVE_KEY+':network-'+item+'-operation';
 const [quote,setQuote]=useState<ConsumablesQuote>(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [pending,setPending]=useState<ConsumableOperation|undefined>(()=>{
  try{
   const saved=JSON.parse(sessionStorage.getItem(operationKey)??'null');
   if(saved)return {...saved,item};
  }catch{return;}
 });
 useEffect(()=>{
  let active=true;
  consumablesRequest().then(value=>{if(active)setQuote(value);})
   .catch(()=>{if(active)setMessage('Сетевой запас временно недоступен');});
  return ()=>{active=false;};
 },[]);
 async function buy(){
  if(busy||!quote&&!pending)return;
  const data=pending??{operation:crypto.randomUUID(),stage:quote!.stage,price:quote!.prices[item],item};
  setBusy(true);setMessage('');setPending(data);
  try{sessionStorage.setItem(operationKey,JSON.stringify(data));}catch{/* Retry remains available in this dialog. */}
  try{
   setQuote(await consumablesRequest(data));
   setMessage(item==='potion'?'Зелье добавлено в рюкзак':'Расходник добавлен в рюкзак');
   clearPending();
  }catch(error){
   if(error instanceof ArenaRequestError&&[400,409,422].includes(error.status)){
    clearPending();
    setQuote(await consumablesRequest().catch(()=>undefined));
   }
   setMessage(error instanceof ArenaRequestError?error.message:'Не удалось подтвердить покупку');
  }finally{setBusy(false)}
 }
 function clearPending(){
  setPending(undefined);
  try{sessionStorage.removeItem(operationKey);}catch{/* State is cleared for this dialog. */}
 }
 const confirmed=quote?.stock[item]??0,reserved=quote?.reserved[item]??0;
 if(!quote&&!message&&!pending)return <p className="hint" role="status">Загружаем сетевой запас…</p>;
 return <div>
  <p>В рюкзаке: {confirmed+localStock}{reserved?' · зарезервировано '+reserved:''}</p>
  {quote&&localStock>0&&<p className="hint">Из них для сетевого боя: {confirmed}</p>}
  {quote&&<p className="hint">Золото сетевого кошелька: {quote.gold.toLocaleString('ru')} · цена для подтверждённого этапа {quote.stage}</p>}
  {message&&<p role="status">{message}</p>}
  {(pending||quote)&&<button className="action secondary" type="button" disabled={busy||!pending&&!!quote&&quote.gold<quote.prices[item]}
   onClick={()=>void buy()}>{pending?'Проверить покупку':'Купить за подтверждённое золото · '+quote!.prices[item].toLocaleString('ru')}</button>}
 </div>;
}

export function TreasureShop({p, source, sources, onFreeSpace}: {
  p: Player;
  onFreeSpace: () => void;
  source: (kind: string) => React.ReactNode;
  sources: (kind: string) => string;
}) {
  const [category, setCategory] = useState<typeof categories[number][0]>('all');
  const [equipmentSlot,setEquipmentSlot]=useState<Slot>('weapon');
  const [details, setDetails] = useState<string>();
  const [confirmation, setConfirmation] = useState<ShopOffer>();
  const [guide, setGuide] = useState<string>();
  const buy = useGame(state => state.buy);
  const now = Date.now();
  const offers = shopOffers(p, now, equipmentSlot);
  const order = (id: string) => featured.includes(id) ? featured.indexOf(id) : featured.length;
  const visible = category === 'all' ? [...offers].sort((a,b) => order(a.id) - order(b.id))
    : offers.filter(offer => offer.category === category);
  const selected = offers.find(offer => offer.id === details);
  const purchase = (offer: ShopOffer) => buy(offer.id, shopQuote(offer), offer.equipment?.slot);
  const requestPurchase = (offer: ShopOffer) => {
    if (offer.equipment||expensiveOffer(offer)) setConfirmation(offer);
    else purchase(offer);
  };
  const signed=signedArena();
  const selectedKind=selected?arenaKind(selected.id):undefined;
  const selectedStatus = selected && shopStatus(p, selected, now);
  const confirmationStatus = confirmation && shopStatus(p, confirmation, now);
  const packFull = category === 'equipment' && visible.some(offer => offer.equipment && shopStatus(p, offer, now) === 'Рюкзак полон');
  const freeSpace = <button className="action secondary" onClick={onFreeSpace}>Освободить место</button>;
  return <div className="treasure-shop">
    <div className="shop-counter">
      <div className="shop-sign"><strong>Прилавок<br/>северного купца</strong><span>Новые товары в 00:00 UTC</span></div>
    </div>
    {communityEnabled&&signed&&category==='supplies'&&<PremiumGems/>}
    <div className="shop-wallet">
      {Object.entries(shopCurrencies).map(([id, def]) => {
        const amount = p[id as keyof typeof shopCurrencies];
        return <button key={id} type="button" onClick={() => setGuide(id)} aria-label={`Где получить · ${def.name}`}
          title={def.name + ' · ' + amount.toLocaleString('ru')}>
          <Icon name={def.icon}/><strong>{amount >= 100_000 ? compactCoins.format(amount) : amount.toLocaleString('ru')}</strong><span aria-hidden="true">i</span>
        </button>;
      })}
    </div>
    <div className="shop-tabs" role="group" aria-label="Категории лавки">
      {categories.map(([id, label]) => <button key={id} type="button" aria-pressed={category === id}
        onClick={() => setCategory(id)}><Icon name={categoryIcons[id]}/><span>{label}</span></button>)}
    </div>
    {packFull && <div className="capacity-help"><p className="hint">Рюкзак полон. Перед покупкой снаряжения разберите выбранную вещь в рюкзаке.</p>{freeSpace}</div>}
    <div className="shop-grid">
      {visible.map(offer => {
        const signedConsumable=signed&&!!arenaKind(offer.id);
        const signedPotion=signedConsumable&&offer.id==='arena-potion';
        const status=signedConsumable?undefined:shopStatus(p,offer,now);
        const sold = status === 'Сегодня куплено' || status === 'Куплено';
        const parts = rewardParts(offer.reward);
        // Visual hierarchy only: limited weekly/one-time offers shine, bundles get a warmer frame.
        const value = offer.limit === 'weekly' || offer.limit === 'once' ? 'prime' : parts.length > 1 ? 'bundle' : undefined;
        return <article className={`shop-offer${sold ? ' sold' : ''}`} key={offer.id} data-offer={offer.id} data-value={value}>
          {value === 'prime' && !sold && <em className="shop-ribbon">{offer.limit === 'weekly' ? 'Раз в неделю' : 'Особое'}</em>}
          <button className="shop-item" type="button" onClick={() => setDetails(offer.id)}
            aria-label={`Подробнее · ${offer.name}${parts.length?` · ${rewardText(offer.reward)}`:''}`}>
            <span className="shop-item-picture">
              {parts.length > 1 ? <RewardArt reward={offer.reward}/> : <><Icon name={parts[0]?.icon ?? offer.icon}/>
                {parts[0] && <b>×{parts[0].count.toLocaleString('ru')}</b>}</>}
            </span>
            <strong>{offer.name}</strong>
          </button>
          <button type="button" className="shop-buy" disabled={!!status}
            aria-label={signedPotion?'К покупке · '+offer.name:sold?status:`Купить · ${priceText(offer)}${status ? ` · ${status}` : ''}`} title={status || priceText(offer)}
            onClick={() => offer.equipment||arenaKind(offer.id)?setDetails(offer.id):requestPurchase(offer)}>
            {sold ? <span>{status}</span> : <><Icon name={shopCurrencies[offer.currency].icon}/>
              <b>{signedPotion?'Купить':offer.price.toLocaleString('ru')}</b>{status && <span>{status === 'Недостаточно средств' ? 'Не хватает' : status === 'Освободите место в Роге' ? 'Мало места в Роге' : status}</span>}</>}
          </button>
        </article>;
      })}
    </div>
    {selected && !confirmation && !guide && <CardDialog title={selected.name} onClose={() => setDetails(undefined)}
      actions={selectedStatus === 'Рюкзак полон' ? freeSpace : selectedStatus === 'Недостаточно средств'
        ? <button className="action secondary" onClick={() => setGuide(selected.currency)}>Где получить</button>
        : <button className="action" disabled={!!selectedStatus}
          onClick={() => requestPurchase(selected)}>{selectedStatus || (selectedKind?(signed?'Купить для Solo · ':'Купить за золото героя · '):'Купить · ')+priceText(selected)}</button>}>
      {selected.equipment?<div className="inventory-order">
        <span>Слот</span><CompactFilter label="Слот покупки" value={equipmentSlot} onChange={slot=>setEquipmentSlot(slot as Slot)}
          options={shopEquipmentSlots.map(slot=>({value:slot,label:slotNames[slot]}))}/>
      </div>:<RewardArt reward={selected.reward} names/>}
      <p>{selected.description}</p><p className="hint">{limitText(selected)}</p>
      {selectedKind&&(signed?<NetworkConsumable key={selectedKind} item={selectedKind} localStock={consumableStock(p,selectedKind)}/>:
       <p>В рюкзаке: {consumableStock(p,selectedKind)}</p>)}
      {(selected.id!=='arena-potion'||!signed)&&<p className="shop-price"><Icon name={shopCurrencies[selected.currency].icon}/>{priceText(selected)}</p>}
    </CardDialog>}
    {confirmation && <CardDialog title="Подтвердить покупку" onClose={() => setConfirmation(undefined)}
      actions={confirmationStatus === 'Рюкзак полон' ? freeSpace :
        <button className="action" disabled={!!confirmationStatus} onClick={() => {if(purchase(confirmation)&&confirmation.equipment)setDetails(undefined);setConfirmation(undefined)}}>
          {confirmationStatus || `Подтвердить · ${priceText(confirmation)}`}
        </button>}>
      {confirmation.equipment?<div className="row">
        <Icon name={gearIcon(confirmation.equipment.slot)}/>
        <p><strong>{slotNames[confirmation.equipment.slot]}</strong><br/>Обычный предмет · ур.{confirmation.equipment.level}</p>
      </div>:<><p><strong>{confirmation.name}</strong></p><RewardArt reward={confirmation.reward} names/></>}
    </CardDialog>}
    {guide && <CardDialog title={sources(guide)} onClose={() => setGuide(undefined)}>{source(guide)}</CardDialog>}
  </div>;
}
