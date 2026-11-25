import {Battle} from '../../src/game/Battle';
import {freshPlayer,useGame} from '../../src/core/store';
import {gainExperience} from '../../src/core/experience';
import {freshWorld} from '../../src/core/world';
import {stageXp} from '../../src/saga/regions';
import type {HeroClass} from '../../src/core/types';
import {proofTickSeconds,maxProofTicks,type ProofCommand} from '../../src/game/campaignProof';

const skills={sword:0,call:1,hammer:2} as const;
type HeadlessGlobal='Image'|'requestAnimationFrame'|'cancelAnimationFrame'|'localStorage';

/**
 * Run the same first campaign encounter and its real combat rules without drawing.
 * The disposable starter profile belongs only to this synchronous verification.
 * Never accept a Player, equipment, health, a save, or a victory from the client.
 */
export function firstBossVictory(hero:HeroClass,seed:number,commands:readonly ProofCommand[],startedAt:number){
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
  const player=freshPlayer();
  player.heroClass=hero;
  player.wave=5;
  player.world=freshWorld(seed);
  gainExperience(player,4*stageXp(1,false));
  useGame.setState({p:player,panel:null,selected:null,notice:()=>{},recoveryRequired:false,storageError:false,
   speed:1,auto:true,stopOnDeath:true,continueOnVictory:false,autoSalvageWeaker:false});
  battle=new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement);
  battle.toggle();
  let index=0;
  for(let tick=0;tick<maxProofTicks;tick++){
   while(commands[index]?.[0]===tick){
    const [,move]=commands[index++];
    if(move==='heal')battle.heal();
    else if(move==='auto_on'||move==='auto_off')useGame.setState({auto:move==='auto_on'});
    else battle.skill(skills[move]);
   }
   time+=proofTickSeconds*1000;
   battle.update(proofTickSeconds,proofTickSeconds);
   if(battle.phase==='victory'&&battle.mode==='campaign'&&battle.stage===1&&battle.wave===5
      &&battle.boss&&battle.units.length===1&&battle.units[0].id==='spider_queen'
      &&battle.units[0].hp===0&&useGame.getState().p.stage===2)return tick+1;
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
