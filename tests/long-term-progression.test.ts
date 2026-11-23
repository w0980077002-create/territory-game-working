import assert from 'node:assert/strict';
import {test} from 'node:test';
import balance from '../config/test-balance.v1.json';
import {installHeadless} from '../scripts/sim/bot';
import {gainExperience,xpNeeded} from '../src/core/experience';
import {exportSave,freshPlayer,makeItem,parseSave,useGame} from '../src/core/store';
import {grant} from '../src/saga/rewards';
import {Battle} from '../src/game/Battle';
import {validEncounter} from '../src/game/snapshot';
import {campaignPlan,curve,growth,stageGold,stageXp,threat} from '../src/saga/regions';

installHeadless();

test('early XP thresholds are exact and the new curve advances beyond level 100',()=>{
 const {level_exp_base,level_exp_multiplier}=balance.progression_test_settings;
 for(let level=1;level<=25;level++)assert.equal(xpNeeded(level),Math.round(level_exp_base*level_exp_multiplier**(level-1)));
 const start={level:24,xp:12_345},expected={...start},award=19_000_000;
 expected.xp+=award;
 while(expected.xp>=xpNeeded(expected.level))expected.xp-=xpNeeded(expected.level++);
 const actual={...start};
 gainExperience(actual,award);
 assert.deepEqual(actual,expected);
 assert.ok(actual.level>100);
 assert.equal(xpNeeded(100),471_176);
 assert.ok(xpNeeded(101)>xpNeeded(100));
});

test('legacy level, banked XP, and gear survive load, and an earned reward spends banked XP once',()=>{
 const legacy=freshPlayer();
 delete legacy.progression;
 legacy.level=105;
 legacy.xp=4_000_000;
 legacy.stage=702;
 legacy.gold=71_234;
 legacy.inventory.push(makeItem('helmet',105,4));
 legacy.pendingLoot=[makeItem('armor',107,5)];
 legacy.claimed.push('story:award');
 const raw=JSON.stringify(legacy);
 const restored=parseSave(raw,true)!;
 assert.equal(restored.level,legacy.level);
 assert.equal(restored.xp,legacy.xp);
 assert.deepEqual(restored.inventory,legacy.inventory);
 assert.deepEqual(restored.pendingLoot,legacy.pendingLoot);
 assert.deepEqual(restored.equipment,legacy.equipment);
 assert.deepEqual(restored.claimed,legacy.claimed);
 useGame.setState({p:restored,panel:null,selected:null,recoveryRequired:false,storageError:false});
 assert.equal(useGame.getState().win('arena','legacy-xp-award'),true);
 assert.equal(useGame.getState().win('arena','legacy-xp-award'),false);
 const saved=parseSave(exportSave(),true)!;
 const expected={level:legacy.level,xp:legacy.xp};
 gainExperience(expected,30);
 assert.equal(saved.level,expected.level);
 assert.equal(saved.xp,expected.xp);
 assert.deepEqual(saved.inventory,legacy.inventory);
 assert.deepEqual(saved.pendingLoot,legacy.pendingLoot);
 assert.deepEqual(saved.equipment,legacy.equipment);
 assert.equal(saved.gold,legacy.gold+100);
});

test('reward thresholds stay exact at a single-level boundary and huge balances remain finite',()=>{
 const p=freshPlayer();
 p.level=150;
 p.xp=xpNeeded(150)-1;
 grant(p,{xp:1});
 assert.deepEqual({level:p.level,xp:p.xp},{level:151,xp:0});
 const huge={level:151,xp:Number.MAX_SAFE_INTEGER-1};
 gainExperience(huge,1);
 assert.ok(Number.isSafeInteger(huge.level)&&huge.level>151);
 assert.ok(huge.xp>=0&&huge.xp<xpNeeded(huge.level));
 assert.ok(Number.isFinite(xpNeeded(Number.MAX_VALUE)));
});

test('early threats are exact and late Legend plans and rewards stay finite',()=>{
 for(const [key,table] of [['hp',curve.hp_table],['atk',curve.attack_table]] as const){
  table.forEach((value,i)=>assert.equal(growth(i+1,key),value));
  for(const stage of [61,62,63]){
   const ratio=(table[59]/table[49])**.1;
   assert.equal(growth(stage,key),table[59]*ratio**(stage-60));
  }
 }
 for(const stage of [70,750,20_681,253_215,1_000_000,Number.MAX_SAFE_INTEGER]){
  const t=threat(stage);
  assert.ok(Object.values(t).every(n=>Number.isFinite(n)&&n>0&&n<1e12));
  for(const wave of [1,5])assert.ok(campaignPlan(stage,wave).units.every(u=>Number.isFinite(u.hp)&&Number.isFinite(u.atk)));
  for(const boss of [false,true]){
   assert.ok(Number.isSafeInteger(stageXp(stage,boss)));
   assert.ok(Number.isSafeInteger(stageGold(stage,boss)));
  }
 }
 assert.ok(growth(1_000_000,'hp')>growth(10_000,'hp'));
 assert.ok(growth(65,'atk')/growth(64,'atk')<growth(64,'atk')/growth(63,'atk'));
});

test('late Legend keeps a valid battle checkpoint through serialization and reload',()=>{
 const p=freshPlayer();
 p.stage=253_215;
 p.wave=5;
 p.level=121;
 useGame.setState({p,panel:null,selected:null,recoveryRequired:false,storageError:false,speed:1});
 const canvas={getContext:()=>({})} as unknown as HTMLCanvasElement;
 const b=new Battle(canvas);
 b.toggle();
 for(let i=0;i<160;i++)b.update(.05,.05);
 const snapshot=b.snapshot();
 assert.ok(validEncounter(snapshot));
 assert.ok(b.pause());
 b.destroy();
 const saved=parseSave(exportSave(),true)!;
 assert.ok(saved.encounter);
 useGame.setState({p:saved,panel:null});
 const restored=new Battle(canvas);
 try{
  assert.equal(restored.stage,p.stage);
  assert.equal(restored.id,snapshot.id);
  assert.deepEqual(restored.snapshot().units,saved.encounter.units);
 }finally{restored.destroy()}
});
