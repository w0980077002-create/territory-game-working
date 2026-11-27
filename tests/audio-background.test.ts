import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AudioDirector} from '../src/game/AudioDirector';

/** Minimal Web Audio stand-in: every node accepts any call; params remember their value. */
function fakeContext(){
 // A rising target is treated as reached; a fade to zero takes time, as in a real context.
 const param=()=>({value:1,setTargetAtTime(this:{value:number},v:number){if(v>0)this.value=v},setValueAtTime(){},exponentialRampToValueAtTime(){}});
 const node=():unknown=>new Proxy({},{get:(target:Record<string,unknown>,key:string)=>{
  if(!(key in target))target[key]=['gain','frequency','detune','Q','threshold','ratio'].includes(key)?param():()=>{};
  return target[key];
 },set:(target:Record<string,unknown>,key:string,value)=>{target[key]=value;return true}});
 const calls:string[]=[];
 const ctx={state:'running',currentTime:0,sampleRate:8000,destination:node(),
  createBuffer:(_c:number,length:number)=>({getChannelData:()=>new Float32Array(length)}),
  suspend(){calls.push('suspend');ctx.state='suspended';return Promise.resolve()},
  resume(){calls.push('resume');ctx.state='running';return Promise.resolve()}} as Record<string,unknown>&{state:string};
 return {calls,ctx:new Proxy(ctx,{get:(target,key:string)=>key in target?target[key]:key.startsWith('create')?()=>node():undefined})};
}

test('the audio context is suspended shortly after the page is hidden, and resumes when it returns',t=>{
 const {calls,ctx}=fakeContext();
 Object.defineProperty(globalThis,'AudioContext',{value:function(){return ctx},configurable:true});
 Object.defineProperty(globalThis,'document',{value:{hidden:false},configurable:true});
 t.mock.timers.enable({apis:['setTimeout']});
 const audio=new AudioDirector();
 audio.unlock(true);
 const frame={enabled:true,running:true,hidden:false,volume:2,mood:'city' as const,wind:0,walked:0,quality:1};
 audio.frame(frame);
 calls.length=0;
 (globalThis.document as {hidden:boolean}).hidden=true;
 audio.frame({...frame,hidden:true});
 assert.deepEqual(calls,[],'the fade runs first');
 t.mock.timers.tick(300);
 assert.deepEqual(calls,['suspend'],'no further frames arrive while hidden, so the timer stops the context');
 (globalThis.document as {hidden:boolean}).hidden=false;
 audio.frame(frame);
 assert.deepEqual(calls,['suspend','resume']);
 calls.length=0;
 // A hide shorter than the fade does not stop the context.
 audio.frame({...frame,hidden:true});
 audio.frame(frame);
 t.mock.timers.tick(300);
 assert.deepEqual(calls,[]);
});
