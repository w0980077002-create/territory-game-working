import {test} from 'node:test';
import assert from 'node:assert/strict';
import {worldObjectsAround} from '../src/game/WorldRenderer';
import frames from '../src/data/world-landmarks.json';
import {paintBiomeBack} from '../src/game/BiomeArt';
import {regions} from '../src/saga/regions';
import {siteX} from '../src/game/Journey';
test('approved painted scenery keeps legacy composition and ground contact within a bounded budget',()=>{
 for(let site=0;site<300;site++)for(const offset of [-675,-375,0,375]){
  const camera=Math.max(0,siteX(site)+offset),objects=worldObjectsAround(camera);assert.ok(objects.length<=19);
  for(const o of objects){const [x,y,w,h]=frames[o.kind];assert.ok(x>=0&&y>=0&&x+w<=1536&&y+h<=1024);assert.ok(Math.abs(o.width/o.height-w/h)<.45, 'landmark proportions remain within the owner-approved painted composition');assert.ok(o.worldY>=706&&o.worldY<=720);}
 }
});
test('regional backgrounds preserve the approved painted scenery without screen-wide colour washes',()=>{
 const calls:string[]=[];
 const ctx=new Proxy({},{get:(_,key)=>{if(['save','restore','fillRect'].includes(String(key)))return ()=>calls.push(String(key));throw new Error('Unexpected background construction: '+String(key))},set:()=>true}) as CanvasRenderingContext2D;
 for(const region of regions)paintBiomeBack(ctx,region,12,85000,1,false);
 assert.equal(calls.filter(c=>c==='fillRect').length,0);
});
