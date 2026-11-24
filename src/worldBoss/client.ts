/**
 * World boss client: talks to the vvr-world-boss Edge Function (W066). Shown only when the endpoint is
 * configured (VITE_WORLD_BOSS_URL at build time) or, on localhost, for QA with ?wb=local.
 * Rewards: the server claims each letter once into its trusted journal; the local save applies the
 * same letter once, keyed by event and kind, so a retried claim can never double the reward.
 */
import type {Player} from '../core/types';
import {tg} from '../core/telegram';
import {grant,type Reward} from '../saga/rewards';
import {boxOf,peekBox} from '../saga/save';

export interface BossReward {gold?:number;chaosite?:number;tokens?:number}
export interface RankTier {upTo:number;reward:BossReward}
export interface BossEvent {
 id:string;title:string;boss:string;startsAt:string;endsAt:string;maxHp:number;hp:number;status:'open'|'defeated'|'expired';
 active:boolean;cooldownSeconds:number;dailyHits:number;damageMin:number;damageMax:number;finishedAt:string|null;participants:number;
 expiredMultiplier:number;rewards:{participation:BossReward;lastHit:BossReward;ranks:RankTier[]};
 lastHit:{name:string;damage:number;me:boolean}|null;
 me:{damage:number;hits:number;rank:number|null;hitsToday:number;nextHitAt:string|null};
 top:{place:number;name:string;damage:number;hits:number;me:boolean}[];
}
export interface BossHistory {id:string;title:string;boss:string;status:'defeated'|'expired';maxHp:number;hp:number;finishedAt:string;lastHitName:string|null;participants:number;top:{name:string;damage:number}[];myDamage:number}
export interface BossLetter {eventId:string;kind:'participation'|'rank'|'last_hit';place:number|null;payload:BossReward;title:string;boss:string;status:string;createdAt:string;claimed:boolean}
export interface BossState {serverNow:string;event:BossEvent|null;history:BossHistory[];mail:BossLetter[];isAdmin:boolean;
 hit?:{damage:number;critical:boolean;killing:boolean;repeated:boolean};error?:string}

declare const __WORLD_BOSS_URL__:string;
const configured=typeof __WORLD_BOSS_URL__!=='undefined'?__WORLD_BOSS_URL__:'';
function localQa(){
 if(typeof location==='undefined')return '';
 const local=/^(localhost|127\.0\.0\.1)$/.test(location.hostname)&&new URLSearchParams(location.search).get('wb')==='local';
 return local?'http://127.0.0.1:'+(new URLSearchParams(location.search).get('wbPort')??'18790'):'';
}
export const worldBossUrl=()=>configured||localQa();
export const worldBossEnabled=()=>!!worldBossUrl();

let cachedInit:string|undefined;
async function initData(){
 const telegram=tg()?.initData;if(telegram)return telegram;
 if(cachedInit)return cachedInit;
 if(!localQa())throw new Error('world_boss_auth_required');
 const q=new URLSearchParams(location.search);
 const res=await fetch(worldBossUrl()+'/local/init?id='+encodeURIComponent(q.get('wbUser')??'1')+'&name='+encodeURIComponent(q.get('wbName')??'Северный страж'));
 cachedInit=(await res.json()).initData as string;
 return cachedInit;
}
export class BossError extends Error {constructor(public code:string){super(code)}}
async function call<T>(action:string,extra:Record<string,unknown>={}):Promise<T>{
 let res:Response;
 try{res=await fetch(worldBossUrl(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,initData:await initData(),...extra})})}
 catch{throw new BossError('world_boss_offline')}
 const body=await res.json().catch(()=>({error:'world_boss_unavailable'}));
 if(!res.ok)throw new BossError(String(body.error??'world_boss_unavailable'));
 return body as T;
}
export const bossState=()=>call<BossState>('state');
/** A failed network attempt is retried with the same request id, so it can land at most once. */
export async function bossAttack(requestId=crypto.randomUUID()){
 try{return await call<BossState>('attack',{requestId})}
 catch(e){if(e instanceof BossError&&e.code==='world_boss_offline')return call<BossState>('attack',{requestId});throw e}
}
export const bossClaim=(eventId:string,kind:string)=>call<{eventId:string;kind:string;payload:BossReward;firstClaim:boolean}>('claim',{eventId,kind});
export const bossAdminStart=(input:{title:string;boss:string;minutes:number;maxHp:number;config:Record<string,unknown>})=>call<BossState>('admin_start',input);
export const bossAdminEnd=(eventId:string)=>call<BossState>('admin_end',{eventId});

// ── Local application of server letters (exactly once per save) ──
interface AppliedBox {keys:string[]}
export const letterKey=(eventId:string,kind:string)=>eventId+':'+kind;
export function letterApplied(p:Player,eventId:string,kind:string){
 const keys=peekBox<AppliedBox>(p,'worldBoss')?.keys;
 return Array.isArray(keys)&&keys.includes(letterKey(eventId,kind));
}
export const toReward=(r:BossReward):Reward=>({...(r.gold?{gold:r.gold}:{}),...(r.chaosite?{chaosite:r.chaosite}:{}),...(r.tokens?{tokens:r.tokens}:{})});
/** Applies a server-confirmed letter to the save. Call inside a mutation; false if already applied. */
export function applyLetter(p:Player,eventId:string,kind:string,payload:BossReward){
 if(letterApplied(p,eventId,kind))return false;
 const box=boxOf<AppliedBox>(p,'worldBoss',()=>({keys:[]}));
 if(!Array.isArray(box.keys))box.keys=[];
 box.keys.push(letterKey(eventId,kind));
 if(box.keys.length>300)box.keys.splice(0,box.keys.length-300);
 grant(p,toReward(payload));
 return true;
}
export const errorText:Record<string,string>={
 world_boss_cooldown:'Оружие ещё не готово · подождите',world_boss_daily_limit:'Атаки на сегодня закончились',
 world_boss_no_event:'Сейчас мирового босса нет',world_boss_not_started:'Событие ещё не началось',
 world_boss_offline:'Нет связи с сервером · попробуйте ещё раз',world_boss_unavailable:'Сервер мирового босса недоступен',
 world_boss_auth_required:'Откройте игру через Telegram',world_boss_no_reward:'Награда не найдена',
 world_boss_admin_only:'Только для администратора',world_boss_bad_config:'Проверьте параметры события',
 world_boss_already_open:'Событие уже идёт',world_boss_not_open:'Событие уже завершено',world_boss_bad_duration:'Длительность от 5 минут до 14 дней',
 world_boss_bad_request:'Неверный запрос',world_boss_event_ended:'Время события вышло',
};
