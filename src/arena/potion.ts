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
 * Arena consumables V1.0, approved by the owner 26.11 (Issue #81, comment 7186062726). One row per item, in the owner's
 * order: effect value, duration (s), individual cooldown (s) and price multiplier of the Heart of Valhalla price.
 * `potion` keeps its existing id and its numbers come from config (45% / 4 s). Do not change values without approval.
 */
export const consumableRules={
 potion:{art:'valhalla-heart',name:'Сердце Вальгаллы',value:rules.potion_heal_fraction,duration:0,cooldown:rules.potion_cooldown_seconds,price:1,
  description:`Мгновенно восстанавливает ${Math.round(rules.potion_heal_fraction*100)}% максимального здоровья.`},
 tear:{art:'yggdrasil-tear',name:'Слеза Иггдрасиля',value:.6,duration:12,cooldown:25,price:1.2,description:'Постепенно восстанавливает 60% максимального здоровья.'},
 berserk:{art:'berserker-blood',name:'Кровь Берсерка',value:.35,duration:10,cooldown:25,price:1.3,description:'+35% атаки, −20% физической защиты.'},
 thor:{art:'thor-thunder',name:'Гром Тора',value:.6,duration:10,cooldown:25,price:1.5,description:'+60% урона следующего успешного прямого удара.'},
 odin:{art:'odin-eye',name:'Око Одина',value:.25,duration:12,cooldown:25,price:1,description:'+25 п.п. точности против уклонения.'},
 niflheim:{art:'niflheim-breath',name:'Дыхание Нифльхейма',value:.25,duration:10,cooldown:25,price:1.2,description:'−25% исходящего прямого урона противника.'},
 muspel:{art:'muspelheim-flame',name:'Пламя Муспельхейма',value:.08,duration:8,cooldown:30,price:1.3,description:'Горение противника: суммарно 8% его максимального здоровья.'},
 aegis:{art:'jupiter-aegis',name:'Эгида Юпитера',value:.25,duration:12,cooldown:30,price:1.4,description:'Щит на 25% максимального здоровья до разрушения.'},
 mars:{art:'mars-fury',name:'Ярость Марса',value:.2,duration:10,cooldown:25,price:1.2,description:'+20 п.п. шанса критического удара.'},
 mercury:{art:'mercury-wings',name:'Крылья Меркурия',value:.2,duration:10,cooldown:25,price:1.2,description:'+20 п.п. уклонения.'},
 minerva:{art:'minerva-wisdom',name:'Мудрость Минервы',value:1,duration:0,cooldown:20,price:1,description:'Снимает один действующий отрицательный эффект.'},
 venom:{art:'jormungandr-venom',name:'Яд Ёрмунганда',value:.5,duration:12,cooldown:30,price:1.3,description:'−50% эффективности лечения, которое получает противник.'},
 fenrir:{art:'fenrir-fang',name:'Клык Фенрира',value:.3,duration:10,cooldown:25,price:1.3,description:'Удары игнорируют 30% эффективной брони противника.'},
 hel:{art:'hel-kiss',name:'Поцелуй Хель',value:.25,duration:12,cooldown:30,price:1.4,description:'Лечение на 25% нанесённого прямого урона.'},
 loki:{art:'loki-cunning',name:'Хитрость Локи',value:.5,duration:10,cooldown:25,price:1.2,description:'Следующий успешный удар по блоку игнорирует 50% его эффективности.'},
 steel:{art:'svartalfheim-steel',name:'Сталь Свартальвхейма',value:.4,duration:12,cooldown:25,price:1.2,description:'+40% физической защиты.'},
 neptune:{art:'neptune-tide',name:'Прилив Нептуна',value:.2,duration:0,cooldown:40,price:1.6,description:'Себе 20% здоровья, каждому живому союзнику 10% его максимального здоровья.'},
 apollo:{art:'apollo-light',name:'Свет Аполлона',value:.3,duration:12,cooldown:30,price:1.3,description:'+30% прямого урона активных навыков.'},
 valkyrie:{art:'valkyrie-oath',name:'Обет Валькирии',value:.1,duration:15,cooldown:0,price:2.5,description:'Пережить один смертельный удар, оставшись с 10% здоровья. Один раз за бой.'},
 bifrost:{art:'bifrost-rainbow',name:'Радуга Биврёста',value:1,duration:8,cooldown:40,price:1.5,description:'Иммунитет к новым отрицательным эффектам расходников.'},
} as const;
export type ConsumableId=keyof typeof consumableRules;
export type ConsumableStock=Partial<Record<ConsumableId,number>>;
export type ConsumablesQuote={stage:number;gold:number;prices:Record<ConsumableId,number>;stock:ConsumableStock;reserved:ConsumableStock};
export const consumableIds=Object.keys(consumableRules) as ConsumableId[];
/** Battle rules V1.0: up to 5 of each chosen kind per fight, a shared 2 s cooldown; the Oath works once per fight. */
export const consumableBattle={perBattle:5,globalCooldown:2,oncePerBattle:['valkyrie'] as readonly ConsumableId[],neptuneLock:10} as const;
export const battleLimit=(id:ConsumableId)=>consumableBattle.oncePerBattle.includes(id)?1:consumableBattle.perBattle;

/** Approved artwork for the 20 Arena potions and elixirs (owner concept 26.11), each linked to its consumable. */
export const elixirArt=consumableIds.map(id=>({art:consumableRules[id].art,name:consumableRules[id].name,consumable:id}));
export const elixirIcon=(art:string)=>'elixir-'+art;

const timing=(id:ConsumableId)=>{
 const {duration,cooldown}=consumableRules[id];
 return (duration?(id==='thor'||id==='loki'?' До срабатывания, максимум '+duration+' с.':id==='aegis'?' Максимум '+duration+' с.':' Длительность '+duration+' с.'):'')+
  (cooldown?' Перезарядка '+cooldown+' с.':'');
};
export const consumables=Object.fromEntries(consumableIds.map(id=>[id,{name:consumableRules[id].name,icon:elixirIcon(consumableRules[id].art),
 description:consumableRules[id].description+timing(id)}])) as Record<ConsumableId,{name:string;icon:string;description:string}>;
/** Shop price in gold: the current Heart of Valhalla formula times the approved multiplier. */
export const consumablePrice=(id:ConsumableId,stage:number)=>Math.round(healingPotion.cost(stage)*consumableRules[id].price);

type Stocked={arenaPotions?:number;arenaConsumables?:Partial<Record<string,number>>};
const count=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:0;
/** Owned stock of a kind: the potion keeps its old save field, the other 19 kinds live in `arenaConsumables`. */
export const consumableStock=(p:Stocked,id:ConsumableId)=>id==='potion'?potionStock(p):count(p.arenaConsumables?.[id]);
export function addConsumable(p:Stocked,id:ConsumableId,delta:number){
 if(id==='potion'){p.arenaPotions=Math.max(0,potionStock(p)+delta);return}
 p.arenaConsumables={...p.arenaConsumables,[id]:Math.max(0,consumableStock(p,id)+delta)};
}

export function consumableStacks(player:Stocked,confirmed:ConsumableStock|number={}){
 return consumableIds.map(id=>({id,count:consumableStock(player,id)+(typeof confirmed==='number'?(id==='potion'?confirmed:0):confirmed[id]??0),...consumables[id]})).filter(item=>item.count>0);
}
