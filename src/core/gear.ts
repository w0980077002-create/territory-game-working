import type {Item,UniqueId,Slot,Player,GearEffectId} from './types';
import balance from '../../config/test-balance.v1.json';
export const gearRules=balance.gear_rpg_test;
export const uniques:Record<UniqueId,{name:string;slot:Slot;effect:GearEffectId;rarity:number;tag:string}>= {
 ice_silk:{name:'Клинок ледяного шёлка',slot:'weapon',effect:'frost',rarity:4,tag:'Контроль'},
 oath_shield:{name:'Щит нерушимой клятвы',slot:'shield',effect:'bulwark',rarity:4,tag:'Контрприём'},
 pack_sigil:{name:'Сигил верной стаи',slot:'amulet',effect:'pack',rarity:4,tag:'Спутники'},
 storm_ring:{name:'Кольцо грозового ритма',slot:'ring1',effect:'tempo',rarity:4,tag:'Крит / скорость'}
};
export function uniqueOf(item?:Item){if(!item)return undefined;if(item.uniqueId)return Object.hasOwn(uniques,item.uniqueId)?uniques[item.uniqueId]:undefined;
 // The already awarded story sword gains its property without rewriting its ID, stats or upgrades.
 if(item.slot==='weapon'&&item.name===uniques.ice_silk.name&&item.origin==='Трофей Матриарха')return uniques.ice_silk;
 return undefined;
}
export function effectText(effect:GearEffectId){const e=gearRules.effects;switch(effect){
 case 'frost':return `Попадание героя замедляет действия живой цели на ${Math.round((1-e.frost.rate)*100)}% на ${e.frost.duration} сек. Без дополнительного урона. Откат ${e.frost.cooldown} сек.`;
 case 'bulwark':return `Успешный срыв атаки Сокрушительным ударом даёт щит на ${Math.round(e.bulwark.hp_fraction*100)}% HP на ${e.bulwark.duration} сек. Откат ${e.bulwark.cooldown} сек.`;
 case 'pack':return `Попадание Гуся лечит героя на ${Math.round(e.pack.heal_fraction*100)}% HP и приближает лечение Пса на ${e.pack.dog_seconds} сек. Откат ${e.pack.cooldown} сек.`;
 case 'tempo':return `Крит героя ускоряет базовые атаки на ${Math.round((e.tempo.rate-1)*100)}% на ${e.tempo.duration} сек. Откат ${e.tempo.cooldown} сек.`;
}}
export function equippedUniques(p:Player){return Object.values(p.equipment).flatMap(item=>{const def=uniqueOf(item);return item&&def?[{item,def}]:[]})}
export type HuntMode='campaign'|'dungeon'|'darkness';
export const huntModes:Record<HuntMode,string>={campaign:'Босс основной главы',dungeon:'Логово мини-босса',darkness:'Босс Царства тьмы'};
export function namedDrop(mode:string,random=Math.random()):UniqueId|undefined {if(!Object.hasOwn(gearRules.drops,mode))return;let sum=0;for(const row of gearRules.drops[mode as HuntMode]){sum+=row.chance;if(random<sum)return row.id as UniqueId}return undefined}
export const buildGuides={berserker:{title:'Кровь и клятва',detail:'Вампиризм поддерживает натиск. Щит клятвы награждает своевременный срыв атаки; Сигил помогает пережить длинный бой.',items:['oath_shield','pack_sigil']},ranger:{title:'Грозовой ритм',detail:'Высокий шанс крита чаще открывает окно ускоренных атак. Клинок замедляет врага даже при стрельбе из лука.',items:['storm_ring','ice_silk']},runologist:{title:'Ледяные руны',detail:'Замедление даёт больше времени на срыв атаки. Щит клятвы позволяет безопаснее дожидаться окна контрприёма.',items:['ice_silk','oath_shield']}} as const;
