import type {Player,GearProc,GearEffectId} from '../core/types';
import {equippedUniques,gearRules} from '../core/gear';
// Only explicit confirmed combat events may proc. No damage is emitted here, so procs cannot recurse.
export class GearEffects {
 entries:GearProc[]=[];
 sync(p:Player){const equipped=equippedUniques(p);for(const entry of this.entries)if(!equipped.some(v=>v.item.id===entry.itemId&&v.def.effect===entry.effect)){entry.remaining=0;entry.pool=0}
 // Keep spent cooldowns until this encounter ends, preventing equip/unequip from resetting them.
 }
 reset(){this.entries=[]}
 step(dt:number,p:Player){this.sync(p);for(const e of this.entries){e.cooldown=Math.max(0,e.cooldown-dt);e.remaining=Math.max(0,e.remaining-dt);if(e.remaining===0)e.pool=0}}
 trigger(effect:GearEffectId,p:Player,role=-1,maxHp=0){this.sync(p);const equipped=equippedUniques(p).find(v=>v.def.effect===effect);if(!equipped)return false;
 // One cooldown per effect, even when the same slot is replaced with another copy.
 let e=this.entries.find(v=>v.effect===effect);if(e&&e.cooldown>0)return false;
 if(!e){e={itemId:equipped.item.id,effect,cooldown:0,remaining:0,pool:0,targetRole:role};this.entries.push(e)}
 const config=gearRules.effects[effect];e.itemId=equipped.item.id;e.cooldown=config.cooldown;e.remaining='duration'in config?config.duration:0;e.targetRole=role;e.pool=effect==='bulwark'?maxHp*gearRules.effects.bulwark.hp_fraction:0;return true;
 }
 active(effect:GearEffectId,p:Player){this.sync(p);return this.entries.find(e=>e.effect===effect&&e.remaining>0)}
 enemyRate(role:number,p:Player){return this.active('frost',p)?.targetRole===role?gearRules.effects.frost.rate:1}
 attackRate(p:Player){return this.active('tempo',p)?gearRules.effects.tempo.rate:1}
 absorb(amount:number,p:Player){const e=this.active('bulwark',p);const absorbed=Math.min(e?.pool??0,amount);if(e)e.pool-=absorbed;return amount-absorbed}
}
export function validGearProcs(value:unknown){return Array.isArray(value)&&value.length<=4&&new Set(value.map(e=>e?.effect)).size===value.length&&value.every(e=>e&&typeof e.itemId==='string'&&e.itemId.length<=120&&Object.hasOwn(gearRules.effects,e.effect)&&['cooldown','remaining','pool','targetRole'].every(k=>typeof e[k]==='number'&&Number.isFinite(e[k]))&&e.cooldown>=0&&e.cooldown<=60&&e.remaining>=0&&e.remaining<=10&&e.pool>=0&&e.pool<1e12&&Number.isInteger(e.targetRole)&&e.targetRole>=-1&&e.targetRole<=4)}
