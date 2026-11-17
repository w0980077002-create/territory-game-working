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
test('damaged dark boxes never crash, duplicate or leak invalid values into stats',()=>{
 give(p=>{sagaOf(p).box.dgear={inv:[item({id:'a'}),item({id:'a'}),{id:'x',s:99,r:1,l:1,u:0},'junk',item({id:'b',u:999})],eq:[item({id:'a',s:0}),item({id:'c',s:5})]};sagaOf(p).box.gems={bag:{'ruby:1':-4,'ruby:99':3,'bogus:1':2,'topaz:2':2},sock:{weapon:['ruby:1','ruby:2','nope'],wings:['ruby:1']}};sagaOf(p).box.squad={own:{goose_aviator:{st:77,t:['x',9,1]},ghost:{lv:5}},act:['brown_white_dog','ghost']};sagaOf(p).box.realm={run:{f:50,r:1,b:'fury'},last:'bad'};sagaOf(p).box.relics={lv:{horn:400,heart:3,nope:2}}});
 const p=reload(),d=R.darkState(p);assert.deepEqual(d.eq.filter(Boolean).map(i=>i!.id),['a']);assert.deepEqual(d.inv,[]);
 const g=R.gemState(p);assert.deepEqual(g.bag,{'topaz:2':2});assert.deepEqual(g.sock.weapon,['ruby:1',null,null]);
 const s=R.squadState(p);assert.deepEqual(s.act,['goose_aviator','brown_white_dog']);assert.equal(s.own.goose_aviator.st,0);assert.deepEqual(s.own.goose_aviator.t,[0,0,1]);
 assert.equal(realm.realmRun(p),undefined);assert.equal(R.relicLevel(p,'horn'),R.RELIC_MAX);assert.equal(R.relicLevel(p,'heart'),0);
 assert.ok(Object.values(stats(p)).every(Number.isFinite));
});
test('dark energy: equip, compare, unequip, upgrade, lock and salvage are single transactions with real stats',()=>{
 const sword=item({id:'sword',s:0,r:4,l:10,e:'reaper'}),old=item({id:'old',s:0,r:1,l:3}),heart=item({id:'heart',s:5,r:3,l:8,e:'veil'});
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
 assert.ok(A.darkLock('old'));assert.equal(A.darkSalvage('old'),false);assert.ok(A.darkLock('old'));
 const value=R.darkSalvageValue(R.darkState(P()).inv.find(i=>i.id==='old')!);assert.ok(A.darkSalvage('old'));assert.equal(R.resCount(P(),'ess'),value);assert.equal(A.darkSalvage('old'),false);assert.equal(R.resCount(P(),'ess'),value);
 assert.ok(A.darkUnequip(0));assert.equal(R.darkState(P()).eq[0],null);
 d=R.darkState(reload());assert.equal(d.inv.find(i=>i.id==='sword')!.u,1);assert.equal(d.eq[5]!.id,'heart');
 assert.deepEqual(stats(P()),stats(parseSave(exportSave())!));
});
test('dark resonance and bulk salvage follow their rules; storage is capped',()=>{
 give(p=>{const box=R.darkBox(p);for(let s=0;s<12;s++)box.eq[s]=item({id:'e'+s,s,r:0});box.inv.push(item({id:'plain',r:0}),item({id:'up',r:0,u:2}),item({id:'locked',r:0,k:true}),item({id:'rare',r:3,e:'thorns'}))});
 assert.equal(R.darkResonance(12),.1);assert.ok(Math.abs(R.darkBonus(P()).atkPct-(R.darkValue(R.darkState(P()).eq[6]!)+.1))<1e-9);
 assert.deepEqual(A.darkBulkList(P(),1).map(i=>i.id),['plain']);assert.ok(A.darkSalvageMany(1));assert.deepEqual(R.darkState(P()).inv.map(i=>i.id).sort(),['locked','rare','up']);
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
test('companions: summon pays once, shards unlock, stars, awakening, talents and the active pair',()=>{
 assert.equal(A.summon(1,'seal'),null);give(p=>{R.addRes(p,'seal',10);p.gold=1e6});
 seedRandom(11);const results=A.summon(10,'seal')!;restoreRandom();assert.equal(results.length,10);assert.equal(R.resCount(P(),'seal'),0);assert.equal(A.summon(1,'seal'),null);
 const total=results.reduce((a,r)=>a+r.shards,0),s=R.squadState(P()),spent=R.companionIds.reduce((a,id)=>a+(R.legacyPet(id)<0&&s.own[id].lv>0?R.companions[id].shards:0),0);
 assert.equal(R.companionIds.reduce((a,id)=>a+s.own[id].sh,0)+spent,total,'every shard is accounted for');
 give(p=>{const box=R.squadBox(p);box.own['08_armored_boar'].lv=1;box.own['08_armored_boar'].sh=200;box.own.moss_eater.lv=1});
 assert.equal(A.petActivate('senior_driller')||R.squadState(P()).own.senior_driller.lv>0,R.squadState(P()).own.senior_driller.lv>0);
 const goose=battle!.gooseDamage(),p0=P();assert.equal(goose,Math.round(stats(p0).attack*(.25+p0.companions[0]*.04)*evoPower(p0.companions[0])),'the goose keeps its approved formula');
 assert.ok(A.petActivate('08_armored_boar'));assert.equal(battle!.squad.striker.id,'08_armored_boar');assert.equal(A.petActivate('08_armored_boar'),false);assert.equal(R.squadState(P()).act[1],'brown_white_dog');
 const power=battle!.gooseDamage();assert.ok(A.petLevel('08_armored_boar'));battle!.tuneTeam();assert.ok(battle!.gooseDamage()>power);
 assert.ok(A.petLevel('goose_aviator'));assert.equal(P().companions[0],2,'the goose level stays in the approved save field');
 const hp=stats(P()).hp;assert.ok(A.petStar('08_armored_boar'));assert.equal(R.squadState(P()).own['08_armored_boar'].sh,190);assert.ok(stats(P()).hp>hp,'stars support the hero');
 assert.equal(A.petAwaken('08_armored_boar'),false);give(p=>{const pet=R.squadBox(p).own['08_armored_boar'];pet.st=3;pet.lv=20;R.addDusk(p,5)});
 assert.ok(A.petAwaken('08_armored_boar'));assert.equal(A.petAwaken('08_armored_boar'),false);assert.equal(R.duskCount(P()),0);battle!.tuneTeam();assert.equal(battle!.squad.striker.awake,true);
 assert.equal(R.talentPoints(R.squadState(P()).own['08_armored_boar']),4);for(let n=0;n<4;n++)assert.ok(A.petTalent('08_armored_boar',2));assert.equal(A.petTalent('08_armored_boar',0),false,'no free points');
 assert.equal(R.combatAura(P()).heroDamage,.06);assert.ok(A.petTalentReset('08_armored_boar'));assert.equal(R.combatAura(P()).heroDamage,0);
 const saved=R.squadState(reload());assert.equal(saved.act[0],'08_armored_boar');assert.equal(saved.own['08_armored_boar'].aw,true);
 assert.ok(Math.abs(R.summonTable.reduce((a,r)=>a+r.chance,0)-1)<1e-9);
});
test('dark realm: paid once, three rooms, rewards per room, first clear opens the next floor, replays do not',()=>{
 const start=P().chaosite;assert.equal(A.realmStart(2,'fury'),false,'floor 2 is locked');assert.equal(P().chaosite,start);
 assert.ok(A.realmStart(1,'harvest'));assert.equal(P().chaosite,start-realm.REALM_COST);assert.equal(A.realmStart(1,'fury'),false,'a run is already active');assert.equal(P().chaosite,start-realm.REALM_COST);
 const b=battle!;assert.equal(b.mode,'darkness');assert.equal(b.running,true);assert.equal(b.plan.units.length,2);assert.equal(b.plan.boss,false);
 const clear=()=>{b.phase='fight';b.units.forEach(u=>u.hp=0);b.victory()};
 clear();assert.equal(realm.realmRun(P())!.r,2);assert.ok(R.resCount(P(),'ess')>=Math.round(4*1.3));const id=b.id;b.rewarded=false;assert.equal(G().win('darkness',id),false,'the same room cannot pay twice');assert.equal(realm.realmRun(P())!.r,2);
 b.update(2);assert.equal(b.mode,'darkness');assert.equal(b.phase,'walk');assert.equal(b.plan.boss,true);assert.equal(b.plan.units[0].id,realm.floorKeeper(1));
 reload();assert.equal(realm.realmRun(P())!.r,2,'the room survives a reload');assert.equal(planFor(P(),'darkness').units[0].id,realm.floorKeeper(1));
 clear();b.update(2);assert.equal(b.plan.units[0].id,realm.floorBoss(1));assert.equal(P().darkFloor,1);
 clear();assert.equal(realm.realmRun(P()),undefined);assert.equal(P().darkFloor,2);const last=realm.realmLast(P())!;assert.equal(last.win,true);assert.equal(last.first,true);assert.equal(last.rooms,3);
 assert.ok(R.darkState(P()).inv.length>=2,'first clear gives two dark items');assert.ok(R.darkState(P()).inv.some(i=>i.r>=2));assert.ok(Object.keys(R.gemState(P()).bag).length>=1);assert.equal(R.resCount(P(),'seal'),1);assert.ok(R.duskCount(P())>=1);assert.equal(P().rewardOffer,undefined);
 b.update(2);assert.equal(b.mode,'campaign');assert.equal(b.running,false);assert.equal(G().panel,'realm','the result window opens');
 G().open(null);assert.ok(A.realmStart(1,'fury'));clear();b.update(2);clear();b.update(2);clear();assert.equal(P().darkFloor,2,'a replay never opens a floor twice');assert.equal(realm.realmLast(P())!.first,false);
});
test('dark realm: defeat ends the run, keeps earned rewards and returns to the campaign with a result',()=>{
 assert.ok(A.realmStart(1,'ward'));const b=battle!;b.phase='fight';b.units.forEach(u=>u.hp=0);b.victory();const ess=R.resCount(P(),'ess');assert.ok(ess>0);b.update(2);
 b.phase='fight';b.defeat();assert.equal(realm.realmRun(P()),undefined);const last=realm.realmLast(P())!;assert.equal(last.win,false);assert.equal(last.rooms,1);assert.equal(last.ess,ess);assert.equal(R.resCount(P(),'ess'),ess);assert.equal(P().darkFloor,1);
 b.update(2);assert.equal(b.mode,'campaign');assert.equal(b.running,false);assert.equal(G().panel,'realm');assert.equal(P().stage,1);assert.equal(P().wave,1,'campaign progress is untouched');
 G().open(null);assert.ok(A.realmStart(1,'fury'));assert.ok(A.realmAbandon());assert.equal(realm.realmRun(P()),undefined);assert.equal(battle!.mode,'campaign');
 give(p=>{p.chaosite=0});assert.equal(A.realmStart(1,'fury'),false);assert.equal(realm.realmRun(P()),undefined);
});
test('floors are deterministic, grow smoothly and every fifth one is a lord floor',()=>{
 let previous=0;for(let f=1;f<=40;f++){const boss=realm.realmPlan(f,3),pack=realm.realmPlan(f,1),keeper=realm.realmPlan(f,2);assert.ok(boss.units[0].hp>previous,'boss grows at '+f);previous=realm.lordFloor(f)?boss.units[0].hp/1.25:boss.units[0].hp;assert.ok(keeper.units[0].hp<boss.units[0].hp);assert.equal(pack.units.length,f>=4?3:2);assert.deepEqual(realm.realmPlan(f,1),pack);
  const first=realm.roomReward(f,3,true),again=realm.roomReward(f,3,false);assert.ok(first.gems>again.gems&&first.items===2&&again.items===1&&again.ess===first.ess)}
 assert.ok(realm.lordFloor(5)&&!realm.lordFloor(4));assert.ok(realm.realmPlan(5,3).timer>realm.realmPlan(4,3).timer);
});
test('auras really change the fight: blessing, veil, aegis, gap, thorns, reduction and companion traits',()=>{
 give(p=>{p.bosses=20;p.arenaWins=5;p.darkFloor=12;sagaOf(p).box.relics={lv:{aegis:2,gap:4,horn:1}};const box=R.darkBox(p);box.eq[5]=item({id:'veil',s:5,r:5,l:5,e:'veil'});box.eq[11]=item({id:'void',s:11,r:5,l:20,u:10,e:'thorns'})});
 assert.ok(stats(P()).reduction>0);assert.ok(A.realmStart(1,'fury'));const b=battle!,plan=realm.realmPlan(1,1);
 assert.equal(b.shield,Math.round(b.maxHp*R.darkEffects.veil.values[2]));assert.equal(b.units[0].hp,Math.round(plan.units[0].hp*(1-R.combatAura(P()).foeHpCut)));
 b.phase='fight';assert.ok(Math.abs(b.auraDamage()-1.2*1.12*1)<1e-9,'fury blessing and the horn rally stack once');
 const hp=b.hp,shield=b.shield;b.takeDamage(500);assert.equal(b.hp,hp);assert.equal(b.shield,shield,'aegis swallows the first hit');
 b.shield=0;const foe=b.units[0].hp;seedRandom(3);b.takeDamage(500);restoreRandom();assert.ok(b.hp<hp);assert.ok(b.units[0].hp<foe,'thorns return damage');
 give(p=>{const q=R.squadBox(p);q.own.senior_driller.lv=3;q.act[0]='senior_driller'});b.tuneTeam();const def=b.foeDef(b.units[0]);b.hit(b.units[0],5,false,'#fff','goose');assert.ok(b.foeDef(b.units[0])<def,'the driller wears armour down');
 give(p=>{const q=R.squadBox(p);q.own.capybara_bruiser.lv=2;q.act[1]='capybara_bruiser'});b.tuneTeam();b.shield=0;b.guardianAid();assert.equal(b.shield,Math.round(b.maxHp*.06));
});
