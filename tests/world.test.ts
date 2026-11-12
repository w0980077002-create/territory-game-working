import {test,beforeEach} from 'node:test';import assert from 'node:assert/strict';
import {Battle} from '../src/game/Battle';import {useGame,freshPlayer,parseSave,SAVE_KEY} from '../src/core/store';import {stats} from '../src/core/formulas';
import {normalizeWorld,freshWorld,legOf} from '../src/core/world';import {planLeg,stageDeck,settle,afterVictory,weatherOf} from '../src/game/WorldEvents';
import {think,interrupted,onWindup,strikeMultiplier,absorb,breakCovers,died,tactics,roleOf} from '../src/game/EnemyTactics';
import {CompanionBrain,team,type TeamHost} from '../src/game/CompanionBrain';import {AudioDirector} from '../src/game/AudioDirector';import {propsOfSite} from '../src/game/WorldLife';
import {feats,boons,variants} from '../src/data/world-variants';import type {Fighter} from '../src/core/types';
Object.defineProperty(globalThis,'Image',{value:class{src='';complete=false;naturalWidth=0}});Object.defineProperty(globalThis,'requestAnimationFrame',{value:()=>1});Object.defineProperty(globalThis,'cancelAnimationFrame',{value:()=>{}});const saves=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{value:{setItem:(k:string,v:string)=>saves.set(k,v),getItem:(k:string)=>saves.get(k)??null}});
beforeEach(()=>{saves.clear();useGame.setState({p:freshPlayer(),panel:null,selected:null,auto:false,speed:1})});
const scene=()=>new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement),g=()=>useGame.getState();
const walkTo=(b:Battle,state:string,limit=2000)=>{for(let n=0;n<limit&&b.director.state!==state;n++)b.update(.02)};
const reload=(b:Battle)=>{b.pause();b.destroy();useGame.setState({p:parseSave(saves.get(SAVE_KEY)!)!});return scene()};
const unit=(id:string,over:Partial<Fighter>={}):Fighter=>({id,x:0,y:0,hp:100,max:100,atk:10,def:5,cd:2,attack:0,hurt:0,dead:0,size:170,role:0,windup:0,ability:'',bossPhase:1,specialCd:5,actionTime:0,guard:0,...over});

