/**
 * Five linked growth systems of the saga: Dark Energy gear, gems, relics, companions and the Dark Realm.
 * Pure rules only: catalogs, defensive readers of the save and ONE aggregator (`powerBonus`) that the hero
 * stats and the battle engine read. Nothing here writes to the store; see ./actions.ts for transactions.
 * Everything lives in `player.saga.box` / `player.saga.n`, so every older save stays valid.
 */
import type {Player,Slot} from '../core/types';
import {peekBox,boxOf,sagaOf} from '../saga/save';
import {runeBonuses} from '../saga/runes';
import {followerEconomy} from '../saga/soloEconomy';
import {evoPower} from '../saga/companions';

// ───────────────────────── shared resources ─────────────────────────
export type ResId='ess'|'shard'|'seal';
export const resources:Record<ResId,{name:string;short:string;color:string;icon:string;source:string}>={
 ess:{name:'Тёмная эссенция',short:'Эссенция',color:'#b98cff',icon:'essence',source:'Царство тьмы и разбор тёмных предметов'},
 shard:{name:'Осколки реликвий',short:'Осколки',color:'#ffd27a',icon:'relic-shard',source:'Владыки Царства тьмы и Логово мини-босса'},
 seal:{name:'Печати призыва',short:'Печати',color:'#9ff3e0',icon:'summon-seal',source:'Первое прохождение этажей Тьмы, Логово, Арена и обмен красных алмазов на верфи'}
};
export const resKey=(id:ResId)=>'res:'+id;
export const resCount=(p:Player,id:ResId)=>p.saga?.n[resKey(id)]??0;
/** Call inside a store mutation. */
export function addRes(p:Player,id:ResId,amount:number){const s=sagaOf(p);s.n[resKey(id)]=Math.max(0,(s.n[resKey(id)]??0)+Math.round(amount))}
const DUSK='mat:dusk';
export const duskCount=(p:Player)=>p.saga?.n[DUSK]??0;
export function addDusk(p:Player,amount:number){const s=sagaOf(p);s.n[DUSK]=Math.max(0,(s.n[DUSK]??0)+amount)}

// ───────────────────────── one bonus shape for every system ─────────────────────────
export interface Bonus {hp:number;attack:number;defense:number;hpPct:number;atkPct:number;defPct:number;crit:number;critDamage:number;lifesteal:number;dodge:number;skill:number;reduction:number}
export type StatKey=keyof Bonus;
export const zeroBonus=():Bonus=>({hp:0,attack:0,defense:0,hpPct:0,atkPct:0,defPct:0,crit:0,critDamage:0,lifesteal:0,dodge:0,skill:0,reduction:0});
export const statNames:Record<StatKey,string>={hp:'Здоровье',attack:'Атака',defense:'Защита',hpPct:'Здоровье',atkPct:'Атака',defPct:'Защита',crit:'Шанс крита',critDamage:'Крит. урон',lifesteal:'Вампиризм',dodge:'Уклонение',skill:'Урон навыков',reduction:'Снижение урона'};
const flat=(k:StatKey)=>k==='hp'||k==='attack'||k==='defense';
export const statText=(k:StatKey,v:number)=>flat(k)?`+${Math.round(v)}`:`+${(v*100).toFixed(v<.1?1:0).replace('.',',')}%`;
export const bonusLines=(b:Bonus)=>(Object.keys(b) as StatKey[]).filter(k=>b[k]>0).map(k=>`${statNames[k]} ${statText(k,b[k])}`);
function plus(to:Bonus,k:StatKey,v:number){if(Number.isFinite(v)&&v>0)to[k]+=v}

