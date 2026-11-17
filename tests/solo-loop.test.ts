import {beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {freshPlayer,makeItem,parseSave,SAVE_KEY,useGame,bestUpgrade} from '../src/core/store';
import {upgradePreview} from '../src/core/forge';
import {xpNeeded,stats} from '../src/core/formulas';
// First play hour outside the Dark Realm: victory → loot → backpack → equip → forge → quests → reload.
const saved=new Map<string,string>();
let failKey='';
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>saved.get(k)??null,setItem:(k:string,v:string)=>{if(k===failKey)throw Error('full');saved.set(k,v)},removeItem:(k:string)=>saved.delete(k)}});
const G=()=>useGame.getState(),P=()=>G().p;
beforeEach(()=>{saved.clear();failKey='';useGame.setState({p:freshPlayer(),panel:null,selected:null,back:null,recoveryRequired:false,storageError:false,toast:''})});
const reload=()=>parseSave(saved.get(SAVE_KEY)??null)!;

test('forge upgrade reports success only after the save is written',()=>{
 G().mutate(p=>{p.gold=10_000});const before=P(),weapon=before.equipment.weapon!;
 failKey=SAVE_KEY;G().upgrade('weapon',{id:weapon.id,upgrade:weapon.upgrade});
 assert.deepEqual(P(),before,'gold and the item stay untouched');
 assert.doesNotMatch(G().toast,/успешно/i);assert.match(G().toast,/Не удалось сохранить/);
 failKey='';G().upgrade('weapon',{id:weapon.id,upgrade:weapon.upgrade});
 assert.equal(P().equipment.weapon!.upgrade,1);assert.equal(P().gold,10_000-upgradePreview(weapon).cost);assert.match(G().toast,/Усиление успешно/);
 assert.equal(reload().equipment.weapon!.upgrade,1,'the upgrade survives reload');
 // A stale double tap carries the old expectation and must not pay twice.
 const gold=P().gold;G().upgrade('weapon',{id:weapon.id,upgrade:0});assert.equal(P().gold,gold);assert.equal(P().equipment.weapon!.upgrade,1);
});

test('training, quest claims, unequip and class change never claim success on a failed write',()=>{
 G().mutate(p=>{p.gold=10_000;p.bosses=1});const before=P();failKey=SAVE_KEY;
 for(const run of [()=>G().train('forge'),()=>G().claim('mission'),()=>G().claim('daily'),()=>G().unequip('helmet'),()=>G().setClass('ranger')]){
  useGame.setState({toast:'',storageError:false});run();
  assert.deepEqual(P(),before);assert.match(G().toast,/Не удалось сохранить/,'honest failure message');
 }
 failKey='';G().claim('mission');assert.equal(P().mission,1);assert.equal(P().gems,before.gems+15);assert.match(G().toast,/Награда получена/);
 G().claim('mission');assert.equal(P().mission,1,'a double tap grants the chapter reward once');assert.equal(P().gems,before.gems+15);
 assert.equal(reload().mission,1);
});

test('first boss trophy: kept in the backpack, flagged as an upgrade, equipped once, and the stats reach the next fight',()=>{
 const g=G();g.mutate(p=>{p.wave=5});
 assert.equal(g.win('campaign','enc-first-boss'),true);
 assert.equal(G().win('campaign','enc-first-boss'),false,'the same victory cannot pay twice');
 const p=P(),trophy=p.inventory.find(i=>i.id===p.rewardOffer!.itemId)!;
 assert.equal(p.stage,2);assert.equal(p.bosses,1);assert.equal(trophy.name,'Клинок ледяного шёлка');
 assert.equal(bestUpgrade(p,'weapon',true)?.item.id,trophy.id,'the main screen marks the weapon slot');
 G().keepReward();assert.equal(P().rewardOffer!.resolved,true);
 const old=P().equipment.weapon!,attack=stats(P()).attack;G().equip(trophy.id);G().equip(trophy.id);
 assert.ok(stats(P()).attack>attack,'the next fight reads the stronger attack from the same stats');
 assert.equal(P().equipment.weapon!.id,trophy.id);assert.equal(P().inventory.filter(i=>i.id===old.id).length,1,'the old weapon returns to the backpack once');
 assert.equal(bestUpgrade(P(),'weapon',true),undefined,'no marker after equipping the best piece');
 const r=reload();assert.equal(r.equipment.weapon!.id,trophy.id);assert.equal(r.stage,2);assert.equal(r.rewardOffer!.resolved,true);
 assert.equal(r.claimed.filter(c=>c==='first-boss-relic').length,1);
});

test('a full backpack keeps the boss trophy in storage instead of losing it',()=>{
 G().mutate(p=>{p.wave=5;p.inventory=Array.from({length:80},()=>makeItem('boots',1,0))});
 assert.equal(G().win('campaign','enc-full'),true);
 const p=P();assert.equal(p.inventory.length,80);assert.equal(p.pendingLoot?.length,1);assert.equal(p.pendingLoot![0].id,p.rewardOffer!.itemId);
 assert.equal(reload().pendingLoot?.length,1,'the stored trophy survives reload');
 G().mutate(p=>{p.inventory.pop()});assert.equal(G().claimStored(),1);assert.equal(G().claimStored(),0);
 assert.equal(P().pendingLoot!.length,0);assert.equal(P().inventory.filter(i=>i.name==='Клинок ледяного шёлка').length,1);
});

test('not enough gold changes nothing and says so',()=>{
 G().mutate(p=>{p.gold=0;p.level=3});const before=P();
 G().train('hero');assert.deepEqual(P(),before);assert.match(G().toast,/Недостаточно золота/);
 G().upgrade('weapon');assert.deepEqual(P(),before);assert.match(G().toast,/Недостаточно золота/);
 assert.equal(xpNeeded(3)>0,true);
});
