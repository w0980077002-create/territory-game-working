import {beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {freshPlayer,makeItem,parseSave,previewBulkSalvage,requiresSalvageConfirmation,salvageProtection,SAVE_KEY,useGame} from '../src/core/store';
import {itemPower,xpNeeded} from '../src/core/formulas';
const saved=new Map<string,string>();
let failKey='';
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>saved.get(k)??null,setItem:(k:string,v:string)=>{if(k===failKey)throw Error('full');saved.set(k,v)}}});
beforeEach(()=>{saved.clear();failKey='';useGame.setState({p:freshPlayer(),panel:null,selected:null,recoveryRequired:false,storageError:false})});
for(const size of [1,10,20,40])test(`bulk ${size}: exact reward, one payment, recoverable save`,()=>{
 const p=freshPlayer();p.inventory=Array.from({length:size},()=>makeItem('helmet',1,0));
 const gold=p.inventory.reduce((n,i)=>n+Math.round(itemPower(i)/3),0),ids=p.inventory.map(i=>i.id);
 let level=p.level,experience=p.xp+size*12;while(experience>=xpNeeded(level)){experience-=xpNeeded(level++);}
 const quote=previewBulkSalvage(p,ids)!.quote;
 useGame.setState({p});assert.equal(useGame.getState().bulkSalvage(ids,quote),size);
 const after=useGame.getState().p;assert.equal(after.gold,p.gold+gold);assert.equal(after.level,level);assert.equal(after.xp,experience);
 assert.equal(useGame.getState().bulkSalvage(ids,quote),0);assert.equal(useGame.getState().p.gold,after.gold);
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
 assert.equal(useGame.getState().bulkSalvage([item.id],previewBulkSalvage(p,[item.id])!.quote),0);assert.deepEqual(useGame.getState().p,p);
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

test('confirmed manual salvage from storage preserves rollback, then pays exactly once',()=>{
 const p=freshPlayer(),item={...makeItem('weapon',15,0),locked:true};
 p.inventory=Array.from({length:80},()=>makeItem('helmet',1,0));
 p.pendingLoot=[item,makeItem('armor',2,0)];
 p.rewardOffer={itemId:item.id,encounterId:'trophy',resolved:false};
 const raw=JSON.stringify(p);
 const restored=parseSave(raw,true)!;
 assert.deepEqual(restored,p);
 assert.equal(salvageProtection(restored,item),'активная награда');
 useGame.setState({p:restored,panel:'item',selected:item.id,back:'inventory'});
 const g=useGame.getState();
 g.salvage(item.id);
 assert.match(useGame.getState().toast,/Подтвердите/);
 assert.equal(useGame.getState().p.pendingLoot?.length,2);
 failKey=SAVE_KEY;
 g.salvage(item.id,true);
 assert.equal(useGame.getState().selected,item.id);
 assert.equal(useGame.getState().p.gold,p.gold);
 assert.equal(useGame.getState().p.rewardOffer?.resolved,false);
 failKey='';
 g.salvage(item.id,true);
 const result=useGame.getState();
 assert.deepEqual(result.p.inventory,p.inventory);
 assert.deepEqual(result.p.pendingLoot,[p.pendingLoot[1]]);
 assert.equal(result.p.rewardOffer?.resolved,true);
 assert.equal(result.panel,'inventory');
 assert.equal(result.p.gold,p.gold+Math.round(itemPower(item)/3));
 assert.equal(result.p.xp,10+item.level*2);
 g.salvage(item.id,true);
 assert.equal(useGame.getState().p,result.p);
 assert.deepEqual(parseSave(saved.get(SAVE_KEY)??null)?.pendingLoot,result.p.pendingLoot);
});

test('an early mutation refusal keeps panels and results unchanged even without storageError',t=>{
 const p=freshPlayer(),item=makeItem('helmet',1,0),stored=makeItem('armor',3,4);
 p.inventory=[item];p.pendingLoot=[stored];
 useGame.setState({p,panel:'item',selected:item.id,toast:'Герой открыт в другой вкладке'});
 const mutate=useGame.getState().mutate;
 const denied=t.mock.fn(()=>false);
 useGame.setState({mutate:denied});
 try{
  const g=useGame.getState();
  g.equip(item.id);
  g.salvage(item.id);
  assert.equal(g.bulkSalvage([item.id],previewBulkSalvage(p,[item.id])!.quote),0);
  assert.equal(g.claimStored([stored.id]),0);
  g.hornLoot();
  const after=useGame.getState();
  assert.equal(denied.mock.callCount(),4,'an action sees the result of mutate even when storageError is false');
  assert.equal(after.p,p);
  assert.equal(after.selected,item.id);
  assert.equal(after.panel,'item');
  assert.equal(after.storageError,false);
  assert.match(after.toast,/другой вкладке/);
 }finally{useGame.setState({mutate})}
});

test('a failed local write never publishes a temporary inventory or spends a Horn charge',()=>{
 const p=freshPlayer();
 p.inventory=Array.from({length:80},()=>makeItem('helmet',1,0));
 useGame.setState({p,panel:'loot'});
 const seen=new Set();
 const stop=useGame.subscribe(state=>seen.add(state.p));
 failKey=SAVE_KEY;
 try{useGame.getState().hornLoot()}finally{stop()}
 const g=useGame.getState();
 assert.deepEqual(seen,new Set([p]),'store subscribers never see uncommitted loot');
 assert.equal(g.p,p);
 assert.equal(g.panel,'loot');
 assert.equal(g.selected,null);
 assert.match(g.toast,/Не удалось сохранить/);
});

test('percent bonuses, wings and active rewards each require individual confirmation after reload',()=>{
 const p=freshPlayer();
 const percent={...makeItem('weapon',1,0),percent:{hp:1,attack:0,defense:0}};
 const wings=makeItem('wings',1,0);
 const reward=makeItem('armor',1,0);
 const ordinary={...makeItem('helmet',1,0),locked:false};
 p.inventory=[percent,wings,reward,ordinary];
 p.rewardOffer={encounterId:'active-reward',itemId:reward.id,resolved:false};
 useGame.setState({p});
 useGame.getState().persist();
 const restored=parseSave(saved.get(SAVE_KEY)??null,true)!;
 useGame.setState({p:restored});
 const g=useGame.getState;
 assert.equal(requiresSalvageConfirmation(g().p,ordinary),false);
 for(const item of [percent,wings,reward]){
  const before=g().p;
  assert.equal(requiresSalvageConfirmation(before,item),true);
  g().salvage(item.id);
  assert.equal(g().p,before);
  g().salvage(item.id,true);
  const after=g().p;
  assert.equal(after.inventory.some(i=>i.id===item.id),false);
  assert.equal(after.gold,before.gold+Math.round(itemPower(item)/3));
  g().salvage(item.id,true);
  assert.equal(g().p,after);
 }
 assert.equal(g().p.rewardOffer?.resolved,true);
 g().salvage(ordinary.id);
 assert.equal(g().p.inventory.length,0);
});
