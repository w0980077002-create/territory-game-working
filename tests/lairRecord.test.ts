import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freshPlayer} from '../src/core/store';
import {noteLairWin,lairRecord,lairTrialView,claimLairTrial,lairCleared} from '../src/saga/lair';
import {miniIds} from '../src/data/catalog';

test('a lair victory records the fastest time and never worsens it',()=>{
 const p=freshPlayer(),id=miniIds[0];
 noteLairWin(p,id,52.34);assert.equal(lairRecord(p,id),523);assert.ok(lairCleared(p,id));
 noteLairWin(p,id,70);assert.equal(lairRecord(p,id),523,'a slower win keeps the record');
 noteLairWin(p,id,31.01);assert.equal(lairRecord(p,id),310);
 noteLairWin(p,id,Number.NaN);assert.equal(lairRecord(p,id),310,'invalid time is ignored');
});
test('trials unlock by record and pay exactly once',()=>{
 const p=freshPlayer(),id=miniIds[1];
 assert.equal(claimLairTrial(p,id,0),null,'no record, no trial');
 noteLairWin(p,id,39);
 const view=lairTrialView(p,id);assert.deepEqual(view.map(t=>t.done),[true,true,false]);
 const gems=p.gems;
 assert.ok(claimLairTrial(p,id,0));assert.equal(claimLairTrial(p,id,0),null);
 assert.ok(claimLairTrial(p,id,1));assert.equal(claimLairTrial(p,id,2),null);
 assert.equal(p.gems,gems+30);
 assert.equal(claimLairTrial(p,'not-a-keeper',0),null);
});
