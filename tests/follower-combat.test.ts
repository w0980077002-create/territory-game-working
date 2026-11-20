import {beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {Battle,battle,mountBattle} from '../src/game/Battle';
import {freshPlayer,parseSave,SAVE_KEY,useGame} from '../src/core/store';
import {stats} from '../src/core/formulas';
import {followerId,newFollower,squadBox,squadBonus,squadCombat} from '../src/dark/rules';
import {petActivate,petClearReserve,realmStart} from '../src/dark/actions';
import {validEncounter} from '../src/game/snapshot';

Object.defineProperty(globalThis,'Image',{value:class{src='';complete=false;naturalWidth=0}});
Object.defineProperty(globalThis,'requestAnimationFrame',{value:()=>1});
Object.defineProperty(globalThis,'cancelAnimationFrame',{value:()=>{}});
const saved=new Map<string,string>();
let failWrite=false;
Object.defineProperty(globalThis,'localStorage',{value:{
 getItem:(key:string)=>saved.get(key)??null,
 setItem:(key:string,raw:string)=>{
  if(failWrite&&key===SAVE_KEY)throw Error('storage full');
  saved.set(key,raw);
 },
}});
const canvas={getContext:()=>({})} as unknown as HTMLCanvasElement;
const G=()=>useGame.getState();
const goose=followerId('goose_aviator');
const dog=followerId('brown_white_dog');
const boar=followerId('08_armored_boar');
const driller=followerId('senior_driller');
const moss=followerId('moss_eater');

beforeEach(()=>{
 failWrite=false;
 saved.clear();
 useGame.setState({p:freshPlayer(),auto:false,stopOnDeath:true,continueOnVictory:false,
  panel:null,selected:null,recoveryRequired:false,storageError:false,speed:1});
});

function fight(b:Battle){
 b.phase='fight';
 b.intro=0;
 b.autoCd=100;
 b.compCd=[100,100];
 b.brain.dive=100;
 b.brain.guard=100;
 for(const unit of b.units){
  unit.hp=unit.max=10000;
  unit.cd=100;
  unit.guard=0;
 }
}
function load(){
 const p=parseSave(saved.get(SAVE_KEY)!,true);
 assert.ok(p);
 useGame.setState({p,panel:null});
 return new Battle(canvas);
}

test('old checkpoints without follower clocks retain the exact original pair and legacy awakening progress',()=>{
 const legacy=freshPlayer();
 legacy.companions=[2,3];
 legacy.relic=5;
 useGame.setState({p:legacy});
 const old=new Battle(canvas);
 const original=old.snapshot();
 delete original.followers;
 original.compCd=[.4,3.25];
 original.perk={sq:5};
 old.destroy();
 const restored=parseSave(JSON.stringify({...legacy,encounter:original}),true)!;
 useGame.setState({p:restored});
 const b=new Battle(canvas);
 try{
  assert.deepEqual(stats(restored),stats(legacy));
  assert.equal(restored.saga,undefined);
  assert.deepEqual(b.compCd,[.4,3.25]);
  assert.deepEqual(b.followers?.formation,[goose,dog,null]);
  assert.equal(b.followers?.charges[goose],2);
  assert.equal(b.squad.reserve,null);
  assert.equal(b.gooseDamage(),Math.round(stats(legacy).attack*(.25+2*.04)));
  assert.equal(b.followerHealFraction(b.squad.guardian,legacy,true),.15);
  assert.deepEqual(b.visibleFollowers().map(pet=>pet.instanceId),[goose,dog]);
 }finally{b.destroy()}
});

test('a hidden third striker has its own damage, talent, awakening and projectile species through reload and removal',()=>{
 G().mutate(p=>{
  const team=squadBox(p);
  team.instances[boar]=newFollower('08_armored_boar',15,[3,2,4],3,true);
  team.instances[driller]=newFollower('senior_driller',5,[0,0,1]);
  team.formation=[driller,dog,boar];
 });
 const b=new Battle(canvas);
 let c:Battle|undefined;
 try{
  b.toggle();
  fight(b);
  assert.equal(b.aura.heroDamage,.075);
  assert.deepEqual(b.visibleFollowers().map(pet=>pet.instanceId),[driller]);
  assert.ok(b.squad.reserve);
  const reserve=b.squad.reserve;
  assert.equal(b.followers!.thirdCooldown,reserve.interval);
  b.followers!.charges[boar]=2;
  b.followers!.thirdCooldown=.01;
  b.units.at(-1)!.guard=3;
  b.update(.02);
  const shot=b.projectiles[0],burst=Math.round(shot.damage*.5);
  assert.deepEqual(shot.follower,{instanceId:boar,species:'08_armored_boar',primary:false,hidden:true});
  assert.equal(shot.damage,Math.round(stats(G().p).attack*reserve.power));
  assert.equal(b.units[0].hp,10000-burst);
  assert.equal(b.followers!.charges[boar],0);
  assert.equal(b.followers!.charges[driller],undefined);
  assert.equal(b.gooseAttack,0,'a hidden action never animates the visible driller');
  b.pause();
  const checkpoint=b.snapshot();
  b.update(8);
  assert.deepEqual(b.snapshot(),checkpoint);
  b.destroy();
  c=load();
  assert.deepEqual(c.snapshot(),checkpoint);
  // The in-flight guard bonus still belongs to the boar after the formation changes.
  G().mutate(p=>{squadBox(p).formation[2]=null});
  c.tuneTeam();
  c.toggle();
  const target=c.units[shot.target],hp=target.hp;
  c.stepProjectiles(1);
  assert.equal(target.hp,hp-Math.round(Math.round(shot.damage*1.5)*.4));
  assert.equal(c.perk.drill,undefined);
  assert.equal(parseSave(saved.get(SAVE_KEY)!,true)?.encounter?.projectiles.length,0);
  c.stepProjectiles(1);
  assert.equal(target.hp,hp-Math.round(Math.round(shot.damage*1.5)*.4));
 }finally{(c??b).destroy()}
});

test('a third guardian heals within the existing cap, cleanses, refreshes awakening and adds protection only once',()=>{
 G().mutate(p=>{
  const team=squadBox(p);
  team.instances[moss]=newFollower('moss_eater',100,[5,3,4],3,true);
  team.instances[dog].talents[2].rank=2;
  team.formation[2]=moss;
 });
 const b=new Battle(canvas);
 try{
  b.toggle();
  fight(b);
  b.hp=b.maxHp*.4;
  b.poison=3;
  b.poisonTick=3;
  b.slow=2;
  b.followers!.thirdCooldown=.01;
  b.update(.02);
  assert.equal(b.hp,b.maxHp*.4+Math.round(b.maxHp*.45));
  assert.equal(b.poison,0);
  assert.equal(b.slow,0);
  assert.equal(b.perk.howl,3);
  assert.equal(squadBonus(G().p).reduction,.06);
  assert.equal(stats(G().p).reduction,.06);
  assert.equal(b.dogCast,0,'reserve healing does not pose the dog');
  assert.equal(b.brain.rescues,0);
  b.guardianAid();
  assert.equal(b.auraDamage(),1.15,'the awakening uses the single existing buff');
 }finally{b.destroy()}
});

test('two instances of the same species keep separate counters and the model follows movement priority',()=>{
 const copy='follower:goose-copy';
 G().mutate(p=>{
  const team=squadBox(p);
  team.instances[goose].aw=true;
  team.instances[boar]=newFollower('08_armored_boar');
  team.instances[copy]=newFollower('goose_aviator',20,[5,0,3],2,true);
  team.formation[2]=copy;
 });
 const b=new Battle(canvas);
 try{
  b.toggle();
  fight(b);
  b.followers!.charges={[goose]:2,[copy]:1};
  b.compCd[0]=b.followers!.thirdCooldown=.01;
  b.update(.02);
  assert.deepEqual(b.projectiles.map(shot=>shot.follower?.instanceId),[goose,copy]);
  assert.deepEqual(b.projectiles.map(shot=>shot.follower?.hidden),[false,true]);
  assert.deepEqual(b.followers?.charges,{[goose]:0,[copy]:2});
  assert.deepEqual(b.visibleFollowers().map(pet=>pet.instanceId),[goose,dog]);
  G().mutate(p=>{squadBox(p).formation[0]=boar});
  b.tuneTeam();
  assert.deepEqual(b.visibleFollowers().map(pet=>pet.instanceId),[boar,copy]);
  G().mutate(p=>{squadBox(p).formation[2]=null});
  b.tuneTeam();
  assert.deepEqual(b.visibleFollowers().map(pet=>pet.instanceId),[boar]);
 }finally{b.destroy()}
});

test('formation edits cannot shorten timers and failed writes never advance or replay the third action',()=>{
 let stop=mountBattle(canvas);
 try{
  const b=battle!;
  G().mutate(p=>{
   const team=squadBox(p);
   team.instances[boar]=newFollower('08_armored_boar',20);
   team.instances[driller]=newFollower('senior_driller',20);
  });
  assert.ok(petActivate(boar,2));
  b.followers!.thirdCooldown=12;
  failWrite=true;
  assert.equal(petActivate(driller,2),false);
  assert.equal(b.squad.reserve?.instanceId,boar);
  assert.equal(b.followers!.thirdCooldown,12);
  failWrite=false;
  assert.ok(petClearReserve(boar));
  assert.ok(petActivate(driller,2));
  assert.equal(b.followers!.thirdCooldown,12);
  b.toggle();
  fight(b);
  b.followers!.thirdCooldown=.01;
  failWrite=true;
  b.update(.02);
  assert.equal(b.running,false);
  const frozen=b.snapshot();
  assert.equal(frozen.projectiles.length,1);
  b.toggle();
  b.update(10);
  assert.deepEqual(b.snapshot(),frozen);
  failWrite=false;
  b.toggle();
  assert.equal(b.running,true);
  assert.equal(parseSave(saved.get(SAVE_KEY)!,true)?.encounter?.projectiles.length,1);
  b.stepProjectiles(1);
  assert.equal(b.perk.drill,1);
  stop();stop=()=>{};
  const restored=load();
  try{
   restored.toggle();
   restored.stepProjectiles(1);
   assert.equal(restored.perk.drill,1);
   assert.equal(restored.projectiles.length,0);
   assert.ok(restored.followers!.thirdCooldown>0);
  }finally{restored.destroy()}
 }finally{failWrite=false;stop()}
});

test('each current combat mode runs the same third action and records one victory or stops on death',()=>{
 for(const mode of ['campaign','farm','arena','dungeon','darkness']){
  useGame.setState({p:freshPlayer(),panel:null});
  const stop=mountBattle(canvas),b=battle!;
  try{
   G().mutate(p=>{
    const team=squadBox(p);
    team.instances[boar]=newFollower('08_armored_boar',25);
    team.formation[2]=boar;
   });
   if(mode==='darkness')assert.ok(realmStart(1,'ward'));
   else{
    if(mode!=='campaign')b.startMode(mode);
    b.toggle();
   }
   assert.equal(b.mode,mode);
   fight(b);
   b.units.forEach(unit=>{unit.hp=1});
   for(let i=0;i<b.units.length;i++){
    b.followers!.thirdCooldown=.01;
    b.update(.02);
    assert.equal(b.projectiles[0]?.follower?.instanceId,boar,mode);
    b.stepProjectiles(1);
   }
   b.update(.02);
   const kills=G().p.kills;
   assert.ok(kills>0,mode);
   if(mode!=='darkness'){
    assert.equal(b.phase,'victory');
    b.victory();
    assert.equal(G().p.kills,kills);
   }else{
    b.defeat();
    const dead=b.snapshot();
    assert.equal(dead.projectiles.length,0);
    b.update(5);
    assert.deepEqual(b.snapshot(),dead);
   }
  }finally{stop()}
 }
});

test('strict checkpoints reject duplicate positions and unrecognised follower projectiles',()=>{
 const b=new Battle(canvas);
 try{
  const state=b.snapshot();
  assert.ok(validEncounter(state));
  const invalid=structuredClone(state);
  invalid.followers!.formation[2]=goose;
  assert.equal(validEncounter(invalid),false);
  b.followerAttack(squadCombat(G().p).striker,true);
  const shot=b.snapshot();
  assert.ok(validEncounter(shot));
  shot.projectiles[0].follower!.species='unknown';
  assert.equal(validEncounter(shot),false);
 }finally{b.destroy()}
});
