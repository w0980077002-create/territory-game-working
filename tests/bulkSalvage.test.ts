import {beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {bulkSalvageRestriction,canBulkSalvage,freshPlayer,makeItem,makePerkItem,parseSave,previewBulkSalvage,SAVE_KEY,useGame} from '../src/core/store';
import {itemPower} from '../src/core/formulas';
import type {Item} from '../src/core/types';

const storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
 getItem:(key:string)=>storage.get(key)??null,
 setItem:(key:string,value:string)=>{storage.set(key,value)},
 removeItem:(key:string)=>storage.delete(key)
}});
const game=useGame.getState;
beforeEach(()=>{
 storage.clear();
 useGame.setState({p:freshPlayer(),panel:null,selected:null,recoveryRequired:false,storageError:false});
});

test('mixed select from backpack and storage pays the exact approved reward once',()=>{
 const base=makeItem('weapon',1,0);
 const items:Item[]=[
  {...base,id:'legacy',locked:true},
  {...base,id:'rare',rarity:3},
  {...base,id:'upgraded',upgrade:2},
  {...base,id:'named',uniqueId:'ice_silk'},
  {...base,id:'set',set:'frost'},
  {...base,id:'perk',perk:'belt'},
  {...base,id:'engrave',engrave:'might'},
  {...base,id:'percent',percent:{hp:5,attack:5,defense:5}},
  {...base,id:'reward',origin:'Награда босса'},
  {...base,id:'shop',origin:'Покупка'},
  {...base,id:'wings',slot:'wings'}
 ];
 game().mutate(p=>{p.inventory.push(...items.slice(0,5));p.pendingLoot=items.slice(5)});
 const before=game().p,ids=items.map(item=>item.id);
 for(const item of items)assert.equal(canBulkSalvage(before,item),true,item.id);
 const plan=previewBulkSalvage(before,[...ids,ids[0]])!;
 assert.equal(plan.entries.length,items.length);
 assert.equal(plan.entries[0].warning,undefined);
 assert.ok(plan.entries.slice(1).every(entry=>entry.warning));
 assert.equal(plan.gold,items.reduce((sum,item)=>sum+Math.round(itemPower(item)/3),0));
 assert.equal(game().bulkSalvage(ids),0,'a quote is required');
 assert.equal(game().bulkSalvage([...ids,'missing'],plan.quote),0,'a missing pick cancels the whole batch');
 assert.deepEqual(game().p,before);
 assert.equal(game().bulkSalvage(ids,plan.quote),items.length);
 const after=parseSave(storage.get(SAVE_KEY)!,true)!;
 assert.deepEqual(after.inventory,[]);
 assert.deepEqual(after.pendingLoot,[]);
 assert.deepEqual(after.equipment,before.equipment);
 assert.equal(after.gold,before.gold+plan.gold);
 assert.equal(game().bulkSalvage(ids,plan.quote),0);
 assert.equal(game().p.gold,after.gold);
 const backup=parseSave(storage.get(SAVE_KEY+':before-bulk-salvage')!,true)!;
 assert.equal(backup.inventory[0].locked,true);
 assert.deepEqual(backup.pendingLoot,before.pendingLoot);
});

test('a changed quote, moved item, equipped item or active offer cannot be silently salvaged',()=>{
 const item=makeItem('armor',1,0),another=makeItem('helmet',2,0);
 game().mutate(p=>{p.inventory.push(item,another)});
 const ids=[item.id,another.id],plan=previewBulkSalvage(game().p,ids)!;
 game().mutate(p=>{p.inventory[0].upgrade++});
 assert.equal(game().bulkSalvage(ids,plan.quote),0);
 const updated=previewBulkSalvage(game().p,ids)!;
 game().mutate(p=>{p.pendingLoot=[p.inventory.pop()!]});
 assert.equal(game().bulkSalvage(ids,updated.quote),0);
 game().mutate(p=>{p.rewardOffer={itemId:item.id,encounterId:'boss',resolved:false}});
 assert.equal(previewBulkSalvage(game().p,ids),null);
 assert.equal(previewBulkSalvage(game().p,[game().p.equipment.weapon!.id]),null);
 assert.equal(game().p.inventory.length,1);
 assert.equal(game().p.pendingLoot?.length,1);
});

test('only the last irreplaceable Wings of Dusk must be kept',()=>{
 const one=makePerkItem('duskwings',12,'20-й этаж');
 const two=makePerkItem('duskwings',12,'20-й этаж');
 game().mutate(p=>{p.pendingLoot=[one]});
 assert.match(bulkSalvageRestriction(game().p,one)!,/20-й этаж/);
 game().salvage(one.id,true);
 assert.deepEqual(game().p.pendingLoot,[one]);
 game().mutate(p=>{p.inventory.push(two)});
 assert.equal(previewBulkSalvage(game().p,[one.id,two.id]),null);
 const plan=previewBulkSalvage(game().p,[two.id])!;
 assert.equal(game().bulkSalvage([two.id],plan.quote),1);
 assert.deepEqual(game().p.pendingLoot,[one]);
});
