import {requestCampaignProof} from './client';
import {observeCampaignProof,parseProofCommands,proofTickSeconds,maxProofCommands,maxProofTicks,type ProofCommand,type ProofMove} from '../game/campaignProof';
import type {HeroClass} from '../core/types';

type Attempt={
 encounter:string;client:string;hero:HeroClass;seconds:number;auto:boolean;commands:ProofCommand[];won:boolean;storedAt:number;
};
type Status={status:'started';ticket:string}|{status:'retry';afterMs:number}|
 {status:'verified'|'ineligible'|'expired'|'unverified'};
const heroes=new Set(['berserker','ranger','runologist']);

export function startCampaignProof(account:string,verified:()=>void){
 if(!crypto.randomUUID)return;
 const key='vvr-first-boss-proof:'+account;
 let attempt:Attempt|undefined;
 let timer:ReturnType<typeof setTimeout>|undefined;
 let busy=false;
 let failures=0;
 try{
  const stored=JSON.parse(localStorage.getItem(key)??'null') as Attempt|null;
  if(stored&&typeof stored.client==='string'&&typeof stored.encounter==='string'&&heroes.has(stored.hero)
     &&typeof stored.won==='boolean'&&typeof stored.auto==='boolean'&&Number.isFinite(stored.seconds)
     &&stored.seconds>=0&&Number.isFinite(stored.storedAt)&&Date.now()-stored.storedAt<30*60_000
     &&parseProofCommands(stored.commands))attempt=stored;
 }catch{/* The local archive is only a replay buffer. */}
 const save=()=>{
  try{
   if(attempt){attempt.storedAt=Date.now();localStorage.setItem(key,JSON.stringify(attempt));}
   else localStorage.removeItem(key);
  }catch{/* Combat and the main save proceed independently. */}
 };
 let began:Promise<Status>|undefined;
 function begin(record:Attempt){
  began??=requestCampaignProof<Status>({action:'begin',client:record.client,hero:record.hero})
   .catch(error=>{if(attempt===record)began=undefined;throw error;});
  return began;
 }
 function checkLater(ms:number){
  clearTimeout(timer);
  timer=setTimeout(()=>void submit(),ms);
 }
 async function submit(){
  const record=attempt;
  if(!record?.won||busy)return;
  busy=true;
  try{
   let result=await begin(record);
   if(attempt!==record)return;
   if(result.status==='retry'){began=undefined;checkLater(result.afterMs);return;}
   if(result.status==='started'){
    result=await requestCampaignProof<Status>({action:'replay',ticket:result.ticket,commands:record.commands});
   }
   if(attempt!==record)return;
   if(result.status==='retry'){checkLater(result.afterMs);return;}
   attempt=undefined;began=undefined;save();
   if(result.status==='verified')verified();
  }catch{
   if(attempt===record&&failures++<2)checkLater(2000);
  }finally{busy=false;}
 }
 function append(move:ProofMove){
  if(!attempt||attempt.commands.length>=maxProofCommands)return;
  const tick=Math.floor(attempt.seconds/proofTickSeconds);
  if(tick>=maxProofTicks)return;
  attempt.commands.push([tick,move]);
 }
 observeCampaignProof({
  advance(encounter,hero,dt,auto){
   if(attempt?.encounter!==encounter){
    if(attempt?.won)return;
    failures=0;began=undefined;
    attempt={encounter,hero,client:crypto.randomUUID(),seconds:0,auto,commands:auto?[]:[[0,'auto_off']],won:false,storedAt:0};
    save();
    void begin(attempt).catch(()=>{});
   }
   if(!attempt||attempt.won)return;
   if(attempt.auto!==auto){append(auto?'auto_on':'auto_off');attempt.auto=auto;}
   attempt.seconds+=dt;
   if(Date.now()-attempt.storedAt>=2000)save();
  },
  command(encounter,move){
   if(attempt?.encounter===encounter&&!attempt.won){append(move);save();}
  },
  won(encounter){
   if(attempt?.encounter!==encounter||attempt.won)return;
   attempt.won=true;save();void submit();
  },
 });
 window.addEventListener('online',()=>{failures=0;void submit();});
 if(attempt?.won)void submit();
}
