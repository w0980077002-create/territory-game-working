import {test} from 'node:test';
import assert from 'node:assert/strict';
import {worldObjectsAround} from '../src/game/WorldRenderer';
import frames from '../src/data/world-landmarks.json';
import {paintBiomeBack} from '../src/game/BiomeArt';
import {regions} from '../src/saga/regions';
import {siteX} from '../src/game/Journey';
import {setAtmosphereTier,liteAtmosphere} from '../src/game/RegionAtmosphere';
test('approved painted scenery keeps legacy composition and ground contact within a bounded budget',()=>{
 for(let site=0;site<300;site++)for(const offset of [-675,-375,0,375]){
  const camera=Math.max(0,siteX(site)+offset),objects=worldObjectsAround(camera);assert.ok(objects.length<=19);
  for(const o of objects){const [x,y,w,h]=frames[o.kind];assert.ok(x>=0&&y>=0&&x+w<=1536&&y+h<=1024);assert.ok(Math.abs(o.width/o.height-w/h)<.9, 'legacy scene has bounded painted-frame distortion');assert.ok(o.worldY>=706&&o.worldY<=720);}
 }
});
test('regional backgrounds preserve the approved painted scenery without flat or opaque washes',()=>{
 // Region light is gradient-only. The approved first region is never recoloured. In both the full and the
 // budget-device (lite) mode no layer may hide the art: the actor lane (y 600–840) only ever gets a light veil.
 const gradient={addColorStop(){}};
 for(const [low,quality] of [[false,1],[false,.5],[true,1]] as const)for(const region of regions){
  setAtmosphereTier(low);assert.equal(liteAtmosphere(quality),low||quality<.6);
  const fills:{style:unknown;rect:number[];alpha:number;mode:string}[]=[];const state={style:undefined as unknown,alpha:1,mode:'source-over'};const stack:typeof state[]=[];
  const ctx=new Proxy({},{get:(_,key)=>{const k=String(key);
   if(k==='save')return ()=>stack.push({...state});
   if(k==='restore')return ()=>Object.assign(state,stack.pop());
   if(['beginPath','moveTo','lineTo','closePath','fill','drawImage'].includes(k))return ()=>{};
   if(k==='createLinearGradient'||k==='createRadialGradient')return ()=>gradient;
   if(k==='fillRect')return (...rect:number[])=>fills.push({style:state.style,rect,alpha:state.alpha,mode:state.mode});
   throw new Error('Unexpected background construction: '+k)},
   set:(_,key,value)=>{if(key==='fillStyle')state.style=value;if(key==='globalAlpha')state.alpha=value;if(key==='globalCompositeOperation')state.mode=value;return true}}) as CanvasRenderingContext2D;
  paintBiomeBack(ctx,region,12,85000,quality,false);
  const blends=fills.filter(f=>f.mode==='hue'||f.mode==='soft-light').length;
  if(liteAtmosphere(quality))assert.equal(blends,0,'lite mode avoids costly blends');
  else if(region.id!=='ice')assert.ok(blends>0,'full mode keeps the vivid hue light');
  if(region.id==='ice')assert.equal(fills.length,0,'approved first region is not recoloured');
  else assert.ok(fills.length>0,region.id+' has its own light');
  for(const f of fills){
   assert.equal(f.style,gradient,region.id+' paints light with gradients, never a flat wash');
   assert.ok(f.alpha<=.85,region.id+' never paints an opaque layer');
   const [,y,,h]=f.rect,coversLane=y<840&&y+h>600;
   if(coversLane&&f.mode==='source-over')assert.ok(f.alpha<=.5,region.id+' keeps fighters visible through any veil');
  }
 }
});
