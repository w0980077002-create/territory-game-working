/**
 * Collections (master spec §13–16, §48.7): what the player has already found and what is still ahead.
 * Gear entries are remembered once obtained (selling or salvaging later never removes them), so the
 * registry only grows. Fill milestones pay once each. Wing looks are cosmetic and never change stats.
 */
import type {Item,Player,Slot} from '../core/types';
import {slots} from '../data/catalog';
import {uniques} from '../core/gear';
import {perks,perkIds,setIds,sets,type SetId} from './gear';
import {boxOf,peekBox,hasFlag,setFlag,sagaOf} from './save';
import {grant,type Reward} from './rewards';
import {companionIds,companions,squadState,relicIds,relicLevel,relics} from '../dark/rules';
import {wingRank} from './soloProgress';

export const gearSlots=slots.filter(s=>s!=='wings') as Slot[];
/** Stable collection key of an item, or undefined for ordinary gear. */
export function gearKey(item:Item|undefined|null):string|undefined{
 if(!item)return undefined;
 if(item.uniqueId&&Object.hasOwn(uniques,item.uniqueId))return 'u:'+item.uniqueId;
 if(item.perk&&Object.hasOwn(perks,item.perk))return 'p:'+item.perk;
 if(item.set&&(setIds as string[]).includes(item.set)&&item.slot!=='wings')return 's:'+item.set+':'+item.slot;
 return undefined;
}
export const gearEntries:readonly string[]=[
 ...Object.keys(uniques).map(id=>'u:'+id),
 ...perkIds.map(id=>'p:'+id),
 ...setIds.flatMap(set=>gearSlots.map(slot=>'s:'+set+':'+slot)),
];
interface CollectionBox {g:string[]}
const known=(p:Player)=>{const g=peekBox<CollectionBox>(p,'collection')?.g;return new Set(Array.isArray(g)?g.filter(k=>typeof k==='string'):[])};
function held(p:Player){
 return [...Object.values(p.equipment),...p.inventory,...(p.pendingLoot??[])];
}
/** Keys proven by the save even before the registry existed: named perks and trophies keep flags. */
function proven(p:Player){
 const out=new Set<string>();
 for(const item of held(p)){const k=gearKey(item);if(k)out.add(k)}
 for(const id of perkIds)if(hasFlag(p,'perk:'+id))out.add('p:'+id);
 for(const flag of p.saga?.flags??[])if(flag==='first-boss-relic')out.add('u:ice_silk');
 if(p.claimed.includes('first-boss-relic'))out.add('u:ice_silk');
 return out;
}
/** Keys that the save shows but the registry has not recorded yet. */
export function unrecorded(p:Player){const k=known(p);return [...proven(p)].filter(key=>!k.has(key)&&gearEntries.includes(key))}
/** Adds newly found gear to the registry. Returns how many entries were added. Call inside a mutation. */
export function recordCollection(p:Player){
 const fresh=unrecorded(p);if(!fresh.length)return 0;
 const box=boxOf<CollectionBox>(p,'collection',()=>({g:[]}));
 if(!Array.isArray(box.g))box.g=[];
 for(const key of fresh)if(gearEntries.includes(key)&&!box.g.includes(key))box.g.push(key);
 return fresh.length;
}
export const gearFound=(p:Player)=>{const k=new Set([...known(p),...proven(p)]);return gearEntries.filter(e=>k.has(e))};

