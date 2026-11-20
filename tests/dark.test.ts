import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {installHeadless,seedRandom,restoreRandom} from '../scripts/sim/bot';
installHeadless();
import {mountBattle,battle} from '../src/game/Battle';
import {freshPlayer,useGame,parseSave,exportSave} from '../src/core/store';
import {stats} from '../src/core/formulas';
import {evoPower} from '../src/saga/companions';
import {planFor} from '../src/saga/encounters';
import {sagaOf} from '../src/saga/save';
import * as R from '../src/dark/rules';
import * as realm from '../src/dark/realm';
import * as A from '../src/dark/actions';
const G=()=>useGame.getState(),P=()=>G().p;
let stop=()=>{};
beforeEach(()=>{stop();useGame.setState({p:freshPlayer(),auto:false,speed:1,panel:null,selected:null,recoveryRequired:false,storageError:false,stopOnDeath:true,continueOnVictory:true});stop=mountBattle({getContext:()=>({})} as unknown as HTMLCanvasElement)});
const give=(fn:(p:ReturnType<typeof freshPlayer>)=>void)=>G().mutate(fn);
const item=(over:Partial<R.DarkItem>={}):R.DarkItem=>({id:R.newDarkId(),s:0,r:2,l:5,u:0,...over});
const reload=()=>{const saved=parseSave(exportSave(),true);assert.ok(saved,'save must stay readable');useGame.setState({p:saved!});return saved!};

