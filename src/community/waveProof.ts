import type {HeroClass} from '../core/types';
import {maxProofCommands,maxWaveProofTicks,observeWaveProof,parseProofCommands,proofTickSeconds,type ProofCommand,type ProofMove} from '../game/campaignProof';
import {requestCampaignProof} from './client';

import {useGame} from '../core/store';

type Wave={retries?:number;stage:number;wave:number;client:string;hero:HeroClass;commands:ProofCommand[]};
type Active=Wave&{encounter:string;seconds:number;auto:boolean};
type Reply={status:'started';ticket:string}|{status:'retry';afterMs:number}|
 {status:'waiting';stage:number;wave:number}|{status:'verified'|'ineligible'|'expired'|'unverified'};
const validHero=new Set(['berserker','ranger','runologist']);

export function startWaveProof(account:string){
 if(!crypto.randomUUID)return;
 const storage='vvr-wave-proof:'+account;
 let queue:Wave[]=[];
 try{
  const raw:unknown=JSON.parse(localStorage.getItem(storage)??'[]');
  if(Array.isArray(raw))queue=raw.filter((wave):wave is Wave=>wave&&typeof wave==='object'&&
   typeof wave.client==='string'&&validHero.has(wave.hero)&&Number.isInteger(wave.stage)&&wave.stage>=2&&
   Number.isInteger(wave.wave)&&wave.wave>=1&&wave.wave<=5&&!!parseProofCommands(wave.commands,maxWaveProofTicks));
 }catch{/* Normal Solo writes are independent of the replay queue. */}
 let active:Active|undefined,timer:ReturnType<typeof setTimeout>|undefined;
 let running=false,failures=0;
 const begin=(entry:Wave)=>requestCampaignProof<Reply>({action:'wave_begin',client:entry.client,
  hero:entry.hero,stage:entry.stage,wave:entry.wave});
 const save=()=>{
  try{localStorage.setItem(storage,JSON.stringify(queue));}catch{/* Replay can continue online. */}
 };
 function retry(ms:number){
  clearTimeout(timer);
  timer=setTimeout(()=>void drain(),ms);
 }
 async function drain(){
  if(running||!queue.length)return;
  running=true;
  const next=queue[0];
  try{
   let result=await begin(next);
   if(result.status==='started'){
    result=await requestCampaignProof<Reply>({action:'wave_replay',ticket:result.ticket,commands:next.commands});
   }
   if(result.status==='verified'){
    queue.shift();save();failures=0;retry(0);
   }else if(result.status==='waiting'){
    // Recover a missing transcript after restoring a save or closing the app
    // immediately after a victory. W066 still runs that fight in order.
    queue.unshift({stage:result.stage,wave:result.wave,hero:next.hero,client:crypto.randomUUID(),commands:[]});
    save();retry(0);
   }else if(result.status==='retry')retry(result.afterMs);
   else if(result.status==='expired')retry(2000);
   else if(result.status==='unverified'&&next.commands.length){
    // Auto is a legal way to play the same server replay. It is useful when
    // commands timed for different Solo equipment fail on the proof hero.
    next.commands=[];save();retry(2500);
   }else if(result.status==='unverified'&&(next.retries??0)<3){
    next.client=crypto.randomUUID();next.retries=(next.retries??0)+1;save();retry(2500);
   }else if(result.status==='ineligible'&&failures++<4)retry(4000);
  }catch{if(failures++<4)retry(3000);}
  finally{running=false;}
 }
 function append(move:ProofMove){
  if(!active||active.commands.length>=maxProofCommands)return;
  const tick=Math.floor(active.seconds/proofTickSeconds);
  if(tick<maxWaveProofTicks)active.commands.push([tick,move]);
 }
 observeWaveProof({
  advance(encounter,hero,stage,wave,dt,auto){
   if(active?.encounter!==encounter){
    active={encounter,stage,wave,hero,client:crypto.randomUUID(),commands:auto?[]:[[0,'auto_off']],seconds:0,auto};
    if(!queue.length)void begin(active).catch(()=>{});
   }
   if(active.auto!==auto){append(auto?'auto_on':'auto_off');active.auto=auto;}
   active.seconds+=dt;
  },
  command(encounter,move){if(active?.encounter===encounter)append(move);},
  won(encounter){
   if(active?.encounter!==encounter)return;
   const {stage,wave,hero,client,commands}=active;
   active=undefined;
   if(queue.some(entry=>entry.stage===stage&&entry.wave===wave))return;
   queue.push({stage,wave,hero,client,commands});
   queue.sort((a,b)=>a.stage-b.stage||a.wave-b.wave);
   save();failures=0;void drain();
  },
 });
 window.addEventListener('online',()=>{failures=0;void drain();});
 const {stage,wave,heroClass}=useGame.getState().p;
 if(!queue.length&&(stage>2||stage===2&&wave>1)){
  queue.push({stage:wave===1?stage-1:stage,wave:wave===1?5:wave-1,hero:heroClass,
   client:crypto.randomUUID(),commands:[]});
  save();
 }
 void drain();
}
