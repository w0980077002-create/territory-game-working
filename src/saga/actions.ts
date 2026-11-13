/**
 * Player actions of the saga systems. Every action validates, then changes the save in ONE store mutation
 * and reports the result, so a double tap or a reload can never pay or charge twice.
 */
import {useGame,makeItem,asSetItem,addLoot} from '../core/store';
import type {Item,Player,Slot,HeroClass} from '../core/types';
import balance from '../../config/test-balance.v1.json';
import {slots} from '../data/catalog';
import {sets,engravings,matKey,matCount,materials,materialIds,type SetId,type EngraveId} from './gear';
import {regionIndex} from './regions';
import {chooseSpec,specIndex} from './specs';
import {chooseBranch} from './companions';
import {boxOf,peekBox,bumpCount} from './save';
const G=()=>useGame.getState(),capacity=balance.loot_test_settings.starter_inventory_capacity;
const fail=(text:string)=>{G().notice(text);return false};
const done=(text:string)=>{G().notice(text);return true};
/** The material a forge job uses: the current region's first, otherwise the fullest stock that can pay. */
export function payMaterial(p:Player,need:number){const own=materialIds[regionIndex(p.stage)%6];if(matCount(p,own)>=need)return own;return [...materialIds].sort((a,b)=>matCount(p,b)-matCount(p,a)).find(id=>matCount(p,id)>=need)??own}
const spend=(p:Player,id:string,n:number)=>{p.saga!.n[matKey(id)]=matCount(p,id)-n};
export const forgeLevel=(p:Player)=>Math.max(1,p.level+Math.floor(p.forge/3));
/** Reforging raises an item to the forge's current level and keeps its name, rarity, upgrades, set and perk. */
export function reforgePlan(item:Item,p:Player){
 const target=forgeLevel(p);if(item.slot==='wings'||item.level>=target)return null;
 const fresh=makeItem(item.slot,target,item.rarity),next:Item={...structuredClone(item),level:target,attack:fresh.attack,hp:fresh.hp,defense:fresh.defense};
 for(let n=0;n<item.upgrade;n++)for(const k of ['attack','hp','defense'] as const)next[k]=Math.ceil(next[k]*balance.gear_rpg_test.upgrade_stat_multiplier);
 const levels=target-item.level,mats=Math.max(1,Math.ceil(levels/6));return {next,gold:Math.round(30*levels*(1+item.rarity*.4)),mats,material:payMaterial(p,mats)};
}
export function reforge(slot:Slot){const p=G().p,item=p.equipment[slot],plan=item&&reforgePlan(item,p);if(!item||!plan)return fail('Предмет уже на уровне кузницы');if(p.gold<plan.gold)return fail('Недостаточно золота');if(matCount(p,plan.material)<plan.mats)return fail(`Нужно ${plan.mats} × ${materials[plan.material].name}`);
 G().mutate(p=>{const now=p.equipment[slot];if(!now||now.id!==item.id||now.level!==item.level)return;p.gold-=plan.gold;spend(p,plan.material,plan.mats);p.equipment[slot]=plan.next;bumpCount(p,'reforge')});return done(`Перековано до ур.${plan.next.level}`)}
export function engravePlan(item:Item,p:Player){const mats=2;return {gold:150*(1+item.rarity)*(item.engrave?2:1),mats,material:payMaterial(p,mats)}}
export function engrave(slot:Slot,id:EngraveId){const p=G().p,item=p.equipment[slot];if(!item||!Object.hasOwn(engravings,id))return false;if(item.engrave===id)return fail('Эта руна уже выгравирована');const plan=engravePlan(item,p);if(p.gold<plan.gold)return fail('Недостаточно золота');if(matCount(p,plan.material)<plan.mats)return fail(`Нужно ${plan.mats} × ${materials[plan.material].name}`);
 G().mutate(p=>{const now=p.equipment[slot];if(!now||now.id!==item.id)return;p.gold-=plan.gold;spend(p,plan.material,plan.mats);now.engrave=id;bumpCount(p,'engrave')});return done(`${engravings[id].name} выгравирована`)}
