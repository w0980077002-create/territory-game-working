import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {addLoot,makeItem,freshPlayer,shouldAutoSalvage,parseSave,exportSave,useGame} from '../src/core/store';
import {itemPower} from '../src/core/formulas';
import type {Item,Slot} from '../src/core/types';

const saves=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{value:{setItem:(k:string,v:string)=>saves.set(k,v),getItem:(k:string)=>saves.get(k)??null},configurable:true});
beforeEach(()=>{saves.clear();useGame.setState({p:freshPlayer(),panel:null,selected:null,autoSalvageWeaker:false,stopOnDeath:true,continueOnVictory:true})});
const drop=(slot:Slot='weapon',rarity=0,level=1)=>makeItem(slot,level,rarity);
const buyOn=()=>useGame.getState().configure({autoSalvageWeaker:true});

test('disabled by default, optional preference survives export/import without save migration',()=>{
 const g=useGame.getState();
 assert.equal(g.autoSalvageWeaker,false);
 assert.equal(g.p.preferences?.autoSalvageWeaker,undefined);
 const weak=drop();let saved=false;
 g.mutate(p=>{saved=addLoot(p,weak,true)});
 assert.equal(saved,true,'ordinary weak gear is not salvaged without consent');
 assert.equal(useGame.getState().p.inventory.some(i=>i.id===weak.id),true);
 buyOn();
 assert.equal(useGame.getState().autoSalvageWeaker,true);
 assert.equal(parseSave(exportSave())?.preferences?.autoSalvageWeaker,true);
 assert.equal(parseSave(JSON.stringify(freshPlayer()))?.preferences?.autoSalvageWeaker,undefined);
 useGame.getState().configure({autoSalvageWeaker:false});
 assert.equal(parseSave(exportSave())?.preferences?.autoSalvageWeaker,false);
});

test('only new strictly weaker same-slot drops yield gold and XP exactly once',()=>{
 buyOn();const g=useGame.getState(),gold=g.p.gold,xp=g.p.xp,weak=drop(),value=Math.round(itemPower(weak)/3);
 assert.equal(shouldAutoSalvage(g.p,weak),true);
 let stored=true;g.mutate(p=>{stored=addLoot(p,weak,true)});
 assert.equal(stored,false);
 const p=useGame.getState().p;
 assert.equal(p.gold,gold+value);assert.equal(p.xp,xp+10+weak.level*2);
 assert.equal(p.inventory.some(i=>i.id===weak.id),false);
 assert.equal((p.pendingLoot??[]).some(i=>i.id===weak.id),false);
 // A duplicate drop ID cannot issue currency/XP again if already granted in the same encounter.
 // Drop IDs are unique; callers additionally de-duplicate encounter IDs.
 const stronger=drop('weapon',2,10),initialGold=p.gold;
 g.mutate(p=>addLoot(p,stronger,true));
 assert.equal(useGame.getState().p.inventory.some(i=>i.id===stronger.id),true);
 assert.equal(useGame.getState().p.gold,initialGold);
});