// ── Wing looks: six original recolours of the approved wing art, unlocked by real progress ──
export interface WingLook {id:string;name:string;filter:string;need:string;unlocked:(p:Player)=>boolean}
export const wingLookList:readonly WingLook[]=[
 {id:'north',name:'Северный ветер',filter:'none',need:'Доступна сразу',unlocked:()=>true},
 {id:'frost',name:'Ледяной иней',filter:'hue-rotate(-75deg) saturate(.9) brightness(1.15)',need:'Пройти Ледяные вершины',unlocked:p=>p.stage>10},
 {id:'grove',name:'Рунная листва',filter:'hue-rotate(-160deg) saturate(1.1)',need:'Пройти Лес древних рун',unlocked:p=>p.stage>30},
 {id:'flame',name:'Пламя Бездны',filter:'hue-rotate(95deg) saturate(1.6) brightness(1.1)',need:'Пройти Огненные земли',unlocked:p=>p.stage>60},
 {id:'gold',name:'Золото Асгарда',filter:'sepia(1) saturate(3.2) hue-rotate(-12deg) brightness(1.08)',need:'Рост крыльев · ранг 6',unlocked:p=>wingRank(p)>=6},
 {id:'dusk',name:'Сумрачный полёт',filter:'grayscale(.4) brightness(.55) contrast(1.3) saturate(1.6)',need:'Пройти 20 этажей Царства тьмы',unlocked:p=>p.darkFloor>20||hasFlag(p,'perk:duskwings')},
];
export function wingLook(p:Player):WingLook{
 const id=peekBox<{look?:string}>(p,'wings')?.look,look=wingLookList.find(l=>l.id===id);
 return look&&look.unlocked(p)?look:wingLookList[0];
}
export function chooseWingLook(p:Player,id:string){
 const look=wingLookList.find(l=>l.id===id);
 if(!look||!look.unlocked(p)||!p.equipment.wings)return false;
 boxOf<{rank?:number;look?:string}>(p,'wings',()=>({rank:0})).look=id;
 p.wingVisible=true;
 return true;
}

// ── Collection pages with fill milestones ──
export type CollectionId='gear'|'wings'|'companions'|'relics';
export interface CollectionPage {id:CollectionId;name:string;found:number;total:number}
export function collectionPages(p:Player):CollectionPage[]{
 const squad=squadState(p);
 return [
  {id:'gear',name:'Снаряжение',found:gearFound(p).length,total:gearEntries.length},
  {id:'wings',name:'Внешность крыльев',found:wingLookList.filter(l=>l.unlocked(p)).length,total:wingLookList.length},
  {id:'companions',name:'Спутники',found:companionIds.filter(id=>squad.owned.includes(id)).length,total:companionIds.length},
  {id:'relics',name:'Реликвии',found:relicIds.filter(id=>relicLevel(p,id)>0).length,total:relicIds.length},
 ];
}
export const collectionSteps=[25,50,75,100] as const;
export function collectionReward(id:CollectionId,index:number):Reward{
 const gems=[15,30,60,120][index]??0;
 if(id==='companions')return {gems,res:{seal:index+1}};
 if(id==='relics')return {gems,res:{shard:5*(index+1)}};
 if(id==='wings')return {gems,solo:{wing:3*(index+1)}};
 return {gems,gold:2000*(index+1)};
}
export function collectionMilestones(p:Player,page:CollectionPage){
 const pct=page.total?page.found/page.total*100:0;
 return collectionSteps.map((at,index)=>({at,index,reward:collectionReward(page.id,index),reached:pct>=at,claimed:hasFlag(p,`coll:${page.id}:${index}`)}));
}
export const collectionReady=(p:Player)=>collectionPages(p).some(page=>collectionMilestones(p,page).some(m=>m.reached&&!m.claimed));
export function claimCollection(p:Player,id:CollectionId,index:number):Reward|null{
 const page=collectionPages(p).find(c=>c.id===id),m=page&&collectionMilestones(p,page)[index];
 if(!m||!m.reached||m.claimed||!setFlag(p,`coll:${id}:${index}`))return null;
 grant(p,m.reward);
 return m.reward;
}
export const companionList=()=>companionIds.map(id=>({id,name:companions[id].name,rarity:companions[id].rarity}));
export const relicList=()=>relicIds.map(id=>({id,name:relics[id].name,rarity:relics[id].rarity,icon:relics[id].icon}));
export const setName=(id:SetId)=>sets[id].name;
export {sagaOf};