test('old saves without dark data keep exactly the same hero and read as empty systems',()=>{
 const p=freshPlayer(),before=stats(p);assert.deepEqual(R.powerBonus(p),R.zeroBonus());
 const legacy=parseSave(JSON.stringify({...p,saga:undefined}))!;assert.deepEqual(stats(legacy),before);
 assert.deepEqual(R.darkState(legacy).inv,[]);assert.equal(R.darkState(legacy).eq.length,12);assert.deepEqual(R.squadState(legacy).act,['goose_aviator','brown_white_dog']);assert.equal(realm.realmRun(legacy),undefined);
 assert.equal(before.reduction,0);
});
test('legacy follower levels without Saga do not activate relic bonuses on read or import',()=>{
 const old=freshPlayer();
 old.companions=[2,3];
 old.relic=5;
 const snapshot=(p:ReturnType<typeof freshPlayer>)=>({
  stats:stats(p),combat:R.squadCombat(p),aura:R.combatAura(p),formation:R.squadState(p).formation,
 });
 const original=snapshot(old);
 const parsed=parseSave(JSON.stringify(old),true)!;
 const reread=parseSave(JSON.stringify(parsed),true)!;
 assert.ok(G().importSave(old));
 const imported=reload();
 for(const p of [parsed,reread,imported]){
  assert.deepEqual(snapshot(p),original);
  assert.equal(p.saga,undefined);
 }
});
test('damaged dark boxes never crash, duplicate or leak invalid values into stats',()=>{
 give(p=>{sagaOf(p).box.dgear={inv:[item({id:'a'}),item({id:'a'}),{id:'x',s:99,r:1,l:1,u:0},'junk',item({id:'b',u:999})],eq:[item({id:'a',s:0}),item({id:'c',s:5})]};sagaOf(p).box.gems={bag:{'ruby:1':-4,'ruby:99':3,'bogus:1':2,'topaz:2':2},sock:{weapon:['ruby:1','ruby:2','nope'],wings:['ruby:1']}};sagaOf(p).box.squad={own:{goose_aviator:{st:77,t:['x',9,1]},ghost:{lv:5}},act:['brown_white_dog','ghost']};sagaOf(p).box.realm={run:{f:50,r:1,b:'fury'},last:'bad'};sagaOf(p).box.relics={lv:{horn:400,heart:3,nope:2}}});
 const p=reload(),d=R.darkState(p);assert.deepEqual(d.eq.filter(Boolean).map(i=>i!.id),['a']);assert.deepEqual(d.inv,[]);
 const g=R.gemState(p);assert.deepEqual(g.bag,{'topaz:2':2});assert.deepEqual(g.sock.weapon,['ruby:1',null,null]);
 const s=R.squadState(p);assert.deepEqual(s.act,['goose_aviator','brown_white_dog']);assert.equal(s.own.goose_aviator.st,0);assert.deepEqual(s.own.goose_aviator.t,[0,0,1]);
 assert.equal(realm.realmRun(p),undefined);assert.equal(R.relicLevel(p,'horn'),R.RELIC_MAX);assert.equal(R.relicLevel(p,'heart'),0);
 assert.ok(Object.values(stats(p)).every(Number.isFinite));
});
test('dark energy: equip, compare, unequip, upgrade and salvage are single transactions with real stats',()=>{
 const sword=item({id:'sword',s:0,r:4,l:10,e:'reaper'}),old=item({id:'old',s:0,r:1,l:3,k:true}),heart=item({id:'heart',s:5,r:3,l:8,e:'veil'});
 give(p=>{R.darkBox(p).inv.push(sword,old,heart);R.addRes(p,'ess',500);p.gold=100000});
 const base=stats(P());assert.ok(A.darkEquip('old'));const withOld=stats(P());assert.equal(withOld.attack-base.attack>0,true);
 assert.ok(A.darkEquip('sword'));assert.equal(A.darkEquip('sword'),false,'double tap must not equip twice');
 let d=R.darkState(P());assert.equal(d.eq[0]!.id,'sword');assert.deepEqual(d.inv.map(i=>i.id).sort(),['heart','old'],'replaced item returns to storage, nothing is lost');
 assert.ok(stats(P()).attack>withOld.attack);assert.ok(A.darkEquip('heart'));assert.ok(stats(P()).hp>base.hp);
 assert.equal(R.darkEffectTotals(P()).reaper,R.darkEffects.reaper.values[1]);assert.equal(R.combatAura(P()).veil,R.darkEffects.veil.values[0]);
 const cost=R.darkUpgradeCost(sword),ess=R.resCount(P(),'ess'),gold=P().gold,attack=stats(P()).attack;
 assert.ok(A.darkUpgrade('sword'));assert.equal(R.resCount(P(),'ess'),ess-cost.ess);assert.equal(P().gold,gold-cost.gold);assert.ok(stats(P()).attack>attack);
 give(p=>{R.addRes(p,'ess',-R.resCount(p,'ess'))});assert.equal(A.darkUpgrade('sword'),false);assert.equal(R.darkState(P()).eq[0]!.u,1);
 assert.equal(A.darkSalvage('sword'),false,'equipped items cannot be dismantled');
 const value=R.darkSalvageValue(R.darkState(P()).inv.find(i=>i.id==='old')!);assert.ok(A.darkSalvage('old'));assert.equal(R.resCount(P(),'ess'),value);assert.equal(A.darkSalvage('old'),false);assert.equal(R.resCount(P(),'ess'),value);
 assert.ok(A.darkUnequip(0));assert.equal(R.darkState(P()).eq[0],null);
 d=R.darkState(reload());assert.equal(d.inv.find(i=>i.id==='sword')!.u,1);assert.equal(d.eq[5]!.id,'heart');
 assert.deepEqual(stats(P()),stats(parseSave(exportSave())!));
});
test('dark resonance and bulk salvage follow their rules; storage is capped',()=>{
 give(p=>{const box=R.darkBox(p);for(let s=0;s<12;s++)box.eq[s]=item({id:'e'+s,s,r:0});box.inv.push(item({id:'plain',r:0}),item({id:'up',r:0,u:2}),item({id:'locked',r:0,k:true}),item({id:'rare',r:3,e:'thorns'}))});
 assert.equal(R.darkResonance(12),.1);assert.ok(Math.abs(R.darkBonus(P()).atkPct-(R.darkValue(R.darkState(P()).eq[6]!)+.1))<1e-9);
 assert.deepEqual(A.darkBulkList(P(),1).map(i=>i.id),['plain','locked']);assert.ok(A.darkSalvageMany(1));assert.deepEqual(R.darkState(P()).inv.map(i=>i.id).sort(),['rare','up']);
 for(let f=1;f<=40;f+=3){const rolled=R.rollDark(f);assert.ok(rolled.r>=0&&rolled.r<=5&&rolled.s<12&&(rolled.r<3||!!R.darkEffectOf(rolled)))}
 assert.ok(R.rollDark(1,()=>.999).r<5,'the top rarity needs floor 15');assert.equal(R.rollDark(30,()=>.9999).r,5);
});
test('gems: sockets, colours, removal, synthesis and bonuses tied to worn equipment',()=>{
 give(p=>{R.gemBox(p).bag={'ruby:1':4,'ruby:2':1,'topaz:1':3};p.gold=1000});
 assert.ok(A.gemInsert('weapon',0,'ruby:1'));assert.equal(R.gemState(P()).bag['ruby:1'],3);assert.equal(R.gemBonus(P()).atkPct,R.gemValue('ruby',1));
 assert.equal(A.gemInsert('weapon',1,'topaz:1'),false,'socket 2 is closed before level 8');
 give(p=>{p.level=8});assert.equal(A.gemInsert('weapon',1,'ruby:2'),false,'one colour per item');assert.ok(A.gemInsert('weapon',1,'topaz:1'));
 assert.equal(A.gemInsert('weapon',2,'topaz:1'),false,'socket 3 needs the Dark Realm');assert.equal(A.gemInsert('wings' as never,0,'ruby:1'),false);assert.equal(A.gemInsert('armor',0,'onyx:1'),false,'cannot insert a gem that is not owned');
 assert.ok(A.gemInsert('weapon',0,'ruby:2'),'replacing returns the old gem');assert.equal(R.gemState(P()).bag['ruby:1'],4);assert.equal(R.gemState(P()).bag['ruby:2'],undefined);
 const worn=stats(P()).attack;give(p=>{p.inventory.push(p.equipment.weapon!);delete p.equipment.weapon});assert.equal(R.gemBonus(P()).atkPct,0,'no item — no gem bonus');
 give(p=>{p.equipment.weapon=p.inventory.pop()!});assert.equal(stats(P()).attack,worn);
 const gold=P().gold;assert.ok(A.gemSynth('ruby:1'));assert.equal(R.gemState(P()).bag['ruby:1'],1);assert.equal(R.gemState(P()).bag['ruby:2'],1);assert.equal(P().gold,gold-R.gemSynthGold(1));assert.equal(A.gemSynth('ruby:1'),false);
 give(p=>{R.gemBox(p).bag={'onyx:1':9}});assert.ok(A.gemSynthAll());assert.deepEqual(R.gemState(P()).bag,{'onyx:3':1});
 assert.ok(A.gemRemove('weapon',1));assert.equal(R.gemState(P()).bag['topaz:1'],1);assert.equal(A.gemRemove('weapon',1),false);
 const p=reload();assert.deepEqual(R.gemState(p).sock.weapon,['ruby:2',null,null]);
 give(q=>{q.gems=R.GEM_SHOP_PRICE});assert.ok(A.gemBuy());assert.equal(P().gems,0);assert.equal(A.gemBuy(),false);
 assert.ok(R.gemValue('ruby',10)>R.gemValue('ruby',9)*1.1);
 const plain=stats(P()).attack;give(q=>{R.gemBox(q).sock.armor=['ruby:10',null,null]});assert.ok(stats(P()).attack>plain*1.15,'a gem really raises the hero attack');
});
test('relics: conditions, costs, levels, collection bonus and the old «Сердце ледника» stay consistent',()=>{
 assert.equal(A.relicUnlock('horn'),false,'needs three bosses');give(p=>{p.bosses=3;p.gold=1e6;R.addRes(p,'shard',200)});
 const before=stats(P()),shards=R.resCount(P(),'shard');assert.ok(A.relicUnlock('horn'));assert.equal(A.relicUnlock('horn'),false);assert.equal(R.resCount(P(),'shard'),shards-R.relicUnlockCost('horn').shard);
 assert.equal(R.relicLevel(P(),'horn'),1);assert.ok(stats(P()).attack>=before.attack);assert.equal(R.combatAura(P()).rally,.12);
 for(let n=0;n<4;n++)assert.ok(A.relicUpgrade('horn'));assert.equal(R.relicLevel(P(),'horn'),5);assert.equal(A.relicUpgrade('horn'),false,'level 5+ needs region material');
 assert.equal(R.relicCollection(P()).bonus,.01);
 const rank=P().relic,gold=P().gold;assert.ok(A.relicUpgrade('heart'));assert.equal(P().relic,rank+1);assert.equal(P().gold,gold-300*(rank+1));assert.equal(R.relicLevel(P(),'heart'),rank+1);
 assert.equal(A.relicUpgrade('aegis'),false);assert.equal(R.relicLevel(reload(),'horn'),5);
 for(const id of R.relicIds){assert.ok(R.relics[id].ability(1).length>8);assert.ok(typeof R.relics[id].need(P()).ok==='boolean')}
});
test('companions: saved shards, legacy awakening, talents and the active pair',()=>{
 give(p=>{
  p.gold=1e6;
  const box=R.squadBox(p);
  box.instances[R.followerId('08_armored_boar')]=R.newFollower('08_armored_boar');
  box.shards['08_armored_boar']=200;
  box.instances[R.followerId('moss_eater')]=R.newFollower('moss_eater');
 });
 assert.equal(A.petActivate('senior_driller'),false);
 const goose=battle!.gooseDamage(),p0=P();assert.equal(goose,Math.round(stats(p0).attack*(.25+p0.companions[0]*.04)*evoPower(p0.companions[0])),'the goose keeps its approved formula');
 assert.ok(A.petActivate('08_armored_boar'));assert.equal(battle!.squad.striker.id,'08_armored_boar');assert.equal(A.petActivate('08_armored_boar'),false);assert.equal(R.squadState(P()).act[1],'brown_white_dog');
 const power=battle!.gooseDamage();assert.ok(A.petLevel('08_armored_boar'));battle!.tuneTeam();assert.ok(battle!.gooseDamage()>power);
 assert.ok(A.petLevel('goose_aviator'));assert.equal(P().companions[0],2,'the goose level stays in the approved save field');
 const hp=stats(P()).hp;assert.ok(A.petStar('08_armored_boar'));assert.equal(R.squadState(P()).own['08_armored_boar'].sh,190);assert.ok(stats(P()).hp>hp,'stars support the hero');
 assert.equal(A.petAwaken('08_armored_boar'),false);give(p=>{const pet=R.squadBox(p).instances[R.followerId('08_armored_boar')];pet.st=3;pet.lv=20;R.addDusk(p,5)});
 assert.ok(A.petAwaken('08_armored_boar'));assert.equal(A.petAwaken('08_armored_boar'),false);assert.equal(R.duskCount(P()),0);battle!.tuneTeam();assert.equal(battle!.squad.striker.awake,true);
 assert.equal(R.talentPoints(R.squadState(P()).own['08_armored_boar']),4);for(let n=0;n<4;n++)assert.ok(A.petTalent('08_armored_boar',2));assert.equal(A.petTalent('08_armored_boar',0),false,'no free points');
 assert.equal(R.combatAura(P()).heroDamage,.06);assert.ok(A.petTalentReset('08_armored_boar'));assert.equal(R.combatAura(P()).heroDamage,0);
 const saved=R.squadState(reload());assert.equal(saved.act[0],'08_armored_boar');assert.equal(saved.own['08_armored_boar'].aw,true);
});
const clearRealmFoe=()=>{const b=battle!;b.phase='fight';b.units.forEach(u=>u.hp=0);b.victory()};
const finishSection=()=>{const section=realm.realmRun(P())!.r;while(realm.realmRun(P())?.r===section&&!realm.realmRun(P())?.stage.startsWith('CHOICE'))clearRealmFoe()};
test('realm: full 7 → four portal choices → boss → one durable claim, free resume and replay',()=>{
 const start=P().chaosite,gold=P().gold;
 assert.equal(A.realmStart(2,'fury'),false);assert.ok(A.realmStart(1,'harvest'));assert.equal(A.realmStart(1,'ward'),false);assert.equal(P().chaosite,start-realm.REALM_COST);
 assert.equal(realm.realmRun(P())!.total,7);assert.equal(battle!.plan.units.length,3);
 finishSection();assert.equal(realm.realmRun(P())!.stage,'CHOICE_1');assert.equal(P().gold,gold);assert.equal(R.resCount(P(),'ess'),0);assert.equal(battle!.phase,'waiting');
 for(let choice=1;choice<=4;choice++){
  const run=realm.realmRun(P())!,pair=structuredClone(run.pair);assert.equal(run.stage,`CHOICE_${choice}`);reload();assert.deepEqual(realm.realmRun(P())!.pair,pair);
  assert.equal(A.chooseRealmPortal('fake'),false);assert.ok(A.chooseRealmPortal(pair![0].id));assert.equal(A.chooseRealmPortal(pair![1].id),false);
  assert.equal(realm.realmRun(P())!.selected!.id,pair![0].id);finishSection();assert.equal(P().darkFloor,1);assert.equal(P().gold,gold);
 }
 assert.equal(realm.realmRun(P())!.stage,'FINAL_BOSS');assert.equal(battle!.plan.boss,true);assert.equal(battle!.plan.units[0].id,realm.floorBoss(1));clearRealmFoe();
 assert.equal(realm.realmRun(P()),undefined);assert.equal(P().darkFloor,1);assert.equal(realm.realmLast(P())!.ack,false);assert.equal(A.realmStart(1,'ward'),false);
 reload();assert.ok(A.collectRealmReward());assert.equal(P().darkFloor,2);assert.ok(P().gold>gold);assert.ok(R.darkState(P()).inv.length>=2);assert.equal(battle!.mode,'campaign');assert.equal(battle!.running,false);
 const awarded=exportSave();assert.equal(A.collectRealmReward(),false);assert.equal(P().gold,JSON.parse(awarded).gold);assert.equal(realm.realmLast(reload())!.ack,true);
 G().open(null);assert.ok(A.realmStart(1,'fury'));assert.equal(realm.realmLast(P()),undefined);finishSection();for(let i=0;i<4;i++){A.chooseRealmPortal(realm.realmRun(P())!.pair![0].id);finishSection()}clearRealmFoe();assert.ok(A.collectRealmReward());assert.equal(P().darkFloor,2);assert.equal(realm.realmLast(P())!.first,false);
});
test('realm: defeat and abandonment bank cleared sections only through explicit acknowledgment',()=>{
 assert.ok(A.realmStart(1,'ward'));finishSection();const pending=realm.realmRun(P())!.acc.ess;assert.ok(pending>0);A.chooseRealmPortal(realm.realmRun(P())!.pair![0].id);clearRealmFoe();
 battle!.defeat();assert.equal(realm.realmRun(P()),undefined);assert.equal(R.resCount(P(),'ess'),0);assert.equal(realm.realmLast(P())!.win,false);assert.equal(P().darkFloor,1);assert.equal(G().panel,'realm');
 reload();assert.ok(A.collectRealmReward());assert.equal(R.resCount(P(),'ess'),pending);assert.equal(A.collectRealmReward(),false);assert.equal(P().stage,1);assert.equal(P().wave,1);
 G().open(null);assert.ok(A.realmStart(1,'ward'));assert.ok(A.realmAbandon());assert.ok(A.collectRealmReward());give(p=>{p.chaosite=0});assert.equal(A.realmStart(1,'fury'),false);
});
test('realm: legacy migration keeps already-issued loot and restarts the paid itinerary without charging',()=>{
 give(p=>{p.gold=1234;sagaOf(p).box.realm={run:{f:1,r:2,b:'ward',acc:{ess:50}},last:{f:1,win:true,rooms:3}}});const chaos=P().chaosite;reload();
 assert.equal(P().gold,1234);assert.equal(realm.realmRun(P())!.legacy,true);assert.equal(realm.realmRun(P())!.stage,'INTRO_7');assert.equal(realm.realmRun(P())!.killed,0);assert.equal(realm.realmLast(P())!.ack,true);assert.ok(A.realmResume());assert.equal(P().chaosite,chaos);
});
test('realm: four and equal stars remain valid and floor boss threat grows',()=>{
 const equal=realm.portalPair('run',1,()=>.99);assert.deepEqual(equal.map(p=>p.stars),[4,4]);assert.notEqual(equal[0].id,equal[1].id);
 assert.deepEqual(realm.portalPair('run',2,()=>0).map(p=>p.stars),[1,1]);
 let previous=0;for(let f=1;f<=40;f++){const boss=realm.realmPlan(f,6);assert.ok(boss.units[0].hp>previous);previous=realm.lordFloor(f)?boss.units[0].hp/1.25:boss.units[0].hp;assert.equal(realm.realmPlan(f,1).boss,false)}
});
test('realm: reload resumes exact wounded enemy and paused hero; failure to persist cannot issue loot',()=>{
 assert.ok(A.realmStart(1,'fury'));const b=battle!;b.phase='fight';b.hp-=10;b.units[0].hp-=11;b.pause();const hp=b.hp,foe=b.units[0].hp;reload();b.restorePlayer();assert.equal(b.running,false);assert.equal(b.hp,hp);assert.equal(b.units[0].hp,foe);assert.ok(A.realmResume());assert.equal(b.hp,hp);assert.equal(b.units[0].hp,foe);
 finishSection();reload();b.restorePlayer();assert.ok(b.realmWaiting());assert.equal(b.running,false);assert.equal(realm.realmRun(P())!.killed,0);
});
test('auras really change the fight: blessing, veil, aegis, gap, thorns, reduction and companion traits',()=>{
 give(p=>{p.bosses=20;p.arenaWins=5;p.darkFloor=12;sagaOf(p).box.relics={lv:{aegis:2,gap:4,horn:1}};const box=R.darkBox(p);box.eq[5]=item({id:'veil',s:5,r:5,l:5,e:'veil'});box.eq[11]=item({id:'void',s:11,r:5,l:20,u:10,e:'thorns'})});
 assert.ok(stats(P()).reduction>0);assert.ok(A.realmStart(1,'fury'));const b=battle!,plan=realm.realmPlan(1,1);
 assert.equal(b.shield,Math.round(b.maxHp*R.darkEffects.veil.values[2]));assert.equal(b.units[0].hp,Math.round(plan.units[0].hp*(1-R.combatAura(P()).foeHpCut)));
 b.phase='fight';assert.ok(Math.abs(b.auraDamage()-1.2*1.12*1)<1e-9,'fury blessing and the horn rally stack once');
 const hp=b.hp,shield=b.shield;b.takeDamage(500);assert.equal(b.hp,hp);assert.equal(b.shield,shield,'aegis swallows the first hit');
 b.shield=0;const foe=b.units[0].hp;seedRandom(3);b.takeDamage(500);restoreRandom();assert.ok(b.hp<hp);assert.ok(b.units[0].hp<foe,'thorns return damage');
 give(p=>{const q=R.squadBox(p);const id=R.followerId('senior_driller');q.instances[id]=R.newFollower('senior_driller',3);q.formation[0]=id});b.tuneTeam();const def=b.foeDef(b.units[0]);b.hit(b.units[0],5,false,'#fff','goose');assert.ok(b.foeDef(b.units[0])<def,'the driller wears armour down');
 give(p=>{const q=R.squadBox(p);const id=R.followerId('capybara_bruiser');q.instances[id]=R.newFollower('capybara_bruiser',2);q.formation[1]=id});b.tuneTeam();b.shield=0;b.guardianAid();assert.equal(b.shield,Math.round(b.maxHp*.06));
});

