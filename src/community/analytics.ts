import {setAnalyticsSink,track,type AnalyticsData,type AnalyticsKind} from '../core/analyticsBus';
import {useGame,SAVE_KEY} from '../core/store';

type Pending={kind:AnalyticsKind;at:number;data:AnalyticsData};
export const ANALYTICS_BATCH=25,ANALYTICS_QUEUE=200,ANALYTICS_FLUSH_MS=20_000;
const version='1.0';
const token=(value:string,max:number)=>value.toLowerCase().replace(/[^a-z0-9_.:-]+/g,'_').slice(0,max)||'unknown';

/** Error text without addresses, ids or long numbers; at most 120 characters. */
export function cleanErrorMessage(message:string){
 return message.replace(/https?:\/\/\S+/g,'<url>').replace(/[\w.+-]+@[\w.-]+/g,'<email>').replace(/\d{4,}/g,'#').replace(/\s+/g,' ').trim().slice(0,120);
}

export function createAnalytics(send:(events:object[])=>Promise<unknown>,now=()=>Date.now()){
 const session=crypto.randomUUID();
 const queue:Pending[]=[];
 const errors=new Map<string,number>();
 let flushing=false,retryAt=0;
 const add=(kind:AnalyticsKind,data:AnalyticsData)=>{
  if(kind==='error'){
   const code=token(String(data.code??'error'),40),seen=errors.get(code)??0;
   if(seen>=5)return;
   errors.set(code,seen+1);
   data={code,...(typeof data.message==='string'&&data.message?{message:cleanErrorMessage(data.message)}:{})};
  }
  for(const key of ['mode','sku','currency','version'])if(typeof data[key]==='string')data={...data,[key]:token(data[key] as string,key==='sku'?48:24)};
  queue.push({kind,at:now(),data});
  if(queue.length>ANALYTICS_QUEUE)queue.splice(0,queue.length-ANALYTICS_QUEUE);
 };
 const flush=async()=>{
  if(flushing||!queue.length||now()<retryAt)return;
  flushing=true;
  const batch=queue.slice(0,ANALYTICS_BATCH),sentAt=now();
  try{
   await send(batch.map(e=>({kind:e.kind,session,ago:Math.max(0,Math.min(604800,Math.round((sentAt-e.at)/1000))),...e.data})));
   queue.splice(0,batch.length);
   retryAt=0;
  }catch{retryAt=now()+60_000;}
  finally{flushing=false;}
 };
 return {session,queue,add,flush};
}

let started=false;
/** Signed Telegram players only. Reports entry, progress, battles, purchases, client errors and active time. */
export function startAnalytics(){
 if(started)return;
 started=true;
 const sender=createAnalytics(events=>import('./client').then(({community})=>community('track',{events})));
 setAnalyticsSink(sender.add);
 const firstKey=SAVE_KEY+':analytics-entered';
 let first=false;
 try{first=!localStorage.getItem(firstKey);localStorage.setItem(firstKey,'1');}catch{/* private mode: counts as returning */}
 const p=useGame.getState().p;
 track('enter',{first:first&&p.stage===1&&p.kills===0,version,stage:p.stage});
 let stage=p.stage;
 useGame.subscribe(state=>{
  if(state.p.stage>stage){stage=state.p.stage;track('stage',{stage,level:state.p.level});}
 });
 let visibleSince=document.hidden?0:performance.now(),active=0;
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
   if(visibleSince)active+=performance.now()-visibleSince;
   visibleSince=0;
   track('session',{seconds:Math.min(86400,Math.round(active/1000))});
   void sender.flush();
  }else visibleSince=performance.now();
 });
 window.addEventListener('error',event=>track('error',{code:event.error?.name??'error',message:String(event.message??'')}));
 window.addEventListener('unhandledrejection',event=>{
  const reason=event.reason as {name?:string;message?:string}|undefined;
  track('error',{code:'rejection_'+(reason?.name??'unknown'),message:String(reason?.message??'')});
 });
 setInterval(()=>void sender.flush(),ANALYTICS_FLUSH_MS);
 setTimeout(()=>void sender.flush(),3000);
}