// ───────────────────────── Dark Energy: 12 own slots ─────────────────────────
export interface DarkItem {id:string;s:number;r:number;l:number;u:number;e?:string;k?:boolean}
export const darkSlots:{name:string;stat:StatKey;base:number;icon:string}[]=[
 {name:'Жало Тьмы',stat:'attack',base:1,icon:'axes'},{name:'Панцирь Ночи',stat:'hp',base:1,icon:'armor'},{name:'Маска Затмения',stat:'defense',base:1,icon:'helmet'},
 {name:'Око Бездны',stat:'crit',base:.006,icon:'ring'},{name:'Клык Мрака',stat:'critDamage',base:.02,icon:'axe'},{name:'Сердце Тени',stat:'hpPct',base:.012,icon:'heart'},
 {name:'Печать Гнева',stat:'atkPct',base:.01,icon:'rune'},{name:'Оковы Стужи',stat:'defPct',base:.012,icon:'belt'},{name:'Чаша Крови',stat:'lifesteal',base:.004,icon:'amulet'},
 {name:'Гримуар Теней',stat:'skill',base:.012,icon:'book'},{name:'Плащ Полуночи',stat:'dodge',base:.004,icon:'cloak'},{name:'Знак Пустоты',stat:'reduction',base:.005,icon:'shield'}
];
export const darkRarity=['Тусклый','Сумеречный','Полночный','Затменный','Бездонный','Первородный'];
export const darkColors=['#8f8aa6','#6fb6d9','#7d7bff','#b56bff','#ff5fa8','#ffcf5a'];
export type DarkEffectId='reaper'|'bossbane'|'eclipse'|'thorns'|'veil'|'hunger';
export const darkEffects:Record<DarkEffectId,{name:string;values:[number,number,number];text:(v:number)=>string}>={
 reaper:{name:'Жнец',values:[.15,.22,.3],text:v=>`+${Math.round(v*100)}% урона героя по врагам ниже 30% здоровья`},
 bossbane:{name:'Гроза владык',values:[.1,.15,.2],text:v=>`+${Math.round(v*100)}% урона героя по боссам и мини-боссам`},
 eclipse:{name:'Затмение',values:[.2,.28,.36],text:v=>`Первые 6 секунд боя: +${Math.round(v*100)}% урона героя`},
 thorns:{name:'Шипы мрака',values:[.15,.22,.3],text:v=>`Возвращает врагу ${Math.round(v*100)}% полученного героем урона`},
 veil:{name:'Пелена',values:[.08,.12,.16],text:v=>`В начале каждого боя — щит на ${Math.round(v*100)}% здоровья`},
 hunger:{name:'Голод тени',values:[.05,.08,.11],text:v=>`Убийство врага лечит героя на ${Math.round(v*100)}% здоровья`}
};
export const darkEffectIds=Object.keys(darkEffects) as DarkEffectId[];
export const DARK_STORAGE=60;
export const darkMaxUpgrade=(r:number)=>5+r*2;
export const darkName=(i:DarkItem)=>`${darkRarity[i.r]} · ${darkSlots[i.s].name}`;
export function darkValue(i:DarkItem){
 const def=darkSlots[i.s],q=1+i.r*.35;
 if(flat(def.stat)){const base=def.stat==='attack'?4+i.l*3:def.stat==='hp'?30+i.l*22:3+i.l*2;return Math.round(base*q*(1+i.u*.08))}
 return def.base*(1+Math.min(i.l,40)*.02)*q*(1+i.u*.06);
}
export const darkEffectOf=(i?:DarkItem|null)=>i&&i.r>=3&&i.e&&Object.hasOwn(darkEffects,i.e)?{id:i.e as DarkEffectId,def:darkEffects[i.e as DarkEffectId],value:darkEffects[i.e as DarkEffectId].values[i.r-3]}:undefined;
/** A single number to sort and compare dark items; never used for combat. */
export const darkScore=(i:DarkItem)=>Math.round((1+i.r*.35)*(10+i.l)*(1+i.u*.07)*(darkEffectOf(i)?1.25:1));
export function darkUpgradeCost(i:DarkItem){return {ess:Math.round(6*(i.u+1)*(1+i.r*.5)),gold:150*(i.u+1)*(1+i.r),dusk:i.u>=8?1:0}}
export function darkSalvageValue(i:DarkItem){let spent=0;for(let u=0;u<i.u;u++)spent+=Math.round(6*(u+1)*(1+i.r*.5));return Math.round((4+i.l)*(1+i.r*.8)+spent*.6)}
const validDark=(v:unknown):v is DarkItem=>{if(!v||typeof v!=='object')return false;const i=v as DarkItem;return typeof i.id==='string'&&i.id.length>0&&i.id.length<=40&&Number.isInteger(i.s)&&i.s>=0&&i.s<12&&Number.isInteger(i.r)&&i.r>=0&&i.r<=5&&Number.isInteger(i.l)&&i.l>=1&&i.l<=9999&&Number.isInteger(i.u)&&i.u>=0&&i.u<=darkMaxUpgrade(i.r)&&(i.e===undefined||typeof i.e==='string'&&i.e.length<=16)&&(i.k===undefined||typeof i.k==='boolean')};
interface DarkBox {inv?:unknown;eq?:unknown}
export interface DarkState {inv:DarkItem[];eq:(DarkItem|null)[]}
/** Defensive read: a damaged field can never crash the game or duplicate an item. */
export function darkState(p:Player):DarkState{
 const box=peekBox<DarkBox>(p,'dgear'),seen=new Set<string>(),eq:(DarkItem|null)[]=Array(12).fill(null);
 if(Array.isArray(box?.eq))box.eq.forEach((v,s)=>{if(s<12&&validDark(v)&&v.s===s&&!seen.has(v.id)){seen.add(v.id);eq[s]=v}});
 const inv=Array.isArray(box?.inv)?box.inv.filter((v):v is DarkItem=>validDark(v)&&!seen.has(v.id)&&!!seen.add(v.id)).slice(0,DARK_STORAGE):[];
 return {inv,eq};
}
/** Mutable, normalised dark box. Call only inside a store mutation. */
export function darkBox(p:Player):DarkState{const clean=darkState(p),box=boxOf<DarkState>(p,'dgear',()=>({inv:[],eq:[]}));box.inv=clean.inv;box.eq=clean.eq;return box}
export const darkResonance=(equipped:number)=>equipped>=12?.1:equipped>=8?.06:equipped>=4?.03:0;
export function darkBonus(p:Player){
 const b=zeroBonus(),eq=darkState(p).eq.filter((i):i is DarkItem=>!!i);
 for(const i of eq)plus(b,darkSlots[i.s].stat,darkValue(i));
 const r=darkResonance(eq.length);b.hpPct+=r;b.atkPct+=r;b.defPct+=r;return b;
}
/** Sum of equipped special effects, each capped so two pieces help but never break a fight. */
export function darkEffectTotals(p:Player){const t:Record<DarkEffectId,number>={reaper:0,bossbane:0,eclipse:0,thorns:0,veil:0,hunger:0};for(const i of darkState(p).eq){const e=darkEffectOf(i);if(e)t[e.id]=Math.min(.6,t[e.id]+e.value)}return t}
let serial=0;
export const newDarkId=()=>`d${Date.now().toString(36)}${(++serial).toString(36)}${Math.random().toString(36).slice(2,6)}`;
/** Rarity grows with the floor; «Первородный» appears from floor 15. */
export function rollDark(floor:number,random:()=>number=Math.random,minRarity=0):DarkItem{
 const f=Math.max(1,floor),w=[50,30*(1+f*.02),14*(1+f*.06),5*(1+f*.12),1*(1+f*.2),f>=15?.2*(f-14):0],total=w.reduce((a,b)=>a+b,0);
 let roll=random()*total,r=0;for(let i=0;i<w.length;i++){roll-=w[i];if(roll<0){r=i;break}}
 r=Math.max(r,Math.min(5,minRarity));
 return {id:newDarkId(),s:Math.min(11,Math.floor(random()*12)),r,l:f,u:0,...(r>=3?{e:darkEffectIds[Math.min(darkEffectIds.length-1,Math.floor(random()*darkEffectIds.length))]}:{})};
}

