/** Fixed, deliberately mixed equipment. No perfect sets, engravings, purchases or rare-drop assumptions.
 * Levels interpolate the owner's lv8@13 and lv18@34 checkpoints. This is a test fixture,
 * never enemy scaling against the actual player: upgrades must make fights easier.
 */
import {installHeadless,seedRandom,restoreRandom} from './bot';
import {freshPlayer,makeItem,useGame} from '../../src/core/store';
import {slots} from '../../src/data/catalog';
import {stats} from '../../src/core/formulas';
import {upgradePreview} from '../../src/core/forge';
import {chooseSpec} from '../../src/saga/specs';
import {newJourney,projectX} from '../../src/game/Journey';
import {freshWorld} from '../../src/core/world';
import {Battle} from '../../src/game/Battle';
import type {HeroClass} from '../../src/core/types';
export type Preparation='mixed'|'prepared'|'neglected';
export function referencePlayer(stage:number,heroClass:HeroClass,preparation:Preparation='mixed',variant=0){
 const p=freshPlayer(),prepared=preparation==='prepared',neglected=preparation==='neglected';
 p.stage=stage;p.level=Math.max(1,Math.round(1+stage*.5));p.heroClass=heroClass;
 p.gold=5000;p.claimed=['wings'];p.skills=[0,1,2].map(i=>1+Math.floor(stage/(prepared?7:12))+(i===2&&prepared?1:0));
 p.companions=[1+Math.floor(stage/12),1+Math.floor(stage/12)];
 const points=Math.floor((p.level-1)*(neglected?.35:prepared?1:.75));p.talents=[Math.ceil(points*.55),Math.floor(points*.45),0];
 p.relic=Math.floor(stage/15);p.runes=variant?[1,1,1]:[0,0,0];chooseSpec(p,variant);
 p.equipment=Object.fromEntries(slots.map((slot,i)=>{
  let item=makeItem(slot,Math.max(1,p.level-(i%3)),slot==='wings'?3:neglected?1:2+(i%4===0?1:0));
  const upgrades=neglected?0:prepared?2+Math.floor(stage/15):Math.floor(stage/20);
  for(let n=0;n<upgrades;n++)item=upgradePreview(item).next;
  return [slot,item];
 }));return p;
}
export function fight(stage:number,wave:number,heroClass:HeroClass,preparation:Preparation='mixed',variant=0,seed=1,mode='campaign'){
 installHeadless();seedRandom(seed);const p=referencePlayer(stage,heroClass,preparation,variant);p.wave=wave;p.world=freshWorld(seed);
 useGame.setState({p,auto:false,panel:null,selected:null,recoveryRequired:false});
 const b=new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement);if(mode!=='campaign'){b.mode=mode;b.spawn();}b.toggle();b.journey=newJourney(stage,wave,true);b.heroX=projectX(b.journey.worldX,b.journey.cameraX);b.phase='fight';b.intro=0;b.placeEncounter();
 let taken=0,maxHit=0,time=0,casts=0,potions=0;
 const take=b.takeDamage.bind(b);b.takeDamage=(...args:Parameters<Battle['takeDamage']>)=>{const before=b.hp;take(...args);const lost=Math.max(0,before-b.hp);taken+=lost;maxHit=Math.max(maxHit,lost)};
 const raw=b.rawDamage.bind(b);b.rawDamage=(...args:Parameters<Battle['rawDamage']>)=>{const before=b.hp,r=raw(...args),lost=Math.max(0,before-b.hp);taken+=lost;maxHit=Math.max(maxHit,lost);return r};
 try{
  while(b.phase==='fight'&&time<100){b.update(.05);time+=.05;
   // Human cadence: one input every 1.7 seconds, cooldown order, no wind-up oracle.
   if(Math.floor(time/1.7)!==casts){casts=Math.floor(time/1.7);const index=b.cooldowns.findIndex(v=>v<=0);if(index>=0)b.skill(index)}
   if(preparation==='prepared'&&potions<1&&b.hp>0&&b.hp<b.maxHp*.35){b.heal();potions++}
  }
  return {stage:b.stage,wave:b.wave,boss:b.boss,mode:b.mode,heroClass,preparation,variant,win:b.snapshot().phase==='victory',seconds:+time.toFixed(2),taken:+(taken/b.maxHp).toFixed(3),maxHit:+(maxHit/b.maxHp).toFixed(3),hpLeft:+(b.hp/b.maxHp).toFixed(3),hp:b.maxHp,attack:stats(p).attack};
 }finally{b.destroy();restoreRandom()}
}
