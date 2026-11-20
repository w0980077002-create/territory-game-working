import {recordSprintSpend} from '../saga/soloCalendar';
import {carnivalNow} from '../core/profile';
import type {Player} from '../core/types';
import {skillData} from '../data/catalog';
import {peekBox,sagaOf,bumpCount} from './save';
import {balanceOf,grantSolo} from './soloEconomy';

export const runeRules={
 summon:20,rankCosts:[0,30,60,100,150],duplicateDust:1,unlockDust:3,dustPerScroll:5,
 resonance:[
  {ranks:3,key:'atkPct',amount:.035,name:'Атака'},
  {ranks:6,key:'hpPct',amount:.03,name:'Здоровье'},
  {ranks:9,key:'crit',amount:.015,name:'Шанс крита'},
  {ranks:15,key:'defPct',amount:.04,name:'Защита'},
  {ranks:24,key:'skill',amount:.04,name:'Урон навыков'},
  {ranks:36,key:'reduction',amount:.025,name:'Снижение урона'},
 ],
 passives:[
  {level:5,key:'hpPct',amount:.06,name:'Стойкость',text:'+6% здоровья'},
  {level:5,key:'atkPct',amount:.05,name:'Напор',text:'+5% атаки'},
  {level:5,key:'defPct',amount:.08,name:'Доспех',text:'+8% защиты'},
 ],
 upgradeEffect:.04,
} as const;
const maxRank=runeRules.rankCosts.length;
export const runeName=(id:number)=>skillData[Math.floor(id/3)].runes[id%3].split(' · ')[0];
const runeIds=Array.from({length:9},(_,i)=>i);
interface RuneSave {v:1;revision:number;ranks:number[];dust:number;passive:number|null;last:number|null}
const validInt=(value:unknown,min:number,max:number):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
export function runeState(p:Player):RuneSave{
 const s=peekBox<RuneSave>(p,'runes');
 return {v:1,revision:validInt(s?.revision,0,1e12)?s.revision:0,
  ranks:runeIds.map(i=>validInt(s?.ranks?.[i],0,maxRank)?s.ranks[i]:0),
  dust:validInt(s?.dust,0,1e12)?s.dust:0,
  passive:validInt(s?.passive,0,runeRules.passives.length-1)?s.passive:null,last:validInt(s?.last,0,8)?s.last:null};
}
export function runeBonuses(p:Player){
 const s=runeState(p),rank=s.ranks.reduce((sum,lv)=>sum+lv,0);
 const bonuses=runeRules.resonance.filter(b=>rank>=b.ranks);
 const passive=s.passive===null?null:runeRules.passives[s.passive];
 return {rank,bonuses:passive?[...bonuses,passive]:bonuses};
}
export function runeUpgradeCost(rank:number,dust:number){
 const base=runeRules.rankCosts[rank];
 if(!base)return null;
 const used=Math.min(dust,Math.floor((base-1)/runeRules.dustPerScroll));
 return {dust:used,scrolls:base-used*runeRules.dustPerScroll};
}
export const runeMultiplier=(p:Player,skill:number)=>1+runeState(p).ranks[skill*3+p.runes[skill]]*runeRules.upgradeEffect;

type RuneAction={kind:'summon'}|{kind:'rank'|'craft'|'passive';id:number};
export function applyRuneAction(p:Player,action:RuneAction,revision:number,random=Math.random,now=carnivalNow()){
 const s=runeState(p);
 if(s.revision!==revision)return false;
 let spend=0;
 switch(action.kind){
  case 'summon': {
   spend=runeRules.summon;
   if(balanceOf(p,'scroll')<spend)return false;
   rollRune(s,random);
   break;
  }
  case 'rank': {
   const upgrade=runeUpgradeCost(s.ranks[action.id],s.dust);
   if(!upgrade||balanceOf(p,'scroll')<upgrade.scrolls)return false;
   spend=upgrade.scrolls;
   s.dust-=upgrade.dust;
   s.ranks[action.id]++;
   break;
  }
  case 'craft':
   if(s.ranks[action.id]!==0||s.dust<runeRules.unlockDust)return false;
   s.ranks[action.id]=1;
   s.dust-=runeRules.unlockDust;
   break;
  case 'passive': {
   const def=runeRules.passives[action.id];
   if(!def||p.level<def.level||s.passive===action.id)return false;
   s.passive=action.id;
  }
 }
 if(spend){grantSolo(p,'scroll',-spend);bumpCount(p,'solo:scrollSpent',spend);recordSprintSpend(p,'runes',spend,now)}
 s.revision++;
 sagaOf(p).box.runes=s;
 return true;
}

function rollRune(state:RuneSave,random:()=>number){
 const id=Math.min(8,Math.floor(random()*9));
 state.last=id;
 if(state.ranks[id])state.dust+=runeRules.duplicateDust;
 else state.ranks[id]=1;
}
export function grantRuneChest(p:Player,state:RuneSave,random=Math.random){
 const dust=state.dust;
 rollRune(state,random);
 state.revision++;
 sagaOf(p).box.runes=state;
 return {id:state.last!,dust:state.dust-dust};
}