// ───────────────────────── Gems: three sockets per equipment slot ─────────────────────────
export type GemType='ruby'|'sapphire'|'emerald'|'topaz'|'amethyst'|'onyx';
export const gemTypes:Record<GemType,{name:string;color:string;stat:StatKey;base:number}>={
 ruby:{name:'Рубин',color:'#ff5a5a',stat:'atkPct',base:.01},sapphire:{name:'Сапфир',color:'#4aa8ff',stat:'hpPct',base:.012},emerald:{name:'Изумруд',color:'#46d17a',stat:'defPct',base:.012},
 topaz:{name:'Топаз',color:'#ffc23d',stat:'crit',base:.003},amethyst:{name:'Аметист',color:'#b46bff',stat:'skill',base:.012},onyx:{name:'Оникс',color:'#8d93a8',stat:'lifesteal',base:.002}
};
export const gemIds=Object.keys(gemTypes) as GemType[];
export const GEM_MAX=10;
export const gemSlots:Slot[]=['weapon','armor','helmet','shield','boots','belt','ring1','ring2','amulet','cloak','extra1','extra2'];
export const gemCode=(type:GemType,level:number)=>`${type}:${level}`;
export function parseGem(code:unknown){if(typeof code!=='string')return undefined;const [type,raw]=code.split(':'),level=Number(raw);return Object.hasOwn(gemTypes,type)&&Number.isInteger(level)&&level>=1&&level<=GEM_MAX?{type:type as GemType,level,code}:undefined}
export const gemValue=(type:GemType,level:number)=>gemTypes[type].base*level*(1+.12*(level-1));
export const gemLabel=(code:string)=>{const g=parseGem(code);return g?`${gemTypes[g.type].name} ${g.level} ур.`:''};
export const gemText=(code:string)=>{const g=parseGem(code);return g?`${statNames[gemTypes[g.type].stat]} ${statText(gemTypes[g.type].stat,gemValue(g.type,g.level))}`:''};
/** Socket 1 is always open, socket 2 opens at hero level 8, socket 3 after clearing floor 3 of the Dark Realm. */
export const socketRules=[{text:'Открыто'},{text:'Откроется на 8 уровне героя'},{text:'Откроется после 3 этажа Царства тьмы'}];
export const socketOpen=(p:Player,index:number)=>index===0||index===1&&p.level>=8||index===2&&p.darkFloor>=4;
interface GemBox {bag?:unknown;sock?:unknown}
export interface GemState {bag:Record<string,number>;sock:Record<string,(string|null)[]>}
export function gemState(p:Player):GemState{
 const box=peekBox<GemBox>(p,'gems'),bag:Record<string,number>={},sock:Record<string,(string|null)[]>={};
 if(box?.bag&&typeof box.bag==='object'&&!Array.isArray(box.bag))for(const [code,n] of Object.entries(box.bag as Record<string,unknown>))if(parseGem(code)&&typeof n==='number'&&Number.isInteger(n)&&n>0)bag[code]=Math.min(n,99999);
 const raw=box?.sock&&typeof box.sock==='object'&&!Array.isArray(box.sock)?box.sock as Record<string,unknown>:{};
 for(const slot of gemSlots){const row=Array.isArray(raw[slot])?raw[slot] as unknown[]:[],types=new Set<string>();sock[slot]=[0,1,2].map(i=>{const g=parseGem(row[i]);if(!g||types.has(g.type))return null;types.add(g.type);return g.code})}
 return {bag,sock};
}
export function gemBox(p:Player):GemState{const clean=gemState(p),box=boxOf<GemState>(p,'gems',()=>({bag:{},sock:{}}));box.bag=clean.bag;box.sock=clean.sock;return box}
/** Gems work only while the slot really holds an item and the socket is open. */
export function gemBonus(p:Player){const b=zeroBonus(),state=gemState(p);for(const slot of gemSlots){if(!p.equipment[slot])continue;state.sock[slot].forEach((code,i)=>{const g=parseGem(code);if(g&&socketOpen(p,i))plus(b,gemTypes[g.type].stat,gemValue(g.type,g.level))})}return b}
export const gemSynthGold=(level:number)=>50*level;
export function rollGem(random:()=>number=Math.random,level=1){return gemCode(gemIds[Math.min(gemIds.length-1,Math.floor(random()*gemIds.length))],Math.max(1,Math.min(GEM_MAX,level)))}
export const GEM_SHOP_PRICE=30;

