import {requestCampaignProof,type BrotherhoodResources} from './client';
import {telegramProfile} from '../core/profile';
import {deliverGiftResources} from '../core/store';

type Delivery={id:string;item:{id:string;resources:BrotherhoodResources}};
type State={status:'ok';available:BrotherhoodResources;wallet:BrotherhoodResources;pending:Delivery|null};
const key='vvr-gift-solo:'+telegramProfile;
let flight:Promise<State&{delivered?:boolean}>|undefined;

export function syncGiftSolo(transfer=false){
 if(flight)return flight;
 flight=reconcile(transfer).finally(()=>{flight=undefined;});
 return flight;
}

async function reconcile(transfer:boolean){
 let operation=localStorage.getItem(key);
 if(!operation&&transfer){
  operation=crypto.randomUUID();
  localStorage.setItem(key,operation);
 }
 const state=await requestCampaignProof<State>(operation?{action:'solo_open',operation}:{action:'solo_state'});
 if(state.pending){
  const {id,item}=state.pending;
  if(item.id!=='brotherhood-solo:'+id||!deliverGiftResources(item.id,item.resources))return state;
  const received=await requestCampaignProof<{status:string}>({action:'solo_ack',operation:id});
  if(received.status!=='delivered')return state;
 }
 if(operation)localStorage.removeItem(key);
 return {...state,pending:null,delivered:!!state.pending};
}
