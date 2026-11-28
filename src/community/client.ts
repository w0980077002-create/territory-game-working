import {tg} from '../core/telegram';

const endpoint=import.meta.env.VITE_VVR_COMMUNITY_URL as string|undefined;
export const communityEnabled=!!endpoint;
export type Metric='world_boss_damage'|'arena_wins';
export type Trade={kind:'list';itemId:string;price:number}|{kind:'buy'|'cancel';listingId:string}
 |{kind:'request';catalogId:string;price:number}|{kind:'withdraw';requestId:string}|{kind:'fulfill';requestId:string;itemId:string};
export type Market={
 equipment?:{attack:number;equipped:string|null;enhancements?:Record<string,{rank:number;cost:number|null}>};
 gold:number;items:{id:string;catalogId:string;rank?:number}[];listings:{id:string;catalogId:string;rank?:number;price:number;mine:boolean;expired?:boolean}[];
 requests?:{id:string;catalogId:string;price:number;mine:boolean;expired:boolean}[];
 priceHistory?:{catalogId:string;price:number;at:string}[];
 history:{operationId:string;kind:Trade['kind']|'enhance';listingId?:string;price:number;at:string;commission?:number|null;sellerNet?:number|null}[];
};
export type GuildChange={kind:'create';name:string}|{kind:'apply'|'withdraw';guild:string}|
 {kind:'accept'|'reject';guild:string;applicant:string}|{kind:'leave'};
type GuildRole='leader'|'member';
export type GuildState={
 quests:{id:string;name:string;target:number;damage:number;gold:number;canClaim:boolean;claimed:boolean}[];
 directory:{id:string;name:string;members:number;applied:boolean}[];
 guild:{id:string;name:string;role:GuildRole;members:{name:string;role:GuildRole}[];applications:{id:string;name:string}[]}|null;
};
export type Chat={moderator:boolean;messages:{id:number;name:string;text:string;at:string}[]};
type Season={id:string;name:string;starts_at:string;ends_at:string};
export type Ranking={season:Season|null;seasons:Season[];rows:{rank:number;name:string;points:number;mine:boolean}[]};
export class CommunityError extends Error {
 constructor(readonly status:number){super(String(status));}
}
let session:Promise<string>|undefined;

async function request<T>(action:string,body:object,token?:string,signal?:AbortSignal,path=''):Promise<T>{
 if(!endpoint)throw new CommunityError(503);
 const response=await fetch(endpoint+path,{method:'POST',credentials:'omit',signal,
  headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
  body:JSON.stringify(path?body:{action,body}),
 });
 if(!response.ok)throw new CommunityError(response.status);
 return response.json() as Promise<T>;
}

export function connectCommunity(){
 if(session)return session;
 const initData=tg()?.initData;
 if(!initData)return Promise.reject(new CommunityError(401));
 session=request<{token:string}>('login',{initData},undefined,AbortSignal.timeout?.(7500)).then(reply=>reply.token).catch(error=>{
  session=undefined;
  throw error;
 });
 return session;
}

async function authenticated<T>(action:string,body:object,signal?:AbortSignal,path=''){
 const current=connectCommunity();
 try{return await request<T>(action,body,await current,signal,path);}
 catch(error){
  if(error instanceof CommunityError&&error.status===401&&session===current)session=undefined;
  throw error;
 }
}

export function community<T>(action:string,body:object={},signal?:AbortSignal){
 return authenticated<T>(action,body,signal);
}