// ───────────────────────── Relics ─────────────────────────
export type RelicId='heart'|'horn'|'mjolnir'|'leaf'|'fang'|'aegis'|'ravens'|'draupnir'|'gjallar'|'gap';
export interface RelicDef {name:string;rarity:number;icon:string;material:string;lore:string;ability:(lv:number)=>string;passive?:[StatKey,number];need:(p:Player)=>{ok:boolean;text:string}}
export const relicRarity=['Редкая','Эпическая','Легендарная','Мифическая'];
export const relicColors=['#48bafa','#c97aff','#ffb343','#ff6262'];
export const RELIC_MAX=10;
const lairWins=(p:Player)=>p.saga?.n['win:dungeon']??0;
const goal=(have:number,need:number,text:string)=>({ok:have>=need,text:`${text} · ${Math.min(have,need)}/${need}`});
export const relics:Record<RelicId,RelicDef>={
 heart:{name:'Сердце ледника',rarity:0,icon:'gem',material:'ice',lore:'Первая реликвия Севера. Растёт без предела.',ability:lv=>`+${lv*3}% атаки героя`,need:()=>({ok:true,text:'Получена в начале пути'})},
 horn:{name:'Рог Вальхаллы',rarity:0,icon:'horn',material:'harbor',lore:'Его зов поднимает дружину в первый натиск.',ability:lv=>`Первые 8 секунд боя: +${10+2*lv}% урона героя`,passive:['atkPct',.005],need:p=>goal(p.bosses,3,'Победить боссов главы')},
 mjolnir:{name:'Осколок Мьёльнира',rarity:1,icon:'lightning',material:'forest',lore:'Искра молота, что помнит гром.',ability:lv=>`Каждый 6-й удар героя бьёт цель молнией на ${60+12*lv}% атаки`,passive:['crit',.003],need:p=>goal(p.stage-1,10,'Пройти этапов главы')},
 leaf:{name:'Лист Иггдрасиля',rarity:1,icon:'heart',material:'forest',lore:'Живой лист Мирового древа не вянет.',ability:lv=>`В бою герой восстанавливает ${(.3+.07*lv).toFixed(2).replace('.',',')}% здоровья в секунду`,passive:['hpPct',.01],need:p=>goal(p.darkFloor-1,2,'Пройти этажей Царства тьмы')},
 fang:{name:'Клык Фенрира',rarity:1,icon:'axe',material:'peaks',lore:'Волк чует слабость раньше охотника.',ability:lv=>`+${(6+2.4*lv).toFixed(0)}% урона героя по врагам ниже 35% здоровья`,passive:['critDamage',.015],need:p=>goal(lairWins(p),3,'Победить в Логове мини-босса')},
 aegis:{name:'Эгида Тюра',rarity:2,icon:'shield',material:'limes',lore:'Щит бога, не знавшего страха.',ability:lv=>`Первый удар врага в каждом бою не наносит урона; снижение урона +${(1+.5*lv).toFixed(1).replace('.',',')}%`,passive:['defPct',.01],need:p=>goal(p.arenaWins,3,'Победить на Арене')},
 ravens:{name:'Вороны Одина',rarity:2,icon:'people',material:'limes',lore:'Хугин и Мунин направляют верных спутников.',ability:lv=>`Активные спутники бьют и лечат на ${6+3*lv}% сильнее`,need:p=>goal(squadState(p).owned.length,3,'Собрать спутников')},
 draupnir:{name:'Кольцо Драупнир',rarity:2,icon:'ring',material:'peaks',lore:'Каждую девятую ночь оно рождает золото.',ability:lv=>`+${4+2*lv}% золота за победы и Тёмной эссенции в Царстве тьмы`,need:p=>goal(p.bosses,10,'Победить боссов главы')},
 gjallar:{name:'Гьяллархорн',rarity:3,icon:'horn',material:'ember',lore:'Рог, чей звук слышен во всех мирах.',ability:lv=>`Навыки перезаряжаются на ${2+lv}% быстрее`,passive:['skill',.01],need:p=>goal(p.darkFloor-1,5,'Пройти этажей Царства тьмы')},
 gap:{name:'Тень Гиннунгагап',rarity:3,icon:'essence',material:'ember',lore:'Пустота, что была до начала времён.',ability:lv=>`Враги начинают каждый бой без ${(3+.7*lv).toFixed(1).replace('.',',')}% здоровья`,passive:['critDamage',.02],need:p=>goal(p.darkFloor-1,10,'Пройти этажей Царства тьмы')}
};
export const relicIds=Object.keys(relics) as RelicId[];
export function relicLevel(p:Player,id:RelicId){if(id==='heart')return p.relic;const v=peekBox<{lv?:Record<string,unknown>}>(p,'relics')?.lv?.[id];return typeof v==='number'&&Number.isInteger(v)&&v>=1?Math.min(RELIC_MAX,v):0}
export const relicUnlockCost=(id:RelicId)=>({shard:[10,20,35,50][relics[id].rarity],gold:[500,1500,4000,9000][relics[id].rarity]});
export function relicUpgradeCost(id:RelicId,level:number){const r=relics[id].rarity;return {shard:4+level*3+r*2,gold:400*(level+1)*(1+r),mats:level>=5?level-2:0,material:relics[id].material}}
/** Every 5 relic levels in the whole collection add 1% to health, attack and defence. */
export function relicCollection(p:Player){const levels=relicIds.reduce((sum,id)=>sum+Math.min(RELIC_MAX,relicLevel(p,id)),0),owned=relicIds.filter(id=>relicLevel(p,id)>0).length;return {levels,owned,total:relicIds.length,bonus:Math.floor(levels/5)*.01,next:5-levels%5}}
export function relicBonus(p:Player){const b=zeroBonus();for(const id of relicIds){const lv=relicLevel(p,id),passive=relics[id].passive;if(lv>0&&id!=='heart'&&passive)plus(b,passive[0],passive[1]*lv)}const c=relicCollection(p).bonus;b.hpPct+=c;b.atkPct+=c;b.defPct+=c;const aegis=relicLevel(p,'aegis');if(aegis)b.reduction+=(1+.5*aegis)/100;return b}

