import {hammerVictoryGold} from '../src/core/battleGold';
import {stageGold} from '../src/saga/regions';
import {validEncounter} from '../src/game/snapshot';
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {Battle} from '../src/game/Battle';
import {freshPlayer,useGame,parseSave,SAVE_KEY} from '../src/core/store';
import {bossIds,miniIds,enemyIds} from '../src/data/catalog';
Object.defineProperty(globalThis,'Image',{value:class {src='';complete=false;naturalWidth=0}});
Object.defineProperty(globalThis,'requestAnimationFrame',{value:()=>1});
Object.defineProperty(globalThis,'cancelAnimationFrame',{value:()=>{}});
const saves=new Map<string,string>();let failWrites=false;Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>saves.get(k)??null,setItem:(k:string,v:string)=>{if(failWrites&&k===SAVE_KEY)throw Error('storage full');saves.set(k,v)}}});
beforeEach(()=>{failWrites=false;saves.clear();useGame.setState({p:freshPlayer(),auto:false,stopOnDeath:true,continueOnVictory:true,panel:null,selected:null,recoveryRequired:false,storageError:false})});
function scene(active=true){const b=new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement);if(active)b.toggle();return b}
test('initial OFF, ON/OFF/ON freezes all encounter values and keeps same enemies',()=>{const b=scene(false);const first=b.snapshot();b.update(2);assert.deepEqual(b.snapshot(),first);b.toggle();b.update(.5);const running=b.snapshot();b.toggle();for(let i=0;i<50;i++)b.update(1);assert.deepEqual(b.snapshot(),running);b.toggle();b.update(.1);assert.equal(b.id,running.id);assert.ok(b.clock>running.clock);b.destroy()});
test('paused boss freezes timer, projectiles, effects and skills; x2 cannot advance OFF',()=>{const b=scene();useGame.getState().mutate(p=>{p.wave=5});b.spawn();b.phase='fight';b.cooldowns=[3,4,5];b.shoot('enemy','fire',0,10);b.burst(10,10,'red',2);b.update(.1);b.toggle();const snapshot=b.snapshot(),fx=JSON.stringify(b.fx);useGame.setState({speed:2});b.update(20);b.skill(0);b.heal();assert.deepEqual(b.snapshot(),snapshot);assert.equal(JSON.stringify(b.fx),fx);b.destroy()});
test('a killed enemy cannot retaliate and encounter reward is atomic and single use',()=>{const b=scene();b.phase='fight';b.hp=1;b.heroPending=.001;b.units=b.units.slice(0,1);b.units[0].worldX=b.journey.cameraX+b.heroX+70;b.units[0].hp=1;b.units[0].atk=100000;b.units[0].cd=0;b.update(.02);assert.equal(b.units[0].hp,0);assert.equal(b.phase,'victory');assert.ok(b.hp>0);assert.equal(useGame.getState().p.kills,1);const saved=parseSave(saves.get(SAVE_KEY)!);assert.ok(saved?.encounter?.rewarded);assert.equal(saved?.lastBattleReward,b.id);b.victory();assert.equal(useGame.getState().p.kills,1);b.destroy()});
test('reload restores HP, enemies, cooldown, paid mode and projectiles but is OFF',()=>{const b=scene();b.startMode('dungeon');b.toggle();b.phase='fight';b.hp=42;b.units[0].hp-=15;b.cooldowns=[1,2,3];b.shoot('enemy','orb',0,18);b.checkpoint();const snap=b.snapshot(),cost=useGame.getState().p.chaosite;b.destroy();const incoming=parseSave(saves.get(SAVE_KEY)!);assert.ok(incoming);useGame.setState({p:incoming});const restored=scene(false);assert.deepEqual(restored.snapshot(),snap);assert.equal(restored.running,false);restored.startMode('dungeon');assert.equal(useGame.getState().p.chaosite,cost);assert.deepEqual(restored.snapshot(),snap);restored.destroy()});
test('reload at victory does not pay again; next wave begins only after ON',()=>{const b=scene();b.units.forEach(u=>u.hp=0);b.phase='fight';b.update(.1);const kills=useGame.getState().p.kills,gold=useGame.getState().p.gold;b.destroy();const c=scene(false);assert.equal(c.phase,'victory');c.update(3);assert.equal(useGame.getState().p.kills,kills);assert.equal(useGame.getState().p.gold,gold);c.toggle();c.update(2);assert.equal(c.phase,'walk');assert.equal(useGame.getState().p.kills,kills);c.destroy()});
test('boss timeout pauses until axes are tapped, then retries the same stage and wave',()=>{const b=scene();useGame.getState().mutate(p=>{p.wave=5});b.spawn();b.phase='fight';b.timer=.001;const site=b.journey.encounterIndex,stage=b.stage,wave=b.wave;b.update(.01);assert.equal(b.phase,'defeat');assert.equal(b.running,false);assert.equal(useGame.getState().p.bosses,0);const frozen=b.snapshot();b.update(3);assert.deepEqual(b.snapshot(),frozen);b.resume();assert.equal(b.running,false,'menu/visibility resume must not bypass death');b.toggle();assert.equal(b.running,true);b.update(2.1);assert.equal(b.mode,'campaign');assert.equal(b.phase,'walk');assert.equal(b.running,true);assert.equal(b.stage,stage);assert.equal(b.wave,wave);assert.equal(b.journey.encounterIndex,site);assert.equal(b.hp,b.maxHp);b.destroy()});
test('all three skills and nine runes act only during ON and consume cooldown once',()=>{for(let skill=0;skill<3;skill++)for(let rune=0;rune<3;rune++){useGame.setState({p:freshPlayer()});const b=scene(false);b.phase='fight';useGame.getState().mutate(p=>{p.runes[skill]=rune});const initial=b.snapshot();b.skill(skill);assert.deepEqual(b.snapshot(),initial);b.toggle();b.skill(skill);assert.ok(b.cooldowns[skill]>0);const hp=b.units[0].hp;b.skill(skill);assert.equal(b.units[0].hp,hp);if(skill===0&&rune===1){b.stepProjectiles(1);assert.equal(b.stun,1.5)};if(skill===1&&rune===1)assert.ok(b.shield>0);if(skill===1)assert.equal(b.buff,5);b.destroy()}});
test('Auto OFF still allows baseline attack but never casts skills',()=>{const b=scene();b.phase='fight';for(let i=0;i<70;i++)b.update(.05);assert.ok(b.units[0].hp<b.units[0].max);assert.deepEqual(b.cooldowns,[0,0,0]);b.destroy()});
test('auto combat clears four waves and a boss, preserving loot',()=>{const b=scene();useGame.setState({auto:true});for(let i=0;i<3000&&useGame.getState().p.stage===1;i++){b.update(.05);if(b.director.state==='decide')b.director.choose('pass')}assert.equal(useGame.getState().p.stage,2);assert.equal(useGame.getState().p.bosses,1);assert.ok(useGame.getState().p.inventory.length>=1);b.destroy()});
test('each enemy/boss has a telegraphed ability; bosses change phases before impact',()=>{for(const id of [...enemyIds,...miniIds,...bossIds]){useGame.setState({p:freshPlayer()});const b=scene();b.phase='fight';const u=b.units[0];u.id=id;u.cd=0;b.boss=bossIds.includes(id)||miniIds.includes(id);b.enemyStep(u,.05);assert.ok(u.windup>0);assert.ok(u.ability.length>0);const hp=b.hp;b.enemyStep(u,.1);assert.equal(b.hp,hp);u.hp=u.max*.3;b.enemyStep(u,.1);if(b.boss)assert.equal(u.bossPhase,3);b.destroy()}});
test('a lethal projectile stops the simulation before any later projectile can award victory',()=>{const b=scene();b.phase='fight';b.hp=1;b.units=b.units.slice(0,1);b.shoot('enemy','orb',0,100000);b.shoot('hero','ice',0,100000);b.projectiles.forEach(p=>{p.duration=.001});b.update(.05);assert.equal(b.phase,'defeat');assert.equal(b.running,false);assert.equal(useGame.getState().p.kills,0);assert.ok(b.units[0].hp>0);b.destroy()});


