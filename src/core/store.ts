import {migrateProgression,validProgression} from './progression';
import {baseVictoryGold,hammerVictoryGold} from './battleGold';
import {noteLairWin,payRaid,lairRules,lairTrophy} from '../saga/lair';
import {chapterReward,combineRewards,grant,rewardText,type Reward} from '../saga/rewards';
import {create} from 'zustand';
import {SHIP_RULES,starterShipyard,validShipyard,shipClaimable,shipBuyCost,shipUpgradeCost,claimShips,buyShip,upgradeShip} from './shipyard';
import type {Player,Item,Slot,HeroClass,BattleView,EncounterSnapshot} from './types';
import balance from '../../config/test-balance.v1.json';
import {slots,slotNames,rarityNames} from '../data/catalog';
import {itemPower,stats,xpNeeded,odinCallMaxLevel,stageLabel} from './formulas';
import {cloudSave,haptic,readCloud} from './telegram';
import {lootStorageNotice,observeLootSave} from './lootStorage';
import {SAVE_KEY,telegramProfile,carnivalNow,mailAcceptanceProfile} from './profile';
import {acceptedMailCarnival} from '../qa/mailAcceptance';
export {SAVE_KEY,isolatedProfile} from './profile';
import {validEncounter} from '../game/snapshot';
import {uniques,uniqueOf,namedDrop,gearRules} from './gear';
import {upgradePreview,forgeLevel,applyForgeMastery} from './forge';
import type {UniqueId} from './types';
import {normalizeWorld} from './world';
import {normalizeSaga,markSeen,bumpCount} from '../saga/save';
import {stageXp,regionIndex,stageInRegion,legendLap} from '../saga/regions';
import {sets,perks,setOfRegion,setChance,rarityBoostChance,blessingCanImprove,dropRules,matKey,hasPerk,materialIds,type SetId,type PerkId} from '../saga/gear';
import {branchOf} from '../saga/companions';
import {setFlag} from '../saga/save';
import {applyPurchase,shopOffers,shopQuote,shopSold,shopStatus} from '../saga/shop';
import {actualReward,claimDailyGift,claimSeason} from '../saga/events';
import {applyHonor,canClaimHonor} from '../saga/honor';
import {applyMail,type MailAction} from '../saga/mail';
import {normalizeCarnival,prepareCarnivalClaim,updateCarnival,type CarnivalClaimResult} from '../saga/carnival';
import {soloVictory} from '../saga/soloEconomy';
import {realmSessionWritable} from '../dark/session';
import {realmRun,realmVictory,realmClaim,migrateRealm,realmBox} from '../dark/realm';
import {lootBonus,addRes,rollGem,gemBox,gemLabel,resCount,migrateSquad,raiseFollowerLevel,followerId,FOLLOWER_MAX_LEVEL} from '../dark/rules';
let sequence=0;
let lastHornAutoSalvage=-Infinity;let lastHornPurchase=-Infinity;let lastSealTrade=-Infinity;
let encounterPause:(()=>void)|undefined;let encounterRestore:(()=>void)|undefined;let encounterResume:(()=>void)|undefined;
let resumeAfterPanel=false;
let encounterProvider:(()=>EncounterSnapshot)|undefined;
export function registerEncounterProvider(provider:()=>EncounterSnapshot,controls?:{pause:()=>void;restore:()=>void;resume?:()=>void}){encounterProvider=provider;encounterPause=controls?.pause;encounterRestore=controls?.restore;encounterResume=controls?.resume;resumeAfterPanel=false;return()=>{if(encounterProvider===provider){encounterProvider=undefined;encounterPause=undefined;encounterRestore=undefined;encounterResume=undefined;resumeAfterPanel=false}}}
const hornConfig=balance.horn_test_settings;
export {hornPurchase} from '../saga/shop';

export function makeItem(slot:Slot,level:number,rarity:number):Item {const quality=1+rarity*.38;const v=(3+level*2)*quality;return {id:`${Date.now().toString(36)}-${++sequence}-${Math.random().toString(36).slice(2,7)}`,slot,name:slot==='wings'?'Крылья северного ветра':`${rarityNames[rarity]} · ${slotNames[slot]}`,level,rarity,attack:slot==='wings'?0:Math.round(v*(slot==='weapon'?2.1:.35)),hp:slot==='wings'?0:Math.round(v*(slot==='armor'?5:1.4)),defense:slot==='wings'?0:Math.round(v*(slot==='shield'?1.3:.4)),upgrade:0,...(slot==='wings'?{percent:{hp:balance.wings_test_settings.rank_1_example.bonuses_percent.hp+rarity*2,attack:balance.wings_test_settings.rank_1_example.bonuses_percent.attack+rarity,defense:balance.wings_test_settings.rank_1_example.bonuses_percent.defense+rarity}}:{})}}
export function makeUnique(id:UniqueId,level:number,origin:string):Item {const def=uniques[id];return {...makeItem(def.slot,level,def.rarity),name:def.name,uniqueId:id,origin}}
/** A piece of a region set: ordinary stats, plus it counts towards the 2/4/6 bonuses. Never wings. */
export function asSetItem(item:Item,set:SetId):Item {if(item.slot==='wings'||item.uniqueId||item.perk)return item;item.set=set;item.rarity=Math.max(item.rarity,2);const fresh=makeItem(item.slot,item.level,item.rarity);item.attack=fresh.attack;item.hp=fresh.hp;item.defense=fresh.defense;item.name=`${sets[set].name} · ${slotNames[item.slot]}`;return item}
/** Every victory leaves a `battle:<id>` receipt so a reward cannot be paid twice. Only the active encounter (always the newest id)
 * can still be won, so the newest receipts are kept and the oldest ones are dropped; other claims are never touched. */
