import {glacierAttackBonus} from '../src/core/progression';
import {beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {freshPlayer,makeItem,parseSave,SAVE_KEY,useGame,bestUpgrade} from '../src/core/store';
import {blessingEffects,blessingCanImprove} from '../src/saga/gear';
import {chapterReward} from '../src/saga/rewards';
import {forgeLevel,nextForgeBonus,upgradePreview} from '../src/core/forge';
import {xpNeeded,stats} from '../src/core/formulas';
// First play hour outside the Dark Realm: victory → loot → backpack → equip → forge → quests → reload.
const saved=new Map<string,string>();
let failKey='';
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>saved.get(k)??null,setItem:(k:string,v:string)=>{if(k===failKey)throw Error('full');saved.set(k,v)},removeItem:(k:string)=>saved.delete(k)}});
const G=()=>useGame.getState(),P=()=>G().p;
beforeEach(()=>{saved.clear();failKey='';useGame.setState({p:freshPlayer(),panel:null,selected:null,back:null,recoveryRequired:false,storageError:false,toast:''})});
const reload=()=>parseSave(saved.get(SAVE_KEY)??null)!;

test('forge upgrade reports success only after the save is written',()=>{
 G().mutate(p=>{p.gold=10_000});const before=P(),weapon=before.equipment.weapon!;
 failKey=SAVE_KEY;G().upgrade('weapon',{id:weapon.id,upgrade:weapon.upgrade});
 assert.deepEqual(P(),before,'gold and the item stay untouched');
 assert.doesNotMatch(G().toast,/успешно/i);assert.match(G().toast,/Не удалось сохранить/);
 failKey='';G().upgrade('weapon',{id:weapon.id,upgrade:weapon.upgrade});
 assert.equal(P().equipment.weapon!.upgrade,1);assert.equal(P().gold,10_000-upgradePreview(weapon).cost);assert.match(G().toast,/Усиление успешно/);
 assert.equal(reload().equipment.weapon!.upgrade,1,'the upgrade survives reload');
 // A stale double tap carries the old expectation and must not pay twice.
 const gold=P().gold;G().upgrade('weapon',{id:weapon.id,upgrade:0});assert.equal(P().gold,gold);assert.equal(P().equipment.weapon!.upgrade,1);
});

test('training, quest claims, unequip and class change never claim success on a failed write',()=>{
 G().mutate(p=>{p.gold=10_000;p.bosses=1});const before=P();failKey=SAVE_KEY;
 for(const run of [()=>G().train('forge'),()=>G().claim('mission'),()=>G().claim('daily'),()=>G().unequip('helmet'),()=>G().setClass('ranger')]){
  useGame.setState({toast:'',storageError:false});run();
  assert.deepEqual(P(),before);assert.match(G().toast,/Не удалось сохранить/,'honest failure message');
 }
 failKey='';G().claim('mission');assert.equal(P().mission,1);assert.equal(P().gems,before.gems+15);assert.match(G().toast,/Получено/);assert.deepEqual(G().toastReward,chapterReward);
 G().claim('mission');assert.equal(P().mission,1,'a double tap grants the chapter reward once');assert.equal(P().gems,before.gems+15);
 assert.equal(reload().mission,1);
});

test('first boss trophy: kept in the backpack, flagged as an upgrade, equipped once, and the stats reach the next fight',()=>{
 const g=G();g.mutate(p=>{p.wave=5});
 assert.equal(g.win('campaign','enc-first-boss'),true);
 assert.equal(G().win('campaign','enc-first-boss'),false,'the same victory cannot pay twice');
 const p=P(),trophy=p.inventory.find(i=>i.id===p.rewardOffer!.itemId)!;
 assert.ok(p.rewardOffer?.bossReward);assert.deepEqual(reload().rewardOffer?.bossReward,p.rewardOffer.bossReward);
 assert.equal(p.stage,2);assert.equal(p.bosses,1);assert.equal(trophy.name,'Клинок ледяного шёлка');
 assert.equal(bestUpgrade(p,'weapon',true)?.item.id,trophy.id,'the main screen marks the weapon slot');
 G().keepReward();assert.equal(P().rewardOffer!.resolved,true);
 const old=P().equipment.weapon!,attack=stats(P()).attack;G().equip(trophy.id);G().equip(trophy.id);
 assert.ok(stats(P()).attack>attack,'the next fight reads the stronger attack from the same stats');
 assert.equal(P().equipment.weapon!.id,trophy.id);assert.equal(P().inventory.filter(i=>i.id===old.id).length,1,'the old weapon returns to the backpack once');
 assert.equal(bestUpgrade(P(),'weapon',true),undefined,'no marker after equipping the best piece');
 const r=reload();assert.equal(r.equipment.weapon!.id,trophy.id);assert.equal(r.stage,2);assert.equal(r.rewardOffer!.resolved,true);
 assert.equal(r.claimed.filter(c=>c==='first-boss-relic').length,1);
});

test('a full backpack keeps the boss trophy in storage instead of losing it',()=>{
 G().mutate(p=>{p.wave=5;p.inventory=Array.from({length:80},()=>makeItem('boots',1,0))});
 assert.equal(G().win('campaign','enc-full'),true);
 const p=P();assert.equal(p.inventory.length,80);assert.equal(p.pendingLoot?.length,1);assert.equal(p.pendingLoot![0].id,p.rewardOffer!.itemId);
 assert.equal(reload().pendingLoot?.length,1,'the stored trophy survives reload');
 G().mutate(p=>{p.inventory.pop()});assert.equal(G().claimStored(),1);assert.equal(G().claimStored(),0);
 assert.equal(P().pendingLoot!.length,0);assert.equal(P().inventory.filter(i=>i.name==='Клинок ледяного шёлка').length,1);
});