test('realm: final claim rolls back on storage failure and retries without granting twice',()=>{
 assert.ok(A.realmStart(1,'ward'));finishSection();for(let n=0;n<4;n++){A.chooseRealmPortal(realm.realmRun(P())!.pair![0].id);finishSection()}clearRealmFoe();
 const gold=P().gold,floor=P().darkFloor,save=localStorage.setItem;
 localStorage.setItem=()=>{throw new Error('quota')};
 try{assert.equal(A.collectRealmReward(),false);assert.equal(P().gold,gold);assert.equal(P().darkFloor,floor);assert.equal(realm.realmLast(P())!.ack,false)}finally{localStorage.setItem=save}
 assert.ok(A.collectRealmReward());const paid=P().gold;assert.ok(paid>gold);assert.equal(A.collectRealmReward(),false);assert.equal(P().gold,paid);
});
test('realm: defeat at intro, every segment and final boss never opens a floor or leaks pending loot',()=>{
 for(let section=1;section<=6;section++){
  const p=freshPlayer();realm.realmBox(p).run=realm.newRealmRun(1,'ward','loss-'+section);
  for(let r=1;r<section;r++){
   const run=realm.realmRun(p)!;for(let i=0;i<run.total;i++)assert.ok(realm.realmVictory(p,`${r}-${i}`));
   const next=realm.realmRun(p)!;if(next.pair)assert.ok(realm.realmChoose(p,next.pair[0].id));
  }
  const before=p.gold;assert.ok(realm.realmDefeat(p));assert.equal(realm.realmDefeat(p),false);assert.equal(p.gold,before);assert.equal(p.darkFloor,1);
  const restored=parseSave(JSON.stringify(p),true)!;assert.ok(restored);const hooks={xp:()=>{},trophies:()=>{throw Error('defeat has no boss trophy')}};
  assert.ok(realm.realmClaim(restored,hooks));assert.equal(realm.realmClaim(restored,hooks),false);assert.equal(restored.darkFloor,1);assert.equal(realm.realmLast(restored)!.rooms,section-1);
 }
});
test('realm: duplicate combat event cannot advance two enemies and an acknowledged result stays silent',()=>{
 const p=freshPlayer();realm.realmBox(p).run=realm.newRealmRun(1,'fury','dedupe');assert.ok(realm.realmVictory(p,'fight-1'));assert.equal(realm.realmVictory(p,'fight-1'),false);assert.equal(realm.realmRun(p)!.killed,1);assert.equal(p.kills,1);
 realm.realmDefeat(p);realm.realmClaim(p,{xp:()=>{},trophies:()=>[]});const restored=parseSave(JSON.stringify(p))!;assert.equal(realm.realmLast(restored)!.stage,'CLAIMED');
});
test('realm: switching modes preserves a separate paid combat checkpoint with HP and cooldowns',()=>{
 assert.ok(A.realmStart(1,'ward'));const b=battle!;b.phase='fight';b.hp-=18;b.units[0].hp-=13;b.cooldowns[0]=2.5;b.pause();const hp=b.hp,foe=b.units[0].hp;
 b.leaveRealm();reload();b.restorePlayer();assert.equal(b.mode,'campaign');assert.ok(A.realmResume());assert.equal(b.mode,'darkness');assert.equal(b.hp,hp);assert.equal(b.units[0].hp,foe);assert.equal(b.cooldowns[0],2.5);
});
test('realm: shared companion achievements are banked until acknowledgment and cannot leak currency mid-run',()=>{
 assert.ok(A.realmStart(1,'ward'));const before=P().gems;for(let i=0;i<5;i++)battle!.director.count('guard');assert.equal(P().gems,before);assert.equal(realm.realmRun(P())!.acc.gems,5);
 assert.ok(A.realmAbandon());assert.equal(P().gems,before);assert.ok(A.collectRealmReward());assert.equal(P().gems,before+5);assert.equal(A.collectRealmReward(),false);
});
test('realm: higher stars rank above the other portal in size and per-enemy threat',()=>{
 const base=realm.newRealmRun(1,'ward','reference');
 const counts=[0,.5,.99];
 for(const left of realm.portalConfig.stars)for(const right of realm.portalConfig.stars){
  for(const leftRoll of counts)for(const rightRoll of counts){
   const rolls=[(left-.5)/4,0,leftRoll,(right-.5)/4,.99,rightRoll];
   const [a,b]=realm.portalPair('reference',1,()=>rolls.shift()!);
   assert.deepEqual([a.stars,b.stars],[left,right]);
   assert.ok(realm.portalConfig.counts.includes(a.count));
   assert.ok(realm.portalConfig.counts.includes(b.count));
   if(left===right)continue;
   const [easy,hard]=left<right?[a,b]:[b,a];
   assert.ok(hard.count>easy.count,`${left}★/${right}★ with rolls ${leftRoll}/${rightRoll}`);
   const foe=(portal:realm.Portal)=>realm.realmPlan(1,2,{...base,r:2,selected:portal,total:portal.count}).units[0];
   assert.ok(foe(hard).hp>foe(easy).hp);
   assert.ok(foe(hard).atk>foe(easy).atk);
  }
 }
});

