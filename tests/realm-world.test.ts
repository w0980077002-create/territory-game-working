import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RealmWorld,realmDecorations,realmLighting,realmSceneIdentity,type RealmView} from '../src/dark/RealmWorld';
import {newJourney} from '../src/game/Journey';

const view:RealmView={floor:1,room:1,phase:'fight',clock:12.4,combatTime:.3,delay:0,impact:0,quality:1,reduced:false};
function recorder(){
 const calls:unknown[][]=[],state:Record<string,unknown>={globalAlpha:1},stack:Record<string,unknown>[]=[];let gradientId=0;
 const c=new Proxy({} as CanvasRenderingContext2D,{
  get:(_,key)=>{
   if(key in state)return state[key as string];
   if(key==='createRadialGradient')return (...a:unknown[])=>{calls.push([key,...a]);return {id:gradientId++,addColorStop:(...v:unknown[])=>calls.push(['stop',...v])}};
   return (...a:unknown[])=>{if(key==='save')stack.push({...state});if(key==='restore')Object.assign(state,stack.pop());calls.push([key,...a.map(v=>v&&typeof v==='object'&&'src' in v?(v as {src:string}).src:v)])};
  },
  set:(_,key,value)=>{state[key as string]=value;calls.push(['set',key,value&&typeof value==='object'&&'id' in value?'gradient:'+value.id:value]);return true},
 });return {c,calls};
}
test('realm illustrations have stable encounter identity and unique chamber arrangements',()=>{
 for(let floor=1;floor<=30;floor++)for(let room=1;room<=3;room++){
  assert.deepEqual(realmSceneIdentity(`Тьма ${floor} · Стража` ,`Царство тьмы · ${room}/3`),{floor,room});
  const props=realmDecorations(floor,room);assert.deepEqual(props,realmDecorations(floor,room));
  assert.ok(props.every(o=>o.depth>0&&o.depth<1&&o.height>100));
  assert.equal(new Set(props.map(o=>`${o.x}:${o.y}`)).size,props.length,'no duplicate wallpaper props');
 }
 assert.notDeepEqual(realmDecorations(1,1),realmDecorations(1,2));assert.notDeepEqual(realmDecorations(1,2),realmDecorations(1,3));
 assert.notDeepEqual(realmDecorations(1,1),realmDecorations(2,1));
});
test('underground light intensifies toward the arena and the floor lord',()=>{
 const start=newJourney(),end=newJourney(1,1,true);
 assert.ok(realmLighting(end,view)>realmLighting(start,view));
 assert.ok(realmLighting(end,{...view,room:3})>realmLighting(end,{...view,room:2}));
});
test('cave render is deterministic, consumes no combat RNG and retains all art under reduced effects',()=>{
 const originalImage=globalThis.Image,originalRandom=Math.random;
 Object.assign(globalThis,{Image:class{src='';complete=true;get naturalWidth(){return this.src.includes('road')?1774:887}get naturalHeight(){return this.src.includes('road')?887:1774}}});
 Math.random=()=>{throw new Error('scenery must never consume combat RNG')};
 try{
  const scene=new RealmWorld(),j=newJourney(1,1,true),saved=structuredClone({j,view});assert.ok(scene.ready());
  const a=recorder(),b=recorder();scene.drawBack(a.c,j,view);scene.drawFront(a.c,j,view);scene.drawBack(b.c,j,view);scene.drawFront(b.c,j,view);
  assert.deepEqual(a.calls,b.calls,'same paused clock and journey produce identical drawing commands');assert.deepEqual({j,view},saved,'drawing cannot mutate progress or view');
  const art=(calls:unknown[][])=>calls.filter(c=>c[0]==='drawImage');
  const reduced=recorder();scene.drawBack(reduced.c,j,{...view,reduced:true,quality:.45});scene.drawFront(reduced.c,j,{...view,reduced:true,quality:.45});
  assert.equal(art(reduced.calls).length,art(a.calls).length,'all painted planes and scenery survive low quality');assert.ok(reduced.calls.length<a.calls.length);
  const moved=recorder();scene.drawBack(moved.c,{...j,cameraX:j.cameraX-100},view);
  assert.notDeepEqual(art(moved.calls),art(a.calls),'camera projects layers at different depths');
  for(const row of art(a.calls)){
   const [,,sx,sy,sw,sh]=row as [string,string,number,number,number,number];const width=(row[1] as string).includes('road')?1774:887,height=width===1774?887:1774;
   assert.ok(sx>=0&&sy>=0&&sw>0&&sh>0&&sx+sw<=width&&sy+sh<=height,'atlas frames stay inside the loaded sheet');
  }
 }finally{globalThis.Image=originalImage;Math.random=originalRandom}
});
