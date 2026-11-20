import {recordSprintSpend} from '../saga/soloCalendar';
import {carnivalNow} from '../core/profile';
import type {Player} from '../core/types';
import {followerEconomy as rules,balanceOf,grantSolo,utcDay,utcWeek} from '../saga/soloEconomy';
import {bumpCount,peekBox,sagaOf} from '../saga/save';
import {soloAction} from '../saga/soloAction';
import {companions,companionIds,addRes,resCount,squadState,squadBox,newFollower,legacyPet,followerId,followerStarCap,type FollowerInstance} from './rules';

type Species={id:string;rarity:number};
const pool=companionIds.map(id=>({id,rarity:companions[id].rarity}));
type Guarantee='legendary'|'mythic';
type Offer={species:string;guarantee?:Guarantee};
interface Market {v:1;revision:number;nextId:number;offers:(Offer|null)[];legendary:number;mythic:number;day:number;week:number;daily:number;weekly:number}

export function offerOdds(slot:number,catalog:readonly Species[]=pool){
 const weights=rules.weights[slot] as readonly number[];
 const counts=weights.map((_,rarity)=>catalog.filter(s=>s.rarity===rarity).length);
 const total=weights.reduce((sum,weight,i)=>sum+(counts[i]?weight:0),0);
 return catalog.flatMap(({id,rarity})=>total&&weights[rarity]&&counts[rarity]?[{id,chance:weights[rarity]/total/counts[rarity]}]:[]);
}
function choose<T>(items:readonly T[],random:()=>number){return items[Math.min(items.length-1,Math.floor(random()*items.length))]}

export function rollOffers(counters:Pick<Market,'legendary'|'mythic'>,catalog:readonly Species[]=pool,random=Math.random):Offer[]{
 const offers:Offer[]=rules.weights.map((_,slot)=>{
  let remaining=random();
  const odds=offerOdds(slot,catalog);
  const selected=odds.find(x=>(remaining-=x.chance)<0)??odds.at(-1);
  return {species:selected?.id??choose(catalog,random)?.id??''};
 });
 const guarantees=[['legendary',3],['mythic',4]] as const;
 guarantees.forEach(([guarantee,rarity],i)=>{
  if(counters[guarantee]<rules[guarantee])return;
  const candidates=catalog.filter(s=>s.rarity===rarity);
  if(candidates.length)offers[i+1]={species:choose(candidates,random).id,guarantee};
 });
 return offers.filter(x=>x.species);
}

const integer=(x:unknown,max=Number.MAX_SAFE_INTEGER)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0?Math.min(max,x):0;
export function followerMarket(p:Player,now=Date.now()):Market{
 const old=peekBox<Market>(p,'followerMarket'),day=utcDay(now),week=utcWeek(now);
 return {v:1,revision:integer(old?.revision),nextId:integer(old?.nextId),
  offers:Array.isArray(old?.offers)&&old.offers.length===3?old.offers.map(o=>o&&Object.hasOwn(companions,o.species)?{species:o.species,...(o.guarantee==='legendary'||o.guarantee==='mythic'?{guarantee:o.guarantee}:{})}:null):[],
  legendary:integer(old?.legendary,rules.legendary),mythic:integer(old?.mythic,rules.mythic),
  day:Math.max(day,integer(old?.day)),week:Math.max(week,integer(old?.week)),
  daily:old&&old.day>=day?integer(old.daily,rules.freeDaily):0,weekly:old&&old.week>=week?integer(old.weekly,rules.freeWeekly):0};
}
export const freeRefresh=(market:Market)=>market.daily<rules.freeDaily&&market.weekly<rules.freeWeekly;

export function refreshFollowers(revision:number,declineGuarantees=false,now=Date.now()){
 return soloAction(p=>{
  const market=followerMarket(p,now);
  if(market.revision!==revision||!declineGuarantees&&market.offers.some(o=>o?.guarantee))return false;
  if(market.offers.length){
   if(freeRefresh(market)){market.daily++;market.weekly++}
   else {
    if(balanceOf(p,'soul')<rules.refresh)return false;
    grantSolo(p,'soul',-rules.refresh);
   }
   for(const offer of market.offers)if(offer?.guarantee)market[offer.guarantee]=0;
   market.legendary=Math.min(rules.legendary,market.legendary+1);
   market.mythic=Math.min(rules.mythic,market.mythic+1);
  }
  market.offers=rollOffers(market);
  market.revision++;
  sagaOf(p).box.followerMarket=market;
  return true;
 },'Предложения сохранены');
}
export function grantFollower(p:Player,species:string){
 if(!Object.hasOwn(companions,species))return false;
 const squad=squadBox(p);
 if(Object.keys(squad.instances).length>=rules.maxOwned)return false;
 const market=followerMarket(p);
 let id:string;
 do{id='follower:copy:'+ ++market.nextId}while(Object.hasOwn(squad.instances,id));
 squad.instances[id]=newFollower(species);
 sagaOf(p).box.followerMarket=market;
 return true;
}
export function buyFollower(slot:number,revision:number,now=carnivalNow()){
 return soloAction(p=>{
  const market=followerMarket(p),offer=market.offers[slot];
  if(market.revision!==revision||!offer)return false;
  const price=rules.prices[companions[offer.species].rarity];
  if(balanceOf(p,'soul')<price||!grantFollower(p,offer.species))return false;
  market.nextId=followerMarket(p).nextId;
  market.offers[slot]=null;
  if(offer.guarantee)market[offer.guarantee]=0;
  market.revision++;
  sagaOf(p).box.followerMarket=market;
  grantSolo(p,'soul',-price);
  bumpCount(p,'summon');
  bumpCount(p,'solo:soulSpent',price);
  recordSprintSpend(p,'followers',price,now);
  return true;
 },'Спутник вступил в дружину');
}

