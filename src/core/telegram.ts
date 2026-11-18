interface TG {ready:()=>void;expand:()=>void;isVersionAtLeast?:(v:string)=>boolean;disableVerticalSwipes?:()=>void;enableClosingConfirmation?:()=>void;initData?:string;CloudStorage?:{getItem:(k:string,cb:(err:unknown,v?:string)=>void)=>void;setItem:(k:string,v:string,cb?:(err:unknown,stored?:boolean)=>void)=>void};HapticFeedback?:{impactOccurred:(s:string)=>void;selectionChanged:()=>void;notificationOccurred:(s:string)=>void}}
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
/** `superseded`: a newer save replaced this queued one before it started, which is not a failure. */
export type CloudFailure='too-large'|'failed'|'superseded';
type CloudDone=(ok:boolean,reason?:CloudFailure)=>void;
let queuedCloud:{raw:string;done?:CloudDone}|null=null;
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
 const chunks:string[]=[];let chunk='',bytes=0;const encoder=new TextEncoder();
 for(const c of packed.data){const length=encoder.encode(c).length;if(bytes+length>CLOUD_CHUNK_BYTES){chunks.push(chunk);chunk='';bytes=0}chunk+=c;bytes+=length}
 if(chunk)chunks.push(chunk);return chunks;
}
// Finish every chunk before releasing the bank, including after a failed write.
// Otherwise callbacks from an older upload can overwrite a newer generation.
// The metadata key is written last, so an interrupted upload leaves the previous complete copy in place.
/** Resolves once this upload has been handed to Telegram (or queued/refused); `done` reports the real outcome. */
export function cloudSave(raw:string,done?:CloudDone):Promise<void>{
 const t=tg();if(!t?.initData||!t.CloudStorage){done?.(false,'failed');return Promise.resolve()}
 if(cloudWriting){queuedCloud?.done?.(false,'superseded');queuedCloud={raw,done};return Promise.resolve()}
 cloudWriting=true;
 const cloud=t.CloudStorage,generation=String(1-cloudBank);
 const finish=(success:boolean,reason?:CloudFailure)=>{
  if(success)cloudBank=Number(generation);
  cloudWriting=false;
  const next=queuedCloud;queuedCloud=null;
  // Save the newest state once the previous bank is fully committed or abandoned.
  // A failed upload may be retried even when the queued payload is identical.
  done?.(success,success?undefined:reason??'failed');
  if(next&&(!success||next.raw!==raw))void cloudSave(next.raw,next.done);
  else next?.done?.(true);
 };
 return pack(raw).then(packed=>{
  const chunks=split(packed);
  if(!chunks.length){finish(false,'failed');return}
  if(chunks.length>CLOUD_MAX_CHUNKS){finish(false,'too-large');return}
  let left=chunks.length,failed=false,finished=false;
  const end=(success:boolean)=>{if(finished)return;finished=true;finish(success)};
  chunks.forEach((value,i)=>{
   let completed=false;
   const chunkDone=(err:unknown,stored?:boolean)=>{if(completed)return;completed=true;failed ||= !!err||stored===false;
    if(--left!==0)return;
    if(failed){end(false);return}
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
   cloudBank=Number(generation);const chunks:string[]=new Array(count);let left=count;
   for(let i=0;i<count;i++)cloud.getItem(`save_${generation}_${i}`,(error,value)=>{
    if(finished)return;if(error||!value){finish({status:'unavailable'});return}
    if(chunks[i]!==undefined)return;chunks[i]=value;if(--left!==0)return;
    const joined=chunks.join('');
    // Older copies are plain JSON; compressed ones are unpacked here so every caller still sees the same JSON text.
    if(!z){finish({status:'found',raw:joined});return}
    inflate(joined).then(text=>finish({status:'found',raw:text}),()=>finish({status:'unavailable'}));
   });
  }catch{finish({status:'unavailable'})}
 })}catch{finish({status:'unavailable'})}
})}

export async function cloudLoad(){const result=await readCloud();return result.status==='found'?result.raw:null}
