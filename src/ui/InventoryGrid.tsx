import {useEffect,useRef,useState} from 'react';
import type {CSSProperties,ReactNode} from 'react';
import balance from '../../config/test-balance.v1.json';
import type {Player,Slot} from '../core/types';
import {bulkSalvageRestriction,canBulkSalvage,compareItem,previewBulkSalvage,salvageProtection} from '../core/store';
import {inventoryItems,type LootFilter} from '../core/loot';
import {slotNames,rarityNames,rarityColors} from '../data/catalog';
import {Icon,gearIcon} from './Icon';
import {CardDialog} from './SagaUI';
import './bulkSalvage.css';

const capacity=balance.loot_test_settings.starter_inventory_capacity;
const TAP_GUARD_MS=350;

interface Props {
 controls?:ReactNode;
 p:Player;
 filter:LootFilter;
 slot?:Slot;
 order:string;
 storage?:boolean;
 onClaim?:(ids?:string[])=>number;
 onSelect:(id:string)=>void;
 onBulkSalvage:(ids:readonly string[],quote:string)=>number;
}
type Mode='salvage'|'transfer'|null;

export function InventoryGrid({p,filter,slot,order,onSelect,onBulkSalvage,storage=false,onClaim,controls}:Props){
 const [mode,setMode]=useState<Mode>(null);
 const [ids,setIds]=useState<string[]>([]);
 const [confirmation,setConfirmation]=useState<string|null>(null);
 const [savedCount,setSavedCount]=useState(0);
 const armedAt=useRef(0);
 const source=storage?{...p,inventory:p.pendingLoot??[]}:p;
 const visible=inventoryItems(source,filter,slot,order);
 const eligible=mode==='transfer'?visible:visible.filter(item=>canBulkSalvage(p,item));
 const eligibleIds=new Set(eligible.map(item=>item.id));
 const chosen=ids.filter(id=>eligibleIds.has(id));
 const selected=new Set(chosen);
 const plan=mode==='salvage'?previewBulkSalvage(p,chosen):null;
 const weaker=storage?[]:eligible.filter(item=>!salvageProtection(p,item)&&compareItem(item,p)<0);
 const room=capacity-p.inventory.length;

 // Keep still-visible selections, and permanently drop picks that a filter hides.
 const selectionKey=JSON.stringify(chosen);
 useEffect(()=>{
  const visibleSelection=JSON.parse(selectionKey) as string[];
  setIds(previous=>previous.length===visibleSelection.length?previous:visibleSelection);
 },[selectionKey]);
 useEffect(()=>{
  if(!savedCount)return;
  // Keep the modal over the grid until the second half of a double tap has passed.
  const timer=window.setTimeout(()=>{setSavedCount(0);setMode(null);setIds([]);setConfirmation(null)},TAP_GUARD_MS);
  return ()=>clearTimeout(timer);
 },[savedCount]);
 const reset=(next:Mode=null)=>{setMode(next);setIds([]);setConfirmation(null)};
 const arm=(quote:string)=>{armedAt.current=performance.now();setConfirmation(quote)};
 const toggle=(id:string)=>setIds(previous=>previous.includes(id)?previous.filter(value=>value!==id):[...previous,id]);
 const cleanWeak=()=>{
  const weakIds=weaker.map(item=>item.id),preview=previewBulkSalvage(p,weakIds);
  if(!preview)return;
  setMode('salvage');setIds(weakIds);arm(preview.quote);
 };
 const confirm=()=>{
  if(!plan||performance.now()-armedAt.current<TAP_GUARD_MS)return;
  if(confirmation!==plan.quote){arm(plan.quote);return}
  const count=onBulkSalvage(chosen,plan.quote);
  if(count>0)setSavedCount(count);
 };
 const visibleCount=source.inventory.length;
 const changed=confirmation!==plan?.quote;
 const valuable=plan?.entries.filter(entry=>entry.warning).length??0;
 return <>
  <div className="bulk-toolbar">
   {!mode&&controls}
   {!mode&&!storage&&<button type="button" className="bulk-clean" disabled={!weaker.length} onClick={cleanWeak}>
    {weaker.length?`Очистить слабые · ${weaker.length}`:'Слабых нет'}
   </button>}
   {!mode&&storage&&<button type="button" className="bulk-mode" disabled={!visible.length} onClick={()=>reset('transfer')}>Забрать</button>}
   {!mode&&<button type="button" className="bulk-mode" disabled={!eligible.length} onClick={()=>reset('salvage')}>
    {storage?'Распылить':'Выбрать'}
   </button>}
   {mode&&<>
    <button type="button" disabled={!eligible.length} onClick={()=>setIds(eligible.map(item=>item.id))}>Выбрать всё</button>
    <button type="button" disabled={!chosen.length} onClick={()=>setIds([])}>Снять выбор</button>
    <button type="button" onClick={()=>reset()}>Готово</button>
   </>}
  </div>
  <div className="inventory-grid" role="group" aria-label={storage?'Предметы на хранении':'Предметы в рюкзаке'}>
   {visible.map(item=>{
    const checked=selected.has(item.id),allowed=eligibleIds.has(item.id);
    const cp=mode?0:compareItem(item,p);
    const reason=mode==='salvage'&&!allowed?bulkSalvageRestriction(p,item):undefined;
    return <button key={item.id} type="button" className={mode?(checked?'bulk-gear chosen':allowed?'bulk-gear':'bulk-gear protected'):''}
      onClick={()=>mode?allowed&&toggle(item.id):onSelect(item.id)} disabled={!!mode&&!allowed}
      aria-pressed={mode?checked:undefined}
      aria-label={`${item.name} · ${rarityNames[item.rarity]}${mode?(allowed?checked?' · выбрано':' · отметить':' · '+reason):''}`}
      style={{'--rarity':rarityColors[item.rarity]} as CSSProperties}>
      {mode&&allowed&&<span className="bulk-tick" aria-hidden="true">{checked?'✓':'□'}</span>}
      <Icon name={gearIcon(item.slot,item)}/>
      <strong>{item.uniqueId||item.perk?'✦ ':item.set?'◆ ':''}{slotNames[item.slot]}</strong>
      {reason?<small className="bulk-reason" title={reason}>{item.perk==='duskwings'?'Единственные крылья':'Решите судьбу награды'}</small>
       :<small>Ур. {item.level}{item.upgrade>0&&<em> +{item.upgrade}</em>}</small>}
      {cp>0&&<b className="pack-better" aria-label={`Сильнее на ${cp} CP`}>↑</b>}
     </button>;
   })}
   {!visible.length&&<p className="pack-empty">{visibleCount?'Нет вещей по выбранным фильтрам':storage?'Склад пуст':'Ваши трофеи появятся здесь после боя'}</p>}
  </div>
  {mode&&<div className="bulk-action">
   <div className="bulk-preview"><strong>Выбрано: {chosen.length}</strong>
    {plan&&<span>+{plan.gold.toLocaleString('ru')} золота · +{plan.xp.toLocaleString('ru')} опыта</span>}
    {mode==='salvage'&&chosen.length>0&&!plan&&<small>Оставьте хотя бы один экземпляр Крыльев Сумрака.</small>}
   </div>
   {mode==='transfer'?<button type="button" className="action" disabled={!chosen.length||room<=0}
     onClick={()=>{if((onClaim?.(chosen)??0)>0)reset()}}>
      {room<=0?'Рюкзак полон':`Забрать ${Math.min(chosen.length,room)}`}
     </button>:<button type="button" className="action" disabled={!plan} onClick={()=>{if(plan)arm(plan.quote)}}>Распылить {chosen.length}</button>}
  </div>}
  {confirmation&&<CardDialog className="bulk-confirm" title={savedCount?`Распылено вещей · ${savedCount}`:`Распылить выбранные вещи · ${chosen.length}`} onClose={()=>{if(!savedCount)setConfirmation(null)}}
    actions={savedCount?undefined:<><button type="button" className="action secondary" onClick={()=>setConfirmation(null)}>Назад</button>
     <button type="button" className="action" disabled={!plan} onClick={confirm}>
      {changed?'Обновить подтверждение':`Да, распылить ${chosen.length}`}
     </button></>}>
    {savedCount?null:plan?<>
      <p className="bulk-confirm-reward"><Icon name="coins"/>+{plan.gold.toLocaleString('ru')} золота <Icon name="star"/>+{plan.xp.toLocaleString('ru')} опыта</p>
      {valuable>0&&<p className="bulk-confirm-warn" role="status">Ценных вещей: {valuable}. Распылённые вещи исчезнут.</p>}
      <div className="bulk-confirm-strip" aria-hidden="true">
       {plan.entries.slice(0,7).map(({item})=><span key={item.id} style={{'--rarity':rarityColors[item.rarity]} as CSSProperties}><Icon name={gearIcon(item.slot,item)}/></span>)}
       {plan.entries.length>7&&<b>+{plan.entries.length-7}</b>}
      </div>
      <details className="bulk-confirm-list">
       <summary>Показать все выбранные · {plan.entries.length}</summary>
       <ul className="bulk-confirm-items" aria-label="Выбранные вещи">
        {plan.entries.map(({item,warning})=><li key={item.id}>{item.name} · ур. {item.level}{warning&&<small> · {warning}</small>}</li>)}
       </ul>
      </details></>:<p>Выбор изменился. Вернитесь к списку вещей.</p>}
  </CardDialog>}
 </>;
}