// ───────────────────────── Companions ─────────────────────────
export type CompanionRole='striker'|'guardian';
export interface CompanionDef {name:string;role:CompanionRole;rarity:number;base:number;perLevel:number;interval:number;fly?:boolean;trait:string;traitName:string;shards:number;lore:string}
export const companionRarity=['Добротный','Редкий','Эпический','Легендарный','Мифический'];
export const companionColors=['#56be75','#48bafa','#c97aff','#ffb343','#ff749c'];
export const companions:Record<string,CompanionDef>={
 goose_aviator:{name:'Гусь-Обнимусь',role:'striker',rarity:3,base:.25,perLevel:.04,interval:2.4,fly:true,traitName:'Пике',trait:'Срывает выстрел стрелка или мага, когда удар героя на перезарядке.',shards:0,lore:'Легендарный лётчик Севера.'},
 brown_white_dog:{name:'Верный пёс',role:'guardian',rarity:2,base:.12,perLevel:.01,interval:7,traitName:'Заслон',trait:'Принимает на себя часть тяжёлого удара и спешит с лечением.',shards:0,lore:'Не бросит хозяина ни в одном походе.'},
 '08_armored_boar':{name:'Броненосный вепрь',role:'striker',rarity:0,base:.34,perLevel:.045,interval:3.1,traitName:'Таран',trait:'Бьёт в полтора раза сильнее по врагам под щитом или в блоке.',shards:10,lore:'Приручённый вожак стада в кованой броне.'},
 senior_driller:{name:'Старший бурильщик',role:'striker',rarity:1,base:.2,perLevel:.034,interval:1.9,traitName:'Бур',trait:'Каждое попадание снижает защиту врагов на 3% до конца боя (до 30%).',shards:20,lore:'Перешёл на сторону дружины вместе с буром.'},
 moss_eater:{name:'Пожиратель мха',role:'guardian',rarity:0,base:.1,perLevel:.009,interval:6,traitName:'Целебные споры',trait:'Лечение снимает с героя яд и замедление.',shards:10,lore:'Тихий лекарь древнего леса.'},
 capybara_bruiser:{name:'Капибара-Громила',role:'guardian',rarity:1,base:.085,perLevel:.008,interval:7,traitName:'Живой щит',trait:'Каждое лечение даёт герою щит на 6% здоровья.',shards:20,lore:'Спокойна, пока не тронут её друзей.'}
};
export const companionIds=Object.keys(companions);
export const legacyPet=(id:string)=>id==='goose_aviator'?0:id==='brown_white_dog'?1:-1;
export const STAR_MAX=5;
export const starCost=[10,20,40,70,110];
export const AWAKEN={stars:3,level:20,dusk:5,gold:5000};
export const talentDefs:Record<CompanionRole,{name:string;text:string}[]>={
 striker:[{name:'Острые когти',text:'+8% урона спутника за очко'},{name:'Боевой темп',text:'Атакует на 4% чаще за очко'},{name:'Метка добычи',text:'+1,5% урона героя за очко, пока спутник в строю'}],
 guardian:[{name:'Целитель',text:'+8% силы лечения за очко'},{name:'Быстрая лапа',text:'Лечит на 4% чаще за очко'},{name:'Оберег',text:'+1% снижения урона героя за очко, пока спутник в строю'}]
};
export const TALENT_MAX=10;
const LEGACY_TALENT_MAX=5;
export const FOLLOWER_MAX_LEVEL=100;
export const followerId=(species:string)=>`follower:${species}`;
interface FollowerTalent {rank:number;type:string|null;open:boolean}
export interface FollowerInstance {species:string;lv:number;st:number;aw:boolean;step:number;locked:boolean;talents:FollowerTalent[]}
export interface Pet {lv:number;st:number;sh:number;aw:boolean;t:number[];extra?:number}
type Formation=[string,string,string|null];
interface FollowerSave {v:2;instances:Record<string,FollowerInstance>;shards:Record<string,number>;formation:Formation}
interface LegacySquad {own?:Record<string,Partial<Pet>>;act?:unknown[]}
export interface SquadState extends FollowerSave {own:Record<string,Pet>;act:[string,string];owned:string[]}
const int=(v:unknown,min:number,max:number,fallback:number)=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max?v:fallback;

