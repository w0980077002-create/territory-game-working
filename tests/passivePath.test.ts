import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freshPlayer} from '../src/core/store';
import {applyRuneAction,runeBonuses,runeState,runeRules} from '../src/saga/runes';
import {stats} from '../src/core/formulas';
import {sagaOf} from '../src/saga/save';

test('path rows unlock by hero level, one choice per row, switching replaces and never stacks',()=>{
 const p=freshPlayer();p.level=30;
 assert.equal(applyRuneAction(p,{kind:'path',row:1,id:0},runeState(p).revision),false,'Контроль needs level 45');
 assert.ok(applyRuneAction(p,{kind:'path',row:0,id:2},runeState(p).revision));
 assert.equal(applyRuneAction(p,{kind:'path',row:0,id:2},runeState(p).revision),false,'same choice is a no-op');
 assert.equal(applyRuneAction(p,{kind:'path',row:0,id:2},runeState(p).revision-1),false,'stale revision');
 let skill=runeBonuses(p).bonuses.filter(b=>b.key==='skill').reduce((a,b)=>a+b.amount,0);assert.equal(skill,.05);
 assert.ok(applyRuneAction(p,{kind:'path',row:0,id:0},runeState(p).revision));
 skill=runeBonuses(p).bonuses.filter(b=>b.key==='skill').reduce((a,b)=>a+b.amount,0);assert.equal(skill,0,'switch replaces');
 assert.equal(runeBonuses(p).bonuses.filter(b=>b.key==='critDamage').length,1);
 assert.equal(applyRuneAction(p,{kind:'path',row:9,id:0},runeState(p).revision),false);
 assert.equal(applyRuneAction(p,{kind:'path',row:0,id:5},runeState(p).revision),false);
});
test('a chosen path really changes hero stats; the base passive keeps working alongside',()=>{
 const p=freshPlayer();p.level=100;
 const before=stats(p).attack;
 assert.ok(applyRuneAction(p,{kind:'path',row:2,id:1},runeState(p).revision));
 assert.ok(stats(p).attack>before,'+4% attack applied through the shared power bonus');
 assert.ok(applyRuneAction(p,{kind:'passive',id:1},runeState(p).revision));
 const keys=runeBonuses(p).bonuses.map(b=>b.key);assert.equal(keys.filter(k=>k==='atkPct').length,2,'base and path both count');
 assert.equal(runeRules.path.length,4);
});
test('old saves without a path read cleanly and corrupt path values are ignored',()=>{
 const p=freshPlayer();p.level=100;
 sagaOf(p).box.runes={v:1,revision:3,ranks:[0,0,0,0,0,0,0,0,0],dust:0,passive:1,last:null};
 assert.deepEqual(runeState(p).path,[null,null,null,null]);
 (sagaOf(p).box.runes as {path:unknown}).path=[7,'x',-1,2];
 assert.deepEqual(runeState(p).path,[null,null,null,2]);
});

test('owner-approved maxima: rows stack to +13% skill, +25% crit damage, 5% damage reduction',()=>{
 const p=freshPlayer();p.level=100;
 const base=stats(p);
 const pick=(row:number,id:number)=>assert.ok(applyRuneAction(p,{kind:'path',row,id},runeState(p).revision));
 pick(0,2);pick(3,0); // Рунная мощь + Гнев богов
 assert.ok(Math.abs(stats(p).skillDamage/base.skillDamage-1.13)<1e-9,'skill damage ×1.13');
 pick(0,0);pick(3,1); // Ярость клинка + Сокрушение
 assert.ok(Math.abs(stats(p).critDamage-base.critDamage-.25)<1e-9,'crit damage +25 points');
 pick(1,1);pick(3,2); // Стойкий строй + Щит Асгарда
 assert.ok(Math.abs(stats(p).reduction-base.reduction-.05)<1e-9,'damage reduction +5 points');
 // One choice per row: switching the final row away removes its share again.
 pick(3,0);assert.ok(Math.abs(stats(p).reduction-base.reduction-.02)<1e-9);
});