export const BATTLE_RECEIPTS=500;
export function trimBattleReceipts(p:Player){let extra=p.claimed.reduce((n,c)=>n+(c.startsWith('battle:')?1:0),0)-BATTLE_RECEIPTS;if(extra>0)p.claimed=p.claimed.filter(c=>!(c.startsWith('battle:')&&extra-->0))}
export function makePerkItem(id:PerkId,level:number,origin:string):Item {const def=perks[id],item=makeItem(def.slot,level,def.rarity);return {...item,name:def.name,perk:id,origin,...(def.set?{set:def.set}:{})}}
/** Region material drop for a campaign victory. Call inside a mutation. */
export function grantMaterial(p:Player,id:string,amount:number){const s=p.saga??=normalizeSaga(undefined);s.n[matKey(id)]=(s.n[matKey(id)]??0)+amount}
/** Gold multiplier from long-term choices (named compass, goose «Добытчик»). */
export const goldBonus=(p:Player)=>1+(hasPerk(p,'compass')?.2:0)+(branchOf(p,0)===1?.1:0)+lootBonus(p);
const campaignGold=(p:Player,boss:boolean)=>Math.round(baseVictoryGold('campaign',p.stage,boss)*(1+p.talents[2]*.05)*goldBonus(p));
export const firstBossTrophyName='Клинок ледяного шёлка';
export const guaranteedBossTrophy=(p:Player)=>p.stage===1&&!p.claimed.includes('first-boss-relic')?firstBossTrophyName:undefined;
export function campaignBossReward(p:Player,now=Date.now()):Reward{
 return actualReward(p,{
  gold:campaignGold(p,true),gems:balance.test_rewards.boss_win_gems,xp:stageXp(p.stage,true),horn:2,
  mats:{[materialIds[regionIndex(p.stage)%6]]:stageInRegion(p.stage)===10?dropRules.materialFinale:dropRules.materialBoss},
 },now);
}
function validBossReward(reward:Reward){
 const count=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 return !!reward&&Object.keys(reward).every(key=>['gold','gems','xp','horn','mats'].includes(key))&&
  [reward.gold,reward.gems,reward.xp,reward.horn].every(count)&&!!reward.mats&&typeof reward.mats==='object'&&
  Object.entries(reward.mats).every(([id,amount])=>materialIds.some(valid=>valid===id)&&count(amount));
}
export function freshPlayer():Player {const s=balance.new_player_test_start;return {version:1,progression:{v:1,anchors:{}},level:s.hero_level,xp:0,gold:s.gold,gems:s.gems,redDiamonds:0,shipyard:starterShipyard(),chaosite:s.chaosite,tokens:s.test_shop_tokens,horn:s.horn_charges,hornAt:Date.now(),stage:1,wave:1,kills:0,bosses:0,heroClass:'berserker',inventory:[],equipment:Object.fromEntries(slots.filter(s=>s!=='wings').map(s=>[s,makeItem(s,1,1)])),skills:[1,1,1],runes:[0,0,0],companions:[1,1],talents:[0,0,0],forge:1,blessing:1,daily:'',mission:0,claimed:[],bought:[],savedAt:Date.now(),wingVisible:true,sound:false,arenaWins:0,darkFloor:1,mineAt:Date.now(),relic:0,seasonClaims:[]}}
function validItem(value:unknown):value is Item {if(!value||typeof value!=='object')return false;const i=value as Item;return typeof i.id==='string'&&i.id.length<=120&&typeof i.name==='string'&&i.name.length<=120&&slots.includes(i.slot)&&['level','rarity','attack','hp','defense','upgrade'].every(k=>Number.isFinite(i[k as keyof Item])&&Number(i[k as keyof Item])>=0)&&Number.isInteger(i.rarity)&&i.rarity<=8&&i.level>=1&&(i.enhancementBase===undefined||typeof i.enhancementBase==='object'&&i.enhancementBase!==null&&!Array.isArray(i.enhancementBase)&&['attack','hp','defense'].every(k=>Number.isFinite(i.enhancementBase![k as keyof typeof i.enhancementBase])&&i.enhancementBase![k as keyof typeof i.enhancementBase]>=0))&&(i.masterwork===undefined||i.masterwork===true)&&(i.salvageGoldCap===undefined||Number.isSafeInteger(i.salvageGoldCap)&&i.salvageGoldCap>=0)&&(i.locked===undefined||typeof i.locked==='boolean')&&(i.origin===undefined||typeof i.origin==='string'&&i.origin.length<=160)&&(i.uniqueId===undefined||typeof i.uniqueId==='string'&&Object.hasOwn(uniques,i.uniqueId)&&uniques[i.uniqueId].slot===i.slot)&&(!i.percent||[i.percent.hp,i.percent.attack,i.percent.defense].every(n=>Number.isFinite(n)&&n>=0))&&[i.set,i.perk,i.engrave].every(v=>v===undefined||typeof v==='string'&&v.length<=24)}
export function parseSave(raw:string|null,strictEncounter=false):Player|null {if(!raw)return null;try{const p=JSON.parse(raw) as Player;if(p.version!==1||p.progression!==undefined&&!validProgression(p.progression))return null;const nonnegative=['level','xp','gold','gems','chaosite','tokens','horn','hornAt','stage','wave','kills','bosses','forge','blessing','mission','savedAt','arenaWins','darkFloor','mineAt','relic'] as const;if(nonnegative.some(k=>!Number.isFinite(p[k])||p[k]<0)||p.level<1||!Number.isInteger(p.level)||p.stage<1||!Number.isInteger(p.stage)||!Number.isInteger(p.wave)||p.wave<1||p.wave>5||p.horn>hornConfig.maximum_charges)return null;if(!['berserker','ranger','runologist'].includes(p.heroClass))return null;for(const [key,len] of [['skills',3],['runes',3],['talents',3],['companions',2]] as const){if(!Array.isArray(p[key])||p[key].length!==len||p[key].some(n=>!Number.isInteger(n)||n<0))return null}if(p.skills.some(n=>n<1)||p.companions.some(n=>n<1)||p.runes.some(n=>n>2))return null;if(!Array.isArray(p.inventory)||p.inventory.length>balance.loot_test_settings.starter_inventory_capacity||!p.inventory.every(validItem)||!p.equipment||typeof p.equipment!=='object'||Array.isArray(p.equipment))return null;if(p.pendingLoot!==undefined&&!Array.isArray(p.pendingLoot))return null;const ids=new Set<string>();for(const [slot,item] of Object.entries(p.equipment)){if(!validItem(item)||item.slot!==slot||ids.has(item.id))return null;ids.add(item.id)}for(const items of [p.inventory,p.pendingLoot]){if(!items)continue;for(const i of items){if(!validItem(i)||ids.has(i.id))return null;ids.add(i.id)}}for(const key of ['claimed','bought'] as const){if(!Array.isArray(p[key])||p[key].some(v=>typeof v!=='string'))return null}if(!Array.isArray(p.seasonClaims)||p.seasonClaims.some(n=>!Number.isInteger(n)||n<1||n>10)||typeof p.daily!=='string'||typeof p.wingVisible!=='boolean'||typeof p.sound!=='boolean')return null;if(p.reducedMotion!==undefined&&typeof p.reducedMotion!=='boolean')return null;if(p.redDiamonds!==undefined&&(!Number.isSafeInteger(p.redDiamonds)||p.redDiamonds<0||p.redDiamonds>1_000_000_000))return null;if(p.shipyard!==undefined&&!validShipyard(p.shipyard))return null;if(p.lastBattleReward!==undefined&&(typeof p.lastBattleReward!=='string'||p.lastBattleReward.length>120))return null;if(p.preferences&&(typeof p.preferences.auto!=='boolean'||![1,2].includes(p.preferences.speed)||(p.preferences.stopOnDeath!==undefined&&typeof p.preferences.stopOnDeath!=='boolean')||(p.preferences.continueOnVictory!==undefined&&typeof p.preferences.continueOnVictory!=='boolean')||(p.preferences.autoSalvageWeaker!==undefined&&typeof p.preferences.autoSalvageWeaker!=='boolean')))return null;if(p.rewardOffer){const r=p.rewardOffer;if(typeof r.encounterId!=='string'||typeof r.itemId!=='string'||typeof r.resolved!=='boolean')return null;if(r.hammerGold!==undefined&&(!Number.isSafeInteger(r.hammerGold)||r.hammerGold<=0))delete r.hammerGold;if(r.bossReward!==undefined&&!validBossReward(r.bossReward))delete r.bossReward;if(!r.resolved&&!p.inventory.some(i=>i.id===r.itemId)&&!p.pendingLoot?.some(i=>i.id===r.itemId))delete p.rewardOffer;}if(p.encounter&&!validEncounter(p.encounter)){if(strictEncounter)return null;delete p.encounter;}if(p.world!==undefined)p.world=normalizeWorld(p.world);if(p.saga!==undefined)p.saga=normalizeSaga(p.saga);if(p.carnival!==undefined){const carnival=normalizeCarnival(p.carnival);if(carnival)p.carnival=carnival;else delete p.carnival;}if(p.volume!==undefined&&![1,2,3].includes(p.volume))delete p.volume;migrateRealm(p);migrateSquad(p);const result=stats(p);if(Object.values(result).some(n=>!Number.isFinite(n)))return null;return p;}catch{return null}}

