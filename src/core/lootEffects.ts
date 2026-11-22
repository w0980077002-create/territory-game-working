import type {Item,Player} from './types';
import {effectText,uniqueOf} from './gear';
import {perkOf,setOf,setCounts,sets} from '../saga/gear';

function effects(item?:Item){
 const unique=uniqueOf(item),perk=perkOf(item);
 return [
  ...(unique?[{id:'unique:'+unique.effect,tag:unique.tag,text:effectText(unique.effect)}]:[]),
  ...(perk?[{id:'perk:'+item?.perk,tag:perk.tag,text:perk.text}]:[]),
 ];
}

export function compareLootEffects(item:Item,p:Player){
 const old=p.equipment[item.slot],before=effects(old),after=effects(item);
 const properties=[
  ...after.map(effect=>({...effect,change:before.some(entry=>entry.id===effect.id)?'Сохраняется':'Получите'})),
  ...before.filter(effect=>!after.some(entry=>entry.id===effect.id)).map(effect=>({...effect,change:'Потеряете'})),
 ];
 const oldSet=setOf(old),newSet=setOf(item),counts=setCounts(p);
 const bonuses=Object.entries(sets).flatMap(([id,def])=>{
  if(id!==oldSet&&id!==newSet)return [];
  const from=counts[id],to=from-Number(id===oldSet)+Number(id===newSet);
  const thresholds=def.bonuses.flatMap((bonus,i)=>{
   const pieces=2*(i+1);
   return (from>=pieces)===(to>=pieces)?[]:[{pieces,bonus,gained:to>=pieces}];
  });
  return [{id,name:def.name,from,to,thresholds}];
 });
 return {properties,bonuses};
}
