import {test,beforeEach} from 'node:test';import assert from 'node:assert/strict';
import {Battle} from '../src/game/Battle';import {useGame,freshPlayer,makeItem,parseSave,SAVE_KEY,compareItem,exportSave} from '../src/core/store';import {stats} from '../src/core/formulas';import {inventoryItems} from '../src/core/loot';import {chapterOne} from '../src/game/Chapter';
Object.defineProperty(globalThis,'Image',{value:class{src='';complete=false;naturalWidth=0}});Object.defineProperty(globalThis,'requestAnimationFrame',{value:()=>1});Object.defineProperty(globalThis,'cancelAnimationFrame',{value:()=>{}});const saves=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{value:{setItem:(k:string,v:string)=>saves.set(k,v),getItem:(k:string)=>saves.get(k)??null}});
beforeEach(()=>useGame.setState({p:freshPlayer(),panel:null,selected:null,auto:false,speed:1}));const scene=()=>new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement);
test('opening any menu pauses the entire encounter; closing never silently resumes',()=>{
 const b=scene();b.toggle();for(let n=0;n<100;n++)b.update(.02);useGame.getState().open('shop');assert.equal(b.running,false);const snap=b.snapshot();b.update(20);assert.deepEqual(b.snapshot(),snap);useGame.getState().open(null);b.update(20);assert.deepEqual(b.snapshot(),snap);b.toggle();b.update(.02);assert.ok(b.journey.worldX>snap.journey!.worldX);b.destroy();
});
test('paid mode selection is free and reversible; actual start charges once, including reload',()=>{
 const b=scene(),g=()=>useGame.getState(),initial=g().p.chaosite,original=b.snapshot();b.startMode('dungeon');b.startMode('darkness');assert.equal(g().p.chaosite,initial);assert.equal(b.id,original.id);assert.deepEqual(b.journey,original.journey);b.startMode('campaign');assert.equal(b.pendingMode,undefined);assert.equal(b.id,original.id);
 b.startMode('dungeon');b.checkpoint();b.destroy();const p=parseSave(saves.get(SAVE_KEY)!)!;assert.equal(p.chaosite,initial);useGame.setState({p});const restored=scene();assert.equal(restored.pendingMode,'dungeon');restored.toggle();assert.equal(g().p.chaosite,initial-5);assert.equal(restored.entryPaid,true);const id=restored.id;restored.toggle();restored.toggle();assert.equal(g().p.chaosite,initial-5);assert.equal(restored.id,id);restored.destroy();const paid=scene();paid.toggle();assert.equal(g().p.chaosite,initial-5);assert.equal(paid.id,id);paid.destroy();
});
test('unaffordable start preserves enemies, position and money',()=>{const b=scene();useGame.getState().mutate(p=>p.chaosite=0);b.startMode('darkness');const s=b.snapshot();b.toggle();assert.equal(b.running,false);assert.deepEqual(b.snapshot(),s);assert.equal(useGame.getState().p.chaosite,0);b.destroy()});
test('a timed strike cancels the attack and opens a real damage window; early strike does not',()=>{
 const b=scene();b.phase='fight';b.toggle();const u=b.units[0];u.worldX=b.journey.cameraX+b.heroX+60;u.worldY=b.journey.worldY;u.hp=u.max=10000;u.windup=1.5;b.skill(0);assert.ok(u.windup>0);b.cooldowns[0]=0;u.windup=.6;u.actionTime=0;b.skill(0);assert.equal(u.windup,0);assert.equal(u.actionTime,0);assert.equal(u.exposed,chapterOne.counter_exposure_seconds);const old=u.hp;b.hit(u,100);assert.equal(old-u.hp,Math.round(100*chapterOne.counter_damage_multiplier));b.destroy();
});
test('boss phase2 creates a timed poison floor; hammer clears it without changing the boss clock',()=>{
 useGame.getState().mutate(p=>p.wave=5);const b=scene();b.phase='fight';b.toggle();const u=b.units[0];u.hp=u.max*.6;b.enemyStep(u,.01);assert.equal(u.bossPhase,2);assert.equal(u.ability,'Ледяной кокон');u.windup=0;u.actionTime=.01;b.enemyStep(u,.02);assert.ok(b.hazard.remaining>0);const clock=b.timer;b.skill(2);assert.equal(b.hazard.remaining,0);assert.equal(b.timer,clock);b.destroy();
});
test('boss receipt and the named epic are single-use; all three reward choices keep the item or pay once',()=>{
 for(const action of ['equip','keep','salvage']){
  useGame.setState({p:{...freshPlayer(),wave:5},panel:null});const b=scene();b.units.forEach(u=>u.hp=0);b.victory();const g=()=>useGame.getState(),offer=g().p.rewardOffer!,item=g().p.inventory.find(i=>i.id===offer.itemId)!;assert.equal(item.rarity,4);assert.ok(compareItem(item,g().p)>0);assert.equal(g().p.bosses,1);b.victory();assert.equal(g().p.bosses,1);
  for(let t=0;t<100;t++)b.update(.02);b.toggle();assert.equal(b.running,false);const originalGold=g().p.gold;
  if(action==='equip'){g().equip(item.id);assert.equal(g().p.equipment.weapon?.id,item.id)}else if(action==='keep'){g().keepReward();assert.ok(g().p.inventory.some(i=>i.id===item.id))}else{g().salvage(item.id);assert.ok(g().p.inventory.some(i=>i.id===item.id));g().salvage(item.id,true);const gold=g().p.gold;g().salvage(item.id,true);assert.equal(g().p.gold,gold);assert.ok(gold>originalGold)}
  assert.equal(g().p.rewardOffer?.resolved,true);g().open(null);b.continueAfterLoot();assert.equal(b.running,true);const world=b.journey.worldX;for(let n=0;n<150;n++)b.update(.02);assert.ok(b.journey.worldX>=world);assert.equal(g().p.bosses,1);b.destroy();
 }
});
test('locked items cannot be dismantled; sort/filter is read-only and settings serialize',()=>{
 const g=()=>useGame.getState();g().mutate(p=>{p.inventory=[makeItem('weapon',4,4),makeItem('armor',1,1)]});const id=g().p.inventory[0].id;g().lockItem(id);const before=structuredClone(g().p);g().salvage(id,true);assert.deepEqual(g().p,before);assert.equal(inventoryItems(g().p,'locked').length,1);inventoryItems(g().p,'all',undefined,'rarity');assert.deepEqual(g().p,before);g().configure({auto:false,speed:2});const saved=parseSave(exportSave())!;assert.deepEqual(saved.preferences,{auto:false,speed:2});
});
test('import backs up live state first, restores OFF, and retains owned gear and settings',()=>{
 const b=scene();b.toggle();b.update(.5);const old=b.id,oldGear=useGame.getState().p.equipment.weapon!.id;const incoming=freshPlayer();incoming.stage=3;incoming.preferences={auto:false,speed:2};assert.ok(useGame.getState().importSave(incoming));const backup=parseSave(saves.get(SAVE_KEY+':before-import')!)!;assert.equal(backup.encounter?.id,old);assert.equal(backup.equipment.weapon!.id,oldGear);assert.equal(useGame.getState().p.stage,3);assert.equal(b.running,false);assert.equal(useGame.getState().speed,2);b.destroy();
});
test('the four first encounters have distinct rosters and every class can clear the full route with tactical Auto',()=>{
 const rosters=[];
 for(const heroClass of ['berserker','ranger','runologist'] as const){useGame.setState({p:{...freshPlayer(),heroClass},panel:null,auto:true});const b=scene();b.toggle();const phases=new Set<number>();let index=0;
 for(let tick=0;tick<12000&&useGame.getState().p.stage===1;tick++){b.update(.02);if(b.boss)phases.add(b.units[0].bossPhase);if(b.wave>index){index=b.wave;if(heroClass==='berserker'&&b.wave<5)rosters.push(b.units.map(u=>u.id).join('|'))}}
 assert.equal(useGame.getState().p.stage,2,heroClass);assert.deepEqual([...phases],[1,2,3]);assert.ok(b.timer>0);assert.ok(useGame.getState().p.rewardOffer);b.destroy();}
 assert.equal(new Set(rosters).size,4);
});

