/** One isolated Solo profile per process. Results include only locally earned checkpoints. */
import {writeFileSync,mkdirSync} from 'node:fs';
import {installHeadless,seedRandom} from './bot';
import {freshPlayer,useGame,compareItem} from '../../src/core/store';
import {Battle} from '../../src/game/Battle';
import {stats,xpNeeded} from '../../src/core/formulas';
import {upgradePreview} from '../../src/core/forge';
import {freshWorld} from '../../src/core/world';
import {compareLootEffects} from '../../src/core/lootEffects';
import {craftSet,craftPlan} from '../../src/saga/actions';
import {matCount,materialIds,setIds} from '../../src/saga/gear';
import {shopOffers,shopStatus,shopQuote} from '../../src/saga/shop';
import type {HeroClass,Player} from '../../src/core/types';

const hero=process.argv[2] as HeroClass,seed=Number(process.argv[3]??17),policy=process.argv[4]??'campaign';
if(!['berserker','ranger','runologist'].includes(hero)||!['campaign','developed'].includes(policy))throw Error('Expected class, seed and policy');
const out=process.env.OUT??'.tmp/solo-balance/runs',g=()=>useGame.getState();
installHeadless();
let now=Date.UTC(2026,10,23,10);Date.now=()=>now;
seedRandom(seed);
const initial=freshPlayer();
initial.world=freshWorld(seed);
useGame.setState({p:initial,panel:null,selected:null,back:null,recoveryRequired:false,storageError:false,speed:1,auto:true,stopOnDeath:true,continueOnVictory:true,autoSalvageWeaker:false});
g().setClass(hero);
const b=new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement);
const events:Array<{stage:number;source:string;gold:number;xp?:number}>=[],fights:object[]=[],trophies:object[]=[];
const checkpoints:Record<string,Player>={};
let minimum=1,seconds=0,totalXP=0,reason='',retries=0,potions=0;
const earnedXP=(p:Player)=>p.xp+Array.from({length:p.level-1},(_,i)=>i+1).reduce((sum,level)=>sum+xpNeeded(level),0);
function transact(stage:number,source:string,action:()=>unknown){
 const before=g().p;
 action();
 const after=g().p,gold=after.gold-before.gold,xp=earnedXP(after)-earnedXP(before);
 if(gold||xp)events.push({stage,source,gold,xp});
 totalXP+=xp;
}
function prepare(stage:number,boss:boolean){
 let p=g().p;
 if(boss){
  transact(stage,'chapter',()=>g().claim('mission',p.mission));
  if(!g().p.claimed.includes('wings'))g().claim('wings');
 }
 p=g().p;
 while(p.talents.reduce((sum,n)=>sum+n,0)<p.level-1){
  if(!g().train('talent',p.talents[0]<p.talents[1]*1.5+1?0:1))break;
  p=g().p;
 }
 g().equipBest();
 if(g().p.inventory.length>=76){
  const ids=g().p.inventory.filter(i=>!i.uniqueId&&!i.perk&&!i.set&&!i.locked&&compareItem(i,g().p)<=0).slice(0,10).map(i=>i.id);
  for(const id of ids)transact(stage,'salvage',()=>g().salvage(id));
 }
 if(policy!=='developed'||!boss)return;
 if(stage%10===0||stage===1){
  for(const [type,index] of [['relic',0],['forge',0],['skill',hero==='ranger'?0:2],['companion',1]] as const){
   transact(stage,type,()=>g().train(type,index));
  }
  const weapon=g().p.equipment.weapon;
  if(weapon&&upgradePreview(weapon).cost<=g().p.gold*.25)transact(stage,'sharpen',()=>g().upgrade('weapon'));
  transact(stage,'mine',()=>g().claim('mine'));
  if(stage===20){
   transact(stage,'ship-build',()=>g().shipAction('buy'));
   transact(stage,'ship-upgrade',()=>g().shipAction('upgrade','drakkar-1'));
  }
  if(stage>=20)g().shipAction('claim');
 }
 if(stage%10===8&&stage<=60){
  const set=setIds[Math.floor((stage-1)/10)],plan=craftPlan(set,g().p);
  if(matCount(g().p,plan.material)>=plan.mats&&g().p.gold>=plan.gold)
   transact(stage,'craft',()=>craftSet(set,'extra2'));
  const offer=shopOffers(g().p,now,'belt').find(x=>x.id==='basic-equipment');
  if(offer&&!shopStatus(g().p,offer,now))transact(stage,'shop',()=>g().buy(offer.id,shopQuote(offer),'belt'));
 }
}
b.toggle();
try{
 while(g().p.stage<=63&&seconds<32000){
  const before=g().p,stage=before.stage,wave=before.wave,phase=b.phase,id=b.id,gold=before.gold;
  const types=b.units.some(i=>i.affix);
  now+=50;seconds+=.05;
  b.update(.05,.05);
  let after=g().p;
  if(b.phase==='fight'&&b.intro<=0)minimum=Math.min(minimum,b.hp/b.maxHp);
  const won=after.stage!==stage||after.wave!==wave;
  const lost=b.phase==='defeat'&&phase!=='defeat';
  if(won||lost){
   const minHP=+Math.min(minimum,b.hp/b.maxHp).toFixed(4);
   const xp=earnedXP(after)-earnedXP(before),totalGold=after.gold-gold;
   const kind=wave===5?'boss':wave===4||types?'elite':'normal';
   fights.push({stage,wave,kind,id,won,seconds:+b.combatTime.toFixed(3),minHP,endHP:+(b.hp/b.maxHp).toFixed(4),level:before.level,cp:stats(before).cp,potions});
   if(totalGold||xp)events.push({stage,source:kind,gold:totalGold,xp});
   totalXP+=xp;
   minimum=1;potions=0;
  }
  if(won){
   retries=0;
   if(wave===5&&after.rewardOffer){
    const offer=after.rewardOffer,drop=[...after.inventory,...(after.pendingLoot??[])].find(i=>i.id===offer.itemId)!;
    if(drop){
     const delta=compareItem(drop,after);
     const comparison=compareLootEffects(drop,after);
     const effect=comparison.properties.some(x=>x.change==='Получите');
     const gains=comparison.bonuses.flatMap(x=>x.thresholds.filter(t=>t.gained).map(t=>t.bonus));
     const losses=comparison.bonuses.flatMap(x=>x.thresholds.filter(t=>!t.gained).map(t=>t.bonus));
     const worn=after.equipment[drop.slot];
     trophies.push({stage,delta,rarity:drop.rarity,itemLevel:drop.level,heroLevel:after.level,wornLevel:worn?.level,wornUpgrade:worn?.upgrade,wornRarity:worn?.rarity,effect,gains,losses,drop,worn});
     if(delta>0&&!(worn?.perk||worn?.uniqueId)||effect&&delta>=0)g().equip(drop.id);
     else g().keepReward();
    }else g().keepReward();
   }
   prepare(stage,wave===5);
   if(g().panel)g().open(null);
   if(wave===5&&(stage%10===0||stage>=60||[1,5,13,34,51,59].includes(stage))){
    checkpoints[stage]=structuredClone(g().p);
    write(stage);
   }
  } else if(lost){
   if(++retries>2){reason='three attempts on same fight';break}
   prepare(stage,false);
   b.toggle();
  }
  if(b.director.state==='decide'){
   const event=b.director.ev;
   transact(stage,'world-choice',()=>b.director.choose(event?.options[0]??'pass'));
  }
  after=g().p;
  if(b.phase==='fight'&&b.intro<=0&&b.hp<b.maxHp*.25&&b.hp>0&&b.potionCd<=0&&after.gold>=b.potionCost()){
   const wallet=after.gold;
   transact(stage,'potion',()=>b.heal());
   if(g().p.gold<wallet)potions++;
  }
  if(g().storageError||g().recoveryRequired){reason='storage';break}
  if(!b.running&&b.phase!=='defeat'&&g().panel===null)b.toggle();
 }
 if(!reason&&g().p.stage<=63)reason='engine time limit';
 write(g().p.stage-1);
 if(reason)process.exitCode=1;
}finally{b.destroy()}
function write(cleared:number){
 mkdirSync(out,{recursive:true});
 const p=g().p;
 writeFileSync(out+'/'+[hero,seed,policy].join('-')+'.json',JSON.stringify({
  hero,seed,policy,cleared,reason,seconds,totalXP,speed:g().speed,initialGold:initial.gold,
  gold:p.gold,level:p.level,xp:p.xp,forge:p.forge,redDiamonds:p.redDiamonds,
  mats:Object.fromEntries(materialIds.map(id=>[id,matCount(p,id)])),fights,events,trophies,checkpoints
 }));
 console.log(hero,seed,policy,cleared,p.level,p.gold,reason);
}