test('world save: old saves load untouched, garbage is repaired, valid data round-trips',()=>{
 const old=freshPlayer();assert.equal(parseSave(JSON.stringify(old))!.world,undefined);
 const broken={...old,world:{v:9,seed:-4,lastLeg:'x',boon:{id:7},counts:{cache:-3,hack:99},feats:[1,'ok'],log:'no'}};const repaired=parseSave(JSON.stringify(broken))!.world!;
 assert.equal(repaired.lastLeg,-1);assert.ok(repaired.seed>0);assert.equal(repaired.boon,undefined);assert.deepEqual(repaired.counts,{});assert.deepEqual(repaired.feats,['ok']);assert.deepEqual(repaired.log,[]);
 const w=freshWorld(42);w.lastLeg=7;w.boon={id:'fury',leg:8};w.counts.cache=2;assert.deepEqual(normalizeWorld(JSON.parse(JSON.stringify(w))),w);
});
test('event plan: chapter one is authored, later stages are seeded, varied and bounded',()=>{
 assert.deepEqual([1,2,3,4,5].map(w=>planLeg(undefined,1,w)!.kind),['cache','caravan','ambush','altar','omen']);
 const a=freshWorld(11),b=freshWorld(987654);let differs=false;const kinds=new Set<string>();
 for(let stage=2;stage<=40;stage++){const deck=stageDeck(a.seed,stage),list=Object.values(deck);assert.ok(list.length>=2&&list.length<=3);assert.ok(list.filter(k=>k==='ambush').length<=1);assert.deepEqual(deck,stageDeck(a.seed,stage));if(JSON.stringify(deck)!==JSON.stringify(stageDeck(b.seed,stage)))differs=true;for(const k of list)kinds.add(k!);assert.equal(planLeg(a,stage,5)!.kind,'omen')}
 assert.ok(differs);assert.equal(kinds.size,4);
 a.lastLeg=legOf(3,2);assert.equal(planLeg(a,3,2),null);assert.equal(planLeg(a,1,1),null);
 assert.equal(weatherOf(a,1),'clear');assert.ok(new Set(Array.from({length:40},(_,n)=>weatherOf(a,n+2))).size>=3);
 const late=new Set<string>();for(let stage=8;stage<60;stage++)for(let wave=1;wave<5;wave++){const plan=planLeg(freshWorld(5),stage,wave);if(plan)late.add(plan.kind+':'+plan.variant.id)}
 assert.ok(late.size>=Object.values(variants).flat().length-variants.omen.length-1,'later chapters reach the unlocked variants');
});
test('settle pays a road event exactly once; passing pays nothing',()=>{
 const p=freshPlayer(),plan=planLeg(p.world,1,1)!,gold=p.gold;const first=settle(p,plan,'act');assert.ok(first&&p.gold>gold);const after=p.gold;
 assert.equal(settle(p,plan,'act'),null);assert.equal(settle(p,plan,'pass'),null);assert.equal(p.gold,after);assert.equal(p.world!.counts.cache,1);
 const q=freshPlayer(),passed=settle(q,planLeg(q.world,1,2)!,'pass');assert.deepEqual(passed,{lines:[],feats:[]});assert.equal(q.gold,gold);assert.equal(q.world!.gift,undefined);assert.equal(planLeg(q.world,1,2),null);
 const r=freshPlayer();assert.equal(settle(r,planLeg(r.world,1,4)!,'harvest')!.lines.length,0,'a rune that is not offered cannot be taken');assert.equal(r.world!.boon,undefined);
});
test('achievements unlock once and pay once',()=>{
 const p=freshPlayer(),gold=p.gold;for(let stage=1;stage<=3;stage++){const plan={...planLeg(undefined,1,1)!,leg:legOf(stage,1),stage};settle(p,plan,'act')}
 assert.ok(p.world!.feats.includes('pathfinder'));const paid=p.gold;assert.ok(paid>=gold+feats.find(f=>f.id==='pathfinder')!.gold);
 settle(p,{...planLeg(undefined,1,1)!,leg:legOf(9,1),stage:1},'act');assert.equal(p.world!.feats.filter(f=>f==='pathfinder').length,1);
});
test('road event holds the party, Auto never answers, the reward survives reload without repeating',()=>{
 useGame.setState({auto:true});let b=scene();b.toggle();walkTo(b,'decide');assert.equal(b.director.ev!.kind,'cache');const at=b.journey.worldX,gold=g().p.gold;
 for(let n=0;n<100;n++)b.update(.02);assert.equal(b.director.state,'decide');assert.equal(b.journey.worldX,at);assert.equal(g().p.gold,gold);
 b=reload(b);assert.equal(b.director.state,'decide');assert.equal(b.journey.worldX,at);assert.ok(Math.abs(b.director.t-2)<.05,'the decision timer is restored, not reset');
 b.director.choose('act');b.director.choose('act');const paid=g().p.gold;assert.ok(paid>gold);assert.equal(b.running,false,'answering while paused does not start the game');
 b=reload(b);assert.equal(b.director.open,false);assert.equal(b.director.state,'after');b.director.choose('act');assert.equal(g().p.gold,paid);
 b.toggle();for(let n=0;n<1500&&b.phase==='walk';n++)b.update(.02);assert.equal(b.phase,'fight');assert.equal(g().p.gold,paid);b.destroy();
});
test('an unanswered event times out in real seconds, x2 does not shorten it, pause freezes it',()=>{
 useGame.setState({speed:2});const b=scene();b.toggle();walkTo(b,'decide');const gold=g().p.gold;
 for(let n=0;n<200;n++)b.update(.04,.02);assert.equal(b.director.state,'decide');b.toggle();const frozen=b.snapshot();b.update(60,60);assert.deepEqual(b.snapshot(),frozen);b.toggle();
 for(let n=0;n<300&&b.director.state==='decide';n++)b.update(.04,.02);assert.equal(b.director.state,'after');assert.equal(b.director.choice,'pass');assert.equal(g().p.gold,gold);
 for(let n=0;n<800&&b.phase==='walk';n++)b.update(.04,.02);assert.equal(b.phase,'fight');b.destroy();
});
test('ambush: preparing exposes the attackers, ignoring it only speeds their telegraphed first strike',()=>{
 for(const answer of ['act','pass']){useGame.setState({p:{...freshPlayer(),wave:3}});const b=scene(),stat=b.units.map(u=>[u.atk,u.max,u.def,u.size]);b.toggle();walkTo(b,'decide');assert.equal(b.director.ev!.kind,'ambush');b.director.choose(answer);
  for(let n=0;n<1500&&b.phase==='walk';n++)b.update(.02);assert.equal(b.phase,'fight');assert.deepEqual(b.units.map(u=>[u.atk,u.max,u.def,u.size]),stat);assert.equal(b.hp,b.maxHp,'no hidden damage');
  if(answer==='act'){assert.ok(b.units.every(u=>(u.exposed??0)>0&&u.guard===0));assert.ok(b.shield>0)}else{assert.ok(b.units.every(u=>u.cd<=.12&&u.windup===0));for(let n=0;n<60;n++)b.update(.02);assert.ok(b.units.some(u=>u.windup>0||u.actionTime>0||u.attack>0),'the strike is wound up in view')}
  b.destroy()}
});
test('altar rune strengthens exactly one encounter and Harvest pays once',()=>{
 useGame.setState({p:{...freshPlayer(),wave:4}});const b=scene();b.toggle();walkTo(b,'decide');assert.deepEqual(b.director.ev!.options,['fury','ice']);b.director.choose('fury');assert.equal(b.director.damageRate(),1.2);assert.equal(g().p.world!.boon!.id,'fury');
 for(const u of b.units)u.hp=0;b.phase='fight';b.update(.02);assert.equal(b.phase,'victory');assert.equal(g().p.world!.boon,undefined);assert.equal(b.director.damageRate(),1);b.destroy();
 const p=freshPlayer();p.stage=3;p.world=freshWorld(1);p.world.boon={id:'harvest',leg:legOf(3,2)};const gold=p.gold;assert.equal(afterVictory(p,3,2,false).lines.length,1);const paid=p.gold;assert.ok(paid>gold);afterVictory(p,3,2,false);assert.equal(p.gold,paid);
 assert.ok(boons.every(o=>o.from>=1&&o.detail.length>10));
});
test('enemy tactics are telegraphed, bounded and never touch stats',()=>{
 const shield=unit('01_sword_shield_veteran',{tacticCd:0}),mage=unit('07_purple_mage',{role:1,hp:30}),units=[shield,mage],ctx={interruptCooldown:0,stunned:false,boss:false};
 assert.equal(think(units,shield,.1,ctx)!.type,'cover-call');assert.equal(mage.cover??0,0,'cover starts only after the telegraph');
 let event=null;for(let n=0;n<10&&!event;n++)event=think(units,shield,.1,ctx);assert.equal(event!.type,'cover');assert.equal(mage.cover,tactics.coverSeconds);
 const split=absorb(units,mage,100);assert.equal(split.amount,50);assert.equal(split.shared,25);assert.equal(split.coverer,shield);
 assert.equal(think(units,shield,.1,ctx),null,'cover is on cooldown');assert.ok(breakCovers(units));assert.equal(absorb(units,mage,100).amount,100);
 assert.equal(think([shield,mage],shield,.1,{...ctx,boss:true}),null);assert.deepEqual([shield.atk,shield.max,shield.def,mage.atk,mage.max,mage.def],[10,100,5,10,100,5]);
 const pirate=unit('03_pirate_bandit',{tacticCd:0,cd:2}),boar=unit('08_armored_boar',{role:1,windup:.8});assert.equal(think([pirate,boar],pirate,.02,ctx)!.type,'combo');assert.ok(Math.abs(pirate.cd-(boar.windup+tactics.comboGap))<1e-9);
 boar.windup=0;assert.deepEqual(interrupted([pirate,boar],boar).map(e=>e.type),['confused']);assert.ok((pirate.exposed??0)>0);
 const raider=unit('04_club_raider',{tacticCd:0,cd:2}),ally=unit('03_pirate_bandit',{role:1});assert.equal(think([raider,ally],raider,.02,{...ctx,interruptCooldown:5})!.type,'moment');assert.equal(raider.cd,tactics.momentDelay);assert.equal(think([raider,ally],raider,.02,{...ctx,interruptCooldown:5}),null);
 const caster=unit('07_purple_mage');assert.equal(interrupted([caster],caster)[0].type,'quick');caster.windup=.6;assert.ok(onWindup(caster));assert.equal(caster.windup,tactics.quickWindup);assert.equal(strikeMultiplier(caster),tactics.quickDamage);caster.windup=.6;onWindup(caster);caster.windup=.6;caster.ability='Тёмная сфера';assert.equal(onWindup(caster),false,'only two quick casts');assert.equal(strikeMultiplier(caster),1);
 const survivor=unit('04_club_raider',{cd:1});assert.equal(died([unit('03_pirate_bandit',{hp:0}),survivor],survivor).length,0);assert.equal(died([survivor,unit('03_pirate_bandit',{hp:0})],unit('x'))[0].type,'flinch');assert.equal(survivor.exposed,undefined);
 assert.deepEqual(['01_sword_shield_veteran','05_shield_spearman','06_red_crest_legionary','03_pirate_bandit','04_club_raider','08_armored_boar','02_roman_spearman','07_purple_mage','spider_queen'].map(roleOf),['shield','shield','shield','raider','raider','raider','ranged','ranged','boss']);
});
test('companions: goose covers only the gap in the hero’s interrupt, dog halves one heavy blow, rescue is once per fight',()=>{
 const log:string[]=[],host=(over:Partial<TeamHost>={}):TeamHost=>({units:[unit('07_purple_mage',{windup:.6,ability:'Тёмная сфера'})],boss:false,phase:'fight',intro:0,hp:100,maxHp:100,cooldowns:[0,0,0],compCd:[1,5],stun:0,companionRate:()=>1,onDive:(_,broke)=>log.push('dive:'+broke),onGuardReady:()=>log.push('ready'),onGuardHit:()=>log.push('guard'),onRescue:()=>log.push('rescue'),...over});
 let brain=new CompanionBrain();brain.dive=0;let h=host();brain.step(.02,h);assert.equal(brain.goose,null,'the hero can answer himself');
 h=host({cooldowns:[4,0,0]});brain.step(.02,h);assert.equal(brain.goose!.kind,'dive');for(let n=0;n<30;n++)brain.step(.02,h);assert.deepEqual(log,['dive:true']);assert.equal(h.units[0].windup,0);assert.ok((h.units[0].exposed??0)>0);assert.equal(brain.dive>team.diveCooldown-1,true);
 h.units[0].windup=.6;for(let n=0;n<100;n++)brain.step(.02,h);assert.equal(log.length,1,'cooldown');
 brain=new CompanionBrain();brain.dive=0;h=host({boss:true,cooldowns:[4,0,0],units:[unit('fungal_king',{windup:1})]});brain.step(.02,h);assert.notEqual(brain.goose?.kind,'dive','never interrupts a boss');
 brain=new CompanionBrain();brain.guard=0;log.length=0;h=host({units:[unit('08_armored_boar',{windup:.3})]});assert.equal(brain.absorb(h),1);brain.step(.02,h);assert.equal(brain.absorb(h),team.guardReduction);assert.equal(brain.absorb(h),1,'one blow per guard');assert.deepEqual(log,['ready','guard']);
 brain=new CompanionBrain();log.length=0;h=host({hp:20,units:[unit('03_pirate_bandit')]});brain.step(.02,h);assert.ok(h.compCd[1]<.1);h.compCd[1]=5;brain.step(.02,h);assert.equal(h.compCd[1],5);assert.deepEqual(log.filter(l=>l==='rescue'),['rescue']);
 const saved=brain.snapshot();const next=new CompanionBrain();next.restore(saved);assert.deepEqual(next.snapshot(),saved);
});
test('dog guard and goose dive work inside a real fight without changing the saved contract',()=>{
 useGame.setState({p:{...freshPlayer(),wave:2}});const b=scene();b.toggle();walkTo(b,'decide');b.director.choose('pass');for(let n=0;n<1500&&b.phase==='walk';n++)b.update(.02);
 b.intro=0;b.brain.guard=0;const boar=b.units.find(u=>u.id.includes('boar'))!;boar.windup=.3;boar.ability='Таран';b.brain.step(.02,b);const hp=b.hp;const reduced=(()=>{b.takeDamage(40,1,false,true);return hp-b.hp})();
 b.hp=hp;b.takeDamage(40,1,false,true);assert.ok(reduced>0&&reduced<hp-b.hp,'the guarded blow hurts less than the next one');assert.equal(g().p.world!.counts.guard,1);
 const snap=b.snapshot();assert.ok(snap.team&&parseSave(JSON.stringify({...g().p,encounter:snap}),true),'snapshot stays valid for strict import');b.destroy();
});
test('one audio context at most; nothing is created while sound is off',()=>{
 let made=0;class Param{value=0;setValueAtTime(){}setTargetAtTime(){}exponentialRampToValueAtTime(){}}class Node{gain=new Param();frequency=new Param();Q=new Param();detune=new Param();threshold=new Param();ratio=new Param();type='';buffer=null;loop=false;connect(){}start(){}stop(){}}
 class Ctx{state='running';currentTime=0;sampleRate=8000;destination={};constructor(){made++}createGain(){return new Node()}createOscillator(){return new Node()}createBiquadFilter(){return new Node()}createDynamicsCompressor(){return new Node()}createBufferSource(){return new Node()}createBuffer(){return {getChannelData:()=>new Float32Array(16000)}}resume(){this.state='running';return Promise.resolve()}suspend(){this.state='suspended';return Promise.resolve()}}
 Object.defineProperty(globalThis,'AudioContext',{value:Ctx,configurable:true});const a=new AudioDirector();a.unlock(false);assert.equal(made,0);a.play('hit');
 a.unlock(true);a.unlock(true);a.unlock(true);assert.equal(made,1);const frame={enabled:true,running:true,hidden:false,volume:2,mood:'city' as const,wind:.2,walked:80,quality:1};
 for(let n=0;n<50;n++){a.frame({...frame,mood:n%2?'boss':'tense'});a.play('hit');a.play('rune')}a.frame({...frame,enabled:false});assert.equal((a.ctx as unknown as Ctx).state,'suspended');a.play('hit');a.frame(frame);assert.equal((a.ctx as unknown as Ctx).state,'running');assert.equal(made,1);
});
test('scenery budget: every site has a small deterministic prop set outside the event stage',()=>{
 for(let i=0;i<40;i++){const props=propsOfSite(i);assert.ok(props.length>=3&&props.length<=5);assert.deepEqual(props,propsOfSite(i));const site=1050+i*1400;assert.ok(props.every(p=>p.x<=site-580&&p.x>=site-930),'clear of both fights and of the road event');}
 assert.ok(stats(freshPlayer()).cp>0);
});
