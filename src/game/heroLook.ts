import type {Player} from '../core/types';
import {rarityColors} from '../data/catalog';
import {sceneImageReady} from './sceneImages';
import {auraForRarity} from './weaponAura';
import type {ActorAttachments} from './heroAttachments';

/** Cosmetic attachments of the player's hero: visible wings and the weapon's rarity light. */
export function heroLook(p:Player,wingImage:HTMLImageElement,clock:number,quality:number,reduced:boolean):ActorAttachments|undefined{
 const wings=p.equipment.wings&&p.wingVisible&&sceneImageReady(wingImage)?wingImage:undefined;
 const weapon=p.equipment.weapon,kind=weapon?auraForRarity(weapon.rarity):undefined;
 if(!wings&&!kind)return undefined;
 return {
  wings,reducedMotion:reduced,motion:{clock},
  weapon:kind&&weapon?{kind,color:rarityColors[weapon.rarity]??'#ffffff',quality,clock,reduced}:undefined,
 };
}
