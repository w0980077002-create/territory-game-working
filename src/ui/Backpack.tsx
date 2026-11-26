import {CompactFilter} from './CompactFilter';
import {useEffect,useState} from 'react';
import type {CSSProperties} from 'react';
import {useGame} from '../core/store';
import {slots,slotNames,rarityNames,rarityColors} from '../data/catalog';
import type {Slot} from '../core/types';
import type {LootFilter} from '../core/loot';
import balance from '../../config/test-balance.v1.json';
import {CardDialog,DialogShell} from './SagaUI';
import {Icon} from './Icon';
import {consumables,consumableStacks,consumableStock,type ConsumableId,type ConsumablesQuote} from '../arena/potion';
import {consumablesRequest,signedArena} from '../arena/client';
import {beltSlotOpen,playerBelt,setBeltSlot} from '../arena/belt';
import {BeltSlots} from './BeltSlots';
import './arenaHub.css';
import {InventoryGrid} from './InventoryGrid';
import './backpack.css';

const capacity=balance.loot_test_settings.starter_inventory_capacity;
type Help='auto'|'ranks'|null;

export type BackpackTab='pack'|'storage'|'consumables';
export type BackpackView={filter:LootFilter;slot?:Slot;order:string};

export function Backpack({tab,setTab,view,setView,scrollMemory}:{
 tab:BackpackTab;setTab:(value:BackpackTab)=>void;view:BackpackView;
 setView:(value:BackpackView)=>void;scrollMemory:Map<string,number>;
}){
 const g=useGame(),p=g.p,{filter,slot,order}=view;
 const [item,setItem]=useState<ConsumableId>(),[selectSlot,setSelectSlot]=useState(false),[slotIndex,setSlotIndex]=useState<number>();
 const belt=playerBelt(p),locked=!!p.localArena&&!p.localArena.match.game.result;
 const [help,setHelp]=useState<Help>(null);
 const storage=tab==='storage',showConsumables=tab==='consumables';
 const signed=signedArena();
 const [quote,setQuote]=useState<ConsumablesQuote>(),[unavailable,setUnavailable]=useState(false);
 useEffect(()=>{
  if(!showConsumables||!signed)return;
  let active=true;
  consumablesRequest().then(data=>{if(active){setQuote(data);setUnavailable(false);}})
   .catch(()=>{if(active){setQuote(undefined);setUnavailable(true);}});
  return ()=>{active=false;};
 },[showConsumables,signed]);
 const stacks=consumableStacks(p,quote?.stock);
 const count=(id:ConsumableId)=>consumableStock(p,id)+(quote?.stock[id]??0);
 const equipped=item?belt.indexOf(item):-1;
 const edit=(index:number,id:ConsumableId|null)=>{
  if(g.mutate(save=>!(save.localArena&&!save.localArena.match.game.result)&&setBeltSlot(save,index,id))){
   setItem(undefined);setSelectSlot(false);setSlotIndex(undefined);
  }
 };
 function equip(id:ConsumableId){
  const index=slotIndex??belt.findIndex((entry,index)=>!entry&&beltSlotOpen(index,p.arenaWins));
  if(index===-1)setSelectSlot(true);
  else edit(index,id);
 }
 const used=p.inventory.length,stored=p.pendingLoot?.length??0,full=used>=capacity;
 const toggleHelp=(next:Help)=>setHelp(h=>h===next?null:next);
 return <DialogShell panel="inventory" title="Рюкзак" footer={null} scrollMemory={scrollMemory}>
  <div className="pack-tabs" role="group" aria-label="Место хранения">
   <button aria-pressed={tab==='pack'} className={full?'is-full':undefined} onClick={()=>setTab('pack')}>
    Рюкзак <small>{used}/{capacity}</small>
    <i className="pack-meter" aria-hidden="true" style={{'--fill':`${Math.min(100,used/capacity*100)}%`} as CSSProperties}/>
   </button>
   <button aria-pressed={storage} onClick={()=>setTab('storage')}>Склад <small>{stored}</small></button>
   <button aria-pressed={showConsumables} onClick={()=>setTab('consumables')}>Расходники</button>
  </div>
  {showConsumables?<div className="pack-consumables">
   <section className="vvr-belt-editor" aria-label="Боевой пояс">
    <header><strong>Боевой пояс</strong>{locked&&<small>Комплектация закреплена до конца боя</small>}</header>
    <BeltSlots player={p} locked={locked} count={count} selected={slotIndex} onSlot={(index,id)=>{
     setSlotIndex(current=>!id&&current===index?undefined:index);setSelectSlot(false);setItem(id??undefined);
    }}/>
   </section>
   {stacks.length>0?<ul aria-label="Расходуемые предметы">{stacks.map(entry=><li key={entry.id}>
    <button type="button" aria-label={entry.name+' · '+entry.count} data-equipped={belt.includes(entry.id)} onClick={()=>{setItem(entry.id);setSelectSlot(false)}}>
     <span><Icon name={entry.icon}/><b>×{entry.count}</b></span><strong>{entry.name}</strong>
    </button>
   </li>)}</ul>:!signed||quote?<p className="pack-empty">Расходников пока нет</p>:null}
   {quote&&Object.values(quote.reserved).some(Boolean)&&<small>Зарезервировано для Арены: {Object.values(quote.reserved).reduce((a,b)=>a+b,0)}</small>}
   {signed&&!quote&&<small role="status">{unavailable?'Сетевой запас временно недоступен':'Загружаем запас…'}</small>}
   <button type="button" className="action secondary" onClick={()=>g.open('shop')}>В Лавку</button>
   {item&&<CardDialog title={consumables[item].name} onClose={()=>{setItem(undefined);setSelectSlot(false);setSlotIndex(undefined)}}
    actions={!locked&&(equipped>=0?<button className="action secondary" onClick={()=>edit(equipped,null)}>Снять</button>:
     !selectSlot&&<button className="action" onClick={()=>equip(item)}>На пояс</button>)}>
    <div className="pack-consumable-detail"><Icon name={consumables[item].icon}/><p>{consumables[item].description}</p></div>
    <p>Solo: {consumableStock(p,item)}{quote&&<> · Сетевой бой: {quote.stock[item]??0}</>}</p>
    {quote&&!quote.stock[item]&&consumableStock(p,item)>0&&<p className="hint">Для сетевого боя купите этот предмет за подтверждённое золото в Лавке.</p>}
    {selectSlot&&<><p>Выберите слот для замены</p><BeltSlots player={p} locked={locked} count={count} onSlot={index=>edit(index,item)}/></>}
   </CardDialog>}
  </div>:<>
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
  <InventoryGrid key={storage?'storage':'backpack'} p={p} filter={filter} slot={slot} order={order} storage={storage} onSelect={g.select} onBulkSalvage={g.bulkSalvage} onClaim={g.claimStored}/></>}
 </DialogShell>;
}