test('realm: published choices keep their saved enemy counts after reload',()=>{
 const p=freshPlayer(),run=realm.newRealmRun(1,'ward','old-pair');
 const pair:[realm.Portal,realm.Portal]=[
  {id:'old-pair:1:0',stars:1,count:11,biome:0,label:'Врата теней'},
  {id:'old-pair:1:1',stars:4,count:9,biome:1,label:'Путь скитальцев'},
 ];
 realm.realmBox(p).run={...run,r:2,stage:'CHOICE_1',total:0,pair};
 const restored=parseSave(JSON.stringify(p),true)!;
 assert.deepEqual(realm.realmRun(restored)!.pair,pair);
 assert.ok(realm.realmChoose(restored,pair[1].id));
 assert.ok(realm.realmVictory(restored,'first-enemy'));
 const resumed=realm.realmRun(parseSave(JSON.stringify(restored),true)!)!;
 assert.equal(resumed.total,9);
 assert.equal(resumed.killed,1);
 assert.deepEqual(resumed.selected,pair[1]);
});

test('legacy followers migrate exactly once with their original combat and all resources',()=>{
 const old=freshPlayer();
 old.companions=[123,44];
 old.gold=47000;
 old.gems=91;
 const saga=sagaOf(old);
 saga.n={'res:seal':17,'res:shard':21,'res:ess':34,'mat:dusk':8};
 saga.box.pets={b:[0,1]};
 saga.box.relics={lv:{ravens:2}};
 saga.box.squad={
  own:{
   goose_aviator:{st:4,sh:97,aw:true,t:[5,3,2]},
   brown_white_dog:{st:2,sh:42,aw:false,t:[1,4,3]},
   senior_driller:{lv:35,st:3,sh:62,aw:true,t:[2,1,4]},
   moss_eater:{lv:0,sh:7},
  },
  act:['senior_driller','brown_white_dog'],
 };
 const before={stats:stats(old),combat:R.squadCombat(old),aura:R.combatAura(old),
  bonus:R.squadBonus(old),ravens:R.relics.ravens.need(old)};
 const p=parseSave(JSON.stringify(old),true)!;
 const state=R.squadState(p);
 assert.deepEqual(state.formation,[R.followerId('senior_driller'),R.followerId('brown_white_dog'),null]);
 assert.deepEqual(state.own.goose_aviator,{lv:123,st:4,sh:97,aw:true,t:[5,3,2]});
 assert.deepEqual(state.own.senior_driller,{lv:35,st:3,sh:62,aw:true,t:[2,1,4]});
 assert.equal(state.shards.moss_eater,7);
 assert.equal(state.instances[R.followerId('moss_eater')],undefined);
 for(const pet of Object.values(state.instances)){
  assert.equal(pet.talents.length,8);
  assert.deepEqual(pet.talents.map(slot=>slot.open),[true,true,true,true,false,false,false,false]);
 }
 assert.deepEqual({stats:stats(p),combat:R.squadCombat(p),aura:R.combatAura(p),
  bonus:R.squadBonus(p),ravens:R.relics.ravens.need(p)},before);
 assert.deepEqual(p.saga?.n,saga.n);
 assert.deepEqual(p.saga?.box.pets,saga.box.pets);
 assert.deepEqual(p.saga?.box.relics,saga.box.relics);
 assert.equal(p.gold,old.gold);
 assert.equal(p.gems,old.gems);
 assert.deepEqual(parseSave(JSON.stringify(p),true),p);
 assert.ok(G().importSave(old));
 assert.deepEqual(R.squadState(reload()),state);
});

