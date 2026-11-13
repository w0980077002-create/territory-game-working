/**
 * Saga save extension. Lives in the optional `player.saga` field so every older save stays valid.
 * `normalizeSaga` never rejects: it keeps whatever is well-formed and repairs the rest, so a bad
 * field can never push the owner's profile into recovery mode.
 */
export interface SagaSave {
 v:1;
 /** Character ids the hero has really met in a fight. */
 seen:string[];
 /** Named trophies ever obtained. */
 trophies:string[];
 /** Long-term counters: kills, interrupts, mode clears… Keys are short ASCII. */
 n:Record<string,number>;
 /** One-time facts and claimed rewards. */
 flags:string[];
 /** Free-form bounded sub-states of the saga systems (quests, expedition, tower, NPC world…). */
 box:Record<string,unknown>;
}
export const freshSaga=():SagaSave=>({v:1,seen:[],trophies:[],n:{},flags:[],box:{}});
const key=(v:unknown,max=48):v is string=>typeof v==='string'&&v.length>0&&v.length<=max&&/^[\w:.\-]+$/.test(v);
const strings=(v:unknown,max:number,len=48)=>Array.isArray(v)?[...new Set(v.filter(x=>key(x,len)))].slice(-max) as string[]:[];
/** Plain JSON only, bounded depth and size. Functions, NaN and prototypes never survive. */
function plain(v:unknown,depth=0):unknown{
 if(v===null||typeof v==='boolean')return v;
 if(typeof v==='number')return Number.isFinite(v)&&Math.abs(v)<1e15?v:0;
 if(typeof v==='string')return v.slice(0,400);
 if(depth>7)return null;
 if(Array.isArray(v))return v.slice(0,400).map(x=>plain(x,depth+1));
 if(typeof v==='object'){const out:Record<string,unknown>={};let count=0;for(const [k,x] of Object.entries(v as object)){if(!key(k,64)||k==='__proto__'||k==='constructor'||k==='prototype'||++count>400)continue;out[k]=plain(x,depth+1)}return out}
 return null;
}
export function normalizeSaga(raw:unknown):SagaSave{
 const s=freshSaga();if(!raw||typeof raw!=='object'||Array.isArray(raw))return s;const r=raw as Partial<SagaSave>;
 s.seen=strings(r.seen,64);s.trophies=strings(r.trophies,200);s.flags=strings(r.flags,600,64);
 if(r.n&&typeof r.n==='object'&&!Array.isArray(r.n)){let count=0;for(const [k,v] of Object.entries(r.n)){if(key(k)&&typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<1e15&&++count<=600)s.n[k]=v}}
 if(r.box&&typeof r.box==='object'&&!Array.isArray(r.box)){const box=plain(r.box) as Record<string,unknown>;if(JSON.stringify(box).length<=90000)s.box=box}
 return s;
}
type Holder={saga?:SagaSave};
/** Call only inside a store mutation (or on a private clone). */
export const sagaOf=(p:Holder)=>p.saga??=freshSaga();
export const count=(p:Holder,k:string)=>p.saga?.n[k]??0;
export function bumpCount(p:Holder,k:string,by=1){const s=sagaOf(p);s.n[k]=(s.n[k]??0)+by;return s.n[k]}
export const hasFlag=(p:Holder,f:string)=>!!p.saga?.flags.includes(f);
export function setFlag(p:Holder,f:string){const s=sagaOf(p);if(s.flags.includes(f))return false;s.flags.push(f);return true}
export function markSeen(p:Holder,ids:string[]){const s=sagaOf(p);for(const id of ids)if(!s.seen.includes(id))s.seen.push(id)}
/** Typed access to a sub-state with a factory for old saves. */
export function boxOf<T extends object>(p:Holder,name:string,make:()=>T):T{const s=sagaOf(p);const v=s.box[name];if(!v||typeof v!=='object'||Array.isArray(v))s.box[name]=make();return s.box[name] as T}
export const peekBox=<T extends object>(p:Holder,name:string):T|undefined=>{const v=p.saga?.box[name];return v&&typeof v==='object'&&!Array.isArray(v)?v as T:undefined};
