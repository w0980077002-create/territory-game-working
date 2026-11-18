interface TG {ready:()=>void;expand:()=>void;isVersionAtLeast?:(v:string)=>boolean;disableVerticalSwipes?:()=>void;enableClosingConfirmation?:()=>void;initData?:string;CloudStorage?:{getItem:(k:string,cb:(err:unknown,v?:string)=>void)=>void;getItems?:(keys:string[],cb:(err:unknown,v?:Record<string,string>)=>void)=>void;setItem:(k:string,v:string,cb?:(err:unknown,stored?:boolean)=>void)=>void};HapticFeedback?:{impactOccurred:(s:string)=>void;selectionChanged:()=>void;notificationOccurred:(s:string)=>void}}
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
export function setupTelegram(){const t=tg();t?.ready();if(t?.isVersionAtLeast?.('7.7'))t.disableVerticalSwipes?.();if(t?.isVersionAtLeast?.('6.2'))t.enableClosingConfirmation?.();}
export function haptic(success=false){const t=tg();if(t?.isVersionAtLeast?.('6.1'))try{if(success)t.HapticFeedback?.notificationOccurred('success');else t.HapticFeedback?.selectionChanged()}catch{ /* unsupported client */ }}
let cloudBank=0;
let cloudWriting=false;
let cloudWriteExpired=false;
export const CLOUD_WRITE_TIMEOUT_MS=8000;
/** `superseded`: a newer save replaced this queued one before it started, which is not a failure. */
export type CloudFailure='too-large'|'failed'|'superseded';
type CloudDone=(ok:boolean,reason?:CloudFailure)=>void;
let queuedCloud:{raw:string;done?:CloudDone;lateCommit?:()=>void}|null=null;
/** Telegram allows 1024 keys of up to 4096 characters. Two banks of this size plus metadata stay far below that. */
export const CLOUD_CHUNK_BYTES=3500,CLOUD_MAX_CHUNKS=240;
const B64=CLOUD_CHUNK_BYTES;
function toBase64(bytes:Uint8Array){let out='';for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(out)}
function fromBase64(text:string){const bin=atob(text),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return bytes}
async function pipe(bytes:Uint8Array,stream:CompressionStream|DecompressionStream){return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer())}
async function inflate(text:string){return new TextDecoder('utf-8',{fatal:true}).decode(await pipe(fromBase64(text),new DecompressionStream('gzip')))}
/** gzip+base64 when the client supports it; the packed copy is unpacked and compared before use, otherwise plain JSON is kept. */
async function pack(raw:string):Promise<{z:boolean;data:string}>{
 try{
  if(typeof CompressionStream==='undefined'||typeof DecompressionStream==='undefined')return {z:false,data:raw};
  const data=toBase64(await pipe(new TextEncoder().encode(raw),new CompressionStream('gzip')));
  return await inflate(data)===raw?{z:true,data}:{z:false,data:raw};
 }catch{return {z:false,data:raw}}
}
function split(packed:{z:boolean;data:string}){
 if(packed.z){const out:string[]=[];for(let i=0;i<packed.data.length;i+=B64)out.push(packed.data.slice(i,i+B64));return out}
 const chunks:string[]=[];let chunk='',bytes=0;
 for(const c of packed.data){const cp=c.codePointAt(0)!;const length=cp<0x80?1:cp<0x800?2:cp<0x10000?3:4;if(bytes+length>CLOUD_CHUNK_BYTES){chunks.push(chunk);chunk='';bytes=0}chunk+=c;bytes+=length}
 if(chunk)chunks.push(chunk);return chunks;
}
export async function measureCloudSave(raw:string){
 const packed=await pack(raw);
 const bytes=packed.z?packed.data.length:new TextEncoder().encode(packed.data).byteLength;
 return {bytes,chunks:packed.z?Math.ceil(bytes/CLOUD_CHUNK_BYTES):split(packed).length,compressed:packed.z};
}
// Finish every chunk before releasing the bank, including after a failed write.
// Otherwise callbacks from an older upload can overwrite a newer generation.
// The metadata key is written last, so an interrupted upload leaves the previous complete copy in place.
/** Resolves once this upload has been handed to Telegram (or queued/refused); `done` reports the real outcome. */
export function cloudSave(raw:string,done?:CloudDone,lateCommit?:()=>void):Promise<void>{
 const t=tg();if(!t?.initData||!t.CloudStorage){done?.(false,'failed');return Promise.resolve()}
 if(cloudWriting){
  if(cloudWriteExpired){done?.(false,'failed');return Promise.resolve()}
  queuedCloud?.done?.(false,'superseded');
  queuedCloud={raw,done,lateCommit};return Promise.resolve();
 }
 cloudWriting=true;
 let deadline:ReturnType<typeof setTimeout>|undefined;
 const cloud=t.CloudStorage,generation=String(1-cloudBank);
 const finish=(success:boolean,reason?:CloudFailure)=>{
  clearTimeout(deadline);
  if(success)cloudBank=Number(generation);
  const expired=cloudWriteExpired;
  cloudWriteExpired=false;
  cloudWriting=false;
  const next=queuedCloud;queuedCloud=null;
  // Save the newest state once the previous bank is fully committed or abandoned.
  // A failed upload may be retried even when the queued payload is identical.
  if(!expired)done?.(success,success?undefined:reason??'failed');
  else if(success)lateCommit?.();
  if(next&&(!success||next.raw!==raw))void cloudSave(next.raw,next.done,next.lateCommit);
  else next?.done?.(true);
 };
 return pack(raw).then(packed=>{
  const chunks=split(packed);
  if(!chunks.length){finish(false,'failed');return}
  if(chunks.length>CLOUD_MAX_CHUNKS){finish(false,'too-large');return}
  let left=chunks.length,failed=false,finished=false;
  deadline=setTimeout(()=>{
   // Tell the caller promptly, but quarantine this bank until Telegram has finished every outstanding write.
   // An old callback may still describe a successful write; the active bank must stay out of its path.
   cloudWriteExpired=true;
   const queued=queuedCloud;
   queuedCloud=null;
   done?.(false,'failed');
   queued?.done?.(false,'failed');
  },CLOUD_WRITE_TIMEOUT_MS);
  const end=(success:boolean)=>{if(finished)return;finished=true;finish(success)};
  chunks.forEach((value,i)=>{
   let completed=false;
   const chunkDone=(err:unknown,stored?:boolean)=>{if(completed)return;completed=true;failed ||= !!err||stored===false;
    if(--left!==0)return;
    if(failed||cloudWriteExpired){end(false);return}
    try{cloud.setItem('save_meta',JSON.stringify({generation,count:chunks.length,...(packed.z?{z:1}:{})}),(error,stored)=>end(!error&&stored!==false))}catch{end(false)}
   };
   try{cloud.setItem(`save_${generation}_${i}`,value,chunkDone)}catch(error){chunkDone(error)}
  });
 });
}
export type CloudRead={status:'empty'|'unavailable'}|{status:'found';raw:string};
export function readCloud():Promise<CloudRead>{return new Promise(resolve=>{
 const t=tg();if(!t?.initData||!t.CloudStorage){resolve({status:'unavailable'});return}
 const cloud=t.CloudStorage;let finished=false;
 const finish=(result:CloudRead)=>{if(finished)return;finished=true;clearTimeout(timer);resolve(result)};
 const timer=setTimeout(()=>finish({status:'unavailable'}),4000);
 try{cloud.getItem('save_meta',(err,raw)=>{
  if(finished)return;if(err){finish({status:'unavailable'});return}
  if(raw===''||raw===undefined){finish({status:'empty'});return}
  if(typeof raw!=='string'){finish({status:'unavailable'});return}
  try{const {generation,count,z}=JSON.parse(raw);
   if(!['0','1'].includes(generation)||!Number.isInteger(count)||count<1||count>CLOUD_MAX_CHUNKS||z!==undefined&&z!==1)throw Error();
   // The next upload must go to the other bank, even if reading this one fails part way.
   cloudBank=Number(generation);
   const keys=Array.from({length:count},(_,i)=>`save_${generation}_${i}`);
   const chunks:string[]=new Array(count);let left=count;
   const unpack=(values:string[])=>{
    if(finished)return;
    if(values.length!==count||values.some(value=>typeof value!=='string'||!value)){finish({status:'unavailable'});return}
    const joined=values.join('');
    if(!z){finish({status:'found',raw:joined});return}
    inflate(joined).then(text=>finish({status:'found',raw:text}),()=>finish({status:'unavailable'}));
   };
   if(cloud.getItems){
    cloud.getItems(keys,(error,values)=>{
     if(finished)return;
     if(error||!values){finish({status:'unavailable'});return}
     unpack(keys.map(key=>values[key]));
    });
    return;
   }
   keys.forEach((key,i)=>cloud.getItem(key,(error,value)=>{
    if(finished)return;if(error||!value){finish({status:'unavailable'});return}
    if(chunks[i]!==undefined)return;chunks[i]=value;
    if(--left===0)unpack(chunks);
   }));
  }catch{finish({status:'unavailable'})}
 })}catch{finish({status:'unavailable'})}
})}

export async function cloudLoad(){const result=await readCloud();return result.status==='found'?result.raw:null}
