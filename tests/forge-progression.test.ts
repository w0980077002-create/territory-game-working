import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installHeadless} from '../scripts/sim/bot';
installHeadless();
import {freshPlayer,makeItem,rollItem,parseSave} from '../src/core/store';
import {forgeLevel,forgeMasteryBonus,upgradePreview,withExistingUpgrades} from '../src/core/forge';
import {reforgePlan} from '../src/saga/actions';

test('forge loot stays within five levels and mastery is bounded',()=>{
 const p=freshPlayer();p.level=39;p.forge=600;
 assert.equal(forgeLevel(p),44);
 assert.ok(forgeMasteryBonus(p)>0&&forgeMasteryBonus(p)<.25);
 const drop=rollItem(p,'weapon');
 assert.ok(drop.level<=44);
 const ordinary=makeItem('weapon',44,drop.rarity);
 assert.ok(drop.attack<=Math.ceil(ordinary.attack*1.25));
 p.forge=4;
 assert.equal(forgeLevel(p),40);
 assert.equal(forgeMasteryBonus(p),0);
});

test('forty enhancements increase stats by 5% of the original per rank, not ninety-fold',()=>{
 const first=makeItem('weapon',39,3);
 let current=first;
 for(let rank=1;rank<=40;rank++){
  current=upgradePreview(current).next;
  assert.equal(current.upgrade,rank);
  for(const key of ['attack','hp','defense'] as const)
   assert.equal(current[key],Math.ceil(first[key]*(1+.05*rank)));
 }
 assert.ok(current.attack<=first.attack*3.01);
 assert.deepEqual(current.enhancementBase,{attack:first.attack,hp:first.hp,defense:first.defense});
});

test('reforging has bounded level and reapplies ranks without compounding',()=>{
 const p=freshPlayer();p.level=39;p.forge=300;
 let worn=makeItem('weapon',25,3);
 for(let n=0;n<10;n++)worn=upgradePreview(worn).next;
 const plan=reforgePlan(worn,p);
 assert.ok(plan);
 assert.equal(plan.next.level,44);
 assert.equal(plan.next.upgrade,10);
 assert.ok(plan.next.enhancementBase);
 assert.equal(plan.next.attack,Math.ceil(plan.next.enhancementBase!.attack*1.5));
 assert.equal(withExistingUpgrades(worn,makeItem('weapon',44,3)).id,worn.id);
});

test('old saved items are unchanged until an explicit player action',()=>{
 const p=freshPlayer();p.level=39;p.forge=600;
 const legacy=makeItem('weapon',160,3);
 legacy.upgrade=40;legacy.attack*=93;
 p.equipment.weapon=legacy;
 const raw=JSON.stringify(p);
 assert.deepEqual(parseSave(raw,true),p);
 assert.equal(JSON.stringify(parseSave(raw,true)),raw);
 const improved=upgradePreview(legacy).next;
 assert.equal(improved.level,160);
 assert.equal(improved.upgrade,41);
 assert.ok(improved.attack>=legacy.attack);
});
