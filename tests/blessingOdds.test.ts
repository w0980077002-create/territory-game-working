import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dropRarityOdds} from '../src/saga/blessingOdds';
test('rarity odds sum to 100% and the blessing shifts weight upwards',()=>{
 for(const lv of [0,1,10,66,80]){const o=dropRarityOdds(lv);assert.ok(Math.abs(o.reduce((a,b)=>a+b,0)-1)<1e-9)}
 const a=dropRarityOdds(1),b=dropRarityOdds(10);
 assert.ok(b[0]<a[0]&&b[8]>a[8],'more blessing, fewer crude and more dusk drops');
});