test('boss trophy respects manual stop and only axes resume the next wave',()=>{
 useGame.setState({p:freshPlayer(),panel:null,selected:null,continueOnVictory:false});
 const b=scene();
 useGame.getState().mutate(p=>{p.wave=5});
 b.spawn();
 b.phase='fight';
 b.units.forEach(u=>{u.hp=0});
 b.victory();
 assert.equal(useGame.getState().p.stage,2);
 assert.equal(useGame.getState().p.bosses,1);
 assert.equal(b.running,false,'manual stop applies even when a trophy is waiting');
 assert.equal(useGame.getState().p.rewardOffer?.resolved,false);
 useGame.getState().keepReward();
 b.continueAfterLoot();
 assert.equal(b.running,false,'closing trophy must not silently override the stop setting');
 b.update(3);
 assert.equal(b.phase,'victory');
 b.toggle();
 assert.equal(b.running,true,'the player can explicitly restart using the axes');
 b.update(2);
 assert.equal(b.phase,'walk');
 assert.equal(useGame.getState().p.bosses,1,'the boss reward cannot be claimed again');
 b.destroy();
});

test('boss trophy still resumes automatically if auto-transition is enabled',()=>{
 useGame.setState({p:freshPlayer(),panel:null,selected:null,continueOnVictory:true});
 const b=scene();
 useGame.getState().mutate(p=>{p.wave=5});
 b.spawn();
 b.phase='fight';
 b.units.forEach(u=>{u.hp=0});
 b.victory();
 b.pause(); // The trophy dialog pauses an otherwise auto-continuing fight.
 useGame.getState().keepReward();
 b.continueAfterLoot();
 assert.equal(b.running,true,'accepting the trophy resumes only when the player allows it');
 b.update(2);
 assert.equal(b.phase,'walk');
 assert.equal(useGame.getState().p.bosses,1);
 b.destroy();
});


