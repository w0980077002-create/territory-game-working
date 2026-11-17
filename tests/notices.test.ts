import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installHeadless} from '../scripts/sim/bot';
import {freshPlayer,useGame} from '../src/core/store';
installHeadless();
const G=()=>useGame.getState();
const reset=()=>useGame.setState({p:freshPlayer(),panel:null,selected:null,back:null,toast:'',recoveryRequired:false,storageError:false});

test('old receipts stop at navigation; same-operation redirects retain their result',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});reset();G().open('companions');
 G().notice('Уровень спутника повышен');await Promise.resolve();G().open('port');assert.equal(G().toast,'');
 G().open('companions');assert.equal(G().toast,'','returning does not resurrect a receipt');
 G().notice('Свежая операция');G().open('port');assert.equal(G().toast,'Свежая операция','automatic redirect keeps its new result');
 await Promise.resolve();G().open(null);assert.equal(G().toast,'');
});

test('identical consecutive messages each receive the full display interval',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});reset();G().open('relic');G().notice('Уровень повышен');const first=G().toastId;
 t.mock.timers.tick(2000);await Promise.resolve();G().notice('Уровень повышен');assert.ok(G().toastId>first);
 t.mock.timers.tick(1200);assert.equal(G().toast,'Уровень повышен','first timer must not expire the second operation');
 t.mock.timers.tick(1999);assert.equal(G().toast,'Уровень повышен');t.mock.timers.tick(1);assert.equal(G().toast,'');
});

test('entering another item or nested card dismisses only the old receipt',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});reset();G().open('inventory');G().notice('Предыдущая операция');await Promise.resolve();G().select('item-a');assert.equal(G().toast,'');
 G().notice('Предмет защищён');await Promise.resolve();G().select('item-b');assert.equal(G().toast,'');
 G().notice('Старое сообщение');const oldId=G().toastId;await Promise.resolve();G().dismissNotice(oldId);assert.equal(G().toast,'');
 G().notice('Новая операция');G().dismissNotice(oldId);assert.equal(G().toast,'Новая операция','stale mount may not clear a new message');
 await Promise.resolve();G().leaveItem();assert.equal(G().panel,'inventory');assert.equal(G().toast,'');
});

test('receipt lifecycle never changes player state or saved progress',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});reset();const player=structuredClone(G().p);const saved=localStorage.getItem('lootborn-codex-v1');
 G().open('darkgear');G().notice('Усиление успешно!');const id=G().toastId;await Promise.resolve();G().dismissNotice(id);G().open('port');t.mock.timers.tick(3200);
 assert.deepEqual(G().p,player);assert.equal(localStorage.getItem('lootborn-codex-v1'),saved);
});
