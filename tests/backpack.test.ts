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


test('equipping a stored boss trophy with a full backpack preserves the replaced gear and survives reload',()=>{
 const p=freshPlayer();
 const old=p.equipment.weapon!;
 const trophy=makeItem('weapon',20,4);
 trophy.origin='Босс основной главы';
 p.inventory=Array.from({length:80},()=>makeItem('helmet',1,0));
 p.pendingLoot=[trophy];
 p.rewardOffer={encounterId:'boss-stash-reload',itemId:trophy.id,resolved:false};
 const all=[...p.inventory,old,trophy].map(i=>i.id).sort();
 useGame.setState({p});
 useGame.getState().equip(trophy.id);
 const result=useGame.getState().p;
 assert.equal(result.equipment.weapon?.id,trophy.id);
 assert.equal(result.inventory.length,80,'equipping from storage does not overfill the backpack');
 assert.deepEqual(result.pendingLoot?.map(i=>i.id),[old.id],'old equipped gear moves to storage, not discarded');
 assert.equal(result.rewardOffer?.resolved,true);
 assert.deepEqual([...result.inventory,...result.pendingLoot!,...Object.values(result.equipment).filter((i):i is NonNullable<typeof i>=>!!i)].map(i=>i.id).sort(),[...all,...Object.values(p.equipment).filter((i):i is NonNullable<typeof i>=>!!i&&i.id!==old.id).map(i=>i.id)].sort());
 const restored=parseSave(saved.get(SAVE_KEY)??null,true);
 assert.ok(restored,'the full inventory and pending boss trophy must remain a valid save');
 assert.equal(restored.equipment.weapon?.id,trophy.id);
 assert.ok(restored.pendingLoot?.some(i=>i.id===old.id));
 assert.equal(restored.rewardOffer?.resolved,true);
});

test('failed persistence cancels gear swap, keeps the trophy, and never claims success',()=>{
 const p=freshPlayer(),trophy=makeItem('weapon',12,4);
 p.inventory=[trophy];
 useGame.setState({p,panel:'item',selected:trophy.id,recoveryRequired:false,storageError:false,toast:''});
 failKey=SAVE_KEY;
 useGame.getState().equip(trophy.id);
 assert.deepEqual(useGame.getState().p,p,'failure must leave every item and resource unchanged');
 assert.equal(useGame.getState().selected,trophy.id,'the item comparison remains open');
 assert.equal(useGame.getState().storageError,true);
 assert.match(useGame.getState().toast,/Не удалось сохранить экипировку/);
 failKey='';
 useGame.getState().equip(trophy.id);
 assert.equal(useGame.getState().p.equipment.weapon?.id,trophy.id);
 assert.ok(parseSave(saved.get(SAVE_KEY)??null));
});

test('failed persistence cancels single-item salvage without losing gold, XP or the item',()=>{
 const p=freshPlayer(),item=makeItem('helmet',2,0);
 p.inventory=[item];
 useGame.setState({p,panel:'item',selected:item.id,recoveryRequired:false,storageError:false,toast:''});
 failKey=SAVE_KEY;
 useGame.getState().salvage(item.id);
 assert.deepEqual(useGame.getState().p,p,'failure must not spend the saved item or grant unsaved resources');
 assert.equal(useGame.getState().selected,item.id);
 assert.equal(useGame.getState().storageError,true);
 assert.match(useGame.getState().toast,/Не удалось сохранить распыление/);
 failKey='';
 useGame.getState().salvage(item.id);
 assert.equal(useGame.getState().p.inventory.length,0);
 assert.ok(useGame.getState().p.gold>p.gold);
 assert.ok(parseSave(saved.get(SAVE_KEY)??null));
});

test('inventory actions are blocked while an unreadable save is being recovered',()=>{
 const p=freshPlayer(),item=makeItem('weapon',5,2);
 p.inventory=[item];
 useGame.setState({p,recoveryRequired:true,storageError:false,toast:''});
 useGame.getState().equip(item.id);
 useGame.getState().salvage(item.id);
 assert.deepEqual(useGame.getState().p,p);
 assert.ok(p.inventory.some(i=>i.id===item.id));
});
