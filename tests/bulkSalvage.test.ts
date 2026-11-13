import {beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {canBulkSalvage,freshPlayer,makeItem,parseSave,SAVE_KEY,useGame} from '../src/core/store';
import {itemPower} from '../src/core/formulas';
import type {Item} from '../src/core/types';

const storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
 getItem:(key:string)=>storage.get(key)??null,
 setItem:(key:string,value:string)=>{storage.set(key,value)},
 removeItem:(key:string)=>storage.delete(key)
}});

beforeEach(()=>{
 storage.clear();
 useGame.setState({p:freshPlayer(),panel:null,selected:null,recoveryRequired:false,storageError:false});
});

test('manual bulk salvage selects existing ordinary items and pays exactly once',()=>{
 const a=makeItem('weapon',1,0),b=makeItem('helmet',2,1);
 const g=useGame.getState();
 g.mutate(p=>{p.inventory.push(a,b)});
 const before=useGame.getState().p;
 const paid=Math.round(itemPower(a)/3)+Math.round(itemPower(b)/3);
 assert.equal(canBulkSalvage(before,a),true);
 assert.equal(canBulkSalvage(before,b),true);
 assert.equal(useGame.getState().bulkSalvage([a.id,b.id,a.id,'missing']),2);
 const after=useGame.getState().p;
 assert.equal(after.inventory.length,0);
 assert.equal(after.gold,before.gold+paid);
 assert.equal(after.xp,before.xp+(10+a.level*2)+(10+b.level*2));
 assert.equal(useGame.getState().bulkSalvage([a.id,b.id]),0);
 assert.equal(useGame.getState().p.gold,after.gold);
 assert.ok(storage.has(SAVE_KEY+':before-bulk-salvage'));
 assert.ok(parseSave(storage.get(SAVE_KEY)??null));
});

test('rare, upgraded, named, set, purchased, locked and rewarded gear cannot be selected',()=>{
 const base=makeItem('weapon',1,0);
 const items:Item[]=[
  {...base,id:'locked',locked:true},
  {...base,id:'rare',rarity:3},
  {...base,id:'upgraded',upgrade:2},
  {...base,id:'named',uniqueId:'ice_silk'},
  {...base,id:'set',set:'frost'},
  {...base,id:'perk',perk:'flame'},
  {...base,id:'engrave',engrave:'might'},
  {...base,id:'percent',percent:{hp:5,attack:5,defense:5}},
  {...base,id:'reward',origin:'Награда босса'},
  {...base,id:'shop',origin:'Покупка'},
  {...base,id:'wings',slot:'wings'}
 ];
 const ordinary={...base,id:'ordinary'};
 const g=useGame.getState();
 g.mutate(p=>{p.inventory.push(...items,ordinary);p.pendingLoot=[{...base,id:'pending'}]});
 for(const i of items)assert.equal(canBulkSalvage(useGame.getState().p,i),false,i.id);
 assert.equal(canBulkSalvage(useGame.getState().p,{...base,id:'pending'}),false);
 assert.equal(useGame.getState().bulkSalvage([...items.map(i=>i.id),ordinary.id,'pending']),1);
 const p=useGame.getState().p;
 for(const i of items)assert.ok(p.inventory.some(x=>x.id===i.id),i.id);
 assert.ok(p.pendingLoot?.some(i=>i.id==='pending'));
 assert.equal(p.inventory.some(i=>i.id==='ordinary'),false);
});

test('no-op and recovery mode do not mutate the backpack',()=>{
 const item=makeItem('armor',1,0),g=useGame.getState();
 g.mutate(p=>{p.inventory.push(item);p.rewardOffer={itemId:item.id,encounterId:'boss',resolved:false}});
 assert.equal(canBulkSalvage(useGame.getState().p,item),false);
 assert.equal(useGame.getState().bulkSalvage([item.id]),0);
 useGame.setState({recoveryRequired:true});
 assert.equal(useGame.getState().bulkSalvage([item.id]),0);
 assert.ok(useGame.getState().p.inventory.some(i=>i.id===item.id));
});
