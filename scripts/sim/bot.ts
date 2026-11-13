/** Headless "diligent player" used to tune and regression-test the TEST_ONLY balance curve. */
import {Battle} from '../../src/game/Battle';
import {freshPlayer,useGame,compareItem} from '../../src/core/store';
import {upgradePreview} from '../../src/core/forge';
import {stats} from '../../src/core/formulas';
import type {HeroClass,Slot} from '../../src/core/types';
export function installHeadless(){
 const g=globalThis as Record<string,unknown>;
 if(!g.Image)Object.defineProperty(globalThis,'Image',{value:class {src='';complete=false;naturalWidth=0},configurable:true});
 if(!g.requestAnimationFrame)Object.defineProperty(globalThis,'requestAnimationFrame',{value:()=>1,configurable:true});
 if(!g.cancelAnimationFrame)Object.defineProperty(globalThis,'cancelAnimationFrame',{value:()=>{},configurable:true});
 if(!g.localStorage){const saves=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>saves.get(k)??null,setItem:(k:string,v:string)=>saves.set(k,v),removeItem:(k:string)=>saves.delete(k)},configurable:true})}
}
export interface StageLog {stage:number;level:number;cp:number;defeats:number;waveTime:number;bossTime:number;bossLeft:number;hpLeft:number;gold:number;taken:number}
const G=()=>useGame.getState();
export function manage(spend=.5){
 const g=G();if(g.p.rewardOffer&&!g.p.rewardOffer.resolved){const id=g.p.rewardOffer.itemId,item=[...g.p.inventory,...(g.p.pendingLoot??[])].find(i=>i.id===id);if(item&&compareItem(item,g.p)>0)g.equip(id);else g.keepReward()}
 for(let guard=0;guard<40;guard++){const p=G().p,best=p.inventory.map(i=>({i,d:compareItem(i,p)})).sort((a,b)=>b.d-a.d)[0];if(!best||best.d<=0)break;G().equip(best.i.id)}
 for(const i of [...G().p.inventory])if(!i.locked&&compareItem(i,G().p)<=0)G().salvage(i.id,true);
 if(!G().p.claimed.includes('wings'))G().claim('wings');
 for(let guard=0;guard<200;guard++){
  const p=G().p,budget=p.gold*spend;let done=false;
  const free=p.level-1-p.talents.reduce((a,b)=>a+b,0);if(free>0){G().train('talent',p.talents[0]<=p.talents[1]*1.5?0:1);continue}
  if(100*p.level<=budget){G().train('hero');continue}
  const slots=(Object.keys(p.equipment) as Slot[]).map(s=>({s,plan:upgradePreview(p.equipment[s]!)})).filter(v=>v.plan.cost<=budget*.6).sort((a,b)=>a.plan.cost-b.plan.cost);
  if(slots[0]){G().upgrade(slots[0].s);done=true}
  for(const [type,index,cost] of [['skill',0,120*p.skills[0]],['skill',1,120*p.skills[1]],['skill',2,120*p.skills[2]],['companion',0,120*p.companions[0]],['companion',1,120*p.companions[1]],['relic',0,300*(p.relic+1)],['forge',0,100*p.forge],['blessing',0,150*p.blessing]] as const)if(cost<=G().p.gold*spend*.25){G().train(type,index);done=true}
  if(!done)break;
 }
 while(G().p.horn>0&&G().p.inventory.length<70){G().hornLoot();const id=G().selected;if(!id)break;const item=G().p.inventory.find(i=>i.id===id);if(item&&compareItem(item,G().p)>0)G().equip(id);else if(item)G().salvage(id,true);G().open(null)}
}
/** Plays the campaign from the current save up to `untilStage`. Returns one log row per cleared stage. */
export function playCampaign(heroClass:HeroClass,untilStage:number,opts:{spend?:number;maxSeconds?:number;potions?:boolean}={}):StageLog[]{
 installHeadless();useGame.setState({p:{...freshPlayer(),heroClass},auto:true,panel:null,selected:null,recoveryRequired:false});
 const b=new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement),log:StageLog[]=[];b.toggle();
 let defeats=0,waveTime=0,waves=0,simTime=0,farmLeft=0,taken=0;const limit=opts.maxSeconds??200000;
 while(G().p.stage<untilStage&&simTime<limit){
  const before=G().p,phase=b.phase,boss=b.boss,mode=b.mode,time=b.combatTime,timer=b.timer,stage=before.stage,hpBefore=b.hp;
  b.update(.05);simTime+=.05;if(phase==='fight'&&boss&&mode==='campaign')taken+=Math.max(0,hpBefore-b.hp)/b.maxHp;if(phase==='walk')taken=0;
  if(b.director.state==='decide'){const ev=b.director.ev;b.director.choose(ev?.options[0]??'pass')}
  if(opts.potions!==false&&b.phase==='fight'&&b.hp>0&&b.hp<b.maxHp*.3&&b.potionCd<=0&&G().p.gold>=b.potionCost()*3)b.heal();
  if(phase==='fight'&&b.phase==='victory'){
   if(mode==='campaign'){if(boss)log.push({stage,level:before.level,cp:stats(before).cp,defeats,waveTime:waves?waveTime/waves:0,bossTime:time,bossLeft:timer,hpLeft:b.hp/b.maxHp,gold:before.gold,taken});else{waveTime+=time;waves++}if(boss){defeats=0;waveTime=0;waves=0}}
   else if(mode==='farm'&&--farmLeft<=0){manage(opts.spend);b.startMode('campaign')}
   manage(opts.spend);if(!b.running)b.toggle();
  }
  if(b.phase==='defeat'&&!b.running){defeats++;if(defeats>60)break;manage(opts.spend);farmLeft=3+Math.min(10,defeats*2);b.toggle()}
  if(!b.running&&b.phase!=='defeat'){manage(opts.spend);G().open(null);b.toggle()}
 }
 b.destroy();return log;
}
