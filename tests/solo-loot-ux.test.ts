import assert from 'node:assert/strict';
import test from 'node:test';
import {compareLootEffects} from '../src/core/lootEffects';
import {previewMine} from '../src/core/mine';
import {shipClaimable,shipCollection,starterShipyard} from '../src/core/shipyard';
import {freshPlayer,makeItem} from '../src/core/store';
import {legendTitle} from '../src/saga/regions';

test('trophy comparison shows gained and lost properties and the exact active set thresholds',()=>{
 const p=freshPlayer();
 p.equipment.amulet={...makeItem('amulet',1,4),set:'stone',uniqueId:'pack_sigil'};
 p.equipment.helmet={...makeItem('helmet',1,3),set:'stone'};
 p.equipment.ring1={...makeItem('ring1',1,3),set:'ember'};
 const trophy={...makeItem('amulet',1,6),set:'ember',perk:'heart'};
 const before=JSON.stringify(p);
 const {properties,bonuses}=compareLootEffects(trophy,p);
 assert.deepEqual(properties.map(x=>[x.change,x.tag]),[['Получите','Второе дыхание'],['Потеряете','Спутники']]);
 assert.deepEqual(bonuses.map(x=>[x.id,x.from,x.to,x.thresholds.map(t=>[t.pieces,t.gained])]),[
  ['stone',2,1,[[2,false]]],['ember',1,2,[[2,true]]],
 ]);
 assert.match(bonuses[1].thresholds[0].bonus,/вампиризма/);
 assert.equal(JSON.stringify(p),before);
 p.equipment.amulet={...trophy,id:'already-equipped'};
 const same=compareLootEffects(trophy,p);
 assert.deepEqual(same.properties.map(x=>x.change),['Сохраняется']);
 assert.deepEqual(same.bonuses.map(x=>[x.from,x.to,x.thresholds.length]),[[2,2,0]]);
});

test('mine timer agrees with the cooldown and capped offline receipts',()=>{
 const lastAt=1000;
 assert.equal(previewMine(lastAt,lastAt-1000).waitMs,601_000);
 assert.equal(previewMine(lastAt,lastAt+599_999).waitMs,1);
 assert.deepEqual(previewMine(lastAt,lastAt+600_000),{waitMs:0,progress:1,gold:1200,chaosite:5});
 assert.deepEqual(previewMine(lastAt,lastAt+86_400_000),{waitMs:0,progress:1,gold:3600,chaosite:10});
});

test('ship timer uses actual fleet rate, stored fractions and the claim boundary',()=>{
 const ship=starterShipyard(1000);
 ship.ships[0].level=3;
 ship.stored=.25;
 const check=(now:number,expected:number)=>{
  const preview=shipCollection(ship,now);
  assert.equal(preview.waitMs,expected);
  assert.equal(preview.amount,shipClaimable(ship,now));
 };
 check(500,900_500);
 check(1000,900_000);
 check(900_999,1);
 check(901_000,0);
 assert.equal(shipCollection(ship,901_000).progress,1);
 assert.equal(ship.stored,.25);
});

test('Legend titles follow the six-region lap without renaming the story',()=>{
 assert.equal(legendTitle(60),undefined);
 assert.equal(legendTitle(61),'Легенда I');
 assert.equal(legendTitle(120),'Легенда I');
 assert.equal(legendTitle(121),'Легенда II');
 assert.equal(legendTitle(181),'Легенда III');
 assert.equal(legendTitle(241),'Легенда IV');
});
