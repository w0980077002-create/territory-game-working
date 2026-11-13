import {useEffect,useState} from 'react';
import balance from '../../config/test-balance.v1.json';
const capacity=balance.loot_test_settings.starter_inventory_capacity;
import type {CSSProperties,ReactNode} from 'react';
import type {Player,Slot} from '../core/types';
import {canBulkSalvage,compareItem} from '../core/store';
import {itemPower} from '../core/formulas';
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

/** Selection stays local to this panel; never changes inventory until final confirmation. */
export function InventoryGrid({p,filter,slot,order,onSelect,onBulkSalvage,storage=false,onClaim,controls}:Props){
 const [multi,setMulti]=useState(false);
 const [ids,setIds]=useState<string[]>([]);
 const [confirm,setConfirm]=useState(false);
 const source=storage?{...p,inventory:p.pendingLoot??[]}:p;
 const visible=inventoryItems(source,filter,slot,order);
 const eligible=visible.filter(i=>storage||canBulkSalvage(p,i));
 const byId=new Map(source.inventory.map(i=>[i.id,i]));
 const chosen=ids.map(id=>byId.get(id)).filter((i):i is NonNullable<typeof i>=>!!i&&(storage||canBulkSalvage(p,i)));
 const chosenIds=new Set(chosen.map(i=>i.id));
 const gold=chosen.reduce((n,i)=>n+Math.round(itemPower(i)/3),0);
 const xp=chosen.reduce((n,i)=>n+10+i.level*2,0);
 const toggle=(id:string)=>{setIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);setConfirm(false)};
 const cancel=()=>{setMulti(false);setIds([]);setConfirm(false)};
 const selectWeaker=()=>{setIds(prev=>[...new Set([...prev,...eligible.filter(i=>compareItem(i,p)<0).map(i=>i.id)])]);setConfirm(false)};
 const execute=()=>{if(!chosen.length)return;const count=storage?(onClaim?.(chosen.map(i=>i.id))??0):onBulkSalvage(chosen.map(i=>i.id));if(count>0)cancel();else setConfirm(false)};
 useEffect(()=>setConfirm(false),[filter,slot,order,p]);

 return <>
  <div className="bulk-toolbar">
   {!multi&&controls}
   <button type="button" className={multi?'bulk-mode active':'bulk-mode'} onClick={()=>multi?cancel():setMulti(true)} aria-pressed={multi}>{multi?'Готово':'☑ Выбрать'}</button>
   {storage&&!multi&&<button className="bulk-secondary" disabled={!p.pendingLoot?.length||p.inventory.length>=capacity} onClick={()=>onClaim?.()}>Забрать доступные</button>}
   {multi&&<>
    <button type="button" className="bulk-secondary" hidden={storage} disabled={!eligible.some(i=>compareItem(i,p)<0)} onClick={selectWeaker}>Выбрать слабее</button>
    <button type="button" className="bulk-secondary" disabled={!ids.length} onClick={()=>{setIds([]);setConfirm(false)}}>Снять выбор</button>
   </>}
  </div>
  <div className="inventory-grid" role="group" aria-label={storage?"Предметы на хранении":"Предметы в рюкзаке"}>
   {visible.map(i=>{
    const allowed=storage||canBulkSalvage(p,i);
    const checked=chosenIds.has(i.id);
    const cp=compareItem(i,p);
    return <button key={i.id} type="button"
      className={multi?(checked?'bulk-gear chosen':allowed?'bulk-gear':'bulk-gear protected'):''}
      onClick={()=>multi?allowed&&toggle(i.id):onSelect(i.id)}
      disabled={multi&&!allowed}
      aria-pressed={multi?checked:undefined}
      aria-label={`${i.name} · ${rarityNames[i.rarity]}${multi?(allowed?checked?' · выбрано':' · отметить':' · защищено от массового разбора'):''}`}
      style={{'--rarity':rarityColors[i.rarity]} as CSSProperties}>
      {(multi||i.locked)&&<span className="bulk-tick" aria-hidden="true">{multi&&checked?'✓':i.locked?'🔒':allowed?'□':'🔒'}</span>}
      <Icon name={gearIcon(i.slot)}/>
      <strong>{i.uniqueId||i.perk?'✦ ':i.set?'◆ ':''}{slotNames[i.slot]}</strong>
      <small>Ур. {i.level}{i.upgrade>0&&<em> +{i.upgrade}</em>}</small>
      {!multi&&cp>0&&<b className="pack-better" aria-label={`Сильнее на ${cp} CP`}>↑</b>}
     </button>
   })}
  {!visible.length&&<p className="pack-empty">{source.inventory.length?'Нет вещей по выбранным фильтрам':storage?'Всё получено. Хранение пусто':'Ваши трофеи появятся здесь после боя'}</p>}
  </div>
  {multi&&<div className="bulk-action">
   <div className="bulk-preview"><strong>Выбрано: {chosen.length}</strong><span hidden={storage}>+{gold.toLocaleString('ru')} золота · +{xp.toLocaleString('ru')} опыта</span></div>
   {storage?<button className="action" disabled={!chosen.length||p.inventory.length>=capacity} onClick={execute}>Получить выбранные · до {Math.max(0,capacity-p.inventory.length)}</button>:!confirm?<button type="button" className="action" disabled={!chosen.length} onClick={()=>setConfirm(true)}>Распылить выбранное</button>:
    <div className="bulk-confirm" role="alert">
     <strong>Подтвердить разбор {chosen.length} вещей?</strong>
     <p>+{gold.toLocaleString('ru')} золота · +{xp.toLocaleString('ru')} опыта. Предметы исчезнут безвозвратно.</p>
     <div><button type="button" className="bulk-secondary" onClick={()=>setConfirm(false)}>Назад</button><button type="button" className="action" onClick={execute}>Да, распылить {chosen.length}</button></div>
    </div>}
  </div>}
 </>;
}