let recoveryRequired=false;
let observedRaw:string|null=null;
function read(){if(typeof localStorage==='undefined')return freshPlayer();try{const raw=localStorage.getItem(SAVE_KEY),saved=parseSave(raw,true);if(raw&&!saved){recoveryRequired=true;return freshPlayer()}observedRaw=raw;if(saved){saved.progression=migrateProgression(saved);return saved;}const player=freshPlayer();if(mailAcceptanceProfile)player.carnival=acceptedMailCarnival(player);return player}catch{recoveryRequired=true;return freshPlayer()}}
export function unreadableSave(){try{const raw=localStorage.getItem(SAVE_KEY);return raw&&!parseSave(raw,true)?raw:localStorage.getItem(SAVE_KEY+':unreadable-cloud')??raw??''}catch{return ''}}
function xp(p:Player,amount:number){p.xp+=amount;while(p.xp>=xpNeeded(p.level)){p.xp-=xpNeeded(p.level);p.level++;}}
export function hornRefillDue(p:Pick<Player,'horn'|'hornAt'>,now=Date.now()){
 return p.horn<hornConfig.maximum_charges&&now-p.hornAt>=hornConfig.recharge_one_charge_every_seconds*1000;
}
export function refill(p:Pick<Player,'horn'|'hornAt'>,now=Date.now()){const interval=hornConfig.recharge_one_charge_every_seconds*1000;const elapsed=Math.floor(Math.max(0,now-p.hornAt)/interval);if(elapsed>0){p.horn=Math.min(hornConfig.maximum_charges,p.horn+elapsed);p.hornAt+=elapsed*interval}if(p.horn>=hornConfig.maximum_charges)p.hornAt=Math.max(p.hornAt,now);}
export function grantHorn(p:Player,count:number,now=Date.now()){refill(p,now);p.horn=Math.min(hornConfig.maximum_charges,p.horn+count);if(p.horn>=hornConfig.maximum_charges)p.hornAt=Math.max(p.hornAt,now);}
export function rollItem(p:Player,forcedSlot?:Slot,setBase:number=dropRules.setChanceHorn){const r=Math.random()*100;let acc=0,rarity=0;for(const [i,x] of balance.loot_test_settings.rarities.entries()){acc+=x.weight_percent;if(r<acc){rarity=i;break}}rarity=Math.min(8,rarity+(Math.random()<rarityBoostChance(p.blessing)?1:0));const item=applyForgeMastery(makeItem(forcedSlot??slots[Math.floor(Math.random()*slots.length)],forgeLevel(p),rarity),p);
 // Sets belong to regions: the hero finds pieces of the region he is fighting in (or has already freed).
 if(item.slot!=='wings'&&p.stage>1&&Math.random()<setChance(setBase,p.blessing)){const open=Math.min(5,regionIndex(p.stage)+legendLap(p.stage)*6);asSetItem(item,setOfRegion(setBase===dropRules.setChanceHorn?Math.floor(Math.random()*(open+1)):regionIndex(p.stage)))}
 return item}
const inventoryCapacity=balance.loot_test_settings.starter_inventory_capacity;
const protectedOrigin=/босс|трофей|награда|покупка|boss|trophy|reward|shop/i;
export function salvageProtection(p:Player,item:Item):string|undefined{
 if(item.slot==='wings')return 'крылья';
 if(item.rarity>=3)return 'редкая вещь';
 if(item.uniqueId||uniqueOf(item)||item.set||item.perk)return 'именная или комплектная вещь';
 if(item.upgrade>0||item.engrave||item.percent)return 'вещь с усилением или особым свойством';
 if(item.origin&&protectedOrigin.test(item.origin))return 'особая награда';
 if(p.rewardOffer?.itemId===item.id&&!p.rewardOffer.resolved)return 'активная награда';
}
export function requiresSalvageConfirmation(p:Player,item:Item):boolean{
 return salvageProtection(p,item)!==undefined;
}
/** Auto-dismantle only newly obtained, plainly weaker gear; never the player's old equipment. */
export function shouldAutoSalvage(p:Player,item:Item){
 return !!p.preferences?.autoSalvageWeaker&&!!p.equipment[item.slot]&&!requiresSalvageConfirmation(p,item)&&compareItem(item,p)<0;
}
const isDuskWing=(item:Item)=>item.slot==='wings'&&item.perk==='duskwings';
const duskWings=(p:Player)=>[...p.inventory,...(p.pendingLoot??[]),...(p.equipment.wings?[p.equipment.wings]:[])].filter(isDuskWing);
const lastDuskWing='Крылья Сумрака выдаются один раз за 20-й этаж. Последний экземпляр нельзя распылить.';
export function salvageRestriction(p:Player,item:Item){
 return isDuskWing(item)&&duskWings(p).length<=1?lastDuskWing:undefined;
}
export function bulkSalvageRestriction(p:Player,item:Item){
 if(Object.values(p.equipment).some(worn=>worn?.id===item.id))return 'Предмет надет';
 if(p.rewardOffer?.itemId===item.id&&!p.rewardOffer.resolved)return 'Сначала откройте и подтвердите решение по награде';
 return salvageRestriction(p,item);
}
export function canBulkSalvage(p:Player,item:Item):boolean{
 return !bulkSalvageRestriction(p,item)&&(p.inventory.some(entry=>entry.id===item.id)||!!p.pendingLoot?.some(entry=>entry.id===item.id));
}
export function salvageYield(item:Item){
 const gold=Math.round(itemPower(item)/3);
 // Made or bought gear can be recycled for a bounded refund, never used to buy XP.
 return item.salvageGoldCap===undefined?{gold,xp:10+item.level*2}:{gold:Math.min(gold,item.salvageGoldCap),xp:0};
}
function salvageReward(p:Player,item:Item){const reward=salvageYield(item);p.gold+=reward.gold;xp(p,reward.xp)}

export function previewBulkSalvage(p:Player,ids:readonly string[]){
 const selected=new Set(ids);
 if(!selected.size)return null;
 const collect=(items:Item[],source:'backpack'|'storage')=>items.filter(item=>selected.has(item.id))
  .map(item=>({item,source,warning:salvageProtection(p,item)}));
 const entries=[...collect(p.inventory,'backpack'),...collect(p.pendingLoot??[],'storage')];
 if(entries.length!==selected.size||entries.some(({item})=>bulkSalvageRestriction(p,item)))return null;
 const selectedWings=entries.filter(({item})=>isDuskWing(item)).length;
 if(selectedWings>0&&selectedWings>=duskWings(p).length)return null;
 const reward=entries.reduce((sum,{item})=>{const value=salvageYield(item);return {gold:sum.gold+value.gold,xp:sum.xp+value.xp}},{gold:0,xp:0});
 const quote=JSON.stringify([entries.map(({source,item,warning})=>[source,item,warning]),reward]);
 return {entries,...reward,quote};
}
function placeLoot(p:Player,item:Item,allowAutoSalvage=false){
 const matches=(existing:Item|undefined)=>existing?.id===item.id;
 if(p.inventory.some(matches)||p.pendingLoot?.some(matches)||Object.values(p.equipment).some(matches))return 'duplicate';
 if(allowAutoSalvage&&shouldAutoSalvage(p,item)){
  salvageReward(p,item);
  return 'salvaged';
 }
 if(p.inventory.length>=inventoryCapacity){
  (p.pendingLoot??=[]).push(item);
  return 'stored';
 }
 p.inventory.push(item);
 return 'backpack';
}
export function addLoot(p:Player,item:Item,allowAutoSalvage=false){
 return placeLoot(p,item,allowAutoSalvage)==='backpack';
}
function lootNotice(p:Player,item:Item,disposition:ReturnType<typeof placeLoot>,success:string){
 if(disposition==='salvaged')return 'Слабая добыча автоматически разобрана · золото и опыт получены';
 const destination=disposition==='stored'?'Рюкзак полон · добыча сохранена на складе':success;
 const protection=p.preferences?.autoSalvageWeaker?salvageProtection(p,item):undefined;
 return protection?destination+' · авторазбор пропущен: '+protection:destination;
}

