import {stageGold} from '../saga/regions';

export function baseVictoryGold(mode:string,stage:number,boss:boolean):number{
 switch(mode){
  case 'campaign':return stageGold(stage,boss);
  case 'farm':return stageGold(stage,false)*.8;
  case 'arena':return 100;
  case 'dungeon':return 150;
  default:return 0;
 }
}

export function hammerVictoryGold(mode:string,stage:number,boss:boolean,kills:number):number{
 const base=Math.round(baseVictoryGold(mode,stage,boss));
 if(!Number.isSafeInteger(base)||base<=0||!Number.isSafeInteger(kills)||kills<=0)return 0;
 const perKill=Math.min(Math.round(5*1.14**(stage-1)),Math.floor(base/5));
 return Math.min(perKill*kills,Math.floor(base*.4));
}