test('a manually killed boss cannot deal one last poison tick before victory; strict import rejects a broken paid session',()=>{
 useGame.getState().mutate(p=>p.wave=5);const b=scene();b.phase='fight';b.toggle();b.hp=1;b.hazard={remaining:2,tick:0,damage:100000};b.units.forEach(u=>u.hp=0);b.update(.02);assert.equal(b.phase,'victory');assert.ok(b.hp>0);assert.equal(b.hazard.remaining,0);const invalid=freshPlayer();invalid.encounter=b.snapshot();invalid.encounter.hazard!.damage=NaN;assert.equal(parseSave(JSON.stringify(invalid),true),null);b.destroy();
});

test('an unknown enemy asset is rejected by strict save import instead of crashing the scene',()=>{
 const b=scene();const p=freshPlayer();p.encounter=b.snapshot();p.encounter.units[0].id='unknown-art';assert.equal(parseSave(JSON.stringify(p),true),null);assert.ok(parseSave(JSON.stringify(p))?.equipment.weapon);b.destroy();
});

test('fractional wave numbers cannot enter an indexed chapter or a restored victory',()=>{
 const p=freshPlayer();p.wave=1.5;assert.equal(parseSave(JSON.stringify(p),true),null);const b=scene();const saved=freshPlayer();saved.encounter=b.snapshot();saved.encounter.wave=2.5;assert.equal(parseSave(JSON.stringify(saved),true),null);b.destroy();
});

test('save hydration never overwrites engine functions, renderer or canvas with imported metadata',()=>{
 const b=scene(),canvas=b.canvas,ctx=b.ctx;const incoming=freshPlayer();incoming.encounter={...b.snapshot(),canvas:null,ctx:{invalid:true},stopped:true,frame:'invalid',pause:'invalid'} as unknown as ReturnType<Battle['snapshot']>;assert.ok(useGame.getState().importSave(incoming));assert.equal(b.canvas,canvas);assert.equal(b.ctx,ctx);assert.equal(b.stopped,false);assert.equal(typeof b.frame,'function');assert.equal(typeof b.pause,'function');b.destroy();
});

test('real critical feedback never mutates rewards or battle clocks, freezes OFF, and uses real-time at x2',()=>{const b=scene();b.toggle();b.phase='fight';const u=b.units[0];u.hp=u.max=10000;const gold=useGame.getState().p.gold,timer=b.timer,clock=b.clock;b.hit(u,100,true);assert.ok(b.comics.active);assert.equal(useGame.getState().p.gold,gold);assert.equal(b.timer,timer);b.pause();const life=b.comics.active.life;b.update(1);assert.equal(b.comics.active.life,life);useGame.setState({speed:2});b.toggle();for(let n=0;n<10;n++)b.update(.04);assert.ok(Math.abs(b.comics.active!.life-.2)<.001);assert.equal(b.timer,timer);assert.ok(Math.abs(b.clock-(clock+.4))<.001);useGame.getState().mutate(p=>p.reducedMotion=true);b.comics.reset();b.hit(u,100,true);assert.equal(b.impactStop,0);assert.ok(b.comics.active);for(let n=0;n<4;n++)b.update(.05,.1);assert.equal(b.comics.active,null);b.destroy();});
