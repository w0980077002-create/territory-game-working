import balance from '../../config/test-balance.v1.json';
import economy from '../../config/solo-economy.v1.json';
import type {Player} from '../core/types';
import {resources} from '../dark/rules';
import {grant, regionMaterial, type Reward} from './rewards';
import {materials} from './gear';
import {dayOf} from './quests';
import {boxOf, peekBox} from './save';

export const shopCategories = [
  ['daily', 'Ежедневные'],
  ['supplies', 'Наборы припасов'],
  ['resources', 'Ресурсы'],
  ['materials', 'Усиление'],
  ['horn', 'Рог Трофеев'],
  ['growth', 'Спутники и реликвии'],
] as const;
type Category = typeof shopCategories[number][0];

export const shopCurrencies = {
  gold: {icon:'coins', name:'Золото', unit:'золота'},
  gems: {icon:'gem', name:'Самоцветы', unit:'самоцветов'},
  tokens: {icon:'medal', name:'Жетоны Арены', unit:'жетонов Арены'},
} as const;
export type ShopCurrency = keyof typeof shopCurrencies;

export interface ShopOffer {
  id: string;
  category: Category;
  name: string;
  icon: string;
  description: string;
  price: number;
  currency: ShopCurrency;
  reward: Reward;
  limit?: 'daily' | 'once';
}

const hornConfig = balance.horn_test_settings;

export function availableHorn(p: Pick<Player, 'horn' | 'hornAt'>, now = Date.now()) {
  const elapsed = Math.floor(Math.max(0, now - p.hornAt) / (hornConfig.recharge_one_charge_every_seconds * 1000));
  return Math.min(hornConfig.maximum_charges, p.horn + elapsed);
}

export function hornPurchase(p: Player, now = Date.now()) {
  const count = Math.min(hornConfig.maximum_charges - availableHorn(p, now), hornConfig.purchase_charge_count);
  return {count, cost:Math.ceil(count * hornConfig.purchase_gem_cost / hornConfig.purchase_charge_count)};
}

function hornOffer(p: Player, now: number): ShopOffer {
  const {count, cost} = hornPurchase(p, now);
  return {
    id:'horn', category:'horn', name:'Заряды Рога Трофеев', icon:'horn',
    description:'Каждый заряд даёт один предмет экипировки. Стоимость зависит от свободного места в Роге.',
    currency:'gems', price:cost,
    reward:{horn:count},
  };
}

const packs: ShopOffer[] = balance.test_store.test_packs.map((pack, index) => ({
  id:pack.id, category:'supplies', name:pack.display_name,
  icon:['chest','gift','ship','crown','book','banner','helmet','boots','ring','cloak'][index] ?? 'chest',
  description:'Запас золота, самоцветов и зарядов для развития героя и новой добычи.',
  currency:'tokens', price:pack.test_token_price, limit:'once',
  reward:{gold:pack.grant.gold, gems:pack.grant.gems, horn:pack.grant.horn_charges},
}));

export function shopOffers(p: Player, now = Date.now()): ShopOffer[] {
  const material = regionMaterial(p);
  const offer = (id: keyof typeof economy.shop, category: Category, name: string, icon: string,
    description: string, currency: ShopCurrency, reward: (amount: number) => Reward): ShopOffer => {
    const {price, amount} = economy.shop[id];
    return {id, category, name, icon, description, currency, price, reward:reward(amount), limit:'daily'};
  };
  return [
    offer('travel-stipend','daily','Кошель разведчика','coins','Золото на первые усиления и обучение навыкам.','tokens',gold=>({gold})),
    offer('guard-stones','daily','Камни караула','shield','Хаосит для одного похода в Логово или Царство тьмы.','tokens',chaosite=>({chaosite})),
    offer('blacksmith-coins','resources','Казна кузнеца','belt','Золото на экипировку, навыки и развитие спутников.','gems',gold=>({gold})),
    offer('mine-reserve','resources','Запас шахтёров','axe','Хаосит для входа в Логово или Царство тьмы.','gold',chaosite=>({chaosite})),
    offer('region-supplies','materials',materials[material].name,'armor','Материал текущего региона для создания и перековки экипировки.','gems',amount=>({mats:{[material]:amount}})),
    offer('dark-essence','materials',resources.ess.name,resources.ess.icon,'Расходуется на усиление тёмной экипировки.','gems',ess=>({res:{ess}})),
    offer('summon-seal','growth','Печать призыва',resources.seal.icon,'Один призыв за осколками спутников.','gems',seal=>({res:{seal}})),
    offer('relic-shards','growth',resources.shard.name,resources.shard.icon,'Для открытия и усиления реликвий. Условия открытия смотрите в каталоге.','gems',shard=>({res:{shard}})),
    hornOffer(p, now),
    ...packs,
  ];
}

interface ShopDay {day?: string; bought?: string[]}
export function shopSold(p: Player, offer: ShopOffer, now: number) {
  if (offer.limit === 'once') return p.bought.includes(offer.id);
  const today = peekBox<ShopDay>(p, 'shop');
  return offer.limit === 'daily' && today?.day === dayOf(now)
    && Array.isArray(today.bought) && today.bought.includes(offer.id);
}

export function shopStatus(p: Player, offer: ShopOffer, now: number): string | undefined {
  if (shopSold(p, offer, now)) return offer.limit === 'daily' ? 'Сегодня куплено' : 'Куплено';
  const space = hornConfig.maximum_charges - availableHorn(p, now);
  if (offer.id === 'horn' && space === 0) return 'Рог заполнен';
  if ((offer.reward.horn ?? 0) > space) return 'Освободите место в Роге';
  if (p[offer.currency] < offer.price) return 'Недостаточно средств';
}

/** Includes displayed contents so a stale confirmation cannot buy a different quantity or material. */
export const shopQuote = (offer: Pick<ShopOffer,'price'|'reward'>) => JSON.stringify([offer.price, offer.reward]);
export const expensiveOffer = (offer: ShopOffer) => offer.price >= economy.confirmFrom[offer.currency];

export function applyPurchase(p: Player, offer: ShopOffer, now: number) {
  p[offer.currency] -= offer.price;
  grant(p, offer.reward, now);
  if (offer.limit === 'once') p.bought.push(offer.id);
  if (offer.limit === 'daily') {
    const day = dayOf(now);
    const log = boxOf<ShopDay>(p, 'shop', () => ({}));
    if (log.day !== day || !Array.isArray(log.bought)) {
      log.day = day;
      log.bought = [];
    }
    log.bought.push(offer.id);
  }
}
