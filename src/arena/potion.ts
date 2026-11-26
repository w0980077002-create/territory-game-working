import balance from '../../config/test-balance.v1.json';
import {stageGold} from '../saga/regions';

const rules=balance.combat_test_settings;
export const healingPotion={
 fraction:rules.potion_heal_fraction,
 cooldown:rules.potion_cooldown_seconds*1000,
 cost:(stage:number)=>Math.max(rules.potion_gold_cost,Math.round(stageGold(stage,false)*rules.potion_stage_gold_share)),
};

export type PotionQuote={stage:number;price:number;gold:number;stock:number;reserved:number};
export function potionStock(p:{arenaPotions?:number}){
 const value=p.arenaPotions;
 return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:0;
}

/**
 * Approved artwork for the 20 Arena potions and elixirs (owner concept 26.11). One entry per concept, in the owner's
 * order; `consumable` links a picture to a real, implemented item below. Entries without it are artwork only: their
 * effects, prices, durations and limits are not specified yet, so they are never offered, stored or usable in play.
 */
export const elixirArt=[
 {art:'valhalla-heart',name:'Сердце Вальгаллы',concept:'Мгновенное лечение',consumable:'potion'},
 {art:'yggdrasil-tear',name:'Слеза Иггдрасиля',concept:'Постепенное лечение'},
 {art:'berserker-blood',name:'Кровь Берсерка',concept:'Атака ценой защиты'},
 {art:'thor-thunder',name:'Гром Тора',concept:'Усиление следующего успешного удара'},
 {art:'odin-eye',name:'Око Одина',concept:'Точность, противодействие уклонению'},
 {art:'niflheim-breath',name:'Дыхание Нифльхейма',concept:'Ослабление исходящего урона противника'},
 {art:'muspelheim-flame',name:'Пламя Муспельхейма',concept:'Горение'},
 {art:'jupiter-aegis',name:'Эгида Юпитера',concept:'Поглощение урона'},
 {art:'mars-fury',name:'Ярость Марса',concept:'Шанс крита'},
 {art:'mercury-wings',name:'Крылья Меркурия',concept:'Уклонение'},
 {art:'minerva-wisdom',name:'Мудрость Минервы',concept:'Снятие одного отрицательного эффекта'},
 {art:'jormungandr-venom',name:'Яд Ёрмунганда',concept:'Снижение лечения противника'},
 {art:'fenrir-fang',name:'Клык Фенрира',concept:'Частичное игнорирование брони'},
 {art:'hel-kiss',name:'Поцелуй Хель',concept:'Вампиризм'},
 {art:'loki-cunning',name:'Хитрость Локи',concept:'Частичное пробитие блока следующим успешным ударом'},
 {art:'svartalfheim-steel',name:'Сталь Свартальвхейма',concept:'Физическая защита'},
 {art:'neptune-tide',name:'Прилив Нептуна',concept:'Лечение себя и живых союзников'},
 {art:'apollo-light',name:'Свет Аполлона',concept:'Усиление навыков'},
 {art:'valkyrie-oath',name:'Обет Валькирии',concept:'Пережить один смертельный удар'},
 {art:'bifrost-rainbow',name:'Радуга Биврёста',concept:'Временная защита от новых отрицательных эффектов'},
] as const satisfies readonly {art:string;name:string;concept:string;consumable?:string}[];
export const elixirIcon=(art:(typeof elixirArt)[number]['art'])=>'elixir-'+art;

export const consumables={
 potion:{name:'Сердце Вальгаллы',icon:elixirIcon('valhalla-heart'),
  description:`Восстанавливает ${Math.round(healingPotion.fraction*100)}% максимального здоровья. Перезарядка ${healingPotion.cooldown/1000} с.`},
} as const;
export type ConsumableId=keyof typeof consumables;

export function consumableStacks(player:{arenaPotions?:number},confirmed=0){
 const counts:Record<ConsumableId,number>={potion:potionStock(player)+confirmed};
 return (Object.keys(consumables) as ConsumableId[]).filter(id=>counts[id]>0)
  .map(id=>({id,count:counts[id],...consumables[id]}));
}
