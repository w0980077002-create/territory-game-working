import {test,beforeEach} from 'node:test';import assert from 'node:assert/strict';
import {Battle} from '../src/game/Battle';import {freshPlayer,useGame,parseSave,SAVE_KEY} from '../src/core/store';import {validEncounter} from '../src/game/snapshot';import {layoutLabels,feedbackBands} from '../src/game/CombatLabels';import {swordTip,reactionOffset,projectileVisualPath} from '../src/game/Impact';import {intersects,clips} from '../src/game/actorGeometry';import {enemyIds,miniIds,bossIds} from '../src/data/catalog';
Object.defineProperty(globalThis,'Image',{value:class{src='';complete=false;naturalWidth=0}});Object.defineProperty(globalThis,'requestAnimationFrame',{value:()=>1});Object.defineProperty(globalThis,'cancelAnimationFrame',{value:()=>{}});const saves=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>saves.get(k)??null,setItem:(k:string,v:string)=>saves.set(k,v)}});
beforeEach(()=>useGame.setState({p:freshPlayer(),panel:null,auto:false,speed:1}));
const scene=()=>{const b=new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement);b.toggle();b.phase='fight';b.intro=0;b.hp=b.maxHp/2;b.heroAttack=.42;for(const u of b.units){u.worldX=b.journey.cameraX+720;u.hp=u.max=1000;u.guard=0;u.cd=10}return b};
test('distant sword launches at the actual blade; only contact applies damage, comic, reaction and actual lifesteal once',()=>{const b=scene(),u=b.units[0],hp=b.hp,enemyHp=u.hp,tip=swordTip(b.heroX,b.journey.worldY,b.heroAttack);b.swordStrike(u,100,true,.2);const shot=b.projectiles[0];assert.equal(shot.kind,'sword-wave');assert.equal(shot.x0,tip.x);assert.equal(shot.y0,tip.y);assert.equal(u.hp,enemyHp);assert.equal(b.hp,hp);assert.equal(b.comics.active,null);b.stepProjectiles(shot.duration-.001);assert.equal(u.hp,enemyHp);b.stepProjectiles(.002);assert.equal(u.hp,enemyHp-100);assert.equal(b.hp,hp+20);assert.equal(u.reactionStrength,8);assert.ok(b.comics.active);assert.equal(b.projectiles.length,0);b.stepProjectiles(10);assert.equal(u.hp,enemyHp-100);assert.equal(b.hp,hp+20);b.destroy()});
test('airborne wave survives pause/reload OFF and saves an atomic consumed impact',()=>{const b=scene(),u=b.units[0],hp=b.hp;b.swordStrike(u,120,false,.1);b.stepProjectiles(.08);b.pause();const snap=b.snapshot();b.update(5);assert.deepEqual(b.snapshot(),snap);b.destroy();useGame.setState({p:parseSave(saves.get(SAVE_KEY)!)!});const c=new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement);assert.equal(c.running,false);assert.deepEqual(c.snapshot(),snap);c.toggle();c.stepProjectiles(1);assert.equal(c.units[0].hp,880);assert.equal(c.hp,hp+12);assert.equal(parseSave(saves.get(SAVE_KEY)!)!.encounter!.projectiles.length,0);c.destroy();const d=new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement);d.toggle();d.stepProjectiles(1);assert.equal(d.units[0].hp,880);assert.equal(d.hp,hp+12);d.destroy()});
test('dead targets, changed encounters and replaced unit slots never receive an old wave or heal the hero',()=>{for(const scenario of ['dead','encounter','slot']){const b=scene(),u=b.units[0],hp=b.hp;b.swordStrike(u,100,true,.5);if(scenario==='dead')u.hp=0;if(scenario==='encounter')b.id+='new';if(scenario==='slot')u.id=b.units[1].id;const before=u.hp;b.stepProjectiles(2);assert.equal(u.hp,before);assert.equal(b.hp,hp);assert.equal(b.projectiles.length,0);b.destroy()}});
test('near sword stays melee; overkill heals only real lost HP and shields react without changing attributes',()=>{const b=scene(),u=b.units[0];u.worldX=b.journey.cameraX+b.heroX+60;u.worldY=b.journey.worldY;u.hp=9;const hp=b.hp;b.swordStrike(u,100,true,.5);assert.equal(b.projectiles.length,0);assert.equal(u.hp,0);assert.equal(b.hp,hp+4.5);const v=b.units[1];v.guard=2;const atk=v.atk,def=v.def;b.hit(v,100,false);assert.equal(v.hp,960);assert.equal(v.reactionStrength,3);assert.equal(v.blockedHit,true);assert.equal(v.atk,atk);assert.equal(v.def,def);assert.ok(reactionOffset(.15,8)>reactionOffset(.15,3));b.destroy()});
test('strict saves accept legacy projectiles but reject corrupt or rebound sword metadata',()=>{const b=scene();b.swordStrike(b.units[0],100,true,.1);const snap=b.snapshot();assert.ok(validEncounter(snap));for(const corrupt of [{lifesteal:NaN},{launchDelay:-1},{strikeRune:3},{target:.5},{encounterId:'other'},{targetId:enemyIds[3]}]){const bad=structuredClone(snap);Object.assign(bad.projectiles[0],corrupt);assert.equal(validEncounter(bad),false)}const old=structuredClone(snap);old.projectiles[0].kind='ice';for(const key of ['encounterId','targetId','targetRole','lifesteal','originCameraX'] as const)delete old.projectiles[0][key];assert.ok(validEncounter(old));b.destroy()});
test('full-size damage, ability and status labels avoid bodies, HP, comic and one another',()=>{const obstacles:[number,number,number,number][]=[[0,0,864,440],[450,560,650,830],[200,630,440,835],[444,449,656,561]];const labels=layoutLabels([{key:'a',text:'Ледяной кокон',x:620,y:520,size:21,color:'white',alpha:1,priority:4},{key:'b',text:'✦ 240',x:590,y:650,size:34,color:'white',alpha:1,priority:3},{key:'c',text:'ЩИТ РАЗБИТ',x:590,y:650,size:24,color:'white',alpha:1,priority:2}],obstacles,(text,size)=>text.length*size*.53);assert.ok(labels.length>=2);for(const [i,f] of labels.entries()){assert.ok(obstacles.every(o=>!intersects(f.rect,o,5)));assert.ok(labels.slice(0,i).every(g=>!intersects(f.rect,g.rect,5)));assert.ok(f.size>=21)}});
test('feedback masks cover every live foe pose without changing formations or actor scale',()=>{for(const id of [...enemyIds,...miniIds,...bossIds])for(const f of clips[id].frames.slice(0,7))for(const b of f.bands){const masks=feedbackBands(id);const mid=(b[1]+b[3])/2;assert.ok(masks.some(m=>m[1]<=mid&&m[3]>=mid&&m[0]<=b[0]&&m[2]>=b[2]),id)}});
test('a distant counter interrupts only its bound target on contact, including its rune effect',()=>{const b=scene(),u=b.units[0],other=b.units[1];u.windup=other.windup=.6;u.actionTime=other.actionTime=0;b.skill(0);assert.equal(u.windup,.6);assert.equal(u.exposed??0,0);assert.equal(b.burn,0);assert.equal(u.hp,1000);b.stepProjectiles(1);assert.equal(u.windup,0);assert.equal(other.windup,.6);assert.ok(u.exposed!>0);assert.ok(b.burn>0);assert.ok(u.hp<1000);b.destroy()});
test('x1 and x2 deliver the same single damage; camera projection carries the real launch point',()=>{for(const speed of [1,2]){useGame.setState({p:freshPlayer(),speed});const b=scene(),u=b.units[0];b.autoCd=10;b.compCd=[10,10];b.swordStrike(u,100,false);const shot=b.projectiles[0],ends=b.projectileEnds(shot);b.journey.cameraX+=80;b.heroX-=80;const moved=b.projectileEnds(shot);assert.ok(Math.abs(moved.start.x-(ends.start.x-80))<.001);assert.ok(Math.abs(moved.end.x-(ends.end.x-80))<.001);assert.equal(shot.t,0);let hits=0,last=u.hp;for(let n=0;n<30;n++){b.update(.02*speed);if(u.hp!==last){hits++;last=u.hp}}assert.equal(hits,1);assert.equal(u.hp,900);b.destroy()}});


