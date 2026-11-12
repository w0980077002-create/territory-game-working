import type {Player,Slot} from './types';
import {compareItem} from './store';
import {itemPower} from './formulas';
export type LootFilter='all'|'better'|'rare'|'locked';
export function inventoryItems(p:Player,filter:LootFilter,slot?:Slot,order='power'){
 return p.inventory.filter(i=>(!slot||i.slot===slot)&&(filter!=='better'||compareItem(i,p)>0)&&(filter!=='rare'||i.rarity>=3)&&(filter!=='locked'||i.locked)).sort((a,b)=>order==='rarity'?b.rarity-a.rarity||itemPower(b)-itemPower(a):order==='newest'?p.inventory.indexOf(b)-p.inventory.indexOf(a):compareItem(b,p)-compareItem(a,p)||itemPower(b)-itemPower(a));
}
