import {CompactFilter} from './CompactFilter';
import {useState} from 'react';
import type {CSSProperties} from 'react';
import {useGame} from '../core/store';
import {slots,slotNames,rarityNames,rarityColors} from '../data/catalog';
import type {Slot} from '../core/types';
import type {LootFilter} from '../core/loot';
import balance from '../../config/test-balance.v1.json';
import {DialogShell} from './SagaUI';
import {InventoryGrid} from './InventoryGrid';
import './backpack.css';

const capacity=balance.loot_test_settings.starter_inventory_capacity;
type Help='auto'|'ranks'|null;

export type BackpackView={filter:LootFilter;slot?:Slot;order:string};

export function Backpack({storage,setStorage,view,setView,scrollMemory}:{
 storage:boolean;setStorage:(value:boolean)=>void;view:BackpackView;
 setView:(value:BackpackView)=>void;scrollMemory:Map<string,number>;
}){
 const g=useGame(),p=g.p,{filter,slot,order}=view;
 const [help,setHelp]=useState<Help>(null);
 const used=p.inventory.length,stored=p.pendingLoot?.length??0,full=used>=capacity;
 const toggleHelp=(next:Help)=>setHelp(h=>h===next?null:next);
 return <DialogShell panel="inventory" title="Рюкзак" footer={null} scrollMemory={scrollMemory}>
  <div className="pack-tabs" role="group" aria-label="Место хранения">
   <button aria-pressed={!storage} className={full?'is-full':undefined} onClick={()=>setStorage(false)}>
    Рюкзак <small>{used}/{capacity}</small>
    <i className="pack-meter" aria-hidden="true" style={{'--fill':`${Math.min(100,used/capacity*100)}%`} as CSSProperties}/>
   </button>
   <button aria-pressed={storage} onClick={()=>setStorage(true)}>Склад <small>{stored}</small></button>
  </div>
  {full&&!storage&&<p className="pack-full">Рюкзак полон · новая добыча идёт на склад</p>}
  <div className="pack-filters">
   <CompactFilter label="Тип предмета" value={slot??''} onChange={value=>setView({...view,slot:(value||undefined) as Slot|undefined})} options={[{value:'',label:'Все типы'},...slots.map(s=>({value:s,label:slotNames[s]}))]}/>
   <CompactFilter label="Фильтр качества" value={filter} onChange={value=>setView({...view,filter:value as LootFilter})} options={[{value:'all',label:'Качество'},{value:'better',label:'Сильнее'},{value:'rare',label:'Редкие'},{value:'unique',label:'Именные / сеты'}]}/>
   <CompactFilter label="Сортировка" value={order} onChange={value=>setView({...view,order:value})} options={[{value:'newest',label:'Новые ↓',shortLabel:'Новые'},{value:'power',label:'Сила ↓',shortLabel:'Сила'},{value:'rarity',label:'Редкость ↓',shortLabel:'Редкость'}]}/>
  </div>
  <div className="pack-help-row">
   <label className="pack-auto"><input type="checkbox" checked={g.autoSalvageWeaker} onChange={e=>g.configure({autoSalvageWeaker:e.target.checked})}/><span>Авторазбор<span className="pack-auto-extra"> новой добычи</span></span></label>
   <button type="button" className="pack-help" aria-expanded={help==='auto'} aria-label="Как работает авторазбор" onClick={()=>toggleHelp('auto')}>?</button>
   <button type="button" className="pack-ranks-toggle" aria-expanded={help==='ranks'} onClick={()=>toggleHelp('ranks')}><span className="pack-rank-dots" aria-hidden="true">{rarityColors.map(c=><i key={c} style={{background:c}}/>)}</span>Ранги</button>
  </div>
  {help==='auto'&&<p className="pack-explain">Срабатывает только на <b>новую</b> добычу: слабее надетой вещи того же типа, ниже «Редкого», без усилений и свойств — сразу в золото и опыт. Вещи, которые уже лежат в рюкзаке или сняты с героя, не трогает: для них «Очистить слабые».</p>}
  {help==='ranks'&&<ol className="pack-ranks" aria-label="9 рангов качества, от слабого к сильному">{rarityNames.map((name,n)=><li key={name} style={{'--rarity':rarityColors[n]} as CSSProperties}><i aria-hidden="true"/>{name}</li>)}</ol>}
  <InventoryGrid key={storage?'storage':'backpack'} p={p} filter={filter} slot={slot} order={order} storage={storage} onSelect={g.select} onBulkSalvage={g.bulkSalvage} onClaim={g.claimStored}/>
 </DialogShell>;
}