test('unsaved wave victory pauses and retries exactly once without losing quest tally',()=>{
 const b=scene();
 b.phase='fight';
 b.note('skill:0');
 b.units.forEach(u=>{u.hp=0});
 const before=structuredClone(useGame.getState().p);
 failWrites=true;
 b.victory();
 assert.equal(b.running,false);
 assert.equal(b.rewarded,false);
 assert.equal(b.phase,'fight');
 assert.equal(useGame.getState().storageError,true);
 assert.deepEqual(useGame.getState().p,before,'unsaved reward may not modify player progress');
 assert.equal(b.tally['skill:0'],1,'buffered quest progress must survive a failed reward save');
 assert.match(useGame.getState().toast,/ожидает сохранения/);
 failWrites=false;
 b.toggle();
 b.update(.05);
 const earned=useGame.getState().p;
 assert.equal(b.phase,'victory');
 assert.equal(earned.wave,2);
 assert.equal(earned.kills,before.kills+1);
 assert.equal(earned.saga?.n['skill:0'],1);
 assert.equal(earned.claimed.filter(x=>x==='battle:'+b.id).length,1);
 assert.equal(parseSave(saves.get(SAVE_KEY)!,true)?.wave,2);
 const gold=earned.gold;
 b.victory();
 assert.equal(useGame.getState().p.gold,gold);
 assert.equal(useGame.getState().p.kills,1);
 b.destroy();
});

test('boss trophy cannot be awarded in memory before a confirmed save',()=>{
 useGame.getState().mutate(p=>{p.wave=5});
 const b=scene();
 b.spawn();
 b.phase='fight';
 b.units.forEach(u=>{u.hp=0});
 const before=structuredClone(useGame.getState().p);
 failWrites=true;
 b.victory();
 assert.equal(useGame.getState().p.stage,1);
 assert.equal(useGame.getState().p.wave,5);
 assert.equal(useGame.getState().p.bosses,0);
 assert.equal(useGame.getState().p.inventory.length,before.inventory.length);
 assert.equal(useGame.getState().p.rewardOffer,undefined);
 assert.equal(b.running,false);
 failWrites=false;
 b.toggle();
 b.update(.05);
 const earned=useGame.getState().p;
 assert.equal(earned.stage,2);
 assert.equal(earned.wave,1);
 assert.equal(earned.bosses,1);
 assert.equal(earned.rewardOffer?.resolved,false);
 assert.ok([...earned.inventory,...(earned.pendingLoot??[])].some(i=>i.id===earned.rewardOffer?.itemId));
 const saved=parseSave(saves.get(SAVE_KEY)!,true);
 assert.ok(saved);
 assert.equal(saved.stage,2);
 assert.equal(saved.bosses,1);
 assert.equal(saved.rewardOffer?.itemId,earned.rewardOffer?.itemId);
 const resources=[earned.gold,earned.gems,earned.bosses,earned.inventory.length];
 b.victory();
 assert.deepEqual([useGame.getState().p.gold,useGame.getState().p.gems,useGame.getState().p.bosses,useGame.getState().p.inventory.length],resources);
 b.destroy();
});

