import type {Player} from '../core/types';
import {rarityColors} from '../data/catalog';
import {sceneImageReady} from './sceneImages';
import {auraForRarity} from './weaponAura';
import type {ActorAttachments,WingArt} from './heroAttachments';
import {wingLook} from '../saga/collections';

const tinted=new Map<string,HTMLCanvasElement>();
/** The chosen wing look: a recolour of the approved art, prepared once per look. */
function lookArt(img:HTMLImageElement,filter:string):WingArt{
 if(filter==='none'||typeof document==='undefined')return img;
 let c=tinted.get(filter);if(c)return c;
 c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
 const ctx=c.getContext('2d');if(!ctx)return img;
 ctx.filter=filter;ctx.drawImage(img,0,0);ctx.filter='none';
 tinted.set(filter,c);return c;
}

/** Cosmetic attachments of the player's hero: visible wings and the weapon's rarity light. */
export function heroLook(p:Player,wingImage:HTMLImageElement,clock:number,quality:number,reduced:boolean):ActorAttachments|undefined{
 const wings=p.equipment.wings&&p.wingVisible&&sceneImageReady(wingImage)?lookArt(wingImage,wingLook(p).filter):undefined;
 const weapon=p.equipment.weapon,kind=weapon?auraForRarity(weapon.rarity):undefined;
 if(!wings&&!kind)return undefined;
 return {
  wings,reducedMotion:reduced,motion:{clock},
  weapon:kind&&weapon?{kind,color:rarityColors[weapon.rarity]??'#ffffff',quality,clock,reduced}:undefined,
 };
}