export const initialBattle:BattleView={hp:1,maxHp:1,enemyHp:1,enemyMax:1,phase:'walk',boss:false,timer:30,cooldowns:[0,0,0],enemyName:'',mode:'campaign',running:false,bossPhase:1,ability:''};
interface Store {p:Player;panel:string|null;selected:string|null;back:string|null;leaveItem:()=>void;equipBest:()=>number;toast:string;toastReward?:Reward;toastId:number;dismissNotice:(expectedId:number)=>void;auto:boolean;speed:number;stopOnDeath:boolean;continueOnVictory:boolean;autoSalvageWeaker:boolean;battle:BattleView;storageError:boolean;recoveryRequired:boolean;open:(s:string|null)=>void;notice:(s:string,reward?:Reward)=>void;select:(id:string|null)=>void;mutate:(fn:(p:Player)=>unknown,exclusive?:boolean)=>boolean;persist:()=>boolean;hornLoot:()=>void;equip:(id:string)=>void;salvage:(id:string,confirmed?:boolean)=>void;bulkSalvage:(ids:readonly string[],quote?:string)=>number;claimStored:(ids?:string[])=>number;keepReward:()=>void;configure:(settings:{auto?:boolean;speed?:1|2;stopOnDeath?:boolean;continueOnVictory?:boolean;autoSalvageWeaker?:boolean})=>void;importSave:(p:Player)=>boolean;upgrade:(slot:Slot,expected?:{id:string;upgrade:number})=>void;train:(type:string,index?:number)=>boolean;claim:(id:string,expected?:number)=>void;claimHonor:(expectedRank:number)=>boolean;mailAction:(action:MailAction)=>boolean;buy:(id:string,quote?:string,equipmentSlot?:Slot)=>boolean;shipAction:(action:'claim'|'buy'|'upgrade'|'trade',id?:string)=>void;win:(mode:string,encounterId?:string,snapshot?:EncounterSnapshot,tally?:Record<string,number>,onHammerPaid?:(gold:number)=>void)=>boolean;unequip:(slot:Slot)=>void;setClass:(c:HeroClass)=>void}
// A message produced in the same synchronous operation may follow its automatic redirect.
// The flag expires before the next user interaction; it is never part of a player save.
let activeNoticeId:number|undefined;
/** The write did not happen: the state was already rolled back, so say so instead of «success». */
const unsaved=(g:Store)=>g.notice(g.recoveryRequired?'Сохранение повреждено · откройте Меню → восстановление':'Не удалось сохранить · попробуйте ещё раз');
const loadedPlayer=read();refill(loadedPlayer);
let observedPlayer:Player|undefined;
/** Check before starting an action that can produce loot. Already-earned rewards are always committed. */
export function mayStartLoot(){
 const g=useGame.getState();
 if(g.p!==observedPlayer){
  observeLootSave(JSON.stringify(g.p),true);
  observedPlayer=g.p;
 }
 const warning=lootStorageNotice();
 if(warning)g.notice(warning);
 return !warning;
}
type Settings=Pick<Store,'auto'|'speed'|'stopOnDeath'|'continueOnVictory'|'autoSalvageWeaker'>;
export const useGame=create<Store>((set,get)=>{
 const writable=()=>{
  if(get().recoveryRequired)return false;
  const ownsLock=realmSessionWritable();
  if(typeof window==='undefined'&&ownsLock)return true;
  try{
   const current=localStorage.getItem(SAVE_KEY);
   if(current&&current!==observedRaw){
    // A browser storage event may arrive after the profile lock changes hands.
    if(!followProfileSave(current))set({storageError:true});
    return false;
   }
   if(ownsLock)return true;
   get().notice('Игра открыта в другой вкладке · продолжите там');
   return false;
  }catch{set({storageError:true});return false}
 };
 const commit=(draft:Player,settings:Settings,changes?:Partial<Settings>)=>{
  const {auto,speed,stopOnDeath,continueOnVictory,autoSalvageWeaker}=settings;
  const now=Date.now();
  const p={...draft,preferences:{auto,speed:speed as 1|2,stopOnDeath,continueOnVictory,autoSalvageWeaker},savedAt:now};
  const carnival=updateCarnival(get().p,p,carnivalNow(now));
  if(carnival)p.carnival=carnival;
  const run=realmRun(p);
  if(run&&p.encounter?.mode==='darkness'&&run.lastCombatId!==p.encounter.id){
   const saga=p.saga!;
   p.saga={...saga,box:{...saga.box,realm:{...realmBox(p),run:{...run,checkpoint:p.encounter}}}};
  }
  let raw:string;
  try{raw=JSON.stringify(p);localStorage.setItem(SAVE_KEY,raw)}
  catch{set({storageError:true});return false}
  observeLootSave(raw);
  observedRaw=raw;
  observedPlayer=p;
  set({p,storageError:false,...changes});
  return true;
 };
 return {p:loadedPlayer,panel:null,selected:null,back:null,toast:'',toastId:0,auto:loadedPlayer.preferences?.auto??true,speed:loadedPlayer.preferences?.speed??1,stopOnDeath:loadedPlayer.preferences?.stopOnDeath??true,continueOnVictory:loadedPlayer.preferences?.continueOnVictory??true,autoSalvageWeaker:loadedPlayer.preferences?.autoSalvageWeaker??false,battle:initialBattle,storageError:false,recoveryRequired,
 open:panel=>{if(panel){if(!get().panel&&get().battle.running)resumeAfterPanel=true;encounterPause?.()}haptic();set({panel,selected:null,back:null,...(panel!==get().panel&&activeNoticeId!==get().toastId?{toast:''}:{})});if(!panel&&resumeAfterPanel){resumeAfterPanel=false;encounterResume?.()}},
 notice:(toast,toastReward)=>{const toastId=get().toastId+1;activeNoticeId=toastId;set({toast,toastId,toastReward});queueMicrotask(()=>{if(activeNoticeId===toastId)activeNoticeId=undefined});setTimeout(()=>{if(get().toastId===toastId&&get().toast)set({toast:''})},3200)},
 dismissNotice:expectedId=>{if(get().toast&&get().toastId===expectedId&&activeNoticeId!==expectedId)set({toast:''})},
 select:selected=>{if(selected){if(!get().panel&&get().battle.running)resumeAfterPanel=true;encounterPause?.()}{const from=get().panel;set({selected,panel:selected?'item':null,back:selected?(from&&from!=='item'?from:get().back):null,...((from!==(selected?'item':null)||selected!==get().selected)&&activeNoticeId!==get().toastId?{toast:''}:{})})}if(!selected&&resumeAfterPanel){resumeAfterPanel=false;encounterResume?.()}},
 mutate:(fn,exclusive)=>{
  if(!writable())return false;
  const g=get(),draft=structuredClone(g.p);
  if(encounterProvider)draft.encounter=encounterProvider();
  if(fn(draft)===false&&exclusive)return false;
  return commit(draft,g);
 },
 persist:()=>{
  if(!writable())return false;
  const g=get();
  return commit({...g.p,...(encounterProvider?{encounter:encounterProvider()}:{})},g);
 },
 claimHonor:expectedRank=>{
  const g=get();
  if(!canClaimHonor(g.p,expectedRank)||!writable())return false;
  let applied=false;
  if(!g.mutate(p=>{applied=applyHonor(p,expectedRank)})){unsaved(get());return false;}
  if(applied)haptic(true);
  return applied;
 },
 mailAction:action=>{
  const g=get(),now=Date.now();
  if(!writable())return false;
  let message:string|undefined,reward:Reward|undefined;
  if(!g.mutate(p=>{message=applyMail(p,action,carnivalNow(now),now,paid=>{reward=paid})})){unsaved(get());return false}
  if(message)g.notice(message,reward);
  return true;
 },
 hornLoot:()=>{
  const g=get(),tap=performance.now();
  if(g.recoveryRequired||g.panel==='item'&&g.selected||tap-lastHornAutoSalvage<350)return;
  const now=Date.now(),current={horn:g.p.horn,hornAt:g.p.hornAt};
  refill(current,now);
  if(current.horn<hornConfig.chest_charge_cost){g.notice('Заряд Рога ещё восстанавливается');return}
  if(!mayStartLoot())return;
  let item:Item|undefined,disposition:ReturnType<typeof placeLoot>|undefined;
  if(!g.mutate(p=>{
   refill(p,now);
   item=rollItem(p);
   item.origin='Рог Трофеев';
   disposition=placeLoot(p,item,true);
   if(disposition==='duplicate')return;
   p.horn-=hornConfig.chest_charge_cost;
   bumpCount(p,'horn');
  })){if(get().storageError)unsaved(get());return}
  if(!item||!disposition||disposition==='duplicate')return;
  if(disposition==='salvaged')lastHornAutoSalvage=tap;
  haptic(true);
  const message=lootNotice(get().p,item,disposition,'Добыча: '+item.name);
  if(disposition!=='backpack'||get().p.preferences?.autoSalvageWeaker&&requiresSalvageConfirmation(get().p,item))g.notice(message);
  if(disposition!=='salvaged')g.select(item.id);
 },
 unequip:slot=>{const g=get(),item=g.p.equipment[slot];if(!item)return;if(g.p.inventory.length>=balance.loot_test_settings.starter_inventory_capacity){g.notice('Рюкзак полон');return}if(!g.mutate(p=>{p.inventory.push(p.equipment[slot]!);delete p.equipment[slot]})){unsaved(get());return}g.notice('Предмет перемещён в рюкзак')},
 equip:id=>{
  const g=get();
  if(g.recoveryRequired)return;
  const source=g.p.inventory.some(i=>i.id===id)?'inventory':'pendingLoot';
  if(!g.p[source]?.some(i=>i.id===id))return;
  if(!g.mutate(p=>{
   const items=p[source]!;
   const [item]=items.splice(items.findIndex(i=>i.id===id),1);
   const old=p.equipment[item.slot];
   delete p.equipment[item.slot];
   if(old)addLoot(p,old);
   p.equipment[item.slot]=item;
   if(old?.id!==item.id)bumpCount(p,'carnival:equip');
   if(p.rewardOffer?.itemId===id)p.rewardOffer.resolved=true;
  })){if(get().storageError)g.notice('Не удалось сохранить экипировку · предметы остались на месте');return}
  if(get().panel==='item')g.leaveItem();
  g.notice('Экипировано · характеристики обновлены');
 },
 /** Closes the item card and returns to the window it was opened from (slot, backpack…), or to the fight. */
 leaveItem:()=>{const back=get().back;if(back)set({selected:null,panel:back,back:null,...(activeNoticeId!==get().toastId?{toast:''}:{})});else get().select(null)},
 /** One transaction: every slot takes the strongest piece from the backpack. Named items with situational effects are never swapped out silently. */
 equipBest:()=>{const g=get();if(g.recoveryRequired)return 0;const plan=bestUpgrades(g.p);if(!plan.length){g.notice('Лучшие вещи уже надеты');return 0}let gain=0;
  if(!g.mutate(p=>{for(const {slot,item} of bestUpgrades(p)){const at=p.inventory.findIndex(i=>i.id===item.id);if(at<0)continue;const cp=stats(p).cp,[fresh]=p.inventory.splice(at,1),old=p.equipment[slot];p.equipment[slot]=fresh;if(old)p.inventory.push(old);bumpCount(p,'carnival:equip');if(p.rewardOffer?.itemId===fresh.id)p.rewardOffer.resolved=true;gain+=stats(p).cp-cp}})){if(get().storageError)g.notice('Не удалось сохранить экипировку · предметы остались на месте');return 0}haptic(true);g.notice(`Надето лучших вещей: ${plan.length} · сила +${gain}`);return plan.length},
 salvage:(id,confirmed=false)=>{
  const g=get();
  if(g.recoveryRequired)return;
  const inBackpack=g.p.inventory.find(i=>i.id===id);
  const item=inBackpack??g.p.pendingLoot?.find(i=>i.id===id);
  if(!item)return;
  const restriction=salvageRestriction(g.p,item);
  if(restriction){g.notice(restriction);return}
  if(!confirmed&&requiresSalvageConfirmation(g.p,item)){
   g.notice('Подтвердите распыление ценной вещи');return;
  }
  if(!g.mutate(p=>{
   const items=(inBackpack?p.inventory:p.pendingLoot)!;
   items.splice(items.findIndex(i=>i.id===id),1);
   salvageReward(p,item);
   bumpCount(p,'carnival:salvage');
   if(p.rewardOffer?.itemId===id)p.rewardOffer.resolved=true;
  })){if(get().storageError)g.notice('Не удалось сохранить распыление · предмет остался на месте');return}
  if(get().panel==='item'&&get().selected===id)g.leaveItem();
  g.notice('Предмет распылён: золото и опыт получены');
 },
 bulkSalvage:(ids,quote)=>{
   if(!Array.isArray(ids)||!ids.length||!writable())return 0;
   const g=get(),plan=previewBulkSalvage(g.p,ids);
   if(!quote||!plan||plan.quote!==quote){
    g.notice('Состав или награда изменились · проверьте выбранные вещи и подтвердите заново');
    return 0;
   }
   const itemIds=new Set(ids);
   try{localStorage.setItem(SAVE_KEY+':before-bulk-salvage',exportSave())}
   catch{g.notice('Не удалось сохранить резервную копию · вещи остались на месте');return 0}
   if(!g.mutate(p=>{
    p.inventory=p.inventory.filter(i=>!itemIds.has(i.id));
    if(p.pendingLoot)p.pendingLoot=p.pendingLoot.filter(i=>!itemIds.has(i.id));
    p.gold+=plan.gold;
    xp(p,plan.xp);
    bumpCount(p,'carnival:salvage',plan.entries.length);
   })){
    if(get().storageError)g.notice('Не удалось сохранить изменения · вещи остались на месте');
    return 0;
   }
   g.notice(`Распылено ${plan.entries.length} вещей · +${plan.gold} золота и +${plan.xp} опыта`);
   return plan.entries.length;
  },
 claimStored:ids=>{
   const g=get();if(g.recoveryRequired)return 0;
   const requested=ids?new Set(ids):null;
   const room=Math.max(0,balance.loot_test_settings.starter_inventory_capacity-g.p.inventory.length);
   const items=(g.p.pendingLoot??[]).filter(i=>!requested||requested.has(i.id)).slice(0,room);
   if(!items.length){g.notice(room?'Выберите вещи на хранении':'Рюкзак полон · освободите место');return 0}
   const chosen=new Set(items.map(i=>i.id));
   if(!g.mutate(p=>{p.inventory.push(...items);p.pendingLoot=(p.pendingLoot??[]).filter(i=>!chosen.has(i.id))})){
    if(get().storageError)g.notice('Не удалось сохранить · вещи остались на хранении');
    return 0;
   }
   g.notice(`Получено ${items.length} · осталось на хранении ${(get().p.pendingLoot??[]).length}`);
   return items.length;
  },
 keepReward:()=>{if(get().p.rewardOffer&&!get().p.rewardOffer!.resolved)get().mutate(p=>{p.rewardOffer!.resolved=true})},
 configure:settings=>{
  if(!writable())return;
  const g=get(),changes={
   ...('auto'in settings?{auto:!!settings.auto}:{}),
   ...('speed'in settings?{speed:settings.speed===2?2:1}:{}),
   ...('stopOnDeath'in settings?{stopOnDeath:settings.stopOnDeath!==false}:{}),
   ...('continueOnVictory'in settings?{continueOnVictory:settings.continueOnVictory!==false}:{}),
   ...('autoSalvageWeaker'in settings?{autoSalvageWeaker:settings.autoSalvageWeaker===true}:{})
  };
  if(!commit({...g.p,...(encounterProvider?{encounter:encounterProvider()}:{})},{...g,...changes},changes))unsaved(get());
 },
 importSave:incoming=>{if(!realmSessionWritable()){get().notice('Закройте другую вкладку игры перед восстановлением');return false}const checked=parseSave(JSON.stringify(incoming),true);if(!checked){get().notice('Некорректное сохранение');return false}if(!get().recoveryRequired&&!writable())return false;checked.progression=migrateProgression(checked,get().p.progression);resumeAfterPanel=false;encounterPause?.();try{localStorage.setItem(SAVE_KEY+':before-import',get().recoveryRequired?unreadableSave():exportSave())}catch{get().notice('Не удалось создать резервную копию · импорт отменён');return false}const raw=JSON.stringify(checked);try{localStorage.setItem(SAVE_KEY,raw)}catch{get().notice('Не удалось записать сохранение · импорт отменён');return false}observeLootSave(raw,true);observedRaw=raw;observedPlayer=checked;set({recoveryRequired:false,storageError:false,p:checked,auto:checked.preferences?.auto??true,speed:checked.preferences?.speed??1,stopOnDeath:checked.preferences?.stopOnDeath??true,continueOnVictory:checked.preferences?.continueOnVictory??true,autoSalvageWeaker:checked.preferences?.autoSalvageWeaker??false,selected:null});encounterRestore?.();get().notice('Импорт завершён · копия сохранена');return true},
 upgrade:(slot,expected)=>{const g=get(),i=g.p.equipment[slot];if(!i||expected&&(i.id!==expected.id||i.upgrade!==expected.upgrade))return;const plan=upgradePreview(i);if(!Number.isFinite(plan.cost)||g.p.gold<plan.cost){g.notice('Недостаточно золота');return}if(!g.mutate(p=>{p.gold-=plan.cost;p.equipment[slot]=plan.next;bumpCount(p,'upgrade')})){unsaved(get());return}g.notice('Усиление успешно!')},
 train:(type,index=0)=>{const g=get();if(!['forge','blessing','companion','skill','relic','talent'].includes(type))return false;if((type==='skill'||type==='talent')&&(!Number.isInteger(index)||index<0||index>2))return false;let cost=0;const p=g.p;if(type==='forge')cost=100*p.forge;else if(type==='blessing'){if(!blessingCanImprove(p.blessing)){g.notice('Максимум бонусов');return false}cost=150*p.blessing;}else if(type==='companion'){if(index!==0&&index!==1)return false;if(p.companions[index]>=FOLLOWER_MAX_LEVEL){g.notice('Достигнут предел уровня');return false}cost=120*p.companions[index]}else if(type==='skill'){if(index===1&&p.skills[index]>=odinCallMaxLevel){g.notice('Клич достиг предела');return false}cost=120*p.skills[index]}else if(type==='relic')cost=300*(p.relic+1);else if(type==='talent')cost=0;if(type==='talent'&&p.talents.reduce((a,b)=>a+b,0)>=p.level-1){g.notice('Нужно новое очко: повышайте уровень героя');return false}if(p.gold<cost){g.notice('Недостаточно золота');return false}if(!g.mutate(p=>{p.gold-=cost;if(type==='forge')p.forge++;if(type==='blessing')p.blessing++;if(type==='companion'&&raiseFollowerLevel(p,followerId(index===0?'goose_aviator':'brown_white_dog')))bumpCount(p,'carnival:companion');if(type==='skill'){p.skills[index]++;bumpCount(p,'carnival:skill')}if(type==='talent')p.talents[index]++;if(type==='relic')p.relic++})){unsaved(get());return false}haptic(true);g.notice('Уровень повышен');return true},
 claim:(id,expected)=>{const g=get(),p=g.p;let ok=true;const now=Date.now();if(id==='pending'){g.claimStored();return}if(id==='daily'||id.startsWith('season:')){
  if(id==='daily'&&p.daily===new Date(now).toISOString().slice(0,10)){g.notice('Награда уже получена. Возвращайтесь завтра');return}
  let reward:Reward|null=null;
  if(!g.mutate(draft=>{
   if(id==='daily'){const r=claimDailyGift(draft,now);if(r)reward=combineRewards([r.main,r.extra])}
   else reward=claimSeason(draft,id,now);
   return reward!==null;
  },true)){if(get().storageError)unsaved(get());return}
  if(reward){haptic(true);g.notice('Получено',reward)}return;
 }else if(id==='mission'){
  const mission=expected??p.mission;
  if(p.mission!==mission)return;
  if(p.bosses<=mission){g.notice('Победите следующего босса главы');return}
  if(!g.mutate(draft=>{
   if(draft.mission!==mission||draft.bosses<=mission)return false;
   draft.mission++;
   grant(draft,chapterReward,now);
  },true)){if(get().storageError)unsaved(get());return}
  haptic(true);g.notice('Получено · '+stageLabel(mission+1),chapterReward);return;
 }else if(id==='wings'){if(p.claimed.includes(id))return;if(p.equipment.wings&&p.inventory.length>=balance.loot_test_settings.starter_inventory_capacity){g.notice('Освободите место для прежних крыльев');return}ok=g.mutate(p=>{p.claimed.push(id);if(p.equipment.wings)p.inventory.push(p.equipment.wings);p.equipment.wings=makeItem('wings',1,3)})}else if(id==='mine'){const elapsed=Math.min(balance.resource_test_settings.offline_accrual_limit_hours*3600,Math.max(0,(Date.now()-p.mineAt)/1000));if(elapsed<balance.resource_test_settings.mine_collect_cooldown_seconds){g.notice(`Шахтёры работают · сбор через ${Math.ceil((balance.resource_test_settings.mine_collect_cooldown_seconds-elapsed)/60)} мин`);return}ok=g.mutate(p=>{p.gold+=Math.floor(elapsed*2);p.chaosite+=Math.floor(elapsed/60);p.mineAt=Date.now()})}else return;if(!ok){unsaved(get());return}haptic(true);g.notice('Награда получена!')},
 shipAction:(action,id)=>{const g=get(),now=Date.now(),p=g.p,s=p.shipyard??starterShipyard(now);
  if(action==='claim'){
   const n=shipClaimable(s,now);if(n<=0){g.notice('Корабли продолжают добычу');return}
   if((p.redDiamonds??0)+n>1_000_000_000){g.notice('Достигнут лимит алмазов');return}
   if(g.mutate(q=>{claimShips(q,now)})){haptic(true);g.notice('Собрано '+n+' красных алмазов')}
   return;
  }
  if(action==='trade'){
   const price=SHIP_RULES.sealPrice;if(performance.now()-lastSealTrade<600)return;
   if((p.redDiamonds??0)<price){g.notice(`Нужно ${price} красных алмазов · корабли добывают их в походе`);return}
   if(g.mutate(q=>{q.redDiamonds=(q.redDiamonds??0)-price;addRes(q,'seal',1)})){lastSealTrade=performance.now();haptic(true);g.notice('Печать призыва получена · призыв в окне «Спутники»')}
   return;
  }
  if(action==='buy'){
   const cost=shipBuyCost(s.ships.length);
   if(cost===null){g.notice('Все корабельные места заняты');return}
   if(p.gold<cost){g.notice('Нужно '+cost+' золота');return}
   if(g.mutate(q=>{buyShip(q,now)})){haptic(true);g.notice('Драккар построен')}
   return;
  }
  const boat=s.ships.find(x=>x.id===id),cost=boat?shipUpgradeCost(boat.level):null;
  if(!boat){g.notice('Корабль не найден');return}
  if(cost===null){g.notice('Максимальный уровень корабля');return}
  if(p.gold<cost){g.notice('Нужно '+cost+' золота');return}
  if(g.mutate(q=>{upgradeShip(q,id!,now)})){haptic(true);g.notice('Корабль улучшен')}
 },
 buy:(id,quote,equipmentSlot)=>{
  const g=get(),now=Date.now(),offer=shopOffers(g.p,now,equipmentSlot).find(o=>o.id===id);
  if(!offer||shopSold(g.p,offer,now))return false;
  if(!realmSessionWritable()){g.notice('Герой открыт в другой вкладке · продолжите там');return false}
  if(id==='horn'&&performance.now()-lastHornPurchase<350)return false;
  const status=shopStatus(g.p,offer,now);
  if(status){g.notice(status);return false}
  if(quote!==undefined&&quote!==shopQuote(offer)){g.notice('Предложение обновилось · проверьте количество и цену');return false}
  if(offer.equipment&&(equipmentSlot!==offer.equipment.slot||quote===undefined||!mayStartLoot()))return false;
  let title=rewardText(offer.reward);
  if(!g.mutate(p=>{
   applyPurchase(p,offer,now);
   if(offer.equipment){
    const item=makeItem(offer.equipment.slot,offer.equipment.level,1);
    item.origin='Покупка в Лавке сокровищ';
    item.salvageGoldCap=salvageYield(item).gold;
    addLoot(p,item);
    title=item.name;
   }
  })){unsaved(get());return false}
  if(id==='horn')lastHornPurchase=performance.now();
  haptic(true);g.notice('Получено: '+title);return true;
 },
 win:(mode,encounterId,snapshot,tally,onHammerPaid)=>{const g=get(),now=Date.now();let extra='';if(mode==='darkness'){const run=realmRun(g.p);if(!run||encounterId&&run.lastCombatId===encounterId)return false;let won=false;return g.mutate(p=>{won=realmVictory(p,encounterId,snapshot?.units.length??1);if(won)soloVictory(p,carnivalNow())})&&won;}if(encounterId&&(g.p.lastBattleReward===encounterId||g.p.claimed.includes('battle:'+encounterId)))return false;let loot:Item|undefined,disposition:ReturnType<typeof placeLoot>|undefined,hammerGold=0;
  if(!g.mutate(p=>{const goldBefore=p.gold;
   if(encounterId&&p.encounter?.id===encounterId&&snapshot?.id===encounterId&&snapshot.mode===mode&&snapshot.stage===p.stage&&snapshot.wave===p.wave&&
    snapshot.phase==='victory'&&snapshot.rewarded&&snapshot.units.every(unit=>unit.hp<=0)&&validEncounter(snapshot)){
    hammerGold=hammerVictoryGold(mode,p.stage,p.wave===5,snapshot.hammerKills??0);
   }
   p.gold+=hammerGold;
   if(tally)for(const [key,amount] of Object.entries(tally))if(Number.isFinite(amount)&&amount>0)bumpCount(p,key,amount);if(encounterId){p.lastBattleReward=encounterId;p.claimed.push('battle:'+encounterId);trimBattleReceipts(p)}if(snapshot){p.encounter=snapshot;markSeen(p,snapshot.units.map(u=>u.id));for(const u of snapshot.units)bumpCount(p,'kill:'+u.id)}bumpCount(p,'win:'+mode);soloVictory(p,carnivalNow());bumpCount(p,'cls:'+p.heroClass);p.kills++;if(mode==='campaign'){const boss=p.wave===5,bossReward=boss?campaignBossReward(p,now):undefined;
    if(bossReward){grant(p,bossReward,now);if(!bossReward.horn)grantHorn(p,0,now);bossReward.gold=(bossReward.gold??0)+hammerGold}
    else{
     p.gold+=campaignGold(p,false);xp(p,stageXp(p.stage,false));
     if(Math.random()<dropRules.materialWave*(branchOf(p,0)===1?1.5:1))grantMaterial(p,materialIds[regionIndex(p.stage)%6],1);
    }
    const finale=boss&&stageInRegion(p.stage)===10;
    if(boss){p.bosses++;const named=namedDrop(mode);loot=named?makeUnique(named,p.level,'Босс основной главы · этап '+p.stage):rollItem(p,undefined,dropRules.setChanceBoss);
    // Region finale: the first victory always gives the region's named trophy (or a guaranteed set piece in region 1).
    if(finale){const region=regionIndex(p.stage)%6,perk=([undefined,'cutlass','crown','echo','aquila','heart'] as (PerkId|undefined)[])[region],first=setFlag(p,'finale:'+regionIndex(p.stage));if(perk&&(setFlag(p,'perk:'+perk)||!first&&Math.random()<dropRules.legendFinalePerk))loot=makePerkItem(perk,p.level+2,'Трофей владыки · '+perks[perk].source);else if(first&&!perk){loot=asSetItem(makeItem('armor',p.level+2,4),'frost');loot.origin='Трофей Королевы паутины'}if(p.stage===60)setFlag(p,'story:done')}
    if(guaranteedBossTrophy(p)){loot=makeItem('weapon',p.level+balance.first_chapter_test.boss_reward_level_bonus,balance.first_chapter_test.boss_reward_min_rarity);loot.name=firstBossTrophyName;loot.origin='Трофей Матриарха';loot.uniqueId='ice_silk';p.claimed.push('first-boss-relic')}loot.origin??='Босс основной главы · этап '+p.stage;disposition=placeLoot(p,loot);if(encounterId&&disposition!=='duplicate')p.rewardOffer={encounterId,itemId:loot.id,resolved:false,bossReward,hammerGold:hammerGold||undefined};p.stage++;p.wave=1}else{p.wave++;if(Math.random()<gearRules.regular_equipment_chance){loot=rollItem(p,undefined,dropRules.setChanceRegular);loot.origin='Встреча основной главы · этап '+p.stage;disposition=placeLoot(p,loot,true)}}}else if(mode==='farm'){p.gold+=Math.round(baseVictoryGold('farm',p.stage,false)*(1+p.talents[2]*.05)*goldBonus(p));if(Math.random()<.25)grantMaterial(p,materialIds[regionIndex(p.stage)%6],1);xp(p,Math.round(stageXp(p.stage,false)*.6))}else if(mode==='arena'){p.arenaWins++;p.tokens+=10;p.gold+=baseVictoryGold('arena',p.stage,false);xp(p,30);if(p.arenaWins%3===0)addRes(p,'seal',1)}else{if(mode==='dungeon'){if(snapshot?.units[0])noteLairWin(p,snapshot.units[0].id);addRes(p,'shard',2);if(Math.random()<.35){const gem=rollGem(),bag=gemBox(p).bag;bag[gem]=(bag[gem]??0)+1;extra='Камень: '+gemLabel(gem)}if(Math.random()<.1)addRes(p,'seal',1)}p.gold+=baseVictoryGold('dungeon',p.stage,false);p.gems+=5;xp(p,50);const keeper=mode==='dungeon'?snapshot?.units.map(u=>lairTrophy(u.id)).find(Boolean):undefined,trophy=keeper&&setFlag(p,'perk:'+keeper)?keeper:undefined,named=trophy?undefined:namedDrop(mode);loot=trophy?makePerkItem(trophy,p.level+2,'Трофей Логова · '+perks[trophy].source):named?makeUnique(named,p.level,mode==='dungeon'?'Логово мини-босса':'Босс Царства тьмы'):rollItem(p);loot.origin??=mode==='dungeon'?'Логово мини-босса':'Босс Царства тьмы';disposition=placeLoot(p,loot);if(encounterId&&disposition!=='duplicate')p.rewardOffer={encounterId,itemId:loot.id,resolved:false,hammerGold:hammerGold||undefined}}bumpCount(p,'carnival:battleGold',p.gold-goldBefore)}))return false;if(loot&&disposition&&disposition!=='duplicate'){
    const player=get().p,hasOffer=!!encounterId&&player.rewardOffer?.encounterId===encounterId;
    if(!hasOffer||disposition==='stored'||player.preferences?.autoSalvageWeaker)extra=lootNotice(player,loot,disposition,'Добыча: '+loot.name);
   }
   if(hammerGold)extra=`${extra||'Победа'} · руна Молота +${hammerGold.toLocaleString('ru')} золота`;
   if(extra)g.notice(extra);
   if(hammerGold)onHammerPaid?.(hammerGold);
   return true;
 },
 setClass:heroClass=>{if(!get().mutate(p=>{p.heroClass=heroClass})){unsaved(get());return}get().notice('Класс изменён · боевые бонусы применены')}
 };
});
export function exportSave(){return JSON.stringify({...useGame.getState().p,preferences:{auto:useGame.getState().auto,speed:useGame.getState().speed as 1|2,stopOnDeath:useGame.getState().stopOnDeath,continueOnVictory:useGame.getState().continueOnVictory,autoSalvageWeaker:useGame.getState().autoSalvageWeaker},...(encounterProvider?{encounter:encounterProvider()}:{})})}
const cloudReceiptKey=SAVE_KEY+':cloud-base';
let checkingCloud=false;
/** One warning per failure streak; cleared only by a confirmed upload. */
let cloudWarned=false;

