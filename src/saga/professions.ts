import type {Player} from '../core/types';
import {professions,sets,matCount,type SetId} from './gear';
import {peekBox} from './save';

export type ProfessionId=(typeof professions)[number]['id'];
export type PersonalWorkshop={profession:ProfessionId;xp:number};
export const workshopKey='workshop';
export const workshopRanks=[
 {xp:0,name:'Подмастерье',regions:2,bonus:25},
 {xp:12,name:'Ремесленник',regions:4,bonus:27},
 {xp:30,name:'Мастер',regions:6,bonus:30},
] as const;
export const workshopMaxXp=workshopRanks[2].xp;
export const practiceMaterials=3;
export const practiceXp=3;
export const personalCraftXp=4;

export function personalWorkshop(p:Player):PersonalWorkshop|undefined{
 const saved=peekBox<PersonalWorkshop>(p,workshopKey);
 if(!saved||!professions.some(entry=>entry.id===saved.profession))return;
 const xp=Number.isSafeInteger(saved.xp)?Math.max(0,Math.min(workshopMaxXp,saved.xp)):0;
 return {profession:saved.profession,xp};
}

export function workshopMastery(xp:number){
 const upcoming=workshopRanks.findIndex(entry=>entry.xp>xp);
 return {current:workshopRanks[upcoming<0?workshopRanks.length-1:Math.max(0,upcoming-1)],next:workshopRanks[upcoming]};
}

export function workshopRecipe(p:Player,set:SetId){
 const workshop=personalWorkshop(p);
 const required=workshopRanks.find(rank=>sets[set].region<rank.regions)!;
 const mastery=workshopMastery(workshop?.xp??0).current;
 const material=sets[set].material;
 return {required,mastery,material,available:!!workshop&&mastery.xp>=required.xp,stock:matCount(p,material)};
}
