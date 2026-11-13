interface TG {ready:()=>void;expand:()=>void;isVersionAtLeast?:(v:string)=>boolean;disableVerticalSwipes?:()=>void;enableClosingConfirmation?:()=>void;initData?:string;CloudStorage?:{getItem:(k:string,cb:(err:unknown,v:string)=>void)=>void;setItem:(k:string,v:string,cb?:(err:unknown)=>void)=>void};HapticFeedback?:{impactOccurred:(s:string)=>void;selectionChanged:()=>void;notificationOccurred:(s:string)=>void}}
declare global {interface Window {Telegram?:{WebApp?:TG}}}
export const tg=()=>typeof window==='undefined'?undefined:window.Telegram?.WebApp;
export function setupTelegram(){const t=tg();t?.ready();t?.expand();if(t?.isVersionAtLeast?.('7.7'))t.disableVerticalSwipes?.();if(t?.isVersionAtLeast?.('6.2'))t.enableClosingConfirmation?.();}
export function haptic(success=false){const t=tg();if(t?.isVersionAtLeast?.('6.1'))try{if(success)t.HapticFeedback?.notificationOccurred('success');else t.HapticFeedback?.selectionChanged()}catch{ /* unsupported client */ }}
let cloudBank=0;
let cloudWriting=false;
// Finish every chunk before releasing the bank, including after a failed write.
// Otherwise callbacks from an older upload can overwrite a newer generation.
export function cloudSave(raw:string){
 const t=tg();if(!t?.initData||!t.CloudStorage||cloudWriting)return;
 const cloud=t.CloudStorage,generation=String(1-cloudBank),chunks:string[]=[];
 let chunk='',bytes=0;const encoder=new TextEncoder();
 for(const c of raw){const length=encoder.encode(c).length;if(bytes+length>3500){chunks.push(chunk);chunk='';bytes=0}chunk+=c;bytes+=length}
 if(chunk)chunks.push(chunk);if(!chunks.length||chunks.length>40)return;
 cloudWriting=true;let left=chunks.length,failed=false;
 chunks.forEach((value,i)=>{
  let completed=false;
  const done=(err:unknown)=>{if(completed)return;completed=true;failed ||= !!err;
   if(--left!==0)return;
   if(failed){cloudWriting=false;return}
   try{cloud.setItem('save_meta',JSON.stringify({generation,count:chunks.length}),error=>{if(!error)cloudBank=Number(generation);cloudWriting=false})}catch{cloudWriting=false}
  };
  try{cloud.setItem(`save_${generation}_${i}`,value,done)}catch(error){done(error)}
 });
}
export function cloudLoad():Promise<string|null>{return new Promise(resolve=>{
 const t=tg();if(!t?.initData||!t.CloudStorage){resolve(null);return}
 const cloud=t.CloudStorage;let finished=false;
 const finish=(raw:string|null)=>{if(finished)return;finished=true;clearTimeout(timer);resolve(raw)};
 const timer=setTimeout(()=>finish(null),2500);
 try{cloud.getItem('save_meta',(err,raw)=>{
  if(finished)return;if(err||!raw){finish(null);return}
  try{const {generation,count}=JSON.parse(raw);
   if(!['0','1'].includes(generation)||!Number.isInteger(count)||count<1||count>40)throw Error();
   cloudBank=Number(generation);const chunks:string[]=new Array(count);let left=count;
   for(let i=0;i<count;i++)cloud.getItem(`save_${generation}_${i}`,(error,value)=>{
    if(finished)return;if(error||!value){finish(null);return}
    if(chunks[i]!==undefined)return;chunks[i]=value;if(--left===0)finish(chunks.join(''));
   });
  }catch{finish(null)}
 })}catch{finish(null)}
})}
