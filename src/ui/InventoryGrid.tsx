import {useEffect,useRef,useState} from 'react';
import balance from '../../config/test-balance.v1.json';
const capacity=balance.loot_test_settings.starter_inventory_capacity;
import type {CSSProperties,ReactNode} from 'react';
import type {Item,Player,Slot} from '../core/types';
import {canBulkSalvage,compareItem} from '../core/store';
import {itemPower} from '../core/formulas';
import {uniqueOf} from '../core/gear';
import {inventoryItems,type LootFilter} from '../core/loot';
import {slotNames,rarityNames,rarityColors} from '../data/catalog';
import {Icon,gearIcon} from './Icon';
import './bulkSalvage.css';

interface Props {
 controls?:ReactNode;
 p:Player;
 filter:LootFilter;
 slot?:Slot;
 order:string;
 storage?:boolean;
 onClaim?:(ids?:string[])=>number;
 onSelect:(id:string)=>void;
 onBulkSalvage:(ids:string[])=>number;
}

/** Display only: why canBulkSalvage() refused. The decision itself always stays with canBulkSalvage(). */
export function protectionReason(p:Player,i:Item):{short:string;long:string}{
 // Saves from before Solo 1.1 may still carry locked:true. No lock exists any more: such an item is simply handled one by one.
 if(i.locked)return {short:'Только вручную',long:'только вручную, по одной вещи с подтверждением'};
 if(Object.values(p.equipment).some(x=>x?.id===i.id))return {short:'надето',long:'надето на героя'};
 if(p.rewardOffer?.itemId===i.id)return {short:'трофей',long:'трофей босса ждёт выбора'};
 if(i.slot==='wings')return {short:'крылья',long:'крылья не разбираются массово'};
 if(i.rarity>=3)return {short:rarityNames[i.rarity],long:`${rarityNames[i.rarity]}: от «Редкого» и выше — только вручную`};
 if(i.upgrade>0)return {short:`усил. +${i.upgrade}`,long:`усилено до +${i.upgrade}`};
 if(i.uniqueId||uniqueOf(i))return {short:'именной',long:'именной трофей'};
 if(i.set)return {short:'сет',long:'часть комплекта'};
 if(i.perk||i.engrave||i.percent)return {short:'свойство',long:'есть особое свойство или гравировка'};
 if(i.origin&&/босс|трофей|награда|покупка|boss|trophy|reward|shop/i.test(i.origin))return {short:'награда',long:'награда, трофей или покупка'};
 return {short:'защищено',long:'защищено от массового разбора'};
}

const keyOf=(items:Item[])=>items.map(i=>`${i.id}:${itemPower(i)}:${i.level}`).join('|');
/** Shorter than a deliberate second tap, longer than a double tap. Matches App.tsx. */
const TAP_GUARD_MS=350;

