import type {Player} from '../core/types';
import {carnivalNow} from '../core/profile';
import {companions,companionIds} from '../dark/rules';
import {grantFollower} from '../dark/followerMarket';
import {type Reward,grant} from './rewards';
import {balanceOf,grantSolo} from './soloEconomy';
import {peekBox,sagaOf} from './save';
import {eventPeriod,eventSchedule,eventWindow,putPeriod,savedEventKeys,windowFromKey,type SoloEventId} from './soloCalendar';
import {runeState,grantRuneChest,runeName} from './runes';

type Chest='epic'|'legendary'|'rune';
type Prize={at:number;reward:Reward;chest?:Chest;after?:boolean};
const followers=[30,60,90,120,180,240,300,360,420,520,600,700,800,900,1050,1250,1450,1650,1850,2150,2500,3000,3600,4300,5200];
const runeThresholds=[20,40,60,80,100,125,150,180,210,240,270,300,340,380,420,460,500,550,600,650,700,760,820,890,960];
const followerPrizes:Prize[]=followers.map((at,i)=>({
 at,reward:i%5===4?{gold:3000*(1+Math.floor(i/5)),solo:{awakeShard:i+1}}:{gold:600*(1+Math.floor(i/5)),res:i%5===2?{shard:4}:undefined},
 chest:i===14?'epic':i===24?'legendary':undefined,
}));
export const eventPrizes:Record<SoloEventId,readonly Prize[]>={
 followers:[...followerPrizes,{at:5200,reward:{solo:{soul:545}},after:true}],
 runes:runeThresholds.map((at,i)=>({at,reward:{gold:400*(1+Math.floor(i/5)),solo:{awakeShard:i%5===4?Math.floor(i/5)+2:1}},chest:i===9||i===19||i===24?'rune':undefined})),
 monopoly:[
  {at:1,reward:{gold:1000}},{at:3,reward:{solo:{awakeShard:5}}},{at:5,reward:{solo:{soul:30}}},
  {at:10,reward:{solo:{awakeShard:15}}},{at:15,reward:{solo:{awake:1}}},
 ],
 fortune:[
  {at:10,reward:{gold:1200}},{at:30,reward:{solo:{awakeShard:10}}},{at:60,reward:{solo:{wing:4}}},{at:120,reward:{solo:{awake:3}}},{at:200,reward:{solo:{awake:2,wing:15}}},
 ],
};
type Cell={name:string;reward:Reward};
const gold:Cell={name:'Трюм с золотом',reward:{gold:180}};
const pearl:Cell={name:'Самоцветы',reward:{gems:3}};
const scroll:Cell={name:'Тайный свиток',reward:{solo:{scroll:2}}};
const fragment:Cell={name:'Осколок пробуждения',reward:{solo:{awakeShard:1}}};
const wing:Cell={name:'Перо ветра',reward:{solo:{wing:1}}};
const jackpot:Cell={name:'Жетон джекпота',reward:{}};
export const seaBoard:readonly Cell[]=[
 {name:'Старт · Северная гавань',reward:{gold:300}},gold,pearl,scroll,gold,fragment,wing,gold,pearl,fragment,scroll,wing,pearl,gold,fragment,scroll,gold,pearl,wing,fragment,
];
export const fortuneBoard=[
 {...gold,weight:20},{...pearl,weight:14},{...scroll,weight:12},{...fragment,weight:8},
 {...wing,weight:8},{...gold,weight:12},{...pearl,weight:6},{...scroll,weight:6},
 {...fragment,weight:4},{...wing,weight:4},{...gold,weight:4},{...jackpot,weight:2},
] as const;
export const fortuneExchange={cost:1,feathers:8,stones:1} as const;