test('a failed buffered quest checkpoint retains the counters until they can be saved',()=>{
 const b=scene();
 b.note('interrupt');
 failWrites=true;
 b.flushTally();
 assert.equal(b.tally.interrupt,1);
 assert.equal(useGame.getState().p.saga?.n.interrupt??0,0);
 failWrites=false;
 b.flushTally();
 assert.equal(b.tally.interrupt,undefined);
 assert.equal(useGame.getState().p.saga?.n.interrupt,1);
 assert.equal(parseSave(saves.get(SAVE_KEY)!,true)?.saga?.n.interrupt,1);
 b.destroy();
});

test('Arena results pause combat, pay once, and retry the duel after a reload or defeat',()=>{
 const g=()=>useGame.getState();
 const b=scene(false);
 b.startMode('arena');
 b.toggle();
 const gold=g().p.gold,tokens=g().p.tokens;
 b.units.forEach(u=>{u.hp=0});
 b.victory();
 assert.equal(g().panel,'arena');
 assert.equal(b.running,false);
 assert.equal(g().p.gold,gold+100);
 assert.equal(g().p.tokens,tokens+10);
 b.destroy();

 const restored=parseSave(saves.get(SAVE_KEY)!);
 assert.ok(restored);
 useGame.setState({p:restored,panel:null});
 const c=scene(false);
 assert.equal(c.phase,'victory');
 c.startMode('arena');
 c.toggle();
 c.update(3);
 assert.equal(c.mode,'arena');
 assert.equal(c.phase,'walk');
 assert.equal(g().p.arenaWins,1);

 c.defeat();
 assert.equal(g().panel,'arena');
 c.startMode('arena');
 c.toggle();
 c.update(3);
 assert.equal(c.mode,'arena');
 assert.equal(c.phase,'walk');
 assert.equal(g().p.arenaWins,1);
 c.destroy();
});

test('a failed save import leaves the previous running profile and disk save intact',()=>{
 const game=()=>useGame.getState();
 game().mutate(p=>{p.gold=1234});
 const current=game().p,saved=saves.get(SAVE_KEY);
 failWrites=true;
 assert.equal(game().importSave({...current,gold:5678}),false);
 assert.equal(game().p,current);
 assert.equal(saves.get(SAVE_KEY),saved);
 assert.match(game().toast,/импорт отменён/);
});

test('paid healing commits HP, cooldown and gold together, survives reload and rejects a double tap',()=>{
 const b=scene();
 b.stage=31;
 useGame.getState().mutate(p=>{p.stage=31;p.gold=30_000});
 b.spawn();
 b.phase='fight';
 const expectedCost=b.potionCost(),max=b.maxHp;
 assert.ok(expectedCost>15);
 b.hp=max*.2;
 b.heal();
 const saved=parseSave(saves.get(SAVE_KEY)!,true)!;
 assert.equal(saved.gold,30_000-expectedCost);
 assert.equal(saved.encounter?.hp,max*.65);
 assert.equal(saved.encounter?.potionCd,4);
 assert.equal(saved.encounter?.defensePressure,1);
 b.heal();
 assert.match(useGame.getState().toast,/через 4 с/);
 assert.equal(useGame.getState().p.gold,saved.gold);
 b.destroy();
 useGame.setState({p:saved});
 const restored=scene(false);
 assert.equal(restored.hp,saved.encounter?.hp);
 assert.equal(restored.potionCd,4);
 restored.heal();
 assert.match(useGame.getState().toast,/Бой остановлен/);
 restored.running=true;
 restored.phase='walk';
 for(const u of restored.units)u.cd=100;
 restored.update(4);
 assert.equal(restored.potionCd,0);
 restored.hp=max*.9;
 restored.heal();
 assert.equal(restored.hp,max);
 assert.equal(useGame.getState().p.gold,saved.gold-expectedCost);
 restored.destroy();
});

