import type {HeroClass} from '../core/types';

export const proofTickSeconds=.05;
export const maxProofTicks=1600;
export const maxWaveProofTicks=3600;
export const maxProofCommands=160;
export type ProofMove='sword'|'call'|'hammer'|'heal'|'auto_on'|'auto_off';
export type ProofCommand=readonly [tick:number,move:ProofMove];

type Observer={
 advance:(encounter:string,hero:HeroClass,dt:number,auto:boolean)=>void;
 command:(encounter:string,move:ProofMove)=>void;
 won:(encounter:string)=>void;
};
export let campaignProof:Observer|undefined;
export function observeCampaignProof(observer:Observer){campaignProof=observer;}

const moves=new Set<ProofMove>(['sword','call','hammer','heal','auto_on','auto_off']);
type WaveObserver={
 advance:(encounter:string,hero:HeroClass,stage:number,wave:number,dt:number,auto:boolean)=>void;
 command:Observer['command'];
 won:Observer['won'];
};
export let waveProof:WaveObserver|undefined;
export function observeWaveProof(observer:WaveObserver){waveProof=observer;}

export function parseProofCommands(value:unknown,maxTicks=maxProofTicks):ProofCommand[]|undefined{
 if(!Array.isArray(value)||value.length>maxProofCommands)return;
 const result:ProofCommand[]=[];
 let last=0;
 for(const entry of value){
  if(!Array.isArray(entry)||entry.length!==2)return;
  const [tick,move]=entry;
  if(!Number.isInteger(tick)||tick<last||tick>=maxTicks||!moves.has(move))return;
  result.push([tick,move]);
  last=tick;
 }
 return result;
}
