import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {installHeadless} from '../scripts/sim/bot';
installHeadless();
import {freshPlayer,useGame,makeItem,makeUnique,compareItem,bestUpgrade,bestUpgrades,parseSave,exportSave} from '../src/core/store';
import {stats} from '../src/core/formulas';
import {slots} from '../src/data/catalog';
const G=()=>useGame.getState(),P=()=>G().p;
beforeEach(()=>useGame.setState({p:freshPlayer(),panel:null,selected:null,back:null,recoveryRequired:false,storageError:false}));
test('comparison predicts the exact CP after equipping, for every slot including wings',()=>{
 for(const slot of slots){const item=makeItem(slot,9,3);G().mutate(p=>{p.inventory.push(item)});const before=stats(P()).cp,predicted=compareItem(item,P());G().equip(item.id);assert.equal(stats(P()).cp,before+predicted,slot);assert.equal(P().equipment[slot]!.id,item.id)}
 assert.equal(P().inventory.length,12,'every replaced piece returned to the backpack; wings had nothing to return');
});
test('best upgrade picks the strongest piece per slot and ignores weaker or foreign-slot items',()=>{
 const weak=makeItem('weapon',1,0),good=makeItem('weapon',8,2),great=makeItem('weapon',8,4),helm=makeItem('helmet',8,3);
 G().mutate(p=>{p.inventory.push(weak,good,great,helm)});
 assert.equal(bestUpgrade(P(),'weapon')!.item.id,great.id);assert.equal(bestUpgrade(P(),'weapon')!.gain,compareItem(great,P()));assert.equal(bestUpgrade(P(),'armor'),undefined);
 assert.deepEqual(bestUpgrades(P()).map(b=>b.slot),['weapon','helmet']);
});
test('equip best is one transaction: gear improves, nothing is lost or duplicated, a second tap does nothing',()=>{
 const items=[makeItem('weapon',8,4),makeItem('weapon',8,2),makeItem('armor',7,3),makeItem('ring1',9,5),makeItem('wings',1,3),makeItem('boots',1,0)];
 G().mutate(p=>{p.inventory.push(...items)});
 const ids=()=>[...P().inventory,...Object.values(P().equipment)].map(i=>i!.id).sort(),all=ids(),cp=stats(P()).cp,expected=bestUpgrades(P()).length;
 assert.equal(G().equipBest(),expected);assert.equal(expected,4);assert.ok(stats(P()).cp>cp);assert.deepEqual(ids(),all);assert.equal(new Set(all).size,all.length);
 assert.equal(P().equipment.weapon!.id,items[0].id);assert.equal(P().equipment.wings!.id,items[4].id);assert.equal(P().equipment.boots!.rarity,1,'a weaker piece is never put on');
 const after=exportSave();assert.equal(G().equipBest(),0);assert.deepEqual(parseSave(exportSave())!.equipment,parseSave(after)!.equipment);
});
test('equip best never swaps out a named item whose effect is outside CP; the player still can by hand',()=>{
 const named=makeUnique('ice_silk',1,'Трофей'),strong=makeItem('weapon',12,5);
 G().mutate(p=>{p.equipment.weapon=named;p.inventory.push(strong)});
 assert.ok(compareItem(strong,P())>0);assert.equal(G().equipBest(),0);assert.equal(P().equipment.weapon!.id,named.id);
 assert.equal(bestUpgrade(P(),'weapon')!.item.id,strong.id,'the slot window still offers it');G().equip(strong.id);assert.equal(P().equipment.weapon!.id,strong.id);assert.ok(P().inventory.some(i=>i.id===named.id));
});
test('the item card returns to the window it was opened from; from the fight it closes as before',()=>{
 const a=makeItem('weapon',8,3),b=makeItem('helmet',8,3),c=makeItem('armor',8,0);G().mutate(p=>{p.inventory.push(a,b,c)});
 G().open('gear:weapon');G().select(a.id);assert.equal(G().panel,'item');assert.equal(G().back,'gear:weapon');G().equip(a.id);assert.equal(G().panel,'gear:weapon');assert.equal(G().selected,null);assert.equal(G().back,null);
 G().open('inventory');G().select(c.id);G().salvage(c.id);assert.equal(G().panel,'inventory');assert.ok(!P().inventory.some(i=>i.id===c.id));
 G().open(null);G().select(b.id);assert.equal(G().back,null);G().equip(b.id);assert.equal(G().panel,null);
 const d=makeItem('boots',9,3);G().mutate(p=>{p.inventory.push(d)});G().open('gear:boots');G().equip(d.id);assert.equal(G().panel,'gear:boots','quick swap keeps the slot window open');
});
