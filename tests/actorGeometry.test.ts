import {test} from 'node:test';
import assert from 'node:assert/strict';
import formations from '../src/data/enemy-formations.json';
import {clips,frameGeometry,localBands,transformBand,intersects,poseFrame} from '../src/game/actorGeometry';
import {enemyIds,miniIds,bossIds} from '../src/data/catalog';
import {enemyPlacement} from '../src/game/sceneLayout';
import type {Fighter} from '../src/core/types';
const enemies=[...enemyIds,...miniIds,...bossIds];
const HUD:[number,number,number,number][]=[[0,110,120,826],[748,110,864,516],[737,731,864,866],[0,846,864,1536]];
test('all 120 opponent poses have integer source rectangles, individual foot pivots and complete bounds',()=>{
 assert.equal(enemies.length,15);
 for(const id of enemies){const clip=clips[id];assert.equal(clip.frames.length,8);
  for(let frame=0;frame<8;frame++){
   const f=clip.frames[frame],g=frameGeometry(id,frame,600,810,200);
   assert.ok(f.rect.every(Number.isInteger),id);assert.ok(f.rect[2]>20&&f.rect[3]>20,id);
   assert.equal(g.y+f.pivot[1]*g.scale,810,id+' ground');
   assert.equal(g.x+f.pivot[0]*g.scale,600,id+' root');
   const mirrored=frameGeometry(id,frame,600,810,200,true);
   assert.ok(Math.abs(mirrored.bounds[0]+g.bounds[2]-1200)<1e-8,id+' mirror');
   assert.ok(f.bands.every(b=>b[0]>=f.bounds[0]-.00002&&b[2]<=f.bounds[2]+.00002),id+' complete width');
  }
 }
});
test('all formations protect every pose and loading fallback against HUD, edges and other enemies',()=>{
 for(const [key,layout] of Object.entries(formations)){
  const ids=key.split('|');const all=layout.actors.map((v,i)=>localBands(ids[i],v.flip).map(b=>transformBand(b,v.x,v.y,v.height,-28,18)));
  for(let i=0;i<all.length;i++){
   const v=layout.actors[i],clip=clips[ids[i]];
   assert.ok(v.y>=714&&v.y<=835,key+' snowy surface');
   for(const b of all[i]){
    assert.ok(b[0]>=12&&b[2]<=852&&b[3]<=840,key+' full sprite in viewport');
    for(const hud of HUD)assert.ok(!intersects(b,hud,5.9),key+' HUD separation');
   }
   const top=v.y+clip.envelope[1]*v.height,barY=top-18;
   assert.ok(barY+10<top,key+' HP above complete motion envelope');
   const half=layout.boss?92:46,bar:[number,number,number,number]=[v.x-half,barY-2,v.x+half,barY+10];
   for(const hud of HUD)assert.ok(!intersects(bar,hud,5.9),key+' HP clear of HUD');
   for(let j=0;j<all.length;j++)if(j!==i)for(const b of all[j])assert.ok(!intersects(bar,b,2.9),key+' HP does not cover another enemy');
   if(i)for(const a of all[0])for(const b of all[i])assert.ok(!intersects(a,b,2.9),key+' enemy separation');
  }
 }
});
test('formation does not jump when first enemy dies; visual projection cannot change saved combat values',()=>{
 const units=enemyIds.slice(0,2).map((id,i)=>({id,x:585+i*98,y:800,hp:100,role:i,attack:0})) as Fighter[];
 const before=structuredClone(units),rear=enemyPlacement(units,1);
 units[0].hp=0;units[0].dead=.9;
 assert.deepEqual(enemyPlacement(units,1),rear);
 units[0]=before[0];for(let i=0;i<2;i++)enemyPlacement(units,i,true);
 assert.deepEqual(units,before);
});
test('pose priority covers hurt, windup, impact, follow-through, death and paused walk clocks',()=>{
 assert.deepEqual([poseFrame({}),poseFrame({walking:true,time:0}),poseFrame({walking:true,time:.13}),poseFrame({windup:1}),poseFrame({attack:.4}),poseFrame({attack:.1}),poseFrame({attack:.5,hurt:1}),poseFrame({attack:.5,hurt:1,death:.1})],[0,1,2,3,4,5,6,7]);
});

test('legacy three- and five-enemy saves receive distinct safe positions without modifying fighters',()=>{
 for(const count of [3,5]){
  const units=enemyIds.slice(0,count).map((id,i)=>({id,x:585+i*98,y:800,hp:100,role:i,attack:0})) as Fighter[];
  const before=structuredClone(units);const boxes=units.map((u,i)=>{const v=enemyPlacement(units,i);return localBands(u.id,v.flip).map(b=>transformBand(b,v.x,v.y,v.height,-28,18))});
  for(let i=0;i<count;i++)for(const b of boxes[i]){for(const hud of HUD)assert.ok(!intersects(b,hud,5.9));for(let j=0;j<i;j++)for(const a of boxes[j])assert.ok(!intersects(a,b,2.9))}
  assert.deepEqual(units,before);
 }
});

test('idle enemies leave all three hero torsos and feet visible; weapon contact uses its own lane',()=>{
 for(const [key,layout] of Object.entries(formations))for(const [i,v] of layout.actors.entries()){
  const id=key.split('|')[i],foe=clips[id].frames[0].bands.map(b=>transformBand(v.flip?[-b[2],b[1],-b[0],b[3]]:b,v.x,v.y,v.height));
  for(const heroId of ['winged_helmet_warrior','whitebeard_mage','strongman_boulder']){
   const hero=clips[heroId],height=214*hero.referenceHeight/hero.legacyCellHeight;
   for(const band of hero.frames[0].bands){const a=transformBand(band,375,805,height);a[2]=Math.min(a[2],430);if(a[0]>=a[2])continue;for(const b of foe)assert.ok(!intersects(a,b,3.9),key+' '+heroId)}
  }
 }
});