test('follower migration preserves other Saga progress in a near-capacity save',()=>{
 const p=freshPlayer(),saga=sagaOf(p);
 saga.box.squad={own:Object.fromEntries(R.companionIds.map(id=>[id,{lv:40,st:4,sh:200,aw:true,t:[4,5,3]}]))};
 saga.box.archive=Object.fromEntries(Array.from({length:215},(_,i)=>['entry'+i,'x'.repeat(400)]));
 assert.ok(JSON.stringify(saga.box).length<90000);
 const migrated=parseSave(JSON.stringify(p),true)!;
 assert.ok(JSON.stringify(migrated.saga?.box).length>90000);
 assert.deepEqual(parseSave(JSON.stringify(migrated),true),migrated);
});

test('formation saves individual copies, protects the combat pair, and rolls back a failed write',()=>{
 const extra='follower:boar-copy',original=R.followerId('08_armored_boar'),goose=R.followerId('goose_aviator');
 give(p=>{
  const s=R.squadBox(p);
  s.instances[original]=R.newFollower('08_armored_boar',7);
  s.instances[extra]=R.newFollower('08_armored_boar',15,[3,1,2]);
 });
 const base=R.squadCombat(P()),collection=R.relics.ravens.need(P());
 assert.equal(A.petActivate(goose,2),false);
 assert.equal(A.petClearReserve(goose),false);
 assert.ok(A.petActivate(extra,2));
 const extended=R.squadCombat(P());
 assert.deepEqual([extended.striker,extended.guardian],[base.striker,base.guardian]);
 assert.equal(extended.reserve?.instanceId,extra);
 assert.equal(extended.heroDamage,base.heroDamage+.03);
 assert.equal(R.squadState(P()).formation[2],extra);
 assert.deepEqual(R.relics.ravens.need(P()),collection);
 const raw=exportSave(),storage=localStorage.setItem;
 localStorage.setItem=()=>{throw new Error('write failed')};
 try{
  assert.equal(A.petActivate(extra),false);
  assert.equal(A.petClearReserve(extra),false);
  assert.equal(exportSave(),raw);
 }finally{localStorage.setItem=storage}
 assert.ok(A.petClearReserve(extra));
 assert.equal(R.squadState(P()).formation[2],null);
 assert.ok(A.petActivate(extra,2));
 assert.deepEqual(R.squadState(reload()).formation,[goose,R.followerId('brown_white_dog'),extra]);
 assert.ok(A.petActivate(extra));
 assert.deepEqual(R.squadState(P()).formation,[extra,R.followerId('brown_white_dog'),null]);
 assert.equal(R.squadState(P()).instances[original].lv,7);
 assert.equal(R.squadCombat(P()).heroDamage,.03);
 assert.equal(A.petActivate(extra,2),false);
});

