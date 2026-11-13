import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {installHeadless} from '../scripts/sim/bot';
installHeadless();
import {Battle} from '../src/game/Battle';
import {freshPlayer,useGame,parseSave,makeItem,asSetItem,makePerkItem,exportSave} from '../src/core/store';
import {stats} from '../src/core/formulas';
import type {Player,Slot} from '../src/core/types';
import {setCounts,setTier,sets,perks,setIds,matKey,matCount,type SetId,type PerkId} from '../src/saga/gear';
import {specs,specId} from '../src/saga/specs';
import {branchOf,evoTier,evoPower} from '../src/saga/companions';
import {reforge,reforgePlan,engrave,craftSet,trade,pickSpec,pickBranch,saveBuild,applyBuild,buildsOf} from '../src/saga/actions';
import {ensureQuests,dailyView,weeklyView,claimBoard,storyQuests,claimStory,masteryView,claimMastery,goals,DAILY_COUNT,WEEKLY_COUNT,dailyPool} from '../src/saga/quests';
const G=()=>useGame.getState();
beforeEach(()=>{useGame.setState({p:freshPlayer(),auto:false,panel:null,selected:null,recoveryRequired:false})});
const wear=(p:Player,set:SetId,n:number)=>{const order:Slot[]=['weapon','armor','helmet','shield','boots','belt'];for(const slot of order.slice(0,n))p.equipment[slot]=asSetItem(makeItem(slot,p.level,3),set)};
const give=(p:Player,id:PerkId)=>{const item=makePerkItem(id,p.level,'test');p.equipment[item.slot]=item};
const fight=(prepare?:(p:Player)=>void)=>{G().mutate(p=>{prepare?.(p);delete p.encounter});const b=new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement);b.spawn();b.toggle();b.phase='fight';b.intro=0;for(const u of b.units){u.guard=0;u.hp=u.max=1e7;u.cd=99}return b};
test('six sets: 2/4/6 pieces switch on real stat and combat bonuses',()=>{
 assert.equal(setIds.length,6);for(const id of setIds)assert.equal(sets[id].bonuses.length,3);
 const p=freshPlayer(),base=stats(p);wear(p,'storm',2);assert.equal(setTier(p,'storm'),1);assert.ok(Math.abs(stats(p).aspd-base.aspd*1.1)<1e-9);wear(p,'storm',4);assert.ok(Math.abs(stats(p).crit-base.crit-.12)<1e-9);assert.equal(setCounts(p).storm,4);
 const q=freshPlayer();wear(q,'stone',2);const plain=freshPlayer();wear(plain,'frost',2);assert.ok(stats(q).defense>stats(plain).defense&&stats(q).hp>stats(plain).hp);
 const e=freshPlayer();e.heroClass='ranger';const before=stats(e).lifesteal;wear(e,'ember',2);assert.ok(Math.abs(stats(e).lifesteal-before-.06)<1e-9);
});
test('frost set: an interrupt freezes the target and a frozen enemy cannot act',()=>{
 const b=fight(p=>wear(p,'frost',4)),u=b.units[0];u.cd=0;b.enemyStep(u,.05);assert.ok(u.windup>0);u.windup=.5;b.cooldowns=[0,0,0];b.skill(0);b.stepProjectiles(1);assert.ok((u.frozen??0)>1);
 u.cd=0;const hp=b.hp;for(let i=0;i<20;i++)b.enemyStep(u,.05);assert.equal(u.windup,0);assert.equal(b.hp,hp);b.destroy();
});
test('rune set (6): Thor\'s Hammer strikes four times and shields the hero',()=>{
 const plain=fight(),u0=plain.units[0];plain.skill(2);const three=u0.max-u0.hp;plain.destroy();
 useGame.setState({p:freshPlayer()});const b=fight(p=>wear(p,'rune',6)),u=b.units[0];b.skill(2);assert.ok(b.shield>0);assert.ok(u.max-u.hp>three*1.3);b.destroy();
});
test('storm set (6): every fifth strike calls lightning on all enemies',()=>{
 const b=fight(p=>wear(p,'storm',6)),other=b.units[1];b.perk.strikes=4;b.heroPending=.01;b.update(.02);assert.equal(b.perk.strikes,5);assert.ok(other.hp<other.max);b.destroy();
});
test('named trophies: boarding cutlass opens with a triple stunning blow; Abyss heart refuses one death',()=>{
 const b=fight(p=>give(p,'cutlass'));b.heroPending=.01;b.update(.02);b.stepProjectiles(1);assert.equal(b.perk.opened,1);assert.ok(b.stun>0);const first=b.units[0].max-b.units[0].hp;
 b.units[0].hp=b.units[0].max;b.stun=0;b.heroPending=.01;b.update(.02);b.stepProjectiles(1);assert.ok(first>(b.units[0].max-b.units[0].hp)*1.6);b.destroy();
 useGame.setState({p:freshPlayer()});const c=fight(p=>give(p,'heart'));c.rawDamage(c.maxHp*5);assert.equal(c.phase,'fight');assert.ok(c.hp>0);assert.equal(c.perk.revived,1);c.rawDamage(c.maxHp*5);assert.equal(c.phase,'defeat');c.destroy();
});
test('each class has two builds that change how attacks work',()=>{
 for(const cls of ['berserker','ranger','runologist'] as const)assert.equal(new Set(specs[cls].map(s=>s.id)).size,2);
 G().mutate(p=>{p.heroClass='ranger'});assert.equal(specId(G().p),'deadeye');const crit=stats(G().p).crit;pickSpec(1);assert.equal(specId(G().p),'trapper');assert.ok(stats(G().p).crit<crit);
 const b=fight(),u=b.units[0];u.windup=.5;u.ability='x';b.perk.strikes=3;b.heroPending=.01;b.update(.02);assert.ok(b.projectiles.at(-1)!.stun);b.stepProjectiles(1);assert.equal(u.windup,0);assert.ok((u.chill??0)>0);b.destroy();
 useGame.setState({p:{...freshPlayer(),heroClass:'runologist'}});pickSpec(1);const c=fight();c.heroPending=.01;c.update(.02);assert.equal(c.projectiles.filter(v=>v.source==='hero').length,2);c.destroy();
 useGame.setState({p:freshPlayer()});const d=fight();for(let i=0;i<3;i++){d.heroPending=.01;d.update(.02)}assert.equal(d.perk.ramp,2);d.destroy();
});
test('companion combos: the dog\'s guard arms a guaranteed critical counter-attack and is counted',()=>{
 const b=fight();b.onGuardHit();assert.equal(b.perk.kind,2);b.heroPending=.01;b.update(.02);assert.equal(b.perk.combo,0);assert.equal(b.tally['combo:riposte'],1);b.pause();assert.equal(G().p.saga!.n['combo:riposte'],1);b.destroy();
});
test('companion branches open at level 5 and tune the team; evolutions strengthen their job',()=>{
 assert.equal(pickBranch(1,1),false);assert.equal(branchOf(G().p,1),-1);G().mutate(p=>{p.companions=[5,12]});assert.ok(pickBranch(1,1));assert.ok(pickBranch(0,0));assert.equal(branchOf(G().p,1),1);
 assert.equal(evoTier(4),0);assert.equal(evoTier(12),2);assert.ok(evoPower(25)>evoPower(5));
 const b=fight();assert.equal(b.brain.rescueMax,2);assert.equal(b.brain.diveScale,.7);b.destroy();
});
test('a region lord always yields his named trophy on the first victory',()=>{
 G().mutate(p=>{p.stage=20;p.wave=5;p.level=30});G().win('campaign','enc-test');const p=G().p;assert.equal(p.stage,21);const trophy=[...p.inventory,...(p.pendingLoot??[])].find(i=>i.perk==='cutlass');assert.ok(trophy&&trophy.locked);assert.equal(trophy!.name,perks.cutlass.name);assert.ok(matCount(p,'harbor')>=8);
 assert.ok(parseSave(JSON.stringify(p)));
});
test('forge depth: reforge keeps identity and upgrades, engraving and recipes spend materials once',()=>{
 G().mutate(p=>{p.level=20;p.gold=1e6;p.saga={v:1,seen:[],trophies:[],n:{[matKey('ice')]:40},flags:[],box:{}};p.equipment.weapon!.upgrade=2});
 const before=G().p.equipment.weapon!,plan=reforgePlan(before,G().p)!;assert.ok(plan.next.attack>before.attack);assert.ok(reforge('weapon'));const after=G().p.equipment.weapon!;assert.equal(after.id,before.id);assert.equal(after.upgrade,2);assert.equal(after.level,20);assert.equal(reforge('weapon'),false);
 const attack=stats(G().p).attack;assert.ok(engrave('weapon','might'));assert.ok(stats(G().p).attack>attack);assert.equal(engrave('weapon','might'),false);
 const mats=matCount(G().p,'ice');assert.ok(craftSet('frost','helmet'));assert.equal(matCount(G().p,'ice'),mats-12);const made=G().p.inventory.at(-1)!;assert.equal(made.set,'frost');assert.equal(made.slot,'helmet');
 assert.equal(craftSet('ember','helmet'),false);assert.ok(trade('ice','harbor'));assert.equal(matCount(G().p,'harbor'),1);assert.ok(parseSave(exportSave()));
});
test('saved builds re-equip owned gear without creating or losing items',()=>{
 G().mutate(p=>{p.inventory.push(makeItem('weapon',5,4))});const strong=G().p.inventory[0],weak=G().p.equipment.weapon!;saveBuild(0);G().equip(strong.id);G().setClass('ranger');saveBuild(1);
 const total=()=>G().p.inventory.length+Object.keys(G().p.equipment).length,n=total();assert.ok(applyBuild(0));assert.equal(G().p.equipment.weapon!.id,weak.id);assert.equal(G().p.heroClass,'berserker');assert.equal(total(),n);
 assert.ok(applyBuild(1));assert.equal(G().p.equipment.weapon!.id,strong.id);assert.equal(G().p.heroClass,'ranger');assert.equal(buildsOf(G().p).filter(Boolean).length,2);
});
test('quests: varied daily board, real progress, single claim, and a missed day costs nothing',()=>{
 const day=Date.UTC(2026,10,13,10);G().mutate(p=>{ensureQuests(p,day)});let daily=dailyView(G().p,day);assert.equal(daily.length,DAILY_COUNT);assert.equal(weeklyView(G().p,day).length,WEEKLY_COUNT);assert.ok(dailyPool.length>=12);assert.ok(daily.every(q=>q.progress===0||q.def.keys[0].startsWith('state:')));
 G().mutate(p=>{p.kills+=30;p.bosses+=5;p.saga!.n.interrupt=50;p.saga!.n.horn=9;p.saga!.n['skill:2']=9;p.saga!.n.upgrade=5;p.saga!.n['win:dungeon']=3;p.saga!.n['win:arena']=3;p.saga!.n.expedition=2;p.saga!.n['combo:finish']=4;p.world={v:1,seed:5,lastLeg:1,counts:{cache:3,caravan:3,altar:3},feats:[],seen:[],log:[]};p.equipment.weapon=asSetItem(makeItem('weapon',1,3),'frost');p.equipment.armor=asSetItem(makeItem('armor',1,3),'frost')});
 daily=dailyView(G().p,day);assert.ok(daily.every(q=>q.done));const gems=G().p.gems,gold=G().p.gold;let reward;G().mutate(p=>{reward=claimBoard(p,'day',daily[0].def.id,day)});assert.ok(reward);assert.ok(G().p.gems>gems||G().p.gold>gold||G().p.tokens>3000);
 const snapshot=JSON.stringify(G().p);G().mutate(p=>{assert.equal(claimBoard(p,'day',daily[0].def.id,day),null)});assert.equal(JSON.stringify({...G().p,savedAt:0}),JSON.stringify({...JSON.parse(snapshot),savedAt:0}));
 const later=day+3*86400000;G().mutate(p=>{ensureQuests(p,later)});const fresh=dailyView(G().p,later);assert.equal(fresh.length,DAILY_COUNT);assert.ok(fresh.every(q=>!q.claimed));assert.ok(G().p.gems>=gems);assert.equal(goals(G().p,later).length,3);
 assert.ok(parseSave(JSON.stringify(G().p)));
});
test('story chain and mastery pay once and follow real progress',()=>{
 assert.equal(storyQuests(G().p).length,24);G().mutate(p=>{assert.equal(claimStory(p,'s0_mid'),null)});G().mutate(p=>{p.stage=6});const q=storyQuests(G().p).find(v=>v.id==='s0_mid')!;assert.ok(q.done);const gems=G().p.gems;G().mutate(p=>{claimStory(p,'s0_mid');claimStory(p,'s0_mid')});assert.equal(G().p.gems,gems+25);
 G().mutate(p=>{p.saga!.n['skill:2']=60});const m=masteryView(G().p).find(v=>v.def.id==='hammer')!;assert.equal(m.tier,2);assert.ok(m.ready);G().mutate(p=>{assert.ok(claimMastery(p,'hammer'));assert.ok(claimMastery(p,'hammer'));assert.equal(claimMastery(p,'hammer'),null)});
});
test('saga items and fight state survive a save roundtrip and a reload mid-fight',()=>{
 const b=fight(p=>{wear(p,'ember',2);give(p,'heart');p.equipment.weapon!.engrave='edge'});b.perk.strikes=7;b.perk.revived=1;b.units[0].frozen=1.2;b.units[0].dusk=3;b.checkpoint();const snap=b.snapshot();b.destroy();
 const loaded=parseSave(JSON.stringify(G().p),true);assert.ok(loaded);assert.equal(loaded!.equipment.amulet!.perk,'heart');assert.equal(loaded!.equipment.weapon!.engrave,'edge');useGame.setState({p:loaded!});
 const c=new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement);assert.deepEqual(c.snapshot(),snap);assert.equal(c.perk.revived,1);c.rawDamage(c.maxHp*5);assert.equal(c.phase,'defeat');c.destroy();
});
