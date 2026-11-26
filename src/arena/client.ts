import {telegramAccountId,tg} from '../core/telegram';
import type {PotionQuote} from './potion';
import {arenaApiOrigin,onlineArenaEnabled} from './staging';

const sessionKey=()=> 'vvr-arena-session:'+(telegramAccountId()??localFixture()??'anonymous');
let tabId:string;
export class ArenaRequestError extends Error{
 constructor(readonly status:number,message:string){super(message)}
}
export function tokenFromSession(){try{return sessionStorage.getItem(sessionKey())??''}catch{return ''}}
export function saveSession(token:string){try{sessionStorage.setItem(sessionKey(),token)}catch{/* In-memory session is still active. */}}
const localFixture=()=>!arenaApiOrigin&&location.hostname==='127.0.0.1'?
 new URLSearchParams(location.search).get('arenaLocal'):null;
export async function request<T>(path:string,token='',data?:Record<string,unknown>):Promise<T>{
 const response=await fetch(arenaApiOrigin+'/arena-api/'+path,{
  method:data?'POST':'GET',signal:AbortSignal.timeout(4500),cache:'no-store',
  headers:{...(token?{Authorization:'Bearer '+token,'X-Arena-Tab':tabId??=crypto.randomUUID()}:{}),
   ...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,
 });
 const result=await response.json();
 if(!response.ok)throw new ArenaRequestError(response.status,result.error??'Арена временно недоступна');
 return result as T;
}
export async function login(){
 const fixture=localFixture();
 const initData=tg()?.initData||(fixture? (await request<{initData:string}>('local?user='+fixture)).initData:'');
 if(!initData)throw new Error('Войдите через Telegram');
 const session=await request<{token:string}>('auth','',{initData});
 saveSession(session.token);
 return session.token;
}
export const signedArena=()=>onlineArenaEnabled&&(!!tg()?.initData||!!localFixture());

export async function sessionRequest<T>(path:string,data?:Record<string,unknown>){
 const token=tokenFromSession()||await login();
 try{return await request<T>(path,token,data);}
 catch(error){
  if(!(error instanceof ArenaRequestError)||error.status!==401)throw error;
  saveSession('');
  return request<T>(path,await login(),data);
 }
}
export type PotionOperation={operation:string;stage:number;price:number};
export const potionRequest=(data?:PotionOperation)=>sessionRequest<PotionQuote>('live/potions',data);