export function newFollower(species:string,lv=1,ranks:readonly number[]=[],st=0,aw=false):FollowerInstance{
 return {species,lv,st,aw,step:0,locked:false,talents:Array.from({length:8},(_,i)=>({
  rank:i<3?int(ranks[i],0,LEGACY_TALENT_MAX,0):0,
  type:i<3?`legacy:${companions[species].role}:${i}`:`growth:${i}`,
  open:i<4,
 }))};
}

export const followerStarCap=(step:number)=>followerEconomy.baseStars+Math.floor(step/2)*followerEconomy.starsPerUnlock;
export const followerExtraRank=(pet:FollowerInstance)=>pet.talents.slice(3).reduce((sum,slot)=>sum+(slot.open&&slot.type?.startsWith('growth:')?slot.rank:0),0);

function readFollowers(p:Player):FollowerSave{
 const saved=peekBox<Omit<FollowerSave,'v'> & {v?:number} & LegacySquad>(p,'squad');
 const instances:Record<string,FollowerInstance>={},shards:Record<string,number>={};
 const current=saved?.v===1||saved?.v===2;
 if(current){
  for(const [id,entry] of Object.entries(saved.instances??{})){
   if(!/^follower:[\w:.-]{1,55}$/.test(id)||!entry||!Object.hasOwn(companions,entry.species))continue;
   if(Object.hasOwn(companions,id.slice(9))&&id!==followerId(entry.species))continue;
   const lv=int(entry.lv,1,Number.MAX_SAFE_INTEGER,0);
   if(!lv)continue;
   const slots=Array.isArray(entry.talents)?entry.talents:[];
   const step=saved.v===2?int(entry.step,0,followerEconomy.awakening.length,0):0;
   const follower=newFollower(entry.species,lv,slots.map(slot=>slot?.rank),int(entry.st,0,saved.v===2?followerStarCap(step):STAR_MAX,0),entry.aw===true);
   follower.step=step;
   follower.locked=entry.locked===true;
   follower.talents.forEach((slot,i)=>{
    const previous=slots[i];
    if(i<3){
     if(saved.v===2)slot.rank=int(previous?.rank,0,10,slot.rank);
     return;
    }
    slot.open=i<4+Math.floor(step/2)||previous?.open===true;
    if(slot.open&&typeof previous?.type==='string'&&/^[\w:.-]{1,48}$/.test(previous.type)){
     slot.type=previous.type;
     slot.rank=int(previous.rank,0,100,0);
    }
   });
   instances[id]=follower;
  }
 }
 for(const species of companionIds){
  const id=followerId(species),old=saved?.own?.[species],legacy=legacyPet(species);
  shards[species]=int(current?saved.shards?.[species]:old?.sh,0,1e6,0);
  if(!current){
   const lv=legacy>=0?p.companions[legacy]:int(old?.lv,0,9999,0);
   if(lv>0)instances[id]=newFollower(species,lv,Array.isArray(old?.t)?old.t:[],int(old?.st,0,STAR_MAX,0),old?.aw===true);
  }else if(legacy>=0){
   // Starter levels also drive approved evolution, branches and hero stats.
   const starter=instances[id]??=newFollower(species);
   starter.lv=p.companions[legacy];
  }
 }
 const requested=current?saved.formation:Array.isArray(saved?.act)?saved.act.map(id=>typeof id==='string'?followerId(id):null):[];
 const pick=(slot:0|1,role:CompanionRole,fallback:string)=>{
  const id=requested?.[slot];
  return typeof id==='string'&&Object.hasOwn(instances,id)&&companions[instances[id].species].role===role?id:followerId(fallback);
 };
 const main=pick(0,'striker','goose_aviator'),guard=pick(1,'guardian','brown_white_dog');
 const reserve=requested?.[2];
 return {v:2,instances,shards,formation:[main,guard,
  typeof reserve==='string'&&Object.hasOwn(instances,reserve)&&reserve!==main&&reserve!==guard?reserve:null]};
}

