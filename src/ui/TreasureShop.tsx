import {Fragment,useState} from 'react';
import type {Player} from '../core/types';
import {useGame} from '../core/store';
import {expensiveOffer, shopCategories, shopCurrencies, shopOffers, shopQuote, shopStatus, type ShopOffer} from '../saga/shop';
import {rewardText} from '../saga/rewards';
import {Icon} from './Icon';
import {CardDialog} from './SagaUI';
import './treasureShop.css';

const priceText = (offer: ShopOffer) => `${offer.price.toLocaleString('ru')} ${shopCurrencies[offer.currency].unit}`;

export function TreasureShop({p, source, sources}: {
  p: Player;
  source: (kind: string) => React.ReactNode;
  sources: (kind: string) => string;
}) {
  const [category, setCategory] = useState<typeof shopCategories[number][0]>('daily');
  const [confirmation, setConfirmation] = useState<ShopOffer>();
  const [guide, setGuide] = useState<string>();
  const buy = useGame(state => state.buy);
  const now = Date.now();
  const visibleOffers = shopOffers(p, now).filter(offer => offer.category === category);
  const purchase = (offer: ShopOffer) => buy(offer.id, shopQuote(offer));
  return <div className="treasure-shop">
    <div className="shop-wallet">
      {Object.entries(shopCurrencies).map(([id, def]) =>
        <button key={id} type="button" onClick={() => setGuide(id)} aria-label={`Где получить · ${def.name}`}>
          <Icon name={def.icon}/><span>{def.name}<strong>{p[id as keyof typeof shopCurrencies].toLocaleString('ru')}</strong></span>
        </button>)}
    </div>
    <div className="tabs shop-tabs" aria-label="Категории лавки">
      {shopCategories.map(([id, label]) => <button key={id} aria-pressed={category === id}
        className={category === id ? 'selected' : ''} onClick={() => setCategory(id)}>{label}</button>)}
    </div>
    {visibleOffers.map((offer, index) => {
      const status = shopStatus(p, offer, now);
      return <Fragment key={offer.id}>
        {offer.limit === 'once' && visibleOffers[index-1]?.limit !== 'once' && <h3>Разовые наборы</h3>}
        <article className="row shop-offer" data-offer={offer.id}>
          <Icon name={offer.icon}/>
          <div className="row-content">
            <strong>{offer.name}</strong>
            <small>{offer.description}</small>
            <b>{rewardText(offer.reward) || 'Свободных мест нет'}</b>
            <small>{offer.limit === 'daily' ? '1 раз в сутки' : offer.limit === 'once' ? '1 раз на героя' : 'Пока есть место в Роге'}</small>
            <button type="button" className="action" disabled={!!status}
              onClick={() => expensiveOffer(offer) ? setConfirmation(offer) : purchase(offer)}>Купить · {priceText(offer)}</button>
            {status && <small>{status}</small>}
            {status === 'Недостаточно средств' && <button type="button" className="shop-source"
              onClick={() => setGuide(offer.currency)}>Где получить</button>}
          </div>
        </article>
      </Fragment>;
    })}
    {category === 'daily' && <p className="hint">Предложения обновляются в 00:00 UTC.</p>}
    {confirmation && <CardDialog title="Подтвердить покупку" onClose={() => setConfirmation(undefined)}
      actions={<button className="action" onClick={() => {purchase(confirmation); setConfirmation(undefined)}}>Подтвердить · {priceText(confirmation)}</button>}>
      <p><strong>{confirmation.name}</strong></p><p>{rewardText(confirmation.reward)}</p>
    </CardDialog>}
    {guide && <CardDialog title={sources(guide)} onClose={() => setGuide(undefined)}>{source(guide)}</CardDialog>}
  </div>;
}
