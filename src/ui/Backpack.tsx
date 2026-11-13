import {CompactFilter} from './CompactFilter';
import {Icon} from './Icon';
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
  <div className="pack-capacity"><strong><Icon name="chest"/>{p.inventory.length} / {balance.loot_test_settings.starter_inventory_capacity}</strong><span>На хранении: {p.pendingLoot?.length??0}</span><span className="pack-wallet">{p.gold.toLocaleString('ru')} зол.</span></div>
  <div className="pack-tabs" role="group" aria-label="Место хранения">
   <button aria-pressed={!storage} onClick={()=>setStorage(false)}>Рюкзак <small>{p.inventory.length}</small></button>
   <button aria-pressed={storage} onClick={()=>setStorage(true)}>Хранение <small>{p.pendingLoot?.length??0}</small></button>
  </div>
  <div className="pack-filters">
   <CompactFilter label="Тип предмета" value={slot??''} onChange={value=>setSlot(value as Slot||undefined)} options={[{value:'',label:'Все типы'},...slots.map(s=>({value:s,label:slotNames[s]}))]}/>
   <CompactFilter label="Фильтр качества" value={filter} onChange={value=>setFilter(value as LootFilter)} options={[{value:'all',label:'Качество'},{value:'better',label:'Сильнее'},{value:'rare',label:'Редкие'},{value:'unique',label:'Именные / сеты'},{value:'locked',label:'С замком'}]}/>
   <CompactFilter label="Сортировка" value={order} onChange={setOrder} options={[{value:'newest',label:'Новые ↓',shortLabel:'Новые'},{value:'power',label:'Сила ↓',shortLabel:'Сила'},{value:'rarity',label:'Редкость ↓',shortLabel:'Редкость'}]}/>
  </div>
  <InventoryGrid controls={<label className="pack-auto"><input type="checkbox" checked={g.autoSalvageWeaker} onChange={e=>g.configure({autoSalvageWeaker:e.target.checked})}/><span>Авторазбор слабой новой добычи</span></label>} key={storage?'storage':'backpack'} p={p} filter={filter} slot={slot} order={order} storage={storage} onSelect={g.select} onBulkSalvage={g.bulkSalvage} onClaim={g.claimStored}/>
 </DialogShell>;
}
