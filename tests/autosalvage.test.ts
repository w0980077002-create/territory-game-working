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
 buyOn();const p=useGame.getState().p;const weak=drop();
 const protectedItems:Item[]=[
  {...weak,id:'rare',rarity:3},
  {...weak,id:'locked',locked:true},
  {...weak,id:'set',set:'frost'},
  {...weak,id:'perk',perk:'crown'},
  {...weak,id:'engrave',engrave:'might'},
  {...weak,id:'unique',uniqueId:'ice_silk'},
  {...weak,id:'boss',origin:'Босс основной главы'},
  {...weak,id:'wings',slot:'wings'},
 ];
 for(const item of protectedItems)assert.equal(shouldAutoSalvage(p,item),false,item.id);
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
