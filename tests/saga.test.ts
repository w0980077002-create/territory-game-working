import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {installHeadless,playCampaign,seedRandom,restoreRandom} from '../scripts/sim/bot';
installHeadless();
import {Battle} from '../src/game/Battle';
import {freshPlayer,useGame,parseSave} from '../src/core/store';
import {regions,campaignPlan,threat,hazardPhase,hazards,regionOf,regionTitle,growth,STORY_STAGES} from '../src/saga/regions';
import {planFor} from '../src/saga/encounters';
import {normalizeSaga,freshSaga} from '../src/saga/save';
import {characters} from '../src/data/catalog';
import formations from '../src/data/enemy-formations.json';
import balance from '../config/test-balance.v1.json';
beforeEach(()=>{useGame.setState({p:freshPlayer(),auto:false,panel:null,selected:null,recoveryRequired:false})});
const scene=()=>{const b=new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement);b.toggle();return b};
const at=(stage:number,wave:number)=>{useGame.getState().mutate(p=>{p.stage=stage;p.wave=wave;delete p.encounter});const b=scene();b.spawn();b.phase='fight';b.intro=0;return b};
test('six regions cover sixty story stages with distinct names, hazards, bosses and finales',()=>{
 assert.equal(regions.length*10,STORY_STAGES);assert.equal(new Set(regions.map(r=>r.name)).size,6);assert.equal(new Set(regions.map(r=>r.hazard)).size,6);
 const ids=new Set(characters.map(c=>c.id));
 for(const r of regions){assert.equal(r.bosses.length,10);assert.equal(new Set(r.districts).size,5);for(const [id] of r.bosses)assert.ok(ids.has(id));for(const pack of r.packs){assert.ok(pack.every(id=>ids.has(id)));if(pack.length===2)assert.ok(pack.join('|') in formations,'formation '+pack.join('|'))}}
 assert.equal(regionOf(1).id,'ice');assert.equal(regionOf(11).id,'harbor');assert.equal(regionOf(60).id,'ember');assert.equal(regionOf(61).id,'ice');assert.match(regionTitle(61),/Легенда/);
 assert.equal(regions[0].bosses[9][1],'Королева паутины');assert.equal(regions[2].bosses[9][0],'fungal_king');assert.equal(regions[3].bosses[9][0],'minotaur_echo');assert.equal(regions[5].bosses[9][0],'fire_abyss_lord');
});
test('first chapter keeps its approved numbers; stage 2 no longer drops below stage 1',()=>{
 const p=freshPlayer(),first=planFor({...p,wave:5},'campaign');assert.equal(first.units[0].id,'spider_queen');assert.equal(first.units[0].hp,2400);assert.equal(first.units[0].atk,27);
 const w1=planFor({...p,wave:1},'campaign');assert.deepEqual(w1.units.map(u=>[u.id,u.hp,u.atk]),[['01_sword_shield_veteran',540,16.5],['05_shield_spearman',480,16.5]]);
 const second=planFor({...p,stage:2,wave:5},'campaign');assert.ok(second.units[0].hp>=2400,'stage 2 boss '+second.units[0].hp);
});
test('threat grows smoothly for stages 1–100: no drops and no impossible walls',()=>{
 let previous=threat(1);for(let stage=2;stage<=100;stage++){const t=threat(stage);assert.ok(t.bossHp>previous.bossHp&&t.atk>=previous.atk,'monotone at '+stage);assert.ok(t.bossHp/previous.bossHp<1.75&&t.atk/previous.atk<1.75,'jump at '+stage);previous=t}
 assert.equal(growth(1,'hp'),1);assert.ok(Number.isFinite(threat(400).bossHp));
});
test('every campaign plan is deterministic, uses known foes and names its boss',()=>{
 for(let stage=2;stage<=72;stage++)for(let wave=1;wave<=5;wave++){const a=campaignPlan(stage,wave,123),b=campaignPlan(stage,wave,123);assert.deepEqual(a,b);assert.ok(a.units.length>=1&&a.units.length<=3);assert.equal(a.boss,wave===5);if(wave===5){assert.ok(a.bossName);assert.ok(a.timer>=balance.locked_owner_rules.boss_timer_seconds)}for(const u of a.units)assert.ok(u.hp>0&&u.atk>0&&Number.isFinite(u.hp))}
 assert.ok(campaignPlan(20,5).finale&&campaignPlan(20,5).ultimates);assert.equal(campaignPlan(50,5).units.length,3);
});
test('hazard clock strikes exactly once per cycle whatever the frame rate, and never while paused',()=>{
 for(const id of Object.keys(hazards) as (keyof typeof hazards)[])for(const dt of [.016,.05,.1]){let strikes=0;for(let t=dt;t<hazards[id].period*4.6;t+=dt)if(hazardPhase(id,t,dt).strike)strikes++;assert.equal(strikes,4,id+' '+dt)}
 const b=at(12,1);b.toggle();const before=b.snapshot();for(let i=0;i<400;i++)b.update(.05);assert.deepEqual(b.snapshot(),before);b.destroy();
});
test('rune forest curse stacks to three, weakens the hero and Thor\'s Hammer cleans it; it survives reload',()=>{
 const b=at(22,1);assert.equal(b.plan.hazard,'curse');for(const u of b.units){u.hp=u.max=1e9;u.atk=0}b.hp=b.maxHp=1e9;
 for(let i=0;i<700&&b.curse<3;i++)b.update(.05);assert.equal(b.curse,3);assert.ok(Math.abs(b.damageRate()-.64)<1e-9);
 const snap=b.snapshot();assert.equal(snap.curse,3);b.checkpoint();b.destroy();
 useGame.setState({p:parseSave(JSON.stringify(useGame.getState().p))!});const c=new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement);assert.equal(c.curse,3);c.toggle();c.cooldowns=[0,0,0];c.skill(2);assert.equal(c.curse,0);c.destroy();
});
test('harbor storm hits an unprepared hero and is weathered under Odin\'s Call',()=>{
 const b=at(12,1);assert.equal(b.plan.hazard,'storm');b.hp=b.maxHp;b.hazardStrike('storm',0);const open=b.maxHp-b.hp;assert.ok(open>b.maxHp*.1);
 b.hp=b.maxHp;b.buff=5;b.hazardStrike('storm',1);assert.ok(b.maxHp-b.hp<open*.4);b.destroy();
});
test('roman phalanx shrugs off damage until the first legionary falls',()=>{
 const b=at(42,1);assert.equal(b.plan.hazard,'phalanx');const [u,v]=b.units;u.guard=v.guard=0;u.hp=u.max=v.hp=v.max=1e6;const hp=u.hp;b.hit(u,1000);assert.equal(hp-u.hp,650);
 v.hp=1;b.hit(v,10);assert.equal(v.hp,0);assert.ok((u.exposed??0)>0);const mid=u.hp;b.hit(u,1000);assert.ok(mid-u.hp>1000);b.destroy();
});
test('elite affixes change the fight: regen heals, bulwark re-shields, warded resists plain hits',()=>{
 const b=at(12,1),u=b.units[0];u.affix='regen';u.hp=u.max*.5;b.combatTime=5;u.cd=99;b.enemyStep(u,1);assert.ok(u.hp>u.max*.5);b.burn=3;const burning=u.hp;b.enemyStep(u,1);assert.equal(u.hp,burning);
 u.affix='bulwark';u.specialCd=0;u.guard=0;b.burn=0;b.enemyStep(u,.05);assert.ok(u.guard>2);
 u.affix='warded';u.guard=0;u.exposed=0;u.hp=u.max=1e6;b.hit(u,1000);assert.equal(1e6-u.hp,700);b.castingSkill=true;b.hit(u,1000,true);assert.equal(1e6-700-u.hp,1300);b.destroy();
});
test('region finale boss casts a named ultimate at each phase; interrupting it opens a long weakness window',()=>{
 const b=at(20,5),u=b.units[0];assert.ok(b.plan.finale);assert.equal(b.plan.bossName,'Адмирал Штормов');u.hp=u.max*.6;b.enemyStep(u,.05);assert.equal(u.bossPhase,2);assert.equal(u.ability,'Бортовой залп');assert.ok(u.windup>1.5);
 u.windup=.5;b.cooldowns=[0,0,0];b.skill(0);b.stepProjectiles(1);assert.equal(u.windup,0);assert.ok((u.exposed??0)>3.5);b.destroy();
});
test('saga save: old saves load untouched, garbage is repaired and never triggers recovery',()=>{
 const old=freshPlayer();assert.ok(parseSave(JSON.stringify(old)));assert.equal(parseSave(JSON.stringify(old))!.saga,undefined);
 const dirty=JSON.parse(JSON.stringify({...old,saga:{v:9,seen:['spider_queen',5,'<script>'],n:{'kill:x':3,bad:-1,'__proto__':1},flags:'no',box:{quests:{day:'2026-11-13',deep:{a:{b:{c:{d:{e:{f:{g:{h:1}}}}}}}}},fn:null}}}));
 const loaded=parseSave(JSON.stringify(dirty));assert.ok(loaded);assert.deepEqual(loaded!.saga!.seen,['spider_queen']);assert.deepEqual(loaded!.saga!.n,{'kill:x':3});assert.deepEqual(loaded!.saga!.flags,[]);
 assert.deepEqual(normalizeSaga(null),freshSaga());assert.deepEqual(normalizeSaga(normalizeSaga(dirty.saga)),normalizeSaga(dirty.saga));
});
test('the album remembers defeated foes across encounters',()=>{
 const b=at(1,1);for(const u of b.units)u.hp=0;b.update(.05);const saga=useGame.getState().p.saga!;assert.ok(saga.seen.includes('01_sword_shield_veteran'));assert.equal(saga.n['kill:05_shield_spearman'],1);assert.equal(saga.n['win:campaign'],1);b.destroy();
});
test('potion price follows the stage and has a cooldown',()=>{
 const b=at(1,1);assert.equal(b.potionCost(),balance.combat_test_settings.potion_gold_cost);b.hp=1;const gold=useGame.getState().p.gold;b.heal();assert.equal(useGame.getState().p.gold,gold-30);b.hp=1;b.heal();assert.equal(useGame.getState().p.gold,gold-30);b.destroy();
 const late=at(30,1);assert.ok(late.potionCost()>300);late.destroy();
});
test('SIM: a diligent bot of every class finishes all sixty story stages without a hard wall',()=>{
 // Seeded, so the run is reproducible; thresholds stay generous because float details may differ between engines.
 for(const [n,c] of (['berserker','ranger','runologist'] as const).entries()){seedRandom(2026+n);let log;try{log=playCampaign(c,61)}finally{restoreRandom()}assert.equal(log.at(-1)?.stage,60,c+' stopped at '+log.at(-1)?.stage);const worst=Math.max(...log.map(r=>r.defeats));assert.ok(worst<=30,c+' wall: '+worst+' defeats on one stage');const times=log.filter(r=>r.stage>=12).map(r=>r.bossTime).sort((a,b)=>a-b);assert.ok(times[Math.floor(times.length/2)]>6,c+' bosses must not melt: median '+times[Math.floor(times.length/2)])}
});
