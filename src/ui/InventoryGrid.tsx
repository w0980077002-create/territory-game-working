import {useEffect,useState} from 'react';
import type {CSSProperties} from 'react';
import type {Player,Slot} from '../core/types';
import {canBulkSalvage,compareItem} from '../core/store';
import {itemPower} from '../core/formulas';
import {inventoryItems,type LootFilter} from '../core/loot';
import {slotNames,rarityNames,rarityColors} from '../data/catalog';
import {Icon,gearIcon} from './Icon';
import './bulkSalvage.css';

interface Props {
 p:Player;
 filter:LootFilter;
 slot?:Slot;
 order:string;
 onSelect:(id:string)=>void;
 onBulkSalvage:(ids:string[])=>number;
}

/** Selection stays local to this panel; never changes inventory until final confirmation. */
export function InventoryGrid({p,filter,slot,order,onSelect,onBulkSalvage}:Props){
 const [multi,setMulti]=useState(false);
 const [ids,setIds]=useState<string[]>([]);
 const [confirm,setConfirm]=useState(false);
 const visible=inventoryItems(p,filter,slot,order);
 const eligible=visible.filter(i=>canBulkSalvage(p,i));
 const byId=new Map(p.inventory.map(i=>[i.id,i]));
 const chosen=ids.map(id=>byId.get(id)).filter((i):i is NonNullable<typeof i>=>!!i&&canBulkSalvage(p,i));
 const chosenIds=new Set(chosen.map(i=>i.id));
 const gold=chosen.reduce((n,i)=>n+Math.round(itemPower(i)/3),0);
 const xp=chosen.reduce((n,i)=>n+10+i.level*2,0);
 const toggle=(id:string)=>{setIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);setConfirm(false)};
 const cancel=()=>{setMulti(false);setIds([]);setConfirm(false)};
 const selectVisible=()=>{setIds(prev=>[...new Set([...prev,...eligible.map(i=>i.id)])]);setConfirm(false)};
 const execute=()=>{if(!chosen.length)return;const count=onBulkSalvage(chosen.map(i=>i.id));if(count>0)cancel();else setConfirm(false)};
 useEffect(()=>setConfirm(false),[filter,slot,order]);

 return <>
  <div className="bulk-toolbar">
   <button type="button" className={multi?'bulk-mode active':'bulk-mode'} onClick={()=>multi?cancel():setMulti(true)} aria-pressed={multi}>{multi?'Отменить выбор':'☑ Выбрать вещи'}</button>
   {multi&&<>
    <button type="button" className="bulk-secondary" disabled={!eligible.length} onClick={selectVisible}>Отметить доступные</button>
    <button type="button" className="bulk-secondary" disabled={!ids.length} onClick={()=>{setIds([]);setConfirm(false)}}>Снять выбор</button>
   </>}
  </div>
  {multi&&<div className="bulk-status" role="status"><strong>Отмечено: {chosen.length}</strong><span>Можно разобрать обычные вещи без защиты и улучшений. Редкие, именные, комплектные и наградные остаются в рюкзаке.</span></div>}
  <div className="inventory-grid">
   {visible.map(i=>{
    const allowed=canBulkSalvage(p,i);
    const checked=chosenIds.has(i.id);
    const cp=compareItem(i,p);
    return <button key={i.id} type="button"
      className={multi?(checked?'bulk-gear chosen':allowed?'bulk-gear':'bulk-gear protected'):''}
      onClick={()=>multi?allowed&&toggle(i.id):onSelect(i.id)}
      disabled={multi&&!allowed}
      aria-pressed={multi?checked:undefined}
      aria-label={`${i.name} · ${rarityNames[i.rarity]}${multi?(allowed?checked?' · выбрано':' · отметить':' · защищено от массового разбора'):''}`}
      style={{'--rarity':rarityColors[i.rarity]} as CSSProperties}>
      {multi&&<span className="bulk-tick" aria-hidden="true">{allowed?checked?'✓':'□':'🔒'}</span>}
      <Icon name={gearIcon(i.slot)}/>
      <strong>{i.locked?'🔒 ':''}{i.uniqueId||i.perk?'✦ '+i.name:i.set?'◆ '+i.name:slotNames[i.slot]}</strong>
      <small>{rarityNames[i.rarity]} · ур.{i.level} +{i.upgrade}</small>
      <b className={cp>=0?'positive':'negative'}>{cp>=0?'+':''}{cp} CP</b>
     </button>
   })}
  </div>
  {multi&&<div className="bulk-action">
   <div className="bulk-preview"><strong>{chosen.length} вещей</strong><span>+{gold.toLocaleString('ru')} золота · +{xp.toLocaleString('ru')} опыта</span></div>
   {!confirm?<button type="button" className="action" disabled={!chosen.length} onClick={()=>setConfirm(true)}>Распылить выбранное</button>:
    <div className="bulk-confirm" role="alert">
     <strong>Подтвердить разбор {chosen.length} вещей?</strong>
     <p>Эти предметы исчезнут из рюкзака. Вы получите золото и опыт. Действие нельзя отменить.</p>
     <div><button type="button" className="bulk-secondary" onClick={()=>setConfirm(false)}>Назад</button><button type="button" className="action" onClick={execute}>Да, распылить {chosen.length}</button></div>
    </div>}
  </div>}
 </>;
}
