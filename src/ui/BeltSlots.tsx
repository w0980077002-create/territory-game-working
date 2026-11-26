import {beltSlotOpen,playerBelt,type BeltSlot} from '../arena/belt';
import {consumables,type ConsumableId} from '../arena/potion';
import type {Player} from '../core/types';
import {Icon} from './Icon';

export function BeltSlots({player,locked,count,selected,onSlot}:{player:Player;locked:boolean;count:(id:ConsumableId)=>number;
 selected?:number|null;onSlot:(index:number,id:BeltSlot)=>void}){
 return <div className="vvr-arena-belt" role="group" aria-label="Слоты пояса">{playerBelt(player).map((id,index)=>{
   const open=beltSlotOpen(index,player.arenaWins);
   return <button type="button" key={index} className={(id?'filled':'empty')+(selected===index?' picking':'')} disabled={locked||!open}
    aria-label={'Слот '+(index+1)+' · '+(!open?'закрыт':id?consumables[id].name+' · '+count(id):'пусто')} aria-pressed={selected===index}
    onClick={()=>onSlot(index,id)}>
    {id?<><Icon name={consumables[id].icon}/><small>{count(id)}</small></>:<span aria-hidden="true">{open?'+':'🔒'}</span>}
   </button>;})}
  </div>;
}