test('not enough gold changes nothing and says so',()=>{
 G().mutate(p=>{p.gold=0;p.level=3});const before=P();
 G().train('forge');assert.deepEqual(P(),before);assert.match(G().toast,/Недостаточно золота/);
 G().upgrade('weapon');assert.deepEqual(P(),before);assert.match(G().toast,/Недостаточно золота/);
 assert.equal(xpNeeded(3)>0,true);
});

test('chapter claim checks its own sequence and preserves the whole queue on a failed write',()=>{
 G().claim('mission',0);
 assert.equal(P().mission,0);
 G().mutate(p=>{p.bosses=3});
 const {gold,gems}=P();
 G().claim('mission',0);
 G().claim('mission',0);
 assert.equal(P().mission,1);
 failKey=SAVE_KEY;
 G().claim('mission',1);
 assert.equal(P().mission,1);
 assert.equal(G().toastReward,undefined);
 failKey='';
 useGame.setState({p:reload()});
 G().claim('mission',1);
 G().claim('mission',2);
 G().claim('mission',3);
 assert.equal(P().mission,3);
 assert.equal(P().gold,gold+3*chapterReward.gold);
 assert.equal(P().gems,gems+3*chapterReward.gems);
});

test('Blessing caps each existing effect independently and blocks only a useless purchase',()=>{
 const caps={rarity:1,craft:.5,boss:.6,regular:.6,horn:.6} as const;
 for(const [effect,level] of [['boss',50],['rarity',67],['regular',120],['horn',130]] as const){
  assert.ok(blessingEffects(level-1)[effect]<caps[effect]);
  assert.equal(blessingEffects(level)[effect],caps[effect]);
 }
 for(const level of [49,50,66,67,119,120,129]){
  assert.ok(blessingCanImprove(level));
  G().mutate(p=>{p.blessing=level;p.gold=100_000});
  assert.equal(G().train('blessing'),true);
  assert.equal(P().blessing,level+1);
  assert.equal(P().gold,100_000-150*level);
 }
 for(const level of [130,200]){
  G().mutate(p=>{p.blessing=level;p.gold=100_000});
  assert.equal(G().train('blessing'),false);
  assert.equal(P().gold,100_000);
  assert.equal(reload().blessing,level);
  assert.deepEqual(blessingEffects(level),caps);
 }
 G().mutate(p=>{p.blessing=129});
 failKey=SAVE_KEY;
 assert.equal(G().train('blessing'),false);
 assert.equal(P().blessing,129);
 assert.equal(P().gold,100_000);
});

test('legacy progression is anchored once, including reload and alternating older backups with modern exports',()=>{
 const old=freshPlayer();
 delete old.progression;
 old.forge=1575;old.relic=420;old.gold=500_000_000;
 old.claimed=['veteran-reward'];
 old.inventory=[makeItem('boots',600,4)];
 const before=stats(old),gear=structuredClone(old.equipment);
 assert.equal(G().importSave(old),true);
 const migrated=reload();
 assert.equal(migrated.progression?.anchors.forge?.bonus,525);
 assert.equal(migrated.progression?.anchors.heart?.bonus,.03*420);
 assert.deepEqual(stats(migrated),before);
 assert.deepEqual(migrated.equipment,gear);
 assert.deepEqual(migrated.inventory,old.inventory);
 assert.deepEqual(migrated.claimed,old.claimed);

 const newer={...migrated,forge:1665,relic:450};
 assert.equal(G().importSave(newer),true);
 const restored=reload();
 assert.equal(forgeLevel(restored)-restored.level,535);
 assert.equal(Math.round(glacierAttackBonus(restored)*1000),12937);
 assert.ok(stats(restored).attack>before.attack);

 const newerLegacy={...newer};
 delete newerLegacy.progression;
 assert.equal(G().importSave(newerLegacy),true);
 assert.equal(forgeLevel(P())-P().level,535);
 assert.equal(Math.round(glacierAttackBonus(P())*1000),12937);

 assert.equal(G().importSave(freshPlayer()),true);
 assert.equal(G().importSave(old),true);
 assert.equal(G().importSave(newerLegacy),true);
 assert.deepEqual(P().progression,restored.progression);
 assert.equal(forgeLevel(P())-P().level,535);
 assert.equal(Math.round(glacierAttackBonus(P())*1000),12937);
});

test('new progression agrees with the approved checkpoints and remains finite',()=>{
 const p=freshPlayer();
 for(const [level,bonus] of [[299,99],[300,100],[301,100],[308,100],[309,101],[1575,241]]){
  p.forge=level;
  assert.equal(forgeLevel(p)-p.level,bonus);
 }
 for(const [level,expected] of [[99,297],[100,300],[101,302.993],[200,543.279],[420,873.307],[450,906.961]]){
  p.relic=level;
  assert.ok(Math.abs(glacierAttackBonus(p)*100-expected)<.015);
 }
 p.relic=Number.MAX_VALUE;
 assert.ok(Number.isFinite(glacierAttackBonus(p)));
 assert.equal(nextForgeBonus(300),9);
 assert.equal(nextForgeBonus(301),8);
 assert.equal(nextForgeBonus(308),1);
});
