import {useState} from 'react';
import type {Player} from '../core/types';
import {useGame} from '../core/store';
import {expensiveOffer, shopCategories, shopCurrencies, shopOffers, shopQuote, shopStatus, type ShopOffer} from '../saga/shop';
import {rewardText} from '../saga/rewards';
import {Icon} from './Icon';
import {RewardArt, rewardParts} from './RewardArt';
import {CardDialog} from './SagaUI';
import './treasureShop.css';

const categories = [['all','Витрина'], ...shopCategories] as const;
const featured = ['travel-stipend','region-supplies','expedition-kit','mine-reserve','summon-seal','forge-parcel'];
const compactCoins = new Intl.NumberFormat('ru', {notation:'compact',maximumFractionDigits:1});
const priceText = (offer: ShopOffer) => `${offer.price.toLocaleString('ru')} ${shopCurrencies[offer.currency].unit}`;
const limitText = (offer: ShopOffer) => offer.limit === 'daily' ? 'Одна покупка в сутки · обновление в 00:00 UTC'
  : offer.limit === 'once' ? 'Одна покупка на героя' : 'Количество зависит от свободного места в Роге';

export function TreasureShop({p, source, sources}: {
  p: Player;
  source: (kind: string) => React.ReactNode;
  sources: (kind: string) => string;
}) {
  const [category, setCategory] = useState<typeof categories[number][0]>('all');
  const [details, setDetails] = useState<string>();
  const [confirmation, setConfirmation] = useState<ShopOffer>();
  const [guide, setGuide] = useState<string>();
  const buy = useGame(state => state.buy);
  const now = Date.now();
  const offers = shopOffers(p, now);
  const order = (id: string) => featured.includes(id) ? featured.indexOf(id) : featured.length;
  const visible = category === 'all' ? [...offers].sort((a,b) => order(a.id) - order(b.id))
    : offers.filter(offer => offer.category === category);
  const selected = offers.find(offer => offer.id === details);
  const purchase = (offer: ShopOffer) => buy(offer.id, shopQuote(offer));
  const requestPurchase = (offer: ShopOffer) => {
    if (expensiveOffer(offer)) setConfirmation(offer);
    else purchase(offer);
  };
  const selectedStatus = selected && shopStatus(p, selected, now);
  return <div className="treasure-shop">
    <div className="shop-counter">
      <div><strong>Прилавок<br/>северного купца</strong><span>Новые товары в 00:00 UTC</span></div>
    </div>
    <div className="shop-wallet">
      {Object.entries(shopCurrencies).map(([id, def]) => {
        const amount = p[id as keyof typeof shopCurrencies];
        return <button key={id} type="button" onClick={() => setGuide(id)} aria-label={`Где получить · ${def.name}`}
          title={def.name + ' · ' + amount.toLocaleString('ru')}>
          <Icon name={def.icon}/><strong>{amount >= 100_000 ? compactCoins.format(amount) : amount.toLocaleString('ru')}</strong>
        </button>;
      })}
    </div>
    <div className="shop-tabs" role="group" aria-label="Категории лавки">
      {categories.map(([id, label]) => <button key={id} type="button" aria-pressed={category === id}
        onClick={() => setCategory(id)}>{label}</button>)}
    </div>
    <div className="shop-grid">
      {visible.map(offer => {
        const status = shopStatus(p, offer, now);
        const sold = status === 'Сегодня куплено' || status === 'Куплено';
        const parts = rewardParts(offer.reward);
        return <article className={`shop-offer${sold ? ' sold' : ''}`} key={offer.id} data-offer={offer.id}>
          <button className="shop-item" type="button" onClick={() => setDetails(offer.id)}
            aria-label={`Подробнее · ${offer.name} · ${rewardText(offer.reward)}`}>
            <span className="shop-item-picture">
              {parts.length > 1 ? <RewardArt reward={offer.reward}/> : <><Icon name={parts[0]?.icon ?? offer.icon}/>
                {parts[0] && <b>×{parts[0].count.toLocaleString('ru')}</b>}</>}
            </span>
            <strong>{offer.name}</strong>
          </button>
          <button type="button" className="shop-buy" disabled={!!status}
            aria-label={sold ? status : `Купить · ${priceText(offer)}${status ? ` · ${status}` : ''}`} title={status || priceText(offer)}
            onClick={() => requestPurchase(offer)}>
            {sold ? <span>{status}</span> : <><Icon name={shopCurrencies[offer.currency].icon}/>
              <b>{offer.price.toLocaleString('ru')}</b>{status && <span>{status === 'Недостаточно средств' ? 'Не хватает' : status === 'Рог заполнен' ? status : 'Мало места в Роге'}</span>}</>}
          </button>
        </article>;
      })}
    </div>
    {selected && !confirmation && !guide && <CardDialog title={selected.name} onClose={() => setDetails(undefined)}
      actions={selectedStatus === 'Недостаточно средств'
        ? <button className="action secondary" onClick={() => setGuide(selected.currency)}>Где получить</button>
        : <button className="action" disabled={!!selectedStatus}
          onClick={() => requestPurchase(selected)}>{selectedStatus || `Купить · ${priceText(selected)}`}</button>}>
      <RewardArt reward={selected.reward} names/>
      <p>{selected.description}</p><p className="hint">{limitText(selected)}</p>
      <p className="shop-price"><Icon name={shopCurrencies[selected.currency].icon}/>{priceText(selected)}</p>
    </CardDialog>}
    {confirmation && <CardDialog title="Подтвердить покупку" onClose={() => setConfirmation(undefined)}
      actions={<button className="action" onClick={() => {purchase(confirmation); setConfirmation(undefined)}}>Подтвердить · {priceText(confirmation)}</button>}>
      <p><strong>{confirmation.name}</strong></p><RewardArt reward={confirmation.reward} names/>
    </CardDialog>}
    {guide && <CardDialog title={sources(guide)} onClose={() => setGuide(undefined)}>{source(guide)}</CardDialog>}
  </div>;
}
