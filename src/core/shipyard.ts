/** TEST_ONLY. No real-money value or server-authoritative balance. */
export interface Ship {id:string;level:number}
export interface ShipyardState {ships:Ship[];lastAt:number;stored:number}
export interface ShipWallet {gold:number;redDiamonds?:number;shipyard?:ShipyardState}
/** sealPrice: red diamonds traded for one summon seal in the harbor (the only spend; companions grow from it). */
export const SHIP_RULES={maxShips:3,maxLevel:5,diamondsPerLevelHour:1,maxStoredHours:12,sealPrice:20} as const;
const HOUR=3_600_000;
const WHOLE_DIAMOND_EPSILON=1e-9;
export function starterShipyard(now=Date.now()):ShipyardState {return {ships:[{id:'drakkar-1',level:1}],lastAt:now,stored:0}}
export function shipRate(s:ShipyardState):number{return s.ships.reduce((n,ship)=>n+ship.level*SHIP_RULES.diamondsPerLevelHour,0)}
export function shipCapacity(s:ShipyardState):number{return shipRate(s)*SHIP_RULES.maxStoredHours}
export function validShipyard(value:unknown):value is ShipyardState {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const s=value as ShipyardState;
 return Number.isSafeInteger(s.lastAt)&&s.lastAt>=0&&Number.isFinite(s.stored)&&s.stored>=0
  &&Array.isArray(s.ships)&&s.ships.length>=1&&s.ships.length<=SHIP_RULES.maxShips
  &&s.ships.every((v,i)=>v&&v.id==='drakkar-'+(i+1)&&Number.isInteger(v.level)&&v.level>=1&&v.level<=SHIP_RULES.maxLevel)
  &&s.stored<=shipCapacity(s)+1e-7;
}
export function previewShips(s:ShipyardState,now=Date.now()):ShipyardState{
 const hours=Math.min(SHIP_RULES.maxStoredHours,Math.max(0,now-s.lastAt)/HOUR);
 return {ships:s.ships.map(ship=>({...ship})),lastAt:Math.max(now,s.lastAt),stored:Math.min(shipCapacity(s),s.stored+hours*shipRate(s))}
}
export function shipBuyCost(count:number):number|null{return count>=SHIP_RULES.maxShips?null:500*count}
export function shipUpgradeCost(level:number):number|null{return level>=SHIP_RULES.maxLevel?null:300*level*level}
const wholeDiamonds=(s:ShipyardState)=>Math.floor(s.stored+WHOLE_DIAMOND_EPSILON);
export function shipClaimable(s:ShipyardState,now=Date.now()):number{return wholeDiamonds(previewShips(s,now))}
export function shipCollection(s:ShipyardState,now=Date.now()){
 const fleet=previewShips(s,now),amount=wholeDiamonds(fleet);
 const waitMs=amount>0?0:Math.ceil(Math.max(0,s.lastAt-now)+(1-WHOLE_DIAMOND_EPSILON-fleet.stored)*HOUR/shipRate(fleet));
 return {fleet,amount,waitMs,progress:amount>0?1:fleet.stored};
}
export function claimShips(p:ShipWallet,now=Date.now()):number{
 const next=previewShips(p.shipyard??starterShipyard(now),now),amount=wholeDiamonds(next);
 if(amount<=0||(p.redDiamonds??0)+amount>1_000_000_000)return 0;
 p.shipyard={...next,stored:Math.max(0,next.stored-amount)};p.redDiamonds=(p.redDiamonds??0)+amount;return amount;
}
export function buyShip(p:ShipWallet,now=Date.now()):boolean{
 const current=p.shipyard??starterShipyard(now),cost=shipBuyCost(current.ships.length);
 if(cost===null||p.gold<cost)return false;
 const next=previewShips(current,now);p.gold-=cost;
 next.ships.push({id:'drakkar-'+(next.ships.length+1),level:1});p.shipyard=next;return true;
}
export function upgradeShip(p:ShipWallet,id:string,now=Date.now()):boolean{
 const current=p.shipyard??starterShipyard(now),old=current.ships.find(s=>s.id===id),cost=old?shipUpgradeCost(old.level):null;
 if(cost===null||p.gold<cost)return false;
 const next=previewShips(current,now);const target=next.ships.find(s=>s.id===id);if(!target)return false;
 p.gold-=cost;target.level++;p.shipyard=next;return true;
}
