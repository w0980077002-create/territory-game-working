/**
 * Saga gear: six region sets (2/4/6 bonuses), named trophies with perks, engravings and region materials.
 * Pure rules. Combat hooks live in game/Battle.ts and read only the helpers exported here.
 * All numbers TEST_ONLY.
 */
import type {Item,Player,Slot} from '../core/types';
export type SetId='frost'|'storm'|'rune'|'stone'|'legion'|'ember';
export const setIds:SetId[]=['frost','storm','rune','stone','legion','ember'];
export interface SetDef {name:string;tag:string;color:string;region:number;material:string;bonuses:[string,string,string]}
export const sets:Record<SetId,SetDef>={
 frost:{name:'Ледяной шёлк',tag:'Контроль',color:'#8ee6ff',region:0,material:'ice',bonuses:['Враги действуют на 8% медленнее','Срыв атаки замораживает цель на 1,5 сек','+30% урона по раскрытым и замороженным врагам']},
 storm:{name:'Штормовой прилив',tag:'Крит и скорость',color:'#9fd0ff',region:1,material:'harbor',bonuses:['+10% скорости атаки','+12% шанса крита','Каждый 5-й удар — молния 150% по всем врагам']},
 rune:{name:'Рунный круг',tag:'Навыки',color:'#c59bff',region:2,material:'forest',bonuses:['+15% урона навыков','Навыки перезаряжаются на 15% быстрее','Молот Тора бьёт четвёртый раз и даёт щит 10% HP']},
 stone:{name:'Каменная стража',tag:'Щит и контрприём',color:'#e3c59c',region:3,material:'peaks',bonuses:['+12% защиты и +8% HP','Срыв атаки даёт щит 12% HP','Пока активен щит: +25% урона героя']},
 legion:{name:'Орёл легиона',tag:'Спутники',color:'#ffd27a',region:4,material:'limes',bonuses:['Спутники действуют на 20% чаще','Гусь бьёт вдвое сильнее, пёс лечит на 30% больше','После пике гуся или заслона пса: +40% урона на 4 сек']},
 ember:{name:'Сердце Бездны',tag:'Вампиризм и ярость',color:'#ff9a5c',region:5,material:'ember',bonuses:['+6% вампиризма','Ниже 50% HP: +25% урона','Убийство врага лечит 15% HP и поджигает следующего']}
};
export const setOfRegion=(region:number)=>setIds[((region%6)+6)%6];
export type PerkId='cutlass'|'crown'|'echo'|'aquila'|'heart'|'belt'|'boots'|'moss'|'compass'|'void'|'duskwings';
export interface PerkDef {name:string;slot:Slot;rarity:number;tag:string;text:string;source:string;set?:SetId}
export const perks:Record<PerkId,PerkDef>={
 cutlass:{name:'Абордажная сабля Адмирала',slot:'weapon',rarity:5,tag:'Первый удар',text:'Первый удар героя в каждом бою наносит тройной урон и оглушает врагов на 1 сек.',source:'Адмирал Штормов · Северные гавани',set:'storm'},
 crown:{name:'Корона Морока',slot:'helmet',rarity:5,tag:'Навыки лечат',text:'Каждое применение навыка лечит героя на 4% HP.',source:'Грибной король Морок · Лес древних рун',set:'rune'},
 echo:{name:'Рог Эха',slot:'extra1',rarity:5,tag:'Долгий клич',text:'Клич Одина длится 8 сек вместо 5 и даёт щит на 8% HP.',source:'Минотавр Эха · Горные крепости',set:'stone'},
 aquila:{name:'Плащ легата с орлом',slot:'cloak',rarity:5,tag:'Удар по всем',text:'Каждый 4-й обычный удар героя задевает всех врагов.',source:'Легат Аквила · Римская граница',set:'legion'},
 heart:{name:'Амулет Сердца Бездны',slot:'amulet',rarity:6,tag:'Второе дыхание',text:'Раз за бой смертельный удар не убивает героя: он восстаёт с 35% HP.',source:'Владыка Огненной Бездны · финал саги',set:'ember'},
 belt:{name:'Пояс Громилы',slot:'belt',rarity:4,tag:'Против щитов',text:'+25% урона по врагам под щитом; блок врага гасит меньше урона.',source:'Логово · Капибара-Громила'},
 boots:{name:'Сапоги бурильщика',slot:'boots',rarity:4,tag:'Пробивание',text:'Удары и навыки героя игнорируют 40% защиты врага.',source:'Логово · Старший бурильщик'},
 moss:{name:'Кольцо мохоеда',slot:'ring2',rarity:4,tag:'Живучесть',text:'В бою герой восстанавливает 1% HP в секунду.',source:'Логово · Пожиратель мха'},
 compass:{name:'Компас морехода',slot:'extra2',rarity:5,tag:'Добытчик',text:'+20% золота за любые победы и +1 бросок добычи в морских экспедициях.',source:'Морские экспедиции · длинный поход'},
 void:{name:'Клинок Сумрака',slot:'weapon',rarity:6,tag:'Сумрак',text:'Каждый удар вешает метку Сумрака: +2% урона по цели за метку, до 10 меток.',source:'Царство Тьмы · этаж 10+'},
 duskwings:{name:'Крылья Сумрака',slot:'wings',rarity:6,tag:'Тёмный полёт',text:'Особые крылья Тьмы: высокие проценты и +5% уклонения.',source:'Царство Тьмы · этаж 20+'}
};
export const perkIds=Object.keys(perks) as PerkId[];
export const perkOf=(item?:Item)=>item?.perk&&Object.hasOwn(perks,item.perk)?perks[item.perk as PerkId]:undefined;
export const hasPerk=(p:Player,id:PerkId)=>Object.values(p.equipment).some(i=>i?.perk===id);
export const setOf=(item?:Item)=>item?.set&&Object.hasOwn(sets,item.set)?item.set as SetId:undefined;
export function setCounts(p:Player){const n:Record<SetId,number>={frost:0,storm:0,rune:0,stone:0,legion:0,ember:0};for(const i of Object.values(p.equipment)){const s=setOf(i);if(s)n[s]++}return n}
/** 0, 1, 2 or 3 active bonuses of a set (2/4/6 pieces). */
export const setTier=(p:Player,id:SetId)=>{const n=setCounts(p)[id];return n>=6?3:n>=4?2:n>=2?1:0};
export type EngraveId='might'|'ward'|'vigor'|'edge';
export const engravings:Record<EngraveId,{name:string;sign:string;text:string}>={
 might:{name:'Руна Мощи',sign:'ᚢ',text:'+2% атаки героя'},ward:{name:'Руна Оберега',sign:'ᛉ',text:'+3% защиты героя'},vigor:{name:'Руна Жизни',sign:'ᛒ',text:'+2,5% HP героя'},edge:{name:'Руна Остроты',sign:'ᛏ',text:'+1% шанса крита'}
};
export const engraveOf=(item?:Item)=>item?.engrave&&Object.hasOwn(engravings,item.engrave)?item.engrave as EngraveId:undefined;
export function engraveTotals(p:Player){const t={might:0,ward:0,vigor:0,edge:0};for(const i of Object.values(p.equipment)){const e=engraveOf(i);if(e)t[e]++}return t}
/** Region materials are plain counters in saga.n under `mat:<id>`. */
export const materials:Record<string,{name:string;color:string}>={ice:{name:'Ледяной шёлк',color:'#8ee6ff'},harbor:{name:'Смола и парусина',color:'#9fd0ff'},forest:{name:'Рунная пыль',color:'#c59bff'},peaks:{name:'Горная руда',color:'#e3c59c'},limes:{name:'Имперская бронза',color:'#ffd27a'},ember:{name:'Угли Бездны',color:'#ff9a5c'},dusk:{name:'Камень Сумрака',color:'#a15dff'},pearl:{name:'Морской жемчуг',color:'#9ff3e0'}};
export const materialIds=['ice','harbor','forest','peaks','limes','ember'];
export const matKey=(id:string)=>'mat:'+id;
export const matCount=(p:Player,id:string)=>p.saga?.n[matKey(id)]??0;
/** Chances are shown to the player as-is (see GearGuide in the UI). */
export const dropRules={setChanceRegular:.12,setChanceBoss:.4,setChanceHorn:.08,blessingPerLevel:.004,setChanceCap:.6,lairPerkChance:.15,lairPity:8,legendFinalePerk:.25,materialWave:.5,materialBoss:3,materialFinale:8} as const;
export const setChance=(base:number,blessing:number)=>Math.min(dropRules.setChanceCap,base+blessing*dropRules.blessingPerLevel);