export function squadBox(p:Player):FollowerSave{
 const squad=readFollowers(p);
 sagaOf(p).box.squad=squad;
 return squad;
}
export function migrateSquad(p:Player){
 if(!p.saga)return;
 if(peekBox(p,'squad')||p.companions.some(level=>level>1))squadBox(p);
}

export function followerProgress(instance:FollowerInstance,sh:number):Pet{
 const extra=followerExtraRank(instance);
 return {lv:instance.lv,st:instance.st,sh,aw:instance.aw,t:instance.talents.slice(0,3).map(slot=>slot.rank),...(extra?{extra}:{})};
}
export function squadState(p:Player):SquadState{
 const save=readFollowers(p),own:Record<string,Pet>={};
 const bySpecies=new Map<string,FollowerInstance>();
 for(const instance of Object.values(save.instances)){
  if(!bySpecies.has(instance.species))bySpecies.set(instance.species,instance);
 }
 for(const species of companionIds){
  const instance=save.instances[followerId(species)]??bySpecies.get(species);
  own[species]=followerProgress(instance??newFollower(species,0),save.shards[species]);
 }
 return {...save,own,owned:companionIds.filter(id=>own[id].lv>0),
  act:[save.instances[save.formation[0]].species,save.instances[save.formation[1]].species]};
}
export function raiseFollowerLevel(p:Player,id:string,box=squadBox(p)){
 const pet=box.instances[id];
 if(!pet||pet.lv>=FOLLOWER_MAX_LEVEL)return false;
 pet.lv++;
 const legacy=legacyPet(pet.species);
 if(legacy>=0&&id===followerId(pet.species))p.companions[legacy]=pet.lv;
 return true;
}
export const talentPoints=(pet:Pet)=>Math.floor(pet.lv/5);
export const talentSpent=(pet:Pet)=>pet.t.reduce((a,b)=>a+b,0);
/** Own power of one companion: its job multiplier, action interval and the awakened ability. */
export function companionPower(id:string,pet:Pet){
 const def=companions[id],talents=pet.t,legacy=legacyPet(id)>=0;
 const power=(def.base+pet.lv*def.perLevel)*(legacy?evoPower(pet.lv):1+Math.min(3,Math.floor(pet.lv/10))*.12)*(1+pet.st*.1)*(1+talents[0]*.08)*(pet.aw?1.25:1)*(1+(pet.extra??0)*.025);
 return {power,interval:def.interval*(1-talents[1]*.04)*(pet.aw?.85:1)};
}
export interface CombatFollower {
 id:string;instanceId:string;role:CompanionRole;power:number;interval:number;fly:boolean;awake:boolean;teamTalent:number
}
export interface SquadCombat {striker:CombatFollower;guardian:CombatFollower;reserve:CombatFollower|null;heroDamage:number}

