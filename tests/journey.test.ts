import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {newJourney,nextSite,stepJourney,validJourney,projectX,siteX,districts} from '../src/game/Journey';
import {enemyIds,miniIds,bossIds} from '../src/data/catalog';
import {clips,transformBand,intersects} from '../src/game/actorGeometry';
import {worldObjectsAround} from '../src/game/WorldRenderer';
import {Battle} from '../src/game/Battle';
import {useGame,freshPlayer,parseSave,SAVE_KEY} from '../src/core/store';
Object.defineProperty(globalThis,'Image',{value:class {src='';complete=false;naturalWidth=0}});
Object.defineProperty(globalThis,'requestAnimationFrame',{value:()=>1});Object.defineProperty(globalThis,'cancelAnimationFrame',{value:()=>{}});
const saves=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>saves.get(k)??null,setItem:(k:string,v:string)=>saves.set(k,v)}});
beforeEach(()=>useGame.setState({p:freshPlayer(),auto:false}));
const scene=()=>new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement);
test('travel moves in world space, accelerates/brakes, and follows without camera overshoot',()=>{
 const j=newJourney();let previousCamera=0,previousWorld=j.worldX,arrived=false,peakVelocity=0;
 for(let n=0;n<1500&&!arrived;n++){
  const oldVelocity=j.velocity;arrived=stepJourney(j,.02);peakVelocity=Math.max(peakVelocity,j.velocity);
  assert.ok(j.worldX>=previousWorld&&j.cameraX>=previousCamera);assert.ok(j.cameraX<=Math.max(0,j.worldX-375)+1e-8);
  assert.ok(Math.abs(j.velocity-oldVelocity)<=260*.02+.01||j.worldX===j.targetX);
  assert.ok(projectX(j.worldX,j.cameraX)>=300&&projectX(j.worldX,j.cameraX)<410);
  previousCamera=j.cameraX;previousWorld=j.worldX;
 }
 assert.ok(arrived);assert.ok(peakVelocity>=200);assert.equal(j.worldX,1050);assert.equal(j.velocity,0);assert.ok(Math.abs(j.cameraX-675)<.05);assert.ok(Math.abs(j.distance-675)<1e-8);assert.ok(validJourney(j));
 const before=structuredClone(j);nextSite(j);assert.equal(j.worldX,before.worldX);assert.equal(j.cameraX,before.cameraX);assert.equal(j.targetX,2450);
});
test('five encounters occupy five distinct districts and continue beyond the boss without teleporting',()=>{
 const j=newJourney(),addresses=[];
 for(let encounter=0;encounter<6;encounter++){
  for(let n=0;n<1600;n++)if(stepJourney(j,.02))break;
  addresses.push(j.worldX);assert.equal(j.worldX,siteX(encounter));assert.equal(districts[j.encounterIndex%5],districts[encounter%5]);
  const world=j.worldX,camera=j.cameraX;nextSite(j);assert.equal(j.worldX,world);assert.equal(j.cameraX,camera);
 }
 assert.equal(new Set(addresses).size,6);assert.ok(addresses[5]>addresses[4]);
});
test('world culling stays bounded and landmark identity changes along the authored route',()=>{
 const kinds=[];for(let i=0;i<40;i++){
  const objects=worldObjectsAround(siteX(i)-375);assert.ok(objects.length<=19);
  const site=objects.find(o=>o.id===`site-${i}`);assert.ok(site);kinds.push(site.kind);
  assert.equal(site.worldX,siteX(i)*site.depth+140);
 }
 assert.deepEqual(kinds.slice(0,5),[0,1,2,3,5]);
});
test('axes pause freezes world, camera, companions and timers; reload resumes exactly the same journey',()=>{
 const b=scene();b.toggle();for(let i=0;i<90;i++){b.update(.02);if(b.director.state==='decide')b.director.choose('pass')}assert.ok(b.journey.worldX>300&&b.journey.cameraX>0);b.toggle();const frozen=b.snapshot();
 b.update(100);assert.deepEqual(b.snapshot(),frozen);b.checkpoint();const p=parseSave(saves.get(SAVE_KEY)!);assert.ok(p);b.destroy();useGame.setState({p});const loaded=scene();assert.equal(loaded.running,false);assert.deepEqual(loaded.snapshot(),frozen);loaded.toggle();loaded.update(.02);assert.ok(loaded.journey.worldX>frozen.journey!.worldX);assert.equal(loaded.id,frozen.id);loaded.destroy();
});
test('legacy mid-fight save migrates to a world site without healing, rerolling foes or rewarding again',()=>{
 const b=scene();b.phase='fight';b.hp=73;b.units[0].hp=27;const legacy=b.snapshot();delete legacy.journey;for(const u of legacy.units){delete u.worldX;delete u.worldY;}const ids=legacy.units.map(u=>u.id);b.destroy();useGame.setState({p:{...freshPlayer(),encounter:legacy}});
 const restored=scene();assert.equal(restored.hp,73);assert.equal(restored.units[0].hp,27);assert.deepEqual(restored.units.map(u=>u.id),ids);assert.equal(restored.phase,'fight');assert.equal(restored.journey.worldX,restored.journey.targetX);assert.equal(restored.heroX,375);assert.equal(useGame.getState().p.kills,0);restored.destroy();
});
test('new waves keep continuous coordinates while combat rewards remain single use',()=>{
 const b=scene();b.toggle();useGame.setState({auto:true});const sites:number[]=[];let previousIndex=-1,world=375;
 for(let i=0;i<10000&&useGame.getState().p.stage===1;i++){
  b.update(.02);assert.ok(b.journey.worldX>=world);world=b.journey.worldX;
  if(b.phase==='fight'&&previousIndex!==b.journey.encounterIndex){sites.push(b.journey.targetX);previousIndex=b.journey.encounterIndex;assert.ok(b.units.every(u=>u.worldX!>b.journey.worldX));}
 }
 assert.equal(useGame.getState().p.stage,2);assert.equal(useGame.getState().p.bosses,1);assert.equal(sites.length,5);assert.equal(new Set(sites).size,5);const kills=useGame.getState().p.kills;b.victory();assert.equal(useGame.getState().p.kills,kills);b.destroy();
});

