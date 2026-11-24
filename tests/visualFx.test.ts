import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auraForRarity} from '../src/game/weaponAura';
import {CombatVfx} from '../src/game/CombatVfx';
import {wingPose} from '../src/game/heroAttachments';

test('weapon light grows with rarity and stays off on common gear',()=>{
 assert.deepEqual([0,1,2,3,4,5,6,7,8].map(auraForRarity),[undefined,undefined,undefined,'glow','sparks','fire','fire','holy','dusk']);
});

test('combat accents are bounded, expire and announce each boss only once',()=>{
 const fx=new CombatVfx();
 for(let i=0;i<100;i++)fx.hit(100,100,i%2===0,'#fff',true);
 assert.ok(fx.list.length<=24);
 fx.step(5);assert.equal(fx.list.length,0);
 fx.watchBoss('enc-1',true,true,true,500,700);fx.watchBoss('enc-1',true,true,true,500,700);
 assert.equal(fx.list.filter(f=>f.kind==='bossIn').length,1);
 fx.watchBoss('enc-1',true,true,false,500,700);fx.watchBoss('enc-1',true,true,false,500,700);
 assert.equal(fx.list.filter(f=>f.kind==='bossOut').length,1);
 fx.watchBoss('enc-2',false,true,true,500,700);
 assert.equal(fx.list.filter(f=>f.kind==='bossIn').length,1,'ordinary encounters stay quiet');
});

test('wings rest still for reduced motion and fold on a hit',()=>{
 assert.deepEqual(wingPose({clock:3,attack:.3},3,true),{shoulder:0,tip:0,squash:1});
 assert.ok(wingPose({clock:0,hurt:.5},0).shoulder>.2);
 assert.ok(wingPose({clock:0,attack:.35},0).shoulder<-.2,'strike gives a downbeat');
});

test('each saga region has its own atmosphere; the approved first region stays untouched',async()=>{
 const {regionMood}=await import('../src/game/RegionAtmosphere');
 const {regions}=await import('../src/saga/regions');
 const ice=regionMood('ice');assert.equal(ice.skyAlpha,0);assert.equal(ice.groundAlpha,0);
 const sig=new Set(regions.slice(1).map(r=>regionMood(r.id).signature));
 assert.equal(sig.size,regions.length-1,'every later region has a distinct signature');
});
