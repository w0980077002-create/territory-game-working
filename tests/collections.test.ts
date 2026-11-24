import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freshPlayer,makeItem,asSetItem} from '../src/core/store';
import {recordCollection,gearFound,unrecorded,gearEntries,collectionPages,claimCollection,collectionMilestones,wingLook,chooseWingLook,wingLookList} from '../src/saga/collections';
import {setFlag} from '../src/saga/save';

test('found gear stays in the collection after it is gone',()=>{
 const p=freshPlayer();
 const piece=asSetItem(makeItem('helmet',5,2),'frost');p.inventory.push(piece);
 assert.deepEqual(unrecorded(p),['s:frost:helmet']);
 assert.equal(recordCollection(p),1);assert.equal(recordCollection(p),0,'idempotent');
 p.inventory=[];
 assert.ok(gearFound(p).includes('s:frost:helmet'));
 assert.equal(unrecorded(p).length,0,'nothing left to record, so tracking cannot loop');
 assert.ok(gearEntries.length>70);
});
test('named trophies proven by older saves count without a registry',()=>{
 const p=freshPlayer();setFlag(p,'perk:cutlass');
 assert.ok(gearFound(p).includes('p:cutlass'));
});
test('collection milestones pay once when the fill is reached',()=>{
 const p=freshPlayer();
 const wings=collectionPages(p).find(c=>c.id==='wings')!;
 assert.equal(wings.found,1);assert.equal(claimCollection(p,'wings',0),null,'1/6 is under 25%');
 p.stage=31;
 const now=collectionPages(p).find(c=>c.id==='wings')!;assert.equal(now.found,3);
 assert.ok(collectionMilestones(p,now)[1].reached);
 const gems=p.gems;assert.ok(claimCollection(p,'wings',0));assert.ok(claimCollection(p,'wings',1));
 assert.equal(claimCollection(p,'wings',1),null);assert.equal(p.gems,gems+45);
});
test('wing looks are cosmetic, need wings and an unlock',()=>{
 const p=freshPlayer();
 assert.equal(chooseWingLook(p,'frost'),false,'no wings');
 p.equipment.wings=makeItem('wings',1,3);
 assert.equal(chooseWingLook(p,'frost'),false,'locked');
 p.stage=11;const before=JSON.stringify(p.equipment.wings);
 assert.equal(chooseWingLook(p,'frost'),true);assert.equal(wingLook(p).id,'frost');
 assert.equal(JSON.stringify(p.equipment.wings),before,'stats untouched');
 p.stage=5;assert.equal(wingLook(p).id,wingLookList[0].id,'a look that is no longer valid falls back safely');
});
