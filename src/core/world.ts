/**
 * Living World save model. Pure data: no store, DOM or engine imports.
 * Every field is optional for old saves; `normalizeWorld` never rejects a save, it repairs.
 * All numbers here are TEST_ONLY placeholders (see docs/TEST_VALUES_POLICY.md).
 */
export type EventKind='cache'|'caravan'|'ambush'|'altar'|'omen';
export interface WorldSave {
 v:1;
 /** Seeds event/variant/weather choice so a reload shows the same road, another hero a different one. */
 seed:number;
 /** Highest campaign leg whose road event is settled (rewarded, declined or missed). Rewards are gated by it. */
 lastLeg:number;
 /** Altar blessing waiting for the fight at `leg`. */
 boon?:{id:string;leg:number};
 /** Merchant's thanks: one free heal at the start of the fight at `leg`. */
 gift?:{leg:number};
 counts:Record<string,number>;
 feats:string[];
 seen:string[];
 log:string[];
}
export const countKeys=['cache','caravan','altar','ambushReady','ambushWon','omen','dive','guard','rescue','interrupt','freed'] as const;
export type CountKey=typeof countKeys[number];
export const legOf=(stage:number,wave:number)=>(stage-1)*5+wave-1;
export function freshWorld(seed=Math.floor(Math.random()*0x7fffffff)+1):WorldSave{return {v:1,seed,lastLeg:-1,counts:{},feats:[],seen:[],log:[]}}
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
/** Accepts anything from JSON and returns a safe world, keeping whatever is valid. */
export function normalizeWorld(raw:unknown):WorldSave{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return freshWorld();
 const r=raw as Partial<WorldSave>,w=freshWorld(Number.isInteger(r.seed)&&r.seed!>0&&r.seed!<=0x7fffffff?r.seed:undefined);
 if(Number.isInteger(r.lastLeg)&&r.lastLeg!>=-1&&r.lastLeg!<1e7)w.lastLeg=r.lastLeg!;
 if(r.boon&&text(r.boon.id,24)&&Number.isInteger(r.boon.leg)&&r.boon.leg>=0&&r.boon.leg<1e7)w.boon={id:r.boon.id,leg:r.boon.leg};
 if(r.gift&&Number.isInteger(r.gift.leg)&&r.gift.leg>=0&&r.gift.leg<1e7)w.gift={leg:r.gift.leg};
 if(r.counts&&typeof r.counts==='object')for(const k of countKeys){const n=(r.counts as Record<string,unknown>)[k];if(Number.isInteger(n)&&(n as number)>0&&(n as number)<1e7)w.counts[k]=n as number}
 for(const key of ['feats','seen'] as const)if(Array.isArray(r[key]))w[key]=[...new Set(r[key]!.filter(v=>text(v,40)))].slice(0,96);
 if(Array.isArray(r.log))w.log=r.log.filter(v=>text(v,120)).slice(-8);
 return w;
}
/** Small deterministic hash → [0,1). Stateless, so plans are reproducible after reload. */
export function roll(seed:number,...keys:number[]){let h=seed|0;for(const k of keys){h=Math.imul(h^(k|0)+0x9e3779b9,0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h^=h>>>16}return (h>>>0)/4294967296}
