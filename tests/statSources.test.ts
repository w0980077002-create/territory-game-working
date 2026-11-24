import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freshPlayer,makeItem} from '../src/core/store';
import {statSources} from '../src/saga/statSources';
import {applyRuneAction,runeState} from '../src/saga/runes';
import {stats} from '../src/core/formulas';

test('source shares are measured on the real formula and never touch the save',()=>{
 const p=freshPlayer();p.level=60;p.talents=[10,5,0];p.equipment.wings=makeItem('wings',10,4);
 applyRuneAction(p,{kind:'path',row:0,id:2},runeState(p).revision);
 const snapshot=JSON.stringify(p);
 const {total,base,sources}=statSources(p);
 assert.equal(JSON.stringify(p),snapshot,'read-only');
 assert.deepEqual(total,stats(p));
 const ids=sources.map(s=>s.id);
 for(const id of ['gear','wings','talents','runes'])assert.ok(ids.includes(id),id+' contributes');
 assert.ok((sources.find(s=>s.id==='runes')!.delta.skillDamage??0)>0,'the chosen +5% skill path shows up');
 assert.ok(base.hp<total.hp&&base.attack<total.attack,'base without any source is lower');
 assert.ok(!ids.includes('relics')||(sources.find(s=>s.id==='relics')!.delta.attack??0)>=0);
});
test('a fresh hero lists only what it really has',()=>{
 const p=freshPlayer();
 const ids=statSources(p).sources.map(s=>s.id);
 assert.ok(ids.includes('gear'));assert.ok(!ids.includes('wings'));assert.ok(!ids.includes('talents'));
});
