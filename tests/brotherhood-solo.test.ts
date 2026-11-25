import assert from 'node:assert/strict';
import {test} from 'node:test';
import {deliverGiftResources,freshPlayer,useGame} from '../src/core/store';
import {resCount} from '../src/dark/rules';
import {applyRuneAction,runeRules,runeState} from '../src/saga/runes';
import {balanceOf} from '../src/saga/soloEconomy';

test('one durable gift adds the ordinary Solo resources and survives a failed write and replay',()=>{
 const restore=useGame.getState();
 const storage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 let raw='';
 let fail=true;
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
  getItem:()=>raw,
  setItem:(_key:string,value:string)=>{if(fail)throw Error('storage full');raw=value;},
 }});
 try{
  const initial=freshPlayer();
  useGame.setState({p:initial,storageError:false,recoveryRequired:false});
  const id='brotherhood-solo:51000000-0000-4000-8000-000000000001';
  const gift={gold:2000,gems:100,chaosite:30,rune_scrolls:40,summon_seals:3,relic_shards:10};
  assert.equal(deliverGiftResources(id,gift),false);
  assert.equal(useGame.getState().p,initial);
  assert.equal(raw,'');
  fail=false;
  assert.equal(deliverGiftResources(id,{...gift,horn:20}),false);
  assert.equal(deliverGiftResources(id,gift),true);
  assert.equal(deliverGiftResources(id,gift),true);
  const final=useGame.getState().p;
  assert.equal(final.gold,initial.gold+2000);
  assert.equal(final.gems,initial.gems+100);
  assert.equal(final.chaosite,initial.chaosite+30);
  assert.equal(balanceOf(final,'scroll'),balanceOf(initial,'scroll')+40);
  assert.equal(resCount(final,'seal'),resCount(initial,'seal')+3);
  assert.equal(resCount(final,'shard'),resCount(initial,'shard')+10);
  assert.deepEqual(final.equipment,initial.equipment);
  assert.equal(final.horn,initial.horn);
  assert.equal(final.stage,initial.stage);
  assert.equal(final.level,initial.level);
  assert.equal(JSON.parse(raw).claimed.filter((receipt:string)=>receipt===id).length,1);
  const spending=structuredClone(final);
  assert.equal(applyRuneAction(spending,{kind:'summon'},runeState(spending).revision,()=>0),true);
  assert.equal(balanceOf(spending,'scroll'),balanceOf(final,'scroll')-runeRules.summon);
 }finally{
  useGame.setState(restore,true);
  if(storage)Object.defineProperty(globalThis,'localStorage',storage);
  else Reflect.deleteProperty(globalThis,'localStorage');
 }
});