export function rollEvent(p:Player,id:'monopoly'|'fortune',revision:number,now=carnivalNow(),random=Math.random){
 const window=eventWindow(id,now),period=eventPeriod(p,window.key);
 if(!window.active||period.revision!==revision||balanceOf(p,id)<1)return false;
 if(id==='monopoly'){
  period.last=1+Math.min(5,Math.floor(random()*6));
  period.steps+=period.last;
  period.position=period.steps%seaBoard.length;
  period.progress=Math.floor(period.steps/seaBoard.length);
  grant(p,seaBoard[period.position].reward);
 }else{
  let roll=random()*100;
  period.position=fortuneBoard.findIndex(cell=>(roll-=cell.weight)<0);
  if(period.position<0)period.position=fortuneBoard.length-1;
  period.last=period.position;
  period.progress++;
  if(fortuneBoard[period.position].name===jackpot.name)grantSolo(p,'jackpot',1);
  else grant(p,fortuneBoard[period.position].reward);
 }
 grantSolo(p,id,-1);
 period.revision++;
 putPeriod(p,window.key,period);
 return true;
}
export const wasClaimed=(claims:number,index:number)=>(claims&(1<<index))!==0;
export const chestNames:Record<Chest,string>={epic:'Случайный эпический спутник',legendary:'Спутник легендарного класса на выбор',rune:'Случайная руна'};
export const chestOptions=(chest:Chest)=>companionIds.filter(id=>companions[id].rarity===(chest==='epic'?2:chest==='legendary'?3:-1));
export function savedChests(p:Player){
 const box=peekBox<Record<string,Chest>>(p,'soloChests')??{};
 return Object.entries(box).filter((entry):entry is [string,Chest]=>Object.hasOwn(chestNames,entry[1]));
}
export function openChest(p:Player,key:string,species?:string,random=Math.random){
 const chests=peekBox<Record<string,Chest>>(p,'soloChests'),chest=chests?.[key];
 if(!chest||!Object.hasOwn(chestNames,chest))return false;
 let received:string;
 if(chest==='rune'){
  const {id,dust}=grantRuneChest(p,runeState(p),random);
  received=dust?`Рунная пыль +${dust} · повтор «${runeName(id)}»`:`Руна «${runeName(id)}» · ранг 1`;
 }
 else {
  const options=chestOptions(chest);
  const chosen=chest==='legendary'?species:options[Math.min(options.length-1,Math.floor(random()*options.length))];
  if(!chosen||!options.includes(chosen)||!grantFollower(p,chosen))return false;
  received=companions[chosen].name+' × 1';
 }
 delete chests![key];
 return received;
}
export function eligiblePrizes(p:Player,key:string){
 const window=windowFromKey(key);
 if(!window)return [];
 const {progress,claims}=eventPeriod(p,key);
 return eventPrizes[window.id].flatMap((prize,index)=>prize.at<=progress&&!wasClaimed(claims,index)?[{...prize,index}]:[]);
}
export function claimEvent(p:Player,key:string,index:number,channel:'event'|'mail',now=carnivalNow()){
 const window=windowFromKey(key);
 if(!window)return false;
 const closed=now>=window.end,fromMail=channel==='mail';
 if(fromMail?!closed:closed||now<window.start)return false;
 const prize=eligiblePrizes(p,key).find(prize=>prize.index===index);
 if(!prize||prize.after&&!closed||prize.chest&&prize.chest!=='rune'&&!chestOptions(prize.chest).length)return false;
 const period=eventPeriod(p,key);
 if(prize.chest){
  const box=sagaOf(p).box;
  const chests=peekBox<Record<string,Chest>>(p,'soloChests')??{};
  chests[key+':'+index]=prize.chest;
  box.soloChests=chests;
 }
 grant(p,prize.reward);
 period.claims|=1<<index;
 putPeriod(p,key,period);
 return true;
}
export function eventMail(p:Player,now:number){
 return savedEventKeys(p).flatMap(id=>{
  const window=windowFromKey(id);
  if(!window||now<window.end)return [];
  const prizes=eligiblePrizes(p,id);
  return prizes.length?[{id,date:window.end,title:eventSchedule[window.id].name,prizes}]:[];
 });
}
export function tradeJackpot(p:Player,expected:number,choice:'wing'|'awake'){
 if(expected<fortuneExchange.cost||balanceOf(p,'jackpot')!==expected)return false;
 if(choice==='wing'&&!p.equipment.wings)return false;
 grantSolo(p,'jackpot',-fortuneExchange.cost);
 grantSolo(p,choice,choice==='wing'?fortuneExchange.feathers:fortuneExchange.stones);
 return true;
}
