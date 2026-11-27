import type {Player} from '../core/types';
import {peekBox,sagaOf} from './save';

export const eventSchedule={
 followers:{name:'Спринт последователей',first:9,last:13},
 monopoly:{name:'Морская монополия',first:14,last:18},
 fortune:{name:'СчастТайна',first:19,last:21},
 runes:{name:'Рунный спринт',first:22,last:24},
} as const;
export type SoloEventId=keyof typeof eventSchedule;
export const soloEventIds=Object.keys(eventSchedule) as SoloEventId[];

export function eventWindow(id:SoloEventId,now:number){
 const {first,last}=eventSchedule[id];
 const date=new Date(now),year=date.getUTCFullYear(),month=date.getUTCMonth();
 const start=Date.UTC(year,month,first),end=Date.UTC(year,month,last+1);
 const key=id+':'+date.toISOString().slice(0,7);
 return {id,key,start,end,active:now>=start&&now<end};
}
export interface EventPeriod {
 v:1;progress:number;claims:number;revision:number;position:number;steps:number;last:number|null;
}
const nonnegative=(n:unknown,max=1e12)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0?Math.min(max,n):0;
export function eventPeriod(p:Player,key:string):EventPeriod{
 const raw=peekBox<Record<string,EventPeriod>>(p,'soloEvents')?.[key];
 return {v:1,progress:nonnegative(raw?.progress),claims:nonnegative(raw?.claims,0x3ffffff),
  revision:nonnegative(raw?.revision),position:nonnegative(raw?.position),steps:nonnegative(raw?.steps),
  last:raw?.last===null||raw?.last===undefined?null:nonnegative(raw.last)};
}
export function putPeriod(p:Player,key:string,period:EventPeriod){
 const box=sagaOf(p).box;
 const periods=peekBox<Record<string,EventPeriod>>(p,'soloEvents')??{};
 periods[key]=period;
 box.soloEvents=periods;
}
export function recordSprintSpend(p:Player,id:'followers'|'runes',amount:number,now:number){
 const window=eventWindow(id,now);
 if(!window.active)return;
 const period=eventPeriod(p,window.key);
 period.progress+=amount;
 putPeriod(p,window.key,period);
}
export function savedEventKeys(p:Player){
 return Object.keys(peekBox<Record<string,EventPeriod>>(p,'soloEvents')??{});
}

export function windowFromKey(key:string){
 const match=/^(followers|runes|monopoly|fortune):(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
 if(!match)return null;
 return eventWindow(match[1] as SoloEventId,Date.UTC(Number(match[2]),Number(match[3])-1,1));
}