export const setUnlocked=(p:Player,set:SetId)=>regionIndex(p.stage)>=sets[set].region;
export function craftPlan(set:SetId,p:Player){const level=forgeLevel(p);return {level,gold:60*level,mats:12,material:sets[set].material,rarity:3}}
/** Recipe: a guaranteed piece of a chosen set for a chosen slot. The honest way to finish a 2/4/6 bonus. */
export function craftSet(set:SetId,slot:Slot){const p=G().p;if(slot==='wings'||!slots.includes(slot)||!Object.hasOwn(sets,set))return false;if(!setUnlocked(p,set))return fail('Сначала дойдите до региона этого комплекта');const plan=craftPlan(set,p);if(p.inventory.length>=capacity)return fail('Рюкзак полон');if(p.gold<plan.gold)return fail('Недостаточно золота');if(matCount(p,plan.material)<plan.mats)return fail(`Нужно ${plan.mats} × ${materials[plan.material].name}`);
 let made:Item|undefined;G().mutate(p=>{p.gold-=plan.gold;spend(p,plan.material,plan.mats);const rarity=plan.rarity+(Math.random()<Math.min(.5,p.blessing*.015)?1:0);made=asSetItem(makeItem(slot,plan.level,rarity),set);made.origin='Рецепт кузницы · '+sets[set].name;addLoot(p,made);bumpCount(p,'craft')});if(made)G().select(made.id);return true}
/** Three materials of one kind become one of another: no dead-end stock after a region is finished. */
export function trade(from:string,to:string){const p=G().p;if(from===to||!materialIds.includes(from)||!materialIds.includes(to))return false;if(matCount(p,from)<3)return fail(`Нужно 3 × ${materials[from].name}`);G().mutate(p=>{spend(p,from,3);p.saga!.n[matKey(to)]=matCount(p,to)+1});return done(`+1 ${materials[to].name}`)}
export function pickSpec(index:number){if(specIndex(G().p)===index)return false;G().mutate(p=>chooseSpec(p,index));return done('Сборка изменена · работает со следующего удара')}
export function pickBranch(pet:0|1,branch:number){let ok=false;G().mutate(p=>{ok=chooseBranch(p,pet,branch)});return ok?done('Ветвь спутника выбрана'):fail('Ветвь открывается на 5 уровне спутника')}
export interface Build {name:string;cls:HeroClass;spec:number;runes:number[];gear:Partial<Record<Slot,string>>}
export const buildsOf=(p:Player)=>peekBox<{list?:(Build|null)[]}>(p,'builds')?.list??[];
export function saveBuild(index:number){if(index<0||index>2)return false;G().mutate(p=>{const box=boxOf<{list:(Build|null)[]}>(p,'builds',()=>({list:[null,null,null]}));box.list??=[null,null,null];box.list[index]={name:`Сборка ${index+1}`,cls:p.heroClass,spec:specIndex(p),runes:[...p.runes],gear:Object.fromEntries(slots.filter(s=>p.equipment[s]).map(s=>[s,p.equipment[s]!.id]))}});return done('Сборка сохранена: класс, руны, ветвь и экипировка')}
/** Re-equips a saved loadout from what the hero still owns. Missing items are skipped, nothing is created or lost. */
export function applyBuild(index:number){const build=buildsOf(G().p)[index];if(!build)return fail('Слот сборки пуст');let missing=0;
 G().mutate(p=>{p.heroClass=build.cls;p.runes=build.runes.slice(0,3).map(n=>Math.max(0,Math.min(2,n|0)));while(p.runes.length<3)p.runes.push(0);chooseSpec(p,build.spec);
  for(const slot of slots){const id=build.gear[slot];if(!id||p.equipment[slot]?.id===id)continue;const at=p.inventory.findIndex(i=>i.id===id&&i.slot===slot);if(at<0){missing++;continue}const [item]=p.inventory.splice(at,1),old=p.equipment[slot];p.equipment[slot]=item;if(old)p.inventory.push(old)}});
 return done(missing?`Сборка надета · ${missing} предм. уже нет в рюкзаке`:'Сборка надета');}
