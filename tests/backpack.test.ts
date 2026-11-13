import {beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {freshPlayer,makeItem,parseSave,SAVE_KEY,useGame} from '../src/core/store';
import {itemPower,xpNeeded} from '../src/core/formulas';
const saved=new Map<string,string>();
let failKey='';
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>saved.get(k)??null,setItem:(k:string,v:string)=>{if(k===failKey)throw Error('full');saved.set(k,v)}}});
beforeEach(()=>{saved.clear();failKey='';useGame.setState({p:freshPlayer(),panel:null,selected:null,recoveryRequired:false,storageError:false})});
for(const size of [1,10,20,40])test(`bulk ${size}: exact reward, one payment, recoverable save`,()=>{
 const p=freshPlayer();p.inventory=Array.from({length:size},()=>makeItem('helmet',1,0));
 const gold=p.inventory.reduce((n,i)=>n+Math.round(itemPower(i)/3),0),ids=p.inventory.map(i=>i.id);
 let level=p.level,experience=p.xp+size*12;while(experience>=xpNeeded(level)){experience-=xpNeeded(level++);}
 useGame.setState({p});assert.equal(useGame.getState().bulkSalvage(ids),size);
 const after=useGame.getState().p;assert.equal(after.gold,p.gold+gold);assert.equal(after.level,level);assert.equal(after.xp,experience);
 assert.equal(useGame.getState().bulkSalvage(ids),0);assert.equal(useGame.getState().p.gold,after.gold);
 assert.deepEqual(parseSave(saved.get(SAVE_KEY)??null)?.inventory,[]);assert.equal(parseSave(saved.get(SAVE_KEY+':before-bulk-salvage')??null)?.inventory.length,size);
});
test('71/80 + 41 stored: selected transfer gets nine, preserves the other 32 and all IDs',()=>{
 const p=freshPlayer();p.inventory=Array.from({length:71},()=>makeItem('helmet',1,0));p.pendingLoot=Array.from({length:41},()=>makeItem('weapon',2,3));
 const all=[...p.inventory,...p.pendingLoot].map(i=>i.id),selected=p.pendingLoot.slice(4,24).map(i=>i.id);useGame.setState({p});
 assert.equal(useGame.getState().claimStored(selected),9);const after=useGame.getState().p;
 assert.equal(after.inventory.length,80);assert.equal(after.pendingLoot?.length,32);assert.deepEqual(after.inventory.slice(71).map(i=>i.id),selected.slice(0,9));
 assert.deepEqual([...after.inventory,...after.pendingLoot!].map(i=>i.id).sort(),all.sort());assert.equal(useGame.getState().claimStored(),0);
 assert.ok(parseSave(saved.get(SAVE_KEY)??null));
});
test('transfer and salvage roll back completely when persistence fails',()=>{
 const p=freshPlayer(),item=makeItem('helmet',1,0);p.inventory=[item];p.pendingLoot=[makeItem('armor',1,1)];useGame.setState({p});failKey=SAVE_KEY;
 assert.equal(useGame.getState().claimStored(),0);assert.deepEqual(useGame.getState().p,p);
 assert.equal(useGame.getState().bulkSalvage([item.id]),0);assert.deepEqual(useGame.getState().p,p);
});
test('selection/navigation does not change saved items and old profiles restore intact',()=>{
 const p=freshPlayer();p.inventory=[makeItem('armor',1,1)];p.pendingLoot=[makeItem('weapon',3,4)];useGame.setState({p});useGame.getState().persist();
 const before=saved.get(SAVE_KEY);useGame.getState().open('inventory');useGame.getState().select(p.inventory[0].id);useGame.getState().open(null);useGame.getState().open('inventory');
 assert.equal(saved.get(SAVE_KEY),before);assert.equal(parseSave(before??null)?.inventory[0].id,p.inventory[0].id);assert.equal(parseSave(before??null)?.pendingLoot?.[0].id,p.pendingLoot[0].id);
});
