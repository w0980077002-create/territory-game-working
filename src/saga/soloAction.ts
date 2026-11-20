import type {Player} from '../core/types';
import {useGame} from '../core/store';
import type {Reward} from './rewards';
import {haptic} from '../core/telegram';

export function soloAction(apply:(p:Player)=>boolean,message?:string,reward?:Reward){
 const game=useGame.getState();
 let applied:boolean|undefined;
 const saved=game.mutate(p=>applied=apply(p),true);
 if(!saved&&applied!==false){
  game.notice('Не удалось сохранить · попробуйте ещё раз');
  return false;
 }
 if(!saved)return false;
 haptic(true);
 if(message)game.notice(message,reward);
 return true;
}