function combatFollower(squad:SquadState,instanceId:string,boost:number):CombatFollower{
 const instance=squad.instances[instanceId],id=instance.species,def=companions[id];
 const {power,interval}=companionPower(id,followerProgress(instance,squad.shards[id]));
 return {id,instanceId,role:def.role,power:power*boost,interval,fly:!!def.fly,awake:instance.aw,teamTalent:instance.talents[2].rank};
}
export function squadCombat(p:Player):SquadCombat{
 const squad=squadState(p),[main,guard,third]=squad.formation,ravens=relicLevel(p,'ravens');
 const boost=1+(ravens?(6+3*ravens)/100:0);
 const striker=combatFollower(squad,main,boost),guardian=combatFollower(squad,guard,boost);
 const reserve=third?combatFollower(squad,third,boost):null;
 const heroDamage=(striker.teamTalent+(reserve?.role==='striker'?reserve.teamTalent:0))*.015;
 return {striker,guardian,reserve,heroDamage};
}
/** Collection bonuses count each owned species once. Active guardians contribute their own talent. */
export function squadBonus(p:Player){
 const b=zeroBonus(),s=squadState(p);let stars=0;
 const best=new Map<string,number>();
 for(const pet of Object.values(s.instances))best.set(pet.species,Math.max(best.get(pet.species)??0,pet.st+(pet.aw?2:0)));
 for(const value of best.values())stars+=value;
 b.hpPct+=stars*.005;b.atkPct+=stars*.005;
 const primary=s.instances[s.formation[1]],third=s.formation[2]?s.instances[s.formation[2]]:null;
 const protection=primary.talents[2].rank+(third&&companions[third.species].role==='guardian'?third.talents[2].rank:0);
 b.reduction+=protection*.01;
 return b;
}
// ───────────────────────── the single aggregator ─────────────────────────
/** Dark gear + gems + relics + companions, each counted exactly once. Read by `stats()`. */
export function powerBonus(p:Player):Bonus{
 const total=zeroBonus();if(!p.saga)return total;
 for(const part of [darkBonus(p),gemBonus(p),relicBonus(p),squadBonus(p),runeBonus(p)])for(const k of Object.keys(total) as StatKey[])total[k]+=part[k];
 return total;
}
function runeBonus(p:Player){
 const bonus=zeroBonus();
 for(const {key,amount} of runeBonuses(p).bonuses)bonus[key]+=amount;
 return bonus;
}
export const powerParts=(p:Player)=>[['Тёмная энергия',darkBonus(p)],['Драгоценные камни',gemBonus(p)],['Реликвии',relicBonus(p)],['Спутники',squadBonus(p)],['Руны и пассивы',runeBonus(p)]] as [string,Bonus][];
/** Fight-wide special effects of all systems, computed once per encounter by the battle engine. */
export interface Aura {execute30:number;execute35:number;boss:number;opening:number;thorns:number;veil:number;killHeal:number;regen:number;firstBlock:boolean;boltEvery:number;boltPower:number;rally:number;cooldownRate:number;foeHpCut:number;heroDamage:number}
export function combatAura(p:Player,team=squadCombat(p)):Aura{
 const e=darkEffectTotals(p),lv=(id:RelicId)=>relicLevel(p,id);
 return {execute30:e.reaper,execute35:lv('fang')?(6+2.4*lv('fang'))/100:0,boss:e.bossbane,opening:e.eclipse,thorns:e.thorns,veil:e.veil,killHeal:e.hunger,regen:lv('leaf')?(.3+.07*lv('leaf'))/100:0,firstBlock:lv('aegis')>0,
  boltEvery:lv('mjolnir')?6:0,boltPower:(60+12*lv('mjolnir'))/100,rally:lv('horn')?(10+2*lv('horn'))/100:0,cooldownRate:1+(lv('gjallar')?(2+lv('gjallar'))/100:0),foeHpCut:lv('gap')?(3+.7*lv('gap'))/100:0,heroDamage:team.heroDamage};
}
export const lootBonus=(p:Player)=>relicLevel(p,'draupnir')?(4+2*relicLevel(p,'draupnir'))/100:0;
