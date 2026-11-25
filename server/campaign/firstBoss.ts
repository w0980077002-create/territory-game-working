import {Battle} from '../../src/game/Battle';
import {freshPlayer,useGame} from '../../src/core/store';
import {gainExperience} from '../../src/core/experience';
import {freshWorld} from '../../src/core/world';
import {stageXp} from '../../src/saga/regions';
import {upgradePreview} from '../../src/core/forge';
import type {HeroClass,Player,Slot} from '../../src/core/types';
import {proofTickSeconds,maxProofTicks,maxWaveProofTicks,type ProofCommand} from '../../src/game/campaignProof';

const skills={sword:0,call:1,hammer:2} as const;
type HeadlessGlobal='Image'|'requestAnimationFrame'|'cancelAnimationFrame'|'localStorage';

/**
 * Run the same first campaign encounter and its real combat rules without drawing.
 * The disposable starter profile belongs only to this synchronous verification.
 * Never accept a Player, equipment, health, a save, or a victory from the client.
 */
export function firstBossVictory(hero:HeroClass,seed:number,commands:readonly ProofCommand[],startedAt:number){
 return replayCampaign(hero,seed,commands,startedAt)?.ticks??null;
}

export function replayCampaign(hero:HeroClass,seed:number,commands:readonly ProofCommand[],startedAt:number,checkpoint?:Player){

 const previous=useGame.getState(),realClock=Date.now,realRandom=Math.random;
 const globals=new Map<HeadlessGlobal,PropertyDescriptor|undefined>();
 const memory=new Map<string,string>();
 const patch=(name:HeadlessGlobal,value:unknown)=>{
  globals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));
  Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});
 };
 let time=startedAt,random=seed|0,battle:Battle|undefined;
 try{
  patch('Image',class {src='';complete=false;naturalWidth=0});
  patch('requestAnimationFrame',()=>0);
  patch('cancelAnimationFrame',()=>{});
  patch('localStorage',{getItem:(key:string)=>memory.get(key)??null,
   setItem:(key:string,value:string)=>{memory.set(key,value);},removeItem:(key:string)=>{memory.delete(key);}});
  Date.now=()=>time;
  Math.random=()=>{
   random=(random+0x6d2b79f5)|0;
   let n=Math.imul(random^random>>>15,1|random);
   n=(n+Math.imul(n^n>>>7,61|n))^n;
   return ((n^n>>>14)>>>0)/4294967296;
  };
  const player=checkpoint?structuredClone(checkpoint):freshPlayer();
  player.heroClass=hero;
  if(!checkpoint){
   player.wave=5;
   player.world=freshWorld(seed);
   gainExperience(player,4*stageXp(1,false));
  }
  const stage=player.stage,wave=player.wave;
  const expectedStage=stage+(wave===5?1:0),expectedWave=wave===5?1:wave+1;
  useGame.setState({p:player,panel:null,selected:null,notice:()=>{},recoveryRequired:false,storageError:false,
   speed:1,auto:true,stopOnDeath:true,continueOnVictory:false,autoSalvageWeaker:false});
  battle=new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement);
  battle.toggle();
  let index=0;
  for(let tick=0;tick<(checkpoint?maxWaveProofTicks:maxProofTicks);tick++){
   while(commands[index]?.[0]===tick){
    const [,move]=commands[index++];
    if(move==='heal')battle.heal();
    else if(move==='auto_on'||move==='auto_off')useGame.setState({auto:move==='auto_on'});
    else battle.skill(skills[move]);
   }
   if(checkpoint&&tick%10===0&&useGame.getState().auto&&battle.phase==='fight'&&battle.hp<battle.maxHp*.48){
    battle.heal();
   }
   time+=proofTickSeconds*1000;
   battle.update(proofTickSeconds,proofTickSeconds);
   if(battle.phase==='victory'&&battle.mode==='campaign'&&battle.stage===stage&&battle.wave===wave
      &&battle.units.length&&battle.units.every(unit=>unit.hp===0)){
    const p=useGame.getState().p;
    if(p.stage!==expectedStage||p.wave!==expectedWave||!checkpoint&&battle.units[0].id!=='spider_queen')return null;
    prepareNextWave(wave===5);
    const next=structuredClone(useGame.getState().p);
    delete next.encounter;
    next.claimed=next.claimed.filter(receipt=>!receipt.startsWith('battle:'));
    return {ticks:tick+1,player:next};
   }
   if(battle.phase==='defeat'||useGame.getState().storageError||!battle.running)return null;
  }
  return null;
 }finally{
  try{battle?.destroy();}finally{
   Date.now=realClock;
   Math.random=realRandom;
   useGame.setState(previous,true);
   for(const [name,descriptor] of globals){
    if(descriptor)Object.defineProperty(globalThis,name,descriptor);
    else Reflect.deleteProperty(globalThis,name);
   }
  }
 }
}

/** The proof hero equips verified drops and buys existing upgrades with
 * campaign gold. None of these changes are written into the user's Solo save. */
function prepareNextWave(boss:boolean){
 const game=useGame.getState;
 if(game().p.rewardOffer&&!game().p.rewardOffer?.resolved)game().keepReward();
 game().equipBest();
 const player=game().p;
 const remaining=player.level-1-player.talents.reduce((total,value)=>total+value,0);
 for(let i=0;i<remaining;i++){
  const [attack,defense]=game().p.talents;
  if(!game().train('talent',attack<defense*1.5+1?0:1))break;
 }
 // Keep each replay checkpoint small and use only loot the engine really issued.
 const current=game().p;
 if(current.inventory.length>15){
  game().bulkSalvage(current.inventory.filter(item=>!item.uniqueId&&!item.perk&&!item.set).map(item=>item.id));
  game().mutate(p=>{p.inventory=p.inventory.slice(-30);p.pendingLoot=p.pendingLoot?.slice(-15);});
 }
 if(!boss)return;
 if(game().p.bosses>game().p.mission)game().claim('mission',game().p.mission);
 if(!game().p.claimed.includes('wings'))game().claim('wings');
 if(game().p.stage%10===0)game().train('relic');
 const reserve=game().p.gold*.2;
 const capped=new Set<string>();
 for(let n=0;n<120;n++){
  const p=game().p;
  const choices:{id:string;cost:number;buy:()=>unknown}[]=[];
  for(const slot of Object.keys(p.equipment) as Slot[]){
   const item=p.equipment[slot];
   if(item&&slot!=='wings')choices.push({id:slot,cost:upgradePreview(item).cost,buy:()=>game().upgrade(slot)});
  }
  for(const [kind,index,value] of [['forge',0,p.forge],['skill',0,p.skills[0]],['skill',2,p.skills[2]],
   ['companion',0,p.companions[0]],['companion',1,p.companions[1]]] as const){
   choices.push({id:kind+index,cost:(kind==='forge'?100:120)*value,buy:()=>game().train(kind,index)});
  }
  choices.sort((a,b)=>a.cost-b.cost);
  const choice=choices.find(option=>!capped.has(option.id)&&option.cost<=p.gold-reserve);
  if(!choice)break;
  choice.buy();
  if(game().p.gold>=p.gold)capped.add(choice.id);
 }
}