type BrotherhoodResource='gold'|'gems'|'horn'|'chaosite'|'rune_scrolls'|'summon_seals'|'relic_shards';
export type BrotherhoodResources=Partial<Record<BrotherhoodResource,number>>;
export type BrotherhoodAward={id:string;kind:'welcome'|'oath'|'level'|'legend';tier:number;payload:BrotherhoodResources;received:boolean};
export type BrotherhoodPair={
 id:string;inviterId:string;name:string;active:boolean;days:number;verifiedLevel?:number;verifiedXp?:number;awards:BrotherhoodAward[];
};
export type BrotherhoodRewards={
 welcome:{inviter:BrotherhoodResources;invitee:BrotherhoodResources};
 level:Record<string,BrotherhoodResources>;
 oath:Record<string,BrotherhoodResources>;
 legend:Record<string,{title:'comrade'|'leader'|'chief';resources:BrotherhoodResources;honor?:string}>;
};
type BrotherhoodState={
 enabled:boolean;rewards:BrotherhoodRewards;incoming:BrotherhoodPair|null;outgoing:BrotherhoodPair[];
 invited:number;active:number;qualifiedFriends?:number;legendAwards?:BrotherhoodAward[];wallet:BrotherhoodResources;
};
export type BrotherhoodStats={
 enabled:boolean;invited:number;active:number;tiers:Record<string,number>;
 issued:BrotherhoodResources;rejections:Partial<Record<'self_referral'|'foreign_or_unknown_award',number>>;
};
type BrotherhoodClaim={status:'received';wallet:BrotherhoodResources}|{status:'paused'|'unavailable'};
export function claimBrotherhood(award:string){
 return community<BrotherhoodClaim>('brotherhood_claim',{award},AbortSignal.timeout?.(7500));
}
export function readBrotherhoodAdmin(enabled?:boolean){
 return community<BrotherhoodStats>('brotherhood_admin',enabled===undefined?{}:{enabled},AbortSignal.timeout?.(7500));
}

export type ReferralState={
 startParam:string;
 rows:{id:string;name:string;at:string;status:'confirmed'|'rewarded'}[];
 next:string|null;
 brotherhood?:BrotherhoodState;
};
export function readReferrals(before:string|null){
 return community<ReferralState>('referrals',before?{before}:{},AbortSignal.timeout?.(7500));
}

export type W066Snapshot={revision:number;raw:string;at:string};
export function readW066Snapshot(previous:boolean){
 return authenticated<W066Snapshot|null>('',{previous},undefined,'/backup');
}

export function storeW066Snapshot(expected:number,requestId:string,raw:string){
 return authenticated<number>('',{expected,requestId,raw},undefined,'/backup');
}

export function requestCampaignProof<T>(body:object){
 return requestW066Function<T>('vvr-campaign',body,10000);
}

export function requestTeamArena<T>(body:object){
 return requestW066Function<T>('vvr-arena',body,7500);
}

async function requestW066Function<T>(slug:string,body:object,timeout:number):Promise<T>{
 if(!endpoint)throw new CommunityError(503);
 const url=new URL(endpoint,location.href);
 url.pathname=url.pathname.replace(/vvr-community\/?$/,slug);
 const response=await fetch(url,{
  method:'POST',credentials:'omit',signal:AbortSignal.timeout?.(timeout),
  headers:{'Content-Type':'application/json',Authorization:'Bearer '+await connectCommunity()},
  body:JSON.stringify(body),
 });
 if(!response.ok){
  if(response.status===401)session=undefined;
  throw new CommunityError(response.status);
 }
 return response.json() as Promise<T>;
}

export type PremiumOffer={sku:string;price:number;resource:string;amount:number};
export type PremiumWallet={status:'ok';balance:number;offers:PremiumOffer[];purchaseAvailable?:boolean};
export type PremiumPurchase={status:'ok';balance:number;receipt:PremiumOffer&{operationId:string}}|
 {status:'insufficient'|'unavailable'|'refunded';balance:number};

export const readPremiumWallet=()=>community<PremiumWallet>('premium_wallet',{},AbortSignal.timeout?.(7500));
export const buyPremiumOffer=(sku:string,operationId:string)=>
 community<PremiumPurchase>('premium_wallet',{sku,operationId},AbortSignal.timeout?.(7500));