test('importing a legacy player without a battle rebuilds the route for their actual stage and wave',()=>{
 const b=scene();useGame.setState({p:{...freshPlayer(),stage:9,wave:3}});b.restorePlayer();assert.equal(b.journey.encounterIndex,42);assert.equal(b.journey.targetX,siteX(42));assert.equal(b.stage,9);assert.equal(b.wave,3);b.destroy();
});

test('all fifteen guards and each regular group enter view before the hero stops, with clear HP and feet',()=>{
 const groups=[...enemyIds.map(id=>[id]),...miniIds.map(id=>[id]),...bossIds.map(id=>[id]),...enemyIds.map((id,i)=>[id,enemyIds[(i+1)%8]])];
 const hud:[number,number,number,number][]=[[0,110,120,826],[748,110,864,516],[737,731,864,866],[0,846,864,1536]];
 for(const ids of groups){
  const b=scene(),seed=b.units[0];b.units=ids.map((id,i)=>({...seed,id,role:i}));b.boss=ids.length===1&&!enemyIds.includes(ids[0]);b.journey=newJourney();b.placeEncounter();let seen=false;
  for(let tick=0;tick<500;tick++){
   b.clock=tick*.02;const arrived=stepJourney(b.journey,.02);b.travelEnemies(.02);
   if(b.journey.velocity>3&&b.units.some(u=>(u.reveal??0)>.8))seen=true;
   const visible=b.units.filter(u=>(u.reveal??0)>0).map(u=>{const v=b.visual(u),frame=(u.travelSpeed??0)>3?1+Math.floor(b.clock*8)%2:0;
    assert.ok(Math.abs(v.x+b.journey.cameraX-u.worldX!)<1e-8);
    const bands=clips[u.id].frames[frame].bands.map(band=>transformBand(v.flip?[-band[2],band[1],-band[0],band[3]]:band,v.x,v.y,v.height));
    for(const band of bands)for(const h of hud)assert.ok(!intersects(band,h,5.9),u.id+' entering HUD');
    const half=b.boss?92:46,bar:[number,number,number,number]=[v.barX-half,v.barY-2,v.barX+half,v.barY+10];for(const h of hud)assert.ok(!intersects(bar,h,5.9),u.id+' HP');
    return {bands,bar};
   });
   if(visible.length===2)for(const a of visible[0].bands)for(const c of visible[1].bands)assert.ok(!intersects(a,c,1),ids.join('|')+' arriving bodies');
   for(let i=0;i<visible.length;i++)for(let k=0;k<visible.length;k++)if(i!==k)for(const body of visible[k].bands)assert.ok(!intersects(visible[i].bar,body),ids.join('|')+' arriving HP over body');
   if(arrived)break;
  }
  assert.ok(seen,ids.join('|')+' visible during actual movement');b.destroy();
 }
});
test('all forty run/flight poses have guarded rectangles and preserve an airborne phase',()=>{
 for(const id of ['winged_helmet_warrior','whitebeard_mage','strongman_boulder','goose_aviator','brown_white_dog']){
  const clip=clips[id+':run'];assert.equal(clip.frames.length,8);assert.ok(clip.frames.every(f=>f.rect.every(Number.isInteger)&&f.rect[0]>=8&&f.rect[1]>=8));assert.ok(clip.frames.every(f=>f.bounds[3]<.02));
  assert.ok(new Set(clip.frames.map(f=>f.rect.slice(2).join(','))).size>4,id+' articulated poses');
 }
});