export function isKnownCloud(raw:string){return localStorage.getItem(cloudReceiptKey)===raw}

export function acknowledgeCloud(raw:string){
 try{localStorage.setItem(cloudReceiptKey,raw)}catch{ /* Existing cloud copy stays protected. */ }
}

export async function backupCloud(){
 if(!telegramProfile||checkingCloud||!realmSessionWritable()||useGame.getState().recoveryRequired)return;
 checkingCloud=true;
 try{
  const current=localStorage.getItem(SAVE_KEY);
  if(!current||isKnownCloud(current))return;
  const latest=await readCloud();
  if(latest.status==='unavailable'||useGame.getState().recoveryRequired)return;
  const raw=localStorage.getItem(SAVE_KEY);
  if(!raw||!parseSave(raw,true))return;
  if(latest.status==='found'&&latest.raw!==raw&&!isKnownCloud(latest.raw))return;
  if(latest.status==='found'&&latest.raw===raw){acknowledgeCloud(raw);return}
  const confirmed=()=>{
   acknowledgeCloud(raw);
   if(cloudWarned){cloudWarned=false;useGame.getState().notice('Копия Telegram снова обновлена')}
  };
  await new Promise<void>(resolve=>void cloudSave(raw,(ok,reason)=>{
   if(ok)confirmed();
   else if(reason!=='superseded'&&!cloudWarned){cloudWarned=true;useGame.getState().notice(reason==='too-large'?'Копия Telegram не обновлена: сохранение слишком большое · прогресс сохранён на устройстве, прежняя копия цела':'Копия Telegram не обновлена · прогресс сохранён на устройстве, прежняя копия цела · повторим автоматически')}
   resolve();
  },confirmed));
 }catch{ /* No upload when local storage is unavailable. */ }finally{checkingCloud=false}
}
export function claimCarnivalReward(periodId:string,rewardId:string,slot?:Slot):CarnivalClaimResult{
 const game=useGame.getState();
 const claim=prepareCarnivalClaim(game.p,periodId,rewardId,slot,Date.now());
 if(claim.status!=='payable')return claim;
 let result:CarnivalClaimResult={status:'save_failed'};
 if(!game.mutate(p=>{result=claim.apply(p)}))return {status:'save_failed'};
 haptic(true);
 return result;
}
/** CP change if the item is worn. `stats` only reads, so a shallow copy is enough and stays cheap for 80 tiles. */
export function compareItem(item:Item,p:Player,base=stats(p).cp){return stats({...p,equipment:{...p.equipment,[item.slot]:item}}).cp-base}
/** Strongest backpack piece for a slot, if it beats what is worn. Equipped named items (effects outside CP) are left to the player. */
export function bestUpgrade(p:Player,slot:Slot,keepNamed=false,base=stats(p).cp){const worn=p.equipment[slot];if(keepNamed&&worn&&(uniqueOf(worn)||worn.perk))return undefined;let item:Item|undefined,gain=0;for(const i of p.inventory){if(i.slot!==slot)continue;const d=compareItem(i,p,base);if(d>gain){gain=d;item=i}}return item?{slot,item,gain}:undefined}
export function bestUpgrades(p:Player){const base=stats(p).cp;return slots.flatMap(slot=>{const b=bestUpgrade(p,slot,true,base);return b?[b]:[]})}

