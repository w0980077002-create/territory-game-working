interface TG {ready:()=>void;expand:()=>void;isVersionAtLeast?:(v:string)=>boolean;disableVerticalSwipes?:()=>void;enableClosingConfirmation?:()=>void;initData?:string;CloudStorage?:{getItem:(k:string,cb:(err:unknown,v:string)=>void)=>void;setItem:(k:string,v:string,cb?:(err:unknown,stored?:boolean)=>void)=>void};HapticFeedback?:{impactOccurred:(s:string)=>void;selectionChanged:()=>void;notificationOccurred:(s:string)=>void}}
declare global {interface Window {Telegram?:{WebApp?:TG}}}
export const tg=()=>typeof window==='undefined'?undefined:window.Telegram?.WebApp;
export function telegramAccountId(){
 const t=tg();
 if(!t?.initData)return undefined;
 try{
  const id=JSON.parse(new URLSearchParams(t.initData).get('user')??'null')?.id;
  return Number.isSafeInteger(id)&&id>0?String(id):undefined;
 }catch{return undefined}
}
export function setupTelegram(){const t=tg();t?.ready();t?.expand();if(t?.isVersionAtLeast?.('7.7'))t.disableVerticalSwipes?.();if(t?.isVersionAtLeast?.('6.2'))t.enableClosingConfirmation?.();}
export function haptic(success=false){const t=tg();if(t?.isVersionAtLeast?.('6.1'))try{if(success)t.HapticFeedback?.notificationOccurred('success');else t.HapticFeedback?.selectionChanged()}catch{ /* unsupported client */ }}
let cloudBank=0;
let cloudWriting=false;
let queuedCloud:{raw:string;done?: (ok:boolean)=>void}|null=null;
// Finish every chunk before releasing the bank, including after a failed write.
// Otherwise callbacks from an older upload can overwrite a newer generation.
export function cloudSave(raw:string,done?: (ok:boolean)=>void){
 const t=tg();if(!t?.initData||!t.CloudStorage){done?.(false);return}
 if(cloudWriting){queuedCloud?.done?.(false);queuedCloud={raw,done};return}
 const cloud=t.CloudStorage,generation=String(1-cloudBank),chunks:string[]=[];
 let chunk='',bytes=0;const encoder=new TextEncoder();
 for(const c of raw){const length=encoder.encode(c).length;if(bytes+length>3500){chunks.push(chunk);chunk='';bytes=0}chunk+=c;bytes+=length}
 if(chunk)chunks.push(chunk);if(!chunks.length||chunks.length>40){done?.(false);return}
 cloudWriting=true;let left=chunks.length,failed=false,finished=false;
 const finish=(success:boolean)=>{
  if(finished)return;finished=true;
  if(success)cloudBank=Number(generation);
  cloudWriting=false;
  const next=queuedCloud;queuedCloud=null;
  // Save the newest state once the previous bank is fully committed or abandoned.
  // A failed upload may be retried even when the queued payload is identical.
  done?.(success);
  if(next&&(!success||next.raw!==raw))cloudSave(next.raw,next.done);
  else next?.done?.(true);
 };
 chunks.forEach((value,i)=>{
  let completed=false;
  const done=(err:unknown,stored?:boolean)=>{if(completed)return;completed=true;failed ||= !!err||stored===false;
   if(--left!==0)return;
   if(failed){finish(false);return}
   try{cloud.setItem('save_meta',JSON.stringify({generation,count:chunks.length}),(error,stored)=>finish(!error&&stored!==false))}catch{finish(false)}
  };
  try{cloud.setItem(`save_${generation}_${i}`,value,done)}catch(error){done(error)}
 });
}
export type CloudRead={status:'empty'|'unavailable'}|{status:'found';raw:string};
export function readCloud():Promise<CloudRead>{return new Promise(resolve=>{
 const t=tg();if(!t?.initData||!t.CloudStorage){resolve({status:'unavailable'});return}
 const cloud=t.CloudStorage;let finished=false;
 const finish=(result:CloudRead)=>{if(finished)return;finished=true;clearTimeout(timer);resolve(result)};
 const timer=setTimeout(()=>finish({status:'unavailable'}),2500);
 try{cloud.getItem('save_meta',(err,raw)=>{
  if(finished)return;if(err){finish({status:'unavailable'});return}
  if(raw===''){finish({status:'empty'});return}
  if(typeof raw!=='string'){finish({status:'unavailable'});return}
  try{const {generation,count}=JSON.parse(raw);
   if(!['0','1'].includes(generation)||!Number.isInteger(count)||count<1||count>40)throw Error();
   cloudBank=Number(generation);const chunks:string[]=new Array(count);let left=count;
   for(let i=0;i<count;i++)cloud.getItem(`save_${generation}_${i}`,(error,value)=>{
    if(finished)return;if(error||!value){finish({status:'unavailable'});return}
    if(chunks[i]!==undefined)return;chunks[i]=value;if(--left===0)finish({status:'found',raw:chunks.join('')});
   });
  }catch{finish({status:'unavailable'})}
 })}catch{finish({status:'unavailable'})}
})}

export async function cloudLoad(){const result=await readCloud();return result.status==='found'?result.raw:null}