test('all hero and companion projectiles visually land on the registered enemy body after camera motion',()=>{
 for(const [source,kind] of [['hero','arrow'],['hero','ice'],['goose','feather']] as const){
  const b=scene(),u=b.units[0];
  b.shoot(source,kind,0,90);
  const shot=b.projectiles.at(-1)!;
  const before=b.projectileEnds(shot);
  b.journey.cameraX+=65;
  b.heroX-=65;
  const after=b.projectileEnds(shot);
  assert.ok(Math.abs(after.start.x-(before.start.x-65))<.001,kind+' camera-correct origin');
  shot.t=shot.duration;
  const path=projectileVisualPath(shot,after.start,after.end),body=b.targetBody(u);
  assert.ok(Math.abs(path.head.x-body.x)<.001,kind+' visible contact x');
  assert.ok(Math.abs(path.head.y-body.y)<.001,kind+' visible contact y');
  assert.ok(Number.isFinite(path.tail.x)&&Number.isFinite(path.tail.y));
  assert.ok(Number.isFinite(path.angle));
  b.destroy();
 }
});

test('enemy arrows and magic use the same registered trajectory without changing damage or timing',()=>{
 for(const kind of ['arrow','orb','web','fire','spore']){
  const b=scene(),u=b.units[0];
  b.shoot('enemy',kind,0,40);
  const shot=b.projectiles.at(-1)!,initialHp=b.hp;
  const before=b.projectileEnds(shot);
  b.journey.cameraX+=50;
  const after=b.projectileEnds(shot);
  assert.ok(Math.abs(after.start.x-(before.start.x-50))<.001,kind+' tracks the moving camera');
  shot.t=shot.duration;
  const path=projectileVisualPath(shot,after.start,after.end);
  assert.ok(Math.abs(path.head.x-after.end.x)<.001,kind+' impact x');
  assert.ok(Math.abs(path.head.y-after.end.y)<.001,kind+' impact y');
  assert.ok(Math.abs(path.tail.x-path.head.x)+Math.abs(path.tail.y-path.head.y)>0,kind+' visible trail');
  shot.t=0;
  const random=Math.random;
  try{Math.random=()=>.99;b.stepProjectiles(shot.duration+.01)}finally{Math.random=random}
  assert.ok(b.hp<initialHp,kind+' still deals one hit');
  assert.equal(b.projectiles.length,0);
  b.destroy();
 }
});

test('projectile visual path is frozen by pause and consistent with saved in-flight shot',()=>{
 const b=scene();b.shoot('hero','arrow',0,75);
 b.projectiles[0].t=.14;b.pause();
 const shot=structuredClone(b.projectiles[0]),bounds=b.projectileEnds(shot),path=projectileVisualPath(shot,bounds.start,bounds.end);
 b.update(2);
 assert.deepEqual(b.projectiles[0],shot,'paused projectile stays in flight');
 const still=b.projectileEnds(b.projectiles[0]),after=projectileVisualPath(b.projectiles[0],still.start,still.end);
 assert.deepEqual(after,path);
 b.destroy();
});
