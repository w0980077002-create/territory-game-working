import {consumables,type ConsumableId} from './potion';

/**
 * Arena battle belt: exactly 7 slots, one consumable kind per slot (as in TERRITORY src/game/belt.ts).
 * A slot names a kind; its quantity is the player's shared consumable stock, so the belt never moves,
 * mints or caps items and the approved prices, effects and stock rules stay unchanged.
 */
export const BELT_SLOTS=7;
export const beltRules={
 /** Owner decision 26.11: all 7 slots free for everyone during testing. Flip to false to enable unlocking. */
 testMode:true,
 /** TERRITORY unlock path (confirmed Arena wins per slot) — prepared, NOT active while testMode is on. */
 unlockWins:[0,100,500,1000,2000,3500,5000] as readonly number[],
} as const;
export type BeltSlot=ConsumableId|null;
export type BeltLoadout=BeltSlot[];

/** Existing players keep today's behaviour: the healing potion starts in the first slot. */
export const DEFAULT_BELT:BeltLoadout=['potion',...Array<BeltSlot>(BELT_SLOTS-1).fill(null)];
export const isBeltItem=(value:unknown):value is ConsumableId=>typeof value==='string'&&Object.hasOwn(consumables,value);
export const beltSlotOpen=(index:number,arenaWins:number)=>
 index>=0&&index<BELT_SLOTS&&(beltRules.testMode||arenaWins>=beltRules.unlockWins[index]);

/** Accepts only a 7-slot array of implemented consumables without duplicates in open slots; anything else is dropped. */
export function sanitizeBelt(value:unknown,arenaWins:number):BeltLoadout{
 const source=Array.isArray(value)?value:DEFAULT_BELT,seen=new Set<string>();
 return Array.from({length:BELT_SLOTS},(_,index)=>{
  const item=source[index];
  if(!isBeltItem(item)||seen.has(item)||!beltSlotOpen(index,arenaWins))return null;
  seen.add(item);return item;
 });
}
export const validBelt=(value:unknown)=>Array.isArray(value)&&value.length===BELT_SLOTS&&
 value.every(item=>item===null||isBeltItem(item))&&new Set(value.filter(Boolean)).size===value.filter(Boolean).length;

export const playerBelt=(p:{arenaBelt?:unknown;arenaWins?:number})=>sanitizeBelt(p.arenaBelt??DEFAULT_BELT,p.arenaWins??0);
export const beltHas=(belt:readonly BeltSlot[]|undefined,id:ConsumableId)=>!!belt?.includes(id);

/** Put a kind into a slot (or clear it with null). A kind already in another slot moves, so kinds never repeat. */
export function setBeltSlot(p:{arenaBelt?:unknown;arenaWins?:number},index:number,item:BeltSlot){
 if(!beltSlotOpen(index,p.arenaWins??0)||item!==null&&!isBeltItem(item))return false;
 const belt=playerBelt(p);
 if(belt[index]===item)return false;
 if(item!==null){const previous=belt.indexOf(item);if(previous>=0)belt[previous]=null;}
 belt[index]=item;
 p.arenaBelt=belt;
 return true;
}
