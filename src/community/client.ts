import {tg} from '../core/telegram';

const endpoint=import.meta.env.VITE_VVR_COMMUNITY_URL as string|undefined;
export const communityEnabled=!!endpoint;
export type Metric='world_boss_damage'|'arena_wins';
export type Trade={kind:'list';itemId:string;price:number}|{kind:'buy'|'cancel';listingId:string};
export type Market={
 gold:number;items:{id:string;catalogId:string}[];listings:{id:string;catalogId:string;price:number;mine:boolean}[];
 history:{operationId:string;kind:Trade['kind'];listingId:string;price:number;at:string}[];
};
export type Chat={moderator:boolean;messages:{id:number;name:string;text:string;at:string}[]};
type Season={id:string;name:string;starts_at:string;ends_at:string};
export type Ranking={season:Season|null;seasons:Season[];rows:{rank:number;name:string;points:number;mine:boolean}[]};
export class CommunityError extends Error {
 constructor(readonly status:number){super(String(status));}
}
let session:Promise<string>|undefined;

async function request<T>(action:string,body:object,token?:string,signal?:AbortSignal):Promise<T>{
 if(!endpoint)throw new CommunityError(503);
 const response=await fetch(endpoint,{method:'POST',credentials:'omit',signal,
  headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
  body:JSON.stringify({action,body}),
 });
 if(!response.ok)throw new CommunityError(response.status);
 return response.json() as Promise<T>;
}

export function connectCommunity(){
 if(session)return session;
 const initData=tg()?.initData;
 if(!initData)return Promise.reject(new CommunityError(401));
 session=request<{token:string}>('login',{initData}).then(reply=>reply.token).catch(error=>{
  session=undefined;
  throw error;
 });
 return session;
}

export async function community<T>(action:string,body:object={},signal?:AbortSignal){
 const current=connectCommunity();
 try{return await request<T>(action,body,await current,signal);}
 catch(error){
  if(error instanceof CommunityError&&error.status===401&&session===current)session=undefined;
  throw error;
 }
}