/** Selection stays local to this panel; never changes inventory until final confirmation. */
export function InventoryGrid({p,filter,slot,order,onSelect,onBulkSalvage,storage=false,onClaim,controls}:Props){
 const [multi,setMulti]=useState(false);
 const [ids,setIds]=useState<string[]>([]);
 const [confirm,setConfirm]=useState(false);
 const armed=useRef<string|null>(null),modeAt=useRef(0);
 const source=storage?{...p,inventory:p.pendingLoot??[]}:p;
 const visible=inventoryItems(source,filter,slot,order);
 const eligible=visible.filter(i=>storage||canBulkSalvage(p,i));
 const weaker=storage?[]:eligible.filter(i=>compareItem(i,p)<0);
 // Only items the player can currently see may be destroyed: a filter or slot change drops hidden picks.
 const visibleById=new Map(visible.map(i=>[i.id,i]));
 const chosen=ids.map(id=>visibleById.get(id)).filter((i):i is Item=>!!i&&(storage||canBulkSalvage(p,i)));
 const chosenIds=new Set(chosen.map(i=>i.id));
 const gold=chosen.reduce((n,i)=>n+Math.round(itemPower(i)/3),0);
 const xp=chosen.reduce((n,i)=>n+10+i.level*2,0);
 const guarded=()=>performance.now()-modeAt.current<TAP_GUARD_MS;
 const toggle=(id:string)=>{setIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);setConfirm(false)};
 const cancel=()=>{setMulti(false);setIds([]);setConfirm(false);modeAt.current=performance.now()};
 const selectWeaker=()=>{if(guarded())return;setIds(prev=>[...new Set([...prev,...weaker.map(i=>i.id)])]);setConfirm(false)};
 /** «Очистить слабые»: preselect and show the confirmation. Nothing is removed until «Да, распылить». */
 const cleanWeak=()=>{if(!weaker.length)return;setIds(weaker.map(i=>i.id));setMulti(true);armed.current=keyOf(weaker);setConfirm(true);modeAt.current=performance.now()};
 const execute=()=>{if(!chosen.length)return;const count=storage?(onClaim?.(chosen.map(i=>i.id))??0):onBulkSalvage(chosen.map(i=>i.id));if(count>0)cancel();else setConfirm(false)};
 // Refill/autosave recreates p every 15s. It must not cancel a decision the player is reading.
 const selectionKey=keyOf(chosen);
 useEffect(()=>{setConfirm(armed.current!==null&&armed.current===selectionKey);armed.current=null},[filter,slot,order,selectionKey]);
 const hiddenPicks=ids.length-chosen.length;

 return <>
  <div className="bulk-toolbar">
   {!multi&&controls}
   {!multi&&!storage&&<button type="button" className="bulk-clean" disabled={!weaker.length} onClick={cleanWeak}>{weaker.length?`Очистить слабые · ${weaker.length}`:'Слабых нет'}</button>}
   {multi&&!storage&&<button type="button" className="bulk-secondary" disabled={!weaker.length} onClick={selectWeaker}>Выбрать слабее</button>}
   {multi&&<button type="button" className="bulk-secondary" disabled={!ids.length} onClick={()=>{if(guarded())return;setIds([]);setConfirm(false)}}>Снять выбор</button>}
   {storage&&!multi&&<button className="bulk-secondary" disabled={!p.pendingLoot?.length||p.inventory.length>=capacity} onClick={()=>onClaim?.()}>Забрать доступные</button>}
   <button type="button" className={multi?'bulk-mode active':'bulk-mode'} onClick={()=>{if(multi){if(!guarded())cancel()}else{setMulti(true);modeAt.current=performance.now()}}} aria-pressed={multi}>{multi?'Готово':'☑ Выбрать'}</button>
  </div>
  {multi&&!storage&&<p className="bulk-rules">Отмечаются только простые вещи. <b>Не попадают</b>: от «Редкого» и выше, усиленные, именные, сеты, свойства, награды, крылья и надетое — их можно распылить по одной в карточке.</p>}
  <div className="inventory-grid" role="group" aria-label={storage?"Предметы на хранении":"Предметы в рюкзаке"}>
   {visible.map(i=>{
    const allowed=storage||canBulkSalvage(p,i);
    const checked=chosenIds.has(i.id);
    const cp=compareItem(i,p);
    const reason=multi&&!allowed?protectionReason(p,i):undefined;
    return <button key={i.id} type="button"
      className={multi?(checked?'bulk-gear chosen':allowed?'bulk-gear':'bulk-gear protected'):''}
      onClick={()=>multi?allowed&&toggle(i.id):onSelect(i.id)}
      disabled={multi&&!allowed}
      aria-pressed={multi?checked:undefined}
      aria-label={`${i.name} · ${rarityNames[i.rarity]}${multi?(allowed?checked?' · выбрано':' · отметить':' · '+reason!.long):''}`}
      style={{'--rarity':rarityColors[i.rarity]} as CSSProperties}>
      {multi&&allowed&&<span className="bulk-tick" aria-hidden="true">{checked?'✓':'□'}</span>}
      <Icon name={gearIcon(i.slot)}/>
      <strong>{i.uniqueId||i.perk?'✦ ':i.set?'◆ ':''}{slotNames[i.slot]}</strong>
      {reason?<small className="bulk-reason">{reason.short}</small>:<small>Ур. {i.level}{i.upgrade>0&&<em> +{i.upgrade}</em>}</small>}
      {!multi&&cp>0&&<b className="pack-better" aria-label={`Сильнее на ${cp} CP`}>↑</b>}
     </button>
   })}
  {!visible.length&&<p className="pack-empty">{source.inventory.length?'Нет вещей по выбранным фильтрам':storage?'Всё получено. Хранение пусто':'Ваши трофеи появятся здесь после боя'}</p>}
  </div>
  {multi&&<div className="bulk-action">
   <div className="bulk-preview"><strong>Выбрано: {chosen.length}</strong><span hidden={storage}>+{gold.toLocaleString('ru')} золота · +{xp.toLocaleString('ru')} опыта</span>{hiddenPicks>0&&<small className="bulk-hidden">Скрытые фильтром ({hiddenPicks}) не затрагиваются</small>}</div>
   {storage?<button className="action" disabled={!chosen.length||p.inventory.length>=capacity} onClick={execute}>{p.inventory.length>=capacity?'Рюкзак полон · освободите место':`Получить выбранные · до ${Math.max(0,capacity-p.inventory.length)}`}</button>:!confirm?<button type="button" className="action" disabled={!chosen.length} onClick={()=>setConfirm(true)}>Распылить выбранное</button>:
    <div className="bulk-confirm" role="alert">
     <strong>Распылить {chosen.length} {chosen.length===1?'вещь':chosen.length<5?'вещи':'вещей'}?</strong>
     <p>Отмеченные ✓ исчезнут безвозвратно. Снимите отметку, чтобы оставить вещь.</p>
     <div><button type="button" className="bulk-secondary" onClick={()=>setConfirm(false)}>Назад</button><button type="button" className="action" onClick={execute}>Да, распылить {chosen.length}</button></div>
    </div>}
  </div>}
 </>;
}