test('valuable items, equipped items and old gear returned during replacement remain untouched',()=>{
 buyOn();const weak=drop();
 const offered={...weak,id:'active-reward'};
 const p={...useGame.getState().p,rewardOffer:{encounterId:'boss',itemId:offered.id,resolved:false}};
 const protectedItems:Item[]=[
  offered,
  {...weak,id:'percent',percent:{hp:1,attack:0,defense:0}},
  {...weak,id:'shop',origin:'Покупка'},
  {...weak,id:'trophy',origin:'Трофей Логова'},
  {...weak,id:'rare',rarity:3},
  {...weak,id:'upgraded',upgrade:2},
  {...weak,id:'set',set:'frost'},
  {...weak,id:'perk',perk:'crown'},
  {...weak,id:'engrave',engrave:'might'},
  {...weak,id:'unique',uniqueId:'ice_silk'},
  {...weak,id:'boss',origin:'Босс основной главы'},
  {...weak,id:'wings',slot:'wings'},
 ];
 for(const item of protectedItems)assert.equal(shouldAutoSalvage(p,item),false,item.id);
 assert.equal(shouldAutoSalvage(p,{...weak,locked:true}),true,'legacy lock is ignored by the new-drop rule');
 const empty={...structuredClone(p),equipment:{...p.equipment}};delete empty.equipment.weapon;
 assert.equal(shouldAutoSalvage(empty,weak),false,'empty slots must keep all new gear');
 const before=p.gold,original={...weak,id:'manual-return'};
 useGame.getState().mutate(p=>addLoot(p,original)); // Manual gear return must not use the auto policy.
 assert.equal(useGame.getState().p.inventory.some(i=>i.id===original.id),true);
 assert.equal(useGame.getState().p.gold,before);
});

test('protected rare item is kept when auto-dismantle is active',()=>{
 buyOn();
 const rare=drop('armor',3,1);
 useGame.getState().mutate(p=>addLoot(p,rare,true));
 assert.equal(useGame.getState().p.inventory.some(i=>i.id===rare.id),true);
});

test('at 80/80, a weak Horn roll is salvaged once and a rare roll is saved on the shelf',t=>{
 const p=freshPlayer(),old=drop();
 p.inventory=[old,...Array.from({length:79},()=>drop('helmet'))];
 p.equipment.weapon=drop('weapon',3,15);
 useGame.setState({p});
 buyOn();
 useGame.getState().open('loot');
 let time=1000;
 t.mock.method(performance,'now',()=>time);
 const random=t.mock.method(Math,'random',()=>0);
 const before=useGame.getState().p;
 useGame.getState().hornLoot();
 const salvaged=useGame.getState(),calls=random.mock.callCount();
 assert.equal(salvaged.p.horn,before.horn-1);
 assert.deepEqual(salvaged.p.inventory,before.inventory);
 assert.equal(salvaged.p.pendingLoot,undefined);
 assert.ok(salvaged.p.gold>before.gold);
 assert.match(salvaged.toast,/автоматически разобрана/);
 useGame.getState().hornLoot();
 assert.equal(useGame.getState().p,salvaged.p);
 assert.equal(random.mock.callCount(),calls,'a double tap never rolls the second item');

 time+=500;
 let draws=0;
 random.mock.mockImplementation(()=>++draws===3?0:0.99);
 useGame.getState().hornLoot();
 const kept=useGame.getState(),stored=kept.p.pendingLoot?.[0];
 assert.ok(stored&&stored.rarity>=3);
 assert.equal(kept.p.horn,before.horn-2);
 assert.equal(kept.p.gold,salvaged.p.gold);
 assert.equal(kept.selected,stored.id);
 assert.match(kept.toast,/сохранена на складе.*авторазбор пропущен.*редкая/);
 assert.deepEqual(parseSave(exportSave())?.pendingLoot,[stored]);
});

test('ordinary campaign loot is salvaged at 80/80 without touching stored or replaced gear',t=>{
 const p=freshPlayer();
 p.inventory=Array.from({length:80},()=>drop('helmet'));
 p.pendingLoot=[drop('weapon')];
 p.equipment.weapon=drop('weapon',3,15);
 useGame.setState({p});
 buyOn();
 t.mock.method(Math,'random',()=>0);
 const g=useGame.getState();
 assert.equal(g.win('campaign','weak-wave'),true);
 const after=useGame.getState();
 assert.equal(after.p.wave,g.p.wave+1);
 assert.deepEqual(after.p.inventory,g.p.inventory);
 assert.deepEqual(after.p.pendingLoot,g.p.pendingLoot);
 assert.match(after.toast,/автоматически разобрана/);
 assert.equal(after.win('campaign','weak-wave'),false);
 assert.equal(useGame.getState().p,after.p);
});
