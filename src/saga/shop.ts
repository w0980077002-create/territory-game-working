import {consumables,healingPotion,potionStock} from '../arena/potion';
import {utcWeek} from './soloEconomy';
import balance from '../../config/test-balance.v1.json';
import economy from '../../config/solo-economy.v1.json';
import type {Player,Slot} from '../core/types';
import {slots} from '../data/catalog';
import {resources} from '../dark/rules';
import {grant, regionMaterial, type Reward} from './rewards';
import {materials,materialIds} from './gear';
import {regionIndex} from './regions';
import {dayOf} from './quests';
import {boxOf, peekBox} from './save';

export const shopCategories = [
  ['daily', 'Ежедневные'],
  ['resources', 'Ресурсы'],
  ['materials', 'Материалы'],
  ['equipment', 'Экипировка'],
  ['growth', 'Развитие'],
  ['horn', 'Рог Трофеев'],
  ['elixirs', 'Зелья и эликсиры'],
  ['supplies', 'Наборы припасов'],
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
  equipment?: {slot:Slot;level:number};
  limit?: 'daily' | 'weekly' | 'once';
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

const packs: ShopOffer[] = balance.test_store.test_packs.map(pack => ({
  id:pack.id, category:'supplies', name:pack.display_name,
  icon:'chest',
  description:'Запас золота, самоцветов и зарядов для развития героя и новой добычи.',
  currency:'tokens', price:pack.test_token_price, limit:'once',
  reward:{gold:pack.grant.gold, gems:pack.grant.gems, horn:pack.grant.horn_charges},
}));

const stock = economy.shop;
type StockId = keyof typeof stock;

function dailyOffer(id: StockId, category: Category, name: string, icon: string, description: string,
  currency: ShopCurrency, reward: Reward): ShopOffer {
  return {id, category, name, icon, description, currency, reward, price:stock[id].price, limit:'daily'};
}

export const shopEquipmentSlots=slots.filter(slot=>slot!=='wings');

export function shopOffers(p: Player, now = Date.now(), equipmentSlot:Slot='weapon'): ShopOffer[] {
  const material = regionMaterial(p);
  const previousIndex = (materialIds.indexOf(material) + materialIds.length - 1) % materialIds.length;
  const previous = materialIds[previousIndex];
  const offers:ShopOffer[] = [
    {id:'arena-potion',category:'elixirs',name:consumables.potion.name,icon:consumables.potion.icon,currency:'gold',
      price:healingPotion.cost(p.stage),reward:{},description:consumables.potion.description},
    {id:'rune-scrolls',category:'daily',name:'Рунические свитки',icon:'scroll',description:'На призыв и развитие рун. Бесплатная смена вариантов по-прежнему доступна в Навыках.',currency:'gold',price:450,reward:{solo:{scroll:20}},limit:'daily'},
    {id:'weekly-growth',category:'supplies',name:'Недельное снаряжение дружины',icon:'chest',description:'Осколки для Камней пробуждения, свитки для рун и перья для роста крыльев.',currency:'tokens',price:45,reward:{solo:{scroll:45,awakeShard:10,wing:8}},limit:'weekly'},

    dailyOffer('travel-stipend','daily','Кошель разведчика','coins','Золото на первые усиления и обучение навыкам.','tokens',{gold:stock['travel-stipend'].amount}),
    dailyOffer('guard-stones','daily','Камни караула','rune','Хаосит для одного похода в Логово или Царство тьмы.','tokens',{chaosite:stock['guard-stones'].amount}),
    dailyOffer('blacksmith-coins','resources','Казна кузнеца','coins','Золото на экипировку, навыки и развитие спутников.','gems',{gold:stock['blacksmith-coins'].amount}),
    dailyOffer('mine-reserve','resources','Запас шахтёров','rune','Хаосит для входа в Логово или Царство тьмы.','gold',{chaosite:stock['mine-reserve'].amount}),
    dailyOffer('arena-pay','resources','Жалованье дружины','coins','Обменяйте жетоны Арены на золото для развития героя.','tokens',stock['arena-pay'].reward),
    dailyOffer('long-march','resources','Запас для дальнего похода','rune','Хаосит на три входа в Логово или Царство тьмы.','gold',stock['long-march'].reward),
    dailyOffer('region-supplies','materials',materials[material].name,`mat-${material}`,'Материал текущего региона для создания и перековки экипировки.','gems',{mats:{[material]:stock['region-supplies'].amount}}),
    dailyOffer('forge-parcel','materials','Посылка кузнеца','hammer','Золото и материал текущего региона для изготовления и улучшения вещей.','gems',
      {gold:stock['forge-parcel'].gold,mats:{[material]:stock['forge-parcel'].materials}}),
    dailyOffer('dark-essence','materials',resources.ess.name,resources.ess.icon,'Расходуется на усиление тёмной экипировки.','gems',{res:{ess:stock['dark-essence'].amount}}),
    dailyOffer('summon-seal','growth','Печать призыва',resources.seal.icon,'Обменивается в Призыве на 10 Звёздных душ.','gems',{res:{seal:stock['summon-seal'].amount}}),
    dailyOffer('squad-rations','growth','Жалованье призывателя','summon-seal','Печать для обмена на Звёздные души и золото на обучение спутников.','gems',stock['squad-rations'].reward),
    dailyOffer('relic-shards','growth',resources.shard.name,resources.shard.icon,'Для открытия и усиления реликвий. Условия открытия смотрите в каталоге.','gems',{res:{shard:stock['relic-shards'].amount}}),
    hornOffer(p, now),
    dailyOffer('horn-kit','horn','Припасы охотника','horn','Заряды для добычи и золото для её усиления.','tokens',stock['horn-kit'].reward),
    dailyOffer('quartermaster','supplies','Дорожный паёк','chest','Золото на подготовку героя и Хаосит на один поход.','tokens',stock.quartermaster.reward),
    dailyOffer('expedition-kit','supplies','Походный сундук','chest',
      'Хаосит для двух вылазок и заряды для новой экипировки.','tokens',stock['expedition-kit'].reward),
    dailyOffer('workshop-kit','materials','Набор подмастерья',`mat-${material}`,
      'Материалы текущего региона и золото для изготовления вещей в кузнице.','gems',
      {gold:stock['workshop-kit'].gold,mats:{[material]:stock['workshop-kit'].amount}}),
  ];
  if(regionIndex(p.stage)>0){
    offers.push(dailyOffer('previous-region','materials',materials[previous].name,`mat-${previous}`,
      'Материал из предыдущего региона для старых рецептов и реликвий.','gems',{mats:{[previous]:stock['previous-region'].amount}}));
  }
  if(p.darkFloor>=2){
    offers.push(dailyOffer('dark-stock','materials','Запас сумеречной кузни','essence',
      'Эссенция и золото на усиление тёмной экипировки после первого этажа.','gems',stock['dark-stock'].reward));
  }
  if(p.bosses>=3||p.darkFloor>=2){
    offers.push(dailyOffer('relic-workshop','growth','Запас хранителя реликвий','relic-shard',
      'Осколки и золото на реликвии, доступные герою.','gems',stock['relic-workshop'].reward));
    offers.push(dailyOffer('relic-expedition','growth','Припасы искателя','relic-shard',
      'Осколки для развития реликвий и Хаосит для похода за добычей.','gems',stock['relic-expedition'].reward));
  }
  if(shopEquipmentSlots.some(slot=>slot===equipmentSlot)){
    offers.push({
      id:'basic-equipment',category:'equipment',name:'Снаряжение дружины',icon:'armor',
      description:'Одна обычная вещь уровня героя. Выберите слот экипировки.',
      currency:'gold',price:Math.max(50,35*p.level),reward:{},limit:'daily',
      equipment:{slot:equipmentSlot,level:p.level},
    });
  }
  return [...offers, ...packs];
}

interface ShopDay {day?: string; bought?: string[]}
export function shopSold(p: Player, offer: ShopOffer, now: number) {
  if (offer.limit === 'once') return p.bought.includes(offer.id);
  if(offer.limit==='weekly'){const week=peekBox<{week:number;bought:string[]}>(p,'shopWeek');return !!week&&week.week>=utcWeek(now)&&week.bought?.includes(offer.id)}
  const today = peekBox<ShopDay>(p, 'shop');
  return offer.limit === 'daily' && today?.day === dayOf(now)
    && Array.isArray(today.bought) && today.bought.includes(offer.id);
}

export function shopStatus(p: Player, offer: ShopOffer, now: number): string | undefined {
  if (shopSold(p, offer, now)) return offer.limit === 'daily' ? 'Сегодня куплено' : 'Куплено';
  const space = hornConfig.maximum_charges - availableHorn(p, now);
  if (offer.id === 'horn' && space === 0) return 'Рог заполнен';
  if ((offer.reward.horn ?? 0) > space) return 'Освободите место в Роге';
  if (offer.equipment && p.inventory.length >= balance.loot_test_settings.starter_inventory_capacity) return 'Рюкзак полон';
  if (p[offer.currency] < offer.price) return 'Недостаточно средств';
}

/** Includes displayed contents so a stale confirmation cannot buy a different quantity or material. */
export const shopQuote = (offer: Pick<ShopOffer,'price'|'reward'|'equipment'>) => JSON.stringify([offer.price, offer.reward, ...(offer.equipment?[offer.equipment]:[])]);
export const expensiveOffer = (offer: ShopOffer) => offer.price >= economy.confirmFrom[offer.currency];

export function applyPurchase(p: Player, offer: ShopOffer, now: number) {
  p[offer.currency] -= offer.price;
  if(offer.id==='arena-potion')p.arenaPotions=potionStock(p)+1;
  else grant(p, offer.reward, now);
  if (offer.limit === 'once') p.bought.push(offer.id);
  if(offer.limit==='weekly'){
    const week=utcWeek(now),log=boxOf(p,'shopWeek',()=>({week,bought:[] as string[]}));
    if(log.week!==week||!Array.isArray(log.bought)){log.week=week;log.bought=[];}
    log.bought.push(offer.id);
  }
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