test('both level entry points enforce 100 without reducing veteran levels or charging gold',()=>{
 const goose=R.followerId('goose_aviator'),dog=R.followerId('brown_white_dog'),boar=R.followerId('08_armored_boar');
 give(p=>{p.gold=100000;p.companions=[99,137];R.squadBox(p).instances[boar]=R.newFollower('08_armored_boar',99)});
 assert.ok(A.petLevel(boar));
 G().train('companion',0);
 assert.equal(R.squadState(P()).instances[goose].lv,100);
 assert.equal(R.squadState(P()).instances[boar].lv,100);
 const gold=P().gold;
 assert.equal(A.petLevel(boar),false);
 assert.equal(A.petLevel(goose),false);
 assert.equal(A.petLevel(dog),false);
 G().train('companion',0);
 G().train('companion',1);
 assert.equal(P().gold,gold);
 assert.deepEqual(P().companions,[100,137]);
 assert.equal(R.squadState(reload()).instances[dog].lv,137);
});

test('Heart of the Glacier reports insufficiency and failed saves without altering a veteran relic',()=>{
 give(p=>{p.relic=420;p.gold=126_299});
 const power=stats(P()).attack;
 assert.equal(A.relicUpgrade('heart'),false);
 assert.equal(P().gold,126_299);
 assert.equal(P().relic,420);
 give(p=>{p.gold=126_300});
 const write=localStorage.setItem;
 try{
  localStorage.setItem=()=>{throw new Error('quota')};
  assert.equal(A.relicUpgrade('heart'),false);
  assert.equal(P().gold,126_300);
  assert.equal(P().relic,420);
  assert.equal(stats(P()).attack,power);
 }finally{localStorage.setItem=write}
 assert.equal(A.relicUpgrade('heart'),true);
 assert.equal(P().gold,0);
 assert.equal(reload().relic,421);
});