test('healing failure leaves gold, HP, cooldown, pressure and effects unchanged',()=>{
 const b=scene();
 useGame.getState().mutate(p=>{p.gold=100});
 b.hp=b.maxHp*.2;
 const snapshot=b.snapshot(),gold=useGame.getState().p.gold,fx=b.fx.length;
 failWrites=true;
 b.heal();
 assert.equal(useGame.getState().storageError,true);
 assert.equal(useGame.getState().p.gold,gold);
 assert.deepEqual(b.snapshot(),snapshot);
 assert.equal(b.fx.length,fx);
 failWrites=false;
 const original=b.snapshot;
 b.snapshot=()=>{throw new DOMException('Cannot clone', 'DataCloneError')};
 b.heal();
 b.snapshot=original;
 assert.match(useGame.getState().toast,/Не удалось сохранить лечение/);
 assert.equal(useGame.getState().p.gold,gold);
 assert.deepEqual(b.snapshot(),snapshot);
 assert.equal(b.fx.length,fx);
 useGame.getState().mutate(p=>{p.gold=0});
 b.heal();
 assert.match(useGame.getState().toast,/Недостаточно золота/);
 b.hp=b.maxHp;
 b.heal();
 assert.match(useGame.getState().toast,/Здоровье полное/);
 b.hp=0;
 b.heal();
 assert.match(useGame.getState().toast,/не оживляет/);
 assert.equal(b.hp,0);
 b.destroy();
});

test('legacy encounter cooldown defaults to zero, invalid values are rejected, and paid modes keep it',()=>{
 const b=scene(false);
 const old=b.snapshot();
 delete old.potionCd;
 for(const mode of ['campaign','farm','arena','dungeon','darkness']){
  useGame.setState({p:{...useGame.getState().p,encounter:{...old,mode,potionCd:2.5}}});
  b.restorePlayer();
  assert.equal(b.mode,mode);
  assert.equal(b.potionCd,2.5);
 }
 useGame.setState({p:{...useGame.getState().p,encounter:old}});
 b.restorePlayer();
 assert.equal(b.potionCd,0);
 for(const potionCd of [-1,4.01,'4',null]){
  assert.equal(parseSave(JSON.stringify({...useGame.getState().p,encounter:{...old,potionCd}}),true),null);
 }
 b.destroy();
});

test('Hammer quotes use the real mode, respect per-kill and victory caps, and accept many genuine kills',()=>{
 const cases=[
  ['campaign',1,false,5,10],['campaign',30,false,223,446],['campaign',60,false,558,1117],
  ['campaign',71,false,681,1363],['campaign',100,false,1005,2011],
  ['campaign',100,true,6033,12067],['farm',100,true,804,1608],
  ['arena',100,false,20,40],['dungeon',100,true,30,60],['darkness',100,true,0,0],
 ] as const;
 for(const [mode,stage,boss,one,cap] of cases){
  assert.equal(hammerVictoryGold(mode,stage,boss,0),0);
  assert.equal(hammerVictoryGold(mode,stage,boss,1),one);
  assert.equal(hammerVictoryGold(mode,stage,boss,2),one*2);
  assert.equal(hammerVictoryGold(mode,stage,boss,3),cap);
  assert.equal(hammerVictoryGold(mode,stage,boss,5),cap);
 }
});

test('golden Hammer earns a saved finishing blow but pays only once with the successful victory write',()=>{
 const G=()=>useGame.getState();
 G().mutate(p=>{p.stage=71;p.gold=100_000;p.runes[2]=2});
 const b=scene();
 b.phase='fight';
 const unit=b.units[0];
 b.units=[unit,{...unit,role:1}];
 unit.hp=1;
 const gold=G().p.gold;
 b.skill(2);b.skill(2);
 assert.equal(b.hammerKills,1);
 assert.equal(G().p.gold,gold);
 const first=parseSave(saves.get(SAVE_KEY)!,true)!;
 assert.equal(first.encounter?.hammerKills,1);
 b.destroy();
 useGame.setState({p:first});
 const restored=scene(false);
 assert.equal(restored.hammerKills,1);
 assert.equal(G().p.gold,gold);
 restored.units[1].hp=0;
 failWrites=true;
 restored.victory();
 assert.equal(G().p.gold,gold);
 assert.equal(restored.phase,'fight');
 assert.equal(G().p.claimed.includes('battle:'+restored.id),false);
 failWrites=false;
 restored.victory();restored.victory();
 const bonus=hammerVictoryGold('campaign',71,false,1);
 assert.equal(G().p.gold,gold+stageGold(71,false)+bonus);
 assert.match(G().toast,/руна Молота/);
 assert.equal(parseSave(saves.get(SAVE_KEY)!,true)?.lastBattleReward,restored.id);
 assert.equal(G().p.claimed.filter(id=>id==='battle:'+restored.id).length,1);
 restored.destroy();
});

