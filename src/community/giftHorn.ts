import {requestCampaignProof,communityEnabled} from './client';
import {telegramProfile} from '../core/profile';
import {deliverGiftHorn,mayStartLoot,useGame} from '../core/store';
import type {Item} from '../core/types';

export const giftHornEnabled=communityEnabled&&!!telegramProfile;
type Opening={id:string;item:Item};
type HornState={status:'ok';charges:number;pending:Opening|null};
const key='vvr-gift-horn:'+telegramProfile;
type Request={operation:string;context:{level:number;stage:number;forge:number;blessing:number;forgeAnchor:number}};
let flight:Promise<HornState>|undefined;

export function syncGiftHorn(open=false):Promise<HornState>{
 if(flight)return flight;
 flight=reconcile(open).finally(()=>{flight=undefined;});
 return flight;
}

async function reconcile(open:boolean){
 const raw=localStorage.getItem(key);
 let saved=raw?JSON.parse(raw) as Request:undefined;
 if(open&&!saved){
  if(!mayStartLoot())return requestCampaignProof<HornState>({action:'horn_state'});
  const {level,stage,forge,blessing,progression}=useGame.getState().p;
  saved={operation:crypto.randomUUID(),context:{level,stage,forge,blessing,forgeAnchor:progression?.anchors.forge?.level??0}};
  localStorage.setItem(key,JSON.stringify(saved));
 }
 const state=saved
  ?await requestCampaignProof<HornState>({action:'horn_open',...saved})
  :await requestCampaignProof<HornState>({action:'horn_state'});
 if(state.pending){
  const {id,item}=state.pending;
  if(item.id!=='brotherhood-horn:'+id||!deliverGiftHorn(item))return state;
  const result=await requestCampaignProof<{status:string}>({action:'horn_ack',operation:id});
  if(result.status!=='delivered')return state;
 }
 if(saved)localStorage.removeItem(key);
 return {...state,pending:null};
}
