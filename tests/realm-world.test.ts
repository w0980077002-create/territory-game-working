import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RealmWorld,realmCrossing,realmDecorations,realmLighting,realmSceneIdentity,type RealmChamber,type RealmView} from '../src/dark/RealmWorld';
import {newRealmRun,type Portal} from '../src/dark/realm';
import {newJourney,nextSite} from '../src/game/Journey';

const view:RealmView={floor:1,chamber:'entry',phase:'fight',clock:12.4,combatTime:.3,crossing:false,impact:0,quality:1,reduced:false};
function recorder(){
 const calls:unknown[][]=[],state:Record<string,unknown>={globalAlpha:1},stack:Record<string,unknown>[]=[];let gradientId=0;
 const c=new Proxy({} as CanvasRenderingContext2D,{
  get:(_,key)=>{
   if(key in state)return state[key as string];
   if(key==='createRadialGradient'||key==='createLinearGradient')return (...a:unknown[])=>{calls.push([key,...a]);return {id:gradientId++,addColorStop:(...v:unknown[])=>calls.push(['stop',...v])}};
   return (...a:unknown[])=>{if(key==='save')stack.push({...state});if(key==='restore')Object.assign(state,stack.pop());calls.push([key,...a.map(v=>v&&typeof v==='object'&&'src' in v?(v as {src:string}).src:v)])};
  },
  set:(_,key,value)=>{state[key as string]=value;calls.push(['set',key,value&&typeof value==='object'&&'id' in value?'gradient:'+value.id:value]);return true},
 });return {c,calls};
}
test('realm illustrations have stable encounter identity and unique chamber arrangements',()=>{
 const chambers:RealmChamber[]=['entry','ruins','crypt','abyss','sanctum'];
 for(let floor=1;floor<=30;floor++)for(const chamber of chambers){
  const props=realmDecorations(floor,chamber);assert.deepEqual(props,realmDecorations(floor,chamber));
  assert.ok(props.every(o=>o.depth>0&&o.depth<1&&o.height>100));
  assert.equal(new Set(props.map(o=>`${o.x}:${o.y}`)).size,props.length,'no duplicate wallpaper props');
 }
 assert.equal(new Set(chambers.map(chamber=>JSON.stringify(realmDecorations(1,chamber)))).size,chambers.length);
 assert.notDeepEqual(realmDecorations(1,'entry'),realmDecorations(2,'entry'));
 const run=newRealmRun(2,'ward','test');
 assert.deepEqual(realmSceneIdentity(run,undefined,1),{floor:2,chamber:'entry',crossing:false});
 for(const [biome,chamber] of chambers.slice(1,4).entries()){
  const selected:Portal={id:'test',stars:3,biome,count:10,label:'Врата'};
  assert.deepEqual(realmSceneIdentity({...run,stage:'SEGMENT_3',selected},undefined,1),{floor:2,chamber,crossing:true});
  assert.deepEqual(realmSceneIdentity({...run,stage:'SEGMENT_3',selected,killed:3},undefined,1),{floor:2,chamber,crossing:false});
  assert.deepEqual(realmSceneIdentity({...run,stage:'CHOICE_4',selected},undefined,1),{floor:2,chamber,crossing:false});
  assert.deepEqual(realmSceneIdentity({...run,stage:'FINAL_BOSS',selected},undefined,1),{floor:2,chamber:'sanctum',crossing:true});
 }
});
test('portal reveal follows the saved journey and skips reduced motion and later waves',()=>{
 const walk={...view,phase:'walk',crossing:true};
 const j=newJourney(1,1,true);nextSite(j);
 assert.equal(realmCrossing(j,walk),1);
 j.worldX+=55;
 assert.ok(realmCrossing(j,walk)<1&&realmCrossing(j,walk)>0);
 assert.equal(realmCrossing(j,walk),realmCrossing(structuredClone(j),walk));
 assert.equal(realmCrossing(j,{...walk,reduced:true}),0);
 assert.equal(realmCrossing(j,{...walk,crossing:false}),0);
 j.worldX+=100;
 assert.equal(realmCrossing(j,walk),0);
});
test('underground light intensifies toward the arena and the floor lord',()=>{
 const start=newJourney(),end=newJourney(1,1,true);
 assert.ok(realmLighting(end,view)>realmLighting(start,view));
 assert.ok(realmLighting(end,{...view,chamber:'sanctum'})>realmLighting(end,{...view,chamber:'crypt'}));
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
  const abyss=recorder();scene.drawBack(abyss.c,j,{...view,chamber:'abyss'});
  assert.ok(abyss.calls.some(row=>row[0]==='createLinearGradient'),'the abyss has luminous fungi on its path');
 }finally{globalThis.Image=originalImage;Math.random=originalRandom}
});
