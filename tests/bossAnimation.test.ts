import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statSync} from 'node:fs';
import {bossTextures,bossPose} from '../src/game/bossAnimation';
import {bossIds,miniIds} from '../src/data/catalog';
import formations from '../src/data/enemy-formations.json';

test('every boss and miniboss uses a lossless original with resolution for mobile DPR 3',()=>{
 assert.deepEqual(Object.keys(bossTextures).sort(),[...bossIds,...miniIds].sort());
 for(const [id,t] of Object.entries(bossTextures)){
  const height=formations[id as keyof typeof formations].actors[0].height;
  assert.ok(t.height>=height*3,id+' texture must not need enlargement at DPR 3');
  assert.ok(statSync(new URL('../public/art/bosses/'+id+'.webp',import.meta.url)).size>1000,id);
 }
});

test('all boss poses preserve the original proportions and fit their registered bounds',()=>{
 for(const id of [...bossIds,...miniIds])for(let time=0;time<3;time+=.13){
  for(const state of [{},{walking:true},{attack:.65},{attack:.35},{attack:.1},{hurt:.2},{windup:1},{death:.03},{death:.3}]){
   const p=bossPose(id,247,{time,...state})!,t=bossTextures[id];
   assert.ok(Math.abs(p.width/p.height-t.width/t.height)<1e-8,id+' no stretching');
   const w=(Math.abs(Math.cos(p.angle))*p.width+Math.abs(Math.sin(p.angle))*p.height)/2;
   const h=(Math.abs(Math.sin(p.angle))*p.width+Math.abs(Math.cos(p.angle))*p.height)/2;
   assert.ok(p.x-w>=p.box.x-1e-6&&p.x+w<=p.box.x+p.box.width+1e-6,id+' width');
   assert.ok(p.y-h>=p.box.y-1e-6&&p.y+h<=p.box.y+p.box.height+1e-6,id+' height');
  }
 }
});

test('bosses animate walking, preparation, attack, hit reaction and a grounded fall',()=>{
 for(const id of [...bossIds,...miniIds]){
  const idle=bossPose(id,240,{time:0})!;
  for(const p of [{walking:true,time:.15},{windup:1,time:.15},{attack:.35},{hurt:.2},{death:.3}])assert.notDeepEqual(bossPose(id,240,p),idle,id);
  assert.equal(bossPose(id,240,{death:.3})!.angle,-Math.PI/2);
 }
});