test('defeat and a different encounter discard unclaimed Hammer gold; invalid snapshots cannot add finishing blows',()=>{
 const G=()=>useGame.getState();
 G().mutate(p=>{p.runes[2]=2});
 const b=scene();
 b.phase='fight';b.units[0].hp=1;b.skill(2);
 assert.equal(b.hammerKills,1);
 const gold=G().p.gold,valid=b.snapshot();
 assert.equal(validEncounter({...valid,hammerKills:2}),false);
 assert.equal(validEncounter({...valid,hammerKills:-1}),false);
 assert.equal(validEncounter({...valid,hammerKills:1.1}),false);
 assert.equal(validEncounter({...valid,mode:'darkness'}),false);
 assert.equal(validEncounter({...valid,hammerKills:undefined}),true);
 b.defeat();
 assert.equal(G().p.gold,gold);
 assert.equal(b.hammerKills,0);
 b.spawn();
 assert.equal(b.hammerKills,0);
 b.destroy();
});

test('the same actual Hammer kill settles with each paid mode and is included in the chapter trophy',()=>{
 const G=()=>useGame.getState();
 for(const [mode,wave,base,bonus] of [
  ['campaign',5,20447,4089],['farm',2,2726,545],['arena',2,100,20],['dungeon',2,150,30],
 ] as const){
  const p=freshPlayer();
  p.gold=100_000;p.stage=71;p.wave=wave;p.runes[2]=2;
  useGame.setState({p,panel:null,selected:null});
  const b=scene(false);
  b.mode=mode;b.spawn();b.running=true;b.phase='fight';
  b.units=[b.units[0]];b.units[0].hp=1;
  b.skill(2);
  assert.equal(b.hammerKills,1,mode);
  assert.equal(G().p.gold,p.gold,mode);
  b.victory();
  assert.equal(G().p.gold,p.gold+base+bonus,mode);
  if(mode==='campaign'){
   assert.equal(G().p.rewardOffer?.bossReward?.gold,base+bonus);
   assert.equal(G().p.rewardOffer?.hammerGold,bonus);
  }
  b.destroy();
 }
});

test('reload on a boss victory restores the boss encounter plan, not the next wave',()=>{
 useGame.setState(s=>({p:{...s.p,stage:3,wave:5,encounter:undefined,rewardOffer:undefined}}));
 const b=scene();
 assert.equal(b.plan.boss,true);
 const title=b.plan.title;
 b.units.forEach(u=>u.hp=0);b.phase='fight';b.update(.1);
 const p=useGame.getState().p;
 assert.equal(p.encounter?.phase,'victory');
 assert.ok(p.wave!==5||p.stage!==3,'progress advanced past the boss');
 b.destroy();
 const restored=scene(false);
 assert.equal(restored.phase,'victory');
 assert.equal(restored.plan.boss,true,'the restored plan describes the boss that was beaten');
 assert.equal(restored.plan.title,title);
 restored.destroy();
});

test('the training duel keeps the 60 s duel frame but fights by regular rules, while campaign bosses still escalate',()=>{
 useGame.setState(s=>({p:{...s.p,encounter:undefined,rewardOffer:undefined,lairAttempt:undefined},panel:null}));
 const b=scene(false);
 b.startMode('arena');
 b.toggle();
 b.update(3);
 assert.equal(b.mode,'arena');
 assert.equal(b.boss,true,'duel presentation and timer stay');
 assert.equal(b.bossRules,false);
 const foe=b.units[0];
 foe.hp=foe.max*.2;
 b.enemyStep(foe,.016);
 assert.equal(foe.bossPhase,1,'no hidden ×1.25 / ×1.6 phases');
 b.destroy();
 useGame.setState(s=>({p:{...s.p,stage:3,wave:5,encounter:undefined},panel:null}));
 const c=scene();
 assert.equal(c.mode,'campaign');
 assert.equal(c.bossRules,true);
 c.units[0].hp=c.units[0].max*.2;
 c.enemyStep(c.units[0],.016);
 assert.equal(c.units[0].bossPhase,3,'campaign bosses keep their phases');
 c.destroy();
});