export function claimRealmReward(){let done=false;const ok=useGame.getState().mutate(p=>{const ess=resCount(p,'ess'),gold=p.gold;done=realmClaim(p,{xp:n=>xp(p,n),trophies:(floor,first)=>{const out:string[]=[],named=namedDrop('darkness');if(named){const u=makeUnique(named,p.level,'Владыка Царства тьмы · этаж '+floor);addLoot(p,u);out.push(u.name)}for(const [at,perk] of [[10,'void'],[20,'duskwings']] as [number,PerkId][])if(first&&floor===at&&setFlag(p,'perk:'+perk)){const t=makePerkItem(perk,p.level+2,'Трофей Царства тьмы · этаж '+floor);addLoot(p,t);out.push(t.name)}return out}});if(done){bumpCount(p,'carnival:realmEss',resCount(p,'ess')-ess);bumpCount(p,'carnival:battleGold',p.gold-gold)}});return ok&&done}

function followProfileSave(raw:string){
 const incoming=parseSave(raw,true);if(!incoming)return false;
 incoming.progression=migrateProgression(incoming,useGame.getState().p.progression);
 observeLootSave(raw,true);observedRaw=raw;observedPlayer=incoming;
 useGame.setState({p:incoming});encounterRestore?.();
 return true;
}

// Ignore queued notifications after a later commit, including during lock handover.
if(typeof window!=='undefined')window.addEventListener('storage',event=>{
 if(event.key!==SAVE_KEY||!event.newValue||event.newValue===observedRaw)return;
 if(realmSessionWritable()&&!event.newValue.includes('"carnival"'))return;
 try{if(localStorage.getItem(SAVE_KEY)===event.newValue)followProfileSave(event.newValue)}catch{/* A blocked read leaves the last valid profile intact. */}
});

export function raidLair(id:string,expected:number,now=carnivalNow()){
 const g=useGame.getState();
 if(!mayStartLoot())return false;
 const ok=g.mutate(p=>{
  if(!payRaid(p,id,expected,now))return false;
  grant(p,lairRules.raidReward);
  const loot=rollItem(p);
  loot.origin='Дневной рейд Логова';
  addLoot(p,loot);
  bumpCount(p,'lair:raid');
  return true;
 },true);
 if(ok){haptic(true);g.notice('Рейд завершён · добыча в рюкзаке или на хранении')}
 return ok;
}