export function exchangeSeal(expected:number,quantity=1){
 return soloAction(p=>{
  if(!Number.isSafeInteger(quantity)||quantity<1||expected<quantity||resCount(p,'seal')!==expected)return false;
  addRes(p,'seal',-quantity);
  grantSolo(p,'soul',quantity*rules.sealSouls);
  return true;
 },'Звёздные души получены');
}
export function exchangeFollowerShards(species:string,expected:number){
 return soloAction(p=>{
  const squad=squadBox(p);
  if(!Object.hasOwn(companions,species)||!expected||squad.shards[species]!==expected)return false;
  squad.shards[species]=0;
  grantSolo(p,'soul',expected*rules.shardSouls);
  return true;
 },'Осколки обменяны');
}
export function redeemFollowerShards(species:string,expected:number){
 return soloAction(p=>{
  if(!Object.hasOwn(companions,species))return false;
  const squad=squadBox(p),cost=companions[species].shards;
  if(!cost||expected<cost||squad.shards[species]!==expected||Object.values(squad.instances).some(pet=>pet.species===species))return false;
  if(!grantFollower(p,species))return false;
  squadBox(p).shards[species]-=cost;
  return true;
 },'Спутник вступил в дружину');
}
export function exchangeAwakeningShards(expected:number,quantity=1){
 return soloAction(p=>{
  const cost=quantity*rules.shardExchange;
  if(!Number.isSafeInteger(cost)||quantity<1||expected<cost||balanceOf(p,'awakeShard')!==expected)return false;
  grantSolo(p,'awakeShard',-cost);
  grantSolo(p,'awake',quantity);
  return true;
 },'Камень пробуждения получен');
}
export function nextAwakening(pet:FollowerInstance){return rules.awakening[pet.step]}
export function advanceAwakening(id:string,step:number){
 return soloAction(p=>{
  const pet=squadBox(p).instances[id],next=pet&&nextAwakening(pet);
  if(!next||pet.step!==step||pet.lv<next.lv||pet.st<next.stars||balanceOf(p,'awake')<next.cost)return false;
  grantSolo(p,'awake',-next.cost);
  pet.step++;
  pet.talents.forEach((slot,i)=>{if(i<4+Math.floor(pet.step/2))slot.open=true});
  bumpCount(p,'pet:awaken');
  return true;
 },'Ступень пробуждения открыта');
}

export function protectFollower(id:string,locked:boolean){
 return soloAction(p=>{
  const pet=squadBox(p).instances[id];
  if(!pet||pet.locked===locked)return false;
  pet.locked=locked;
  return true;
 });
}
export function followerMerge(p:Player,targetId:string,donorId:string,talent:number|null){
 if(talent!==null&&(!Number.isInteger(talent)||talent<0||talent>7))return null;
 const squad=squadState(p),target=squad.instances[targetId],donor=squad.instances[donorId];
 if(!target||!donor||targetId===donorId||target.species!==donor.species||squad.formation.includes(donorId)||donor.locked||
  (legacyPet(donor.species)>=0&&donorId===followerId(donor.species)))return null;
 const step=Math.max(target.step,donor.step),stars=target.st+donor.st+1,cap=followerStarCap(step);
 if(stars>cap)return null;
 const talents=target.talents.map((slot,i)=>{
  const source=donor.talents[i];
  const open=slot.open||source.open;
  if(i!==talent||!source.rank||!open)return {...slot,open};
  const rank=slot.type===source.type?Math.max(slot.rank,source.rank,Math.min(10,Math.max(slot.rank,source.rank)+1)):source.rank;
  return {open,type:source.type,rank};
 });
 const result={...target,step,st:stars,aw:target.aw||donor.aw,talents};
 return {result,cap,donor,quote:JSON.stringify([targetId,donorId,talent,target,donor])};
}
export function mergeFollower(target:string,donor:string,talent:number|null,quote:string){
 return soloAction(p=>{
  const plan=followerMerge(p,target,donor,talent);
  if(!plan||quote!==plan.quote)return false;
  const squad=squadBox(p);
  squad.instances[target]=plan.result;
  delete squad.instances[donor];
  bumpCount(p,'pet:star');
  return true;
 },'Спутники объединены');
}
