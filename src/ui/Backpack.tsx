import {useState} from 'react';
import {useGame} from '../core/store';
import {slots,slotNames} from '../data/catalog';
import type {Slot} from '../core/types';
import type {LootFilter} from '../core/loot';
import balance from '../../config/test-balance.v1.json';
import {DialogShell} from './SagaUI';
import {InventoryGrid} from './InventoryGrid';
import './backpack.css';

export function Backpack({storage,setStorage}:{storage:boolean;setStorage:(value:boolean)=>void}){
 const g=useGame(),p=g.p;
 const [filter,setFilter]=useState<LootFilter>('all');
 const [slot,setSlot]=useState<Slot|undefined>(),[order,setOrder]=useState('newest');
 return <DialogShell panel="inventory" title="Рюкзак" footer={null}>
  <div className="pack-capacity"><strong>{p.inventory.length}/{balance.loot_test_settings.starter_inventory_capacity}</strong><span>Хранение: {p.pendingLoot?.length??0}</span><span className="pack-wallet">{p.gold.toLocaleString('ru')} зол.</span></div>
  <div className="pack-tabs" role="tablist" aria-label="Место хранения">
   <button role="tab" aria-selected={!storage} onClick={()=>setStorage(false)}>Рюкзак <small>{p.inventory.length}</small></button>
   <button role="tab" aria-selected={storage} onClick={()=>setStorage(true)}>Хранение <small>{p.pendingLoot?.length??0}</small></button>
  </div>
  <div className="pack-filters">
   <select aria-label="Тип предмета" value={slot??''} onChange={e=>setSlot(e.target.value as Slot||undefined)}><option value="">Все типы</option>{slots.map(s=><option key={s} value={s}>{slotNames[s]}</option>)}</select>
   <select aria-label="Фильтр качества" value={filter} onChange={e=>setFilter(e.target.value as LootFilter)}><option value="all">Всё качество</option><option value="better">Сильнее</option><option value="rare">Редкие</option><option value="unique">Именные / сеты</option><option value="locked">С замком</option></select>
   <select aria-label="Сортировка" value={order} onChange={e=>setOrder(e.target.value)}><option value="newest">Новые ↓</option><option value="power">Сила ↓</option><option value="rarity">Редкость ↓</option></select>
  </div>
  <InventoryGrid key={storage?'storage':'backpack'} p={p} filter={filter} slot={slot} order={order} storage={storage} onSelect={g.select} onBulkSalvage={g.bulkSalvage} onClaim={g.claimStored}/>
 </DialogShell>;
}
