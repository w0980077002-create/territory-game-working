/**
 * Player actions of the dark systems. Each one validates on the live save, then changes it in ONE store
 * mutation (re-validated inside), so a double tap, a reload or two tabs can never pay or grant twice.
 */
import {useGame} from '../core/store';
import type {Player,Slot} from '../core/types';
import {battle} from '../game/Battle';
import {haptic} from '../core/telegram';
import {matKey,matCount,materials} from '../saga/gear';
import {bumpCount} from '../saga/save';
import {realmRun,realmBox,realmDefeat,blessingIds,REALM_COST,emptyTotals,type BlessingId} from './realm';
import {resCount,addRes,duskCount,addDusk,darkState,darkBox,darkUpgradeCost,darkMaxUpgrade,darkSalvageValue,darkName,DARK_STORAGE,
 gemState,gemBox,parseGem,gemCode,gemSynthGold,gemSlots,socketOpen,rollGem,gemLabel,GEM_MAX,GEM_SHOP_PRICE,
 relics,relicLevel,relicUnlockCost,relicUpgradeCost,RELIC_MAX,type RelicId,
 companions,squadState,squadBox,legacyPet,starCost,STAR_MAX,AWAKEN,talentPoints,talentSpent,TALENT_MAX,rollSummon,SUMMON,resources} from './rules';
const G=()=>useGame.getState();
const fail=(text:string)=>{G().notice(text);return false};
/** Validate → mutate (validated again on the fresh clone) → report. */
function tx(check:(p:Player)=>string|null,apply:(p:Player)=>void,ok?:string){
 const error=check(G().p);if(error)return fail(error);let done=false;
 if(!G().mutate(p=>{if(check(p))return;apply(p);done=true})||!done)return fail('Не удалось сохранить · попробуйте ещё раз');
 haptic(true);if(ok)G().notice(ok);return true;
}
// ── Dark Realm ──
export function realmSelect(floor:number){if(!Number.isInteger(floor)||floor<1||floor>G().p.darkFloor)return false;return G().mutate(p=>{realmBox(p).sel=floor})}
const trophyWaiting=(p:Player)=>p.rewardOffer&&!p.rewardOffer.resolved?'Сначала разберите трофей босса':null;
export function realmStart(floor:number,blessing:BlessingId){
 if(!battle)return false;
 const ok=tx(p=>trophyWaiting(p)??(realmRun(p)?'Поход во Тьму уже идёт':!Number.isInteger(floor)||floor<1||floor>p.darkFloor?'Этот этаж ещё закрыт':!blessingIds.includes(blessing)?'Выберите благословение':p.chaosite<REALM_COST?`Нужно ${REALM_COST} Хаосита`:null),
  p=>{p.chaosite-=REALM_COST;const box=realmBox(p);box.run={f:floor,r:1,b:blessing,acc:emptyTotals()};box.sel=floor;delete box.last;bumpCount(p,'realm:run')});
 if(ok)battle.enterRealm();return ok;
}
/** Returns to a run that was interrupted by another mode. Free: the entry was paid at the start. */
export function realmResume(){const p=G().p;if(!battle||!realmRun(p))return false;const wait=trophyWaiting(p);if(wait)return fail(wait);battle.enterRealm();return true}
export function realmAbandon(){if(battle?.mode==='darkness')battle.leaveRealm();return tx(p=>realmRun(p)?null:'Поход уже завершён',p=>{realmDefeat(p)},'Поход завершён · добытое сохранено')}
// ── Dark Energy ──
const findDark=(p:Player,id:string)=>{const s=darkState(p);return s.inv.find(i=>i.id===id)??s.eq.find(i=>i?.id===id)??undefined};
export function darkEquip(id:string){return tx(p=>darkState(p).inv.some(i=>i.id===id)?null:'Предмет не найден на складе',p=>{const box=darkBox(p),at=box.inv.findIndex(i=>i.id===id),[item]=box.inv.splice(at,1),old=box.eq[item.s];box.eq[item.s]=item;if(old)box.inv.push(old)},'Надето · характеристики обновлены')}
export function darkUnequip(slot:number){return tx(p=>{const s=darkState(p);return !s.eq[slot]?'Слот пуст':s.inv.length>=DARK_STORAGE?'Склад Тьмы полон':null},p=>{const box=darkBox(p);box.inv.push(box.eq[slot]!);box.eq[slot]=null},'Снято на склад')}
export function darkUpgrade(id:string){
 const cost=(p:Player)=>{const i=findDark(p,id);return i?darkUpgradeCost(i):undefined};
 return tx(p=>{const i=findDark(p,id),c=cost(p);return !i||!c?'Предмет не найден':i.u>=darkMaxUpgrade(i.r)?'Достигнут предел усиления':resCount(p,'ess')<c.ess?`Нужно ${c.ess} Тёмной эссенции`:p.gold<c.gold?'Недостаточно золота':duskCount(p)<c.dusk?'Нужен Камень Сумрака':null},
  p=>{const box=darkBox(p),item=box.inv.find(i=>i.id===id)??box.eq.find(i=>i?.id===id)!,c=darkUpgradeCost(item);addRes(p,'ess',-c.ess);p.gold-=c.gold;if(c.dusk)addDusk(p,-c.dusk);item.u++;bumpCount(p,'dark:upgrade')},'Усиление успешно!');
}
/** Affordable one-level upgrades across the 12 worn Dark Energy slots, in slot order.
 * Preview and transaction use the same plan; missing resources simply leave later slots unchanged.
 */
export function darkEquippedUpgradePlan(p:Player){
 let essence=resCount(p,'ess'),gold=p.gold,dusk=duskCount(p);
 const ids:string[]=[];let spentEss=0,spentGold=0,spentDusk=0;
 for(const i of darkState(p).eq){
  if(!i||i.u>=darkMaxUpgrade(i.r))continue;
  const c=darkUpgradeCost(i);
  if(essence<c.ess||gold<c.gold||dusk<c.dusk)continue;
  ids.push(i.id);essence-=c.ess;gold-=c.gold;dusk-=c.dusk;
  spentEss+=c.ess;spentGold+=c.gold;spentDusk+=c.dusk;
 }
 return {ids,count:ids.length,ess:spentEss,gold:spentGold,dusk:spentDusk};
}
/** One press = at most one level per equipped item and one persisted wallet transaction. */
export function darkUpgradeEquipped(){
 let upgraded=0;
 const ok=tx(p=>darkEquippedUpgradePlan(p).count?null:'Нет доступных усилений: проверьте материалы и уровни предметов',
  p=>{
   const plan=darkEquippedUpgradePlan(p),box=darkBox(p),chosen=new Set(plan.ids);
   for(const i of box.eq)if(i&&chosen.has(i.id))i.u++;
   addRes(p,'ess',-plan.ess);p.gold-=plan.gold;if(plan.dusk)addDusk(p,-plan.dusk);
   upgraded=plan.count;bumpCount(p,'dark:upgrade',upgraded);
  });
 if(ok)G().notice(`Усилено предметов Тёмной энергии: ${upgraded}`);
 return ok;
}
export function darkLock(id:string){return tx(p=>findDark(p,id)?null:'Предмет не найден',p=>{const box=darkBox(p),item=box.inv.find(i=>i.id===id)??box.eq.find(i=>i?.id===id)!;item.k=!item.k})}
export function darkSalvage(id:string){
 let gain=0;return tx(p=>{const i=darkState(p).inv.find(x=>x.id===id);return !i?'Разобрать можно только предмет со склада':i.k?'Предмет защищён · сначала снимите замок':null},
  p=>{const box=darkBox(p),at=box.inv.findIndex(i=>i.id===id),[item]=box.inv.splice(at,1);gain=darkSalvageValue(item);addRes(p,'ess',gain)})&&(G().notice(`Разобрано · +${gain} Тёмной эссенции`),true);
}
/** Bulk clean-up: only unlocked, never upgraded items up to the chosen rarity. */
export const darkBulkList=(p:Player,maxRarity:number)=>darkState(p).inv.filter(i=>!i.k&&i.u===0&&i.r<=maxRarity);
export function darkSalvageMany(maxRarity:number){
 let gain=0,n=0;return tx(p=>darkBulkList(p,maxRarity).length?null:'Нет подходящих предметов для разбора',
  p=>{const ids=new Set(darkBulkList(p,maxRarity).map(i=>i.id)),box=darkBox(p);for(const i of box.inv)if(ids.has(i.id)){gain+=darkSalvageValue(i);n++}box.inv=box.inv.filter(i=>!ids.has(i.id));addRes(p,'ess',gain)})&&(G().notice(`Разобрано ${n} · +${gain} Тёмной эссенции`),true);
}
// ── Gems ──
export function gemInsert(slot:Slot,index:number,code:string){
 return tx(p=>{const g=parseGem(code),s=gemState(p);return !g||!gemSlots.includes(slot)||index<0||index>2?'Камень не найден':!socketOpen(p,index)?'Гнездо ещё закрыто':!(s.bag[code]>0)?'Такого камня нет в запасе':s.sock[slot].some((c,i)=>i!==index&&parseGem(c)?.type===g.type)?'В этом предмете уже есть камень такого цвета':null},
  p=>{const box=gemBox(p),old=box.sock[slot][index];box.bag[code]--;if(!box.bag[code])delete box.bag[code];if(old)box.bag[old]=(box.bag[old]??0)+1;box.sock[slot][index]=code;bumpCount(p,'gem:set')},'Камень вставлен · бонус действует');
}
export function gemRemove(slot:Slot,index:number){return tx(p=>gemState(p).sock[slot]?.[index]?null:'Гнездо пустое',p=>{const box=gemBox(p),old=box.sock[slot][index]!;box.bag[old]=(box.bag[old]??0)+1;box.sock[slot][index]=null},'Камень возвращён в запас')}
export function gemSynth(code:string){
 const g=parseGem(code);if(!g)return false;const next=gemCode(g.type,g.level+1);
 return tx(p=>g.level>=GEM_MAX?'Это высший уровень камня':(gemState(p).bag[code]??0)<3?'Нужно три одинаковых камня':p.gold<gemSynthGold(g.level)?'Недостаточно золота':null,
  p=>{const bag=gemBox(p).bag;bag[code]-=3;if(!bag[code])delete bag[code];bag[next]=(bag[next]??0)+1;p.gold-=gemSynthGold(g.level);bumpCount(p,'gem:synth')},`Синтез: ${gemLabel(next)}`);
}
/** Merges every full triple it can afford, lowest levels first. */
export function gemSynthAll(){
 let made=0;return tx(p=>Object.entries(gemState(p).bag).some(([code,n])=>{const g=parseGem(code)!;return n>=3&&g.level<GEM_MAX&&p.gold>=gemSynthGold(g.level)})?null:'Нет трёх одинаковых камней или не хватает золота',
  p=>{const bag=gemBox(p).bag;for(let level=1;level<GEM_MAX;level++)for(const code of Object.keys(bag)){const g=parseGem(code)!;if(g.level!==level)continue;while((bag[code]??0)>=3&&p.gold>=gemSynthGold(level)){bag[code]-=3;const next=gemCode(g.type,level+1);bag[next]=(bag[next]??0)+1;p.gold-=gemSynthGold(level);made++}if(!bag[code])delete bag[code]}bumpCount(p,'gem:synth',made)})&&(G().notice(`Синтезировано камней: ${made}`),true);
}
export function gemBuy(){let code='';return tx(p=>p.gems<GEM_SHOP_PRICE?'Недостаточно самоцветов':null,p=>{p.gems-=GEM_SHOP_PRICE;code=rollGem();const bag=gemBox(p).bag;bag[code]=(bag[code]??0)+1})&&(G().notice(`Получен камень: ${gemLabel(code)}`),true)}
// ── Relics ──
export function relicUnlock(id:RelicId){
 if(id==='heart'||!Object.hasOwn(relics,id))return false;const c=relicUnlockCost(id);
 return tx(p=>relicLevel(p,id)>0?'Реликвия уже открыта':!relics[id].need(p).ok?'Условие ещё не выполнено':resCount(p,'shard')<c.shard?`Нужно ${c.shard} осколков реликвий`:p.gold<c.gold?'Недостаточно золота':null,
  p=>{addRes(p,'shard',-c.shard);p.gold-=c.gold;const box=relicBoxOf(p);box.lv[id]=1;bumpCount(p,'relic:open')},`${relics[id].name} — реликвия открыта!`);
}
function relicBoxOf(p:Player){const lv:Record<string,number>={};for(const id of Object.keys(relics) as RelicId[])if(id!=='heart'&&relicLevel(p,id)>0)lv[id]=relicLevel(p,id);p.saga??={v:1,seen:[],trophies:[],n:{},flags:[],box:{}};p.saga.box.relics={lv};return p.saga.box.relics as {lv:Record<string,number>}}
export function relicUpgrade(id:RelicId){
 if(id==='heart'){G().train('relic');return true}
 return tx(p=>{const lv=relicLevel(p,id),c=relicUpgradeCost(id,lv);return lv<=0?'Сначала откройте реликвию':lv>=RELIC_MAX?'Реликвия на высшем уровне':resCount(p,'shard')<c.shard?`Нужно ${c.shard} осколков реликвий`:p.gold<c.gold?'Недостаточно золота':matCount(p,c.material)<c.mats?`Нужно ${c.mats} × ${materials[c.material].name}`:null},
  p=>{const lv=relicLevel(p,id),c=relicUpgradeCost(id,lv);addRes(p,'shard',-c.shard);p.gold-=c.gold;if(c.mats)p.saga!.n[matKey(c.material)]=matCount(p,c.material)-c.mats;relicBoxOf(p).lv[id]=lv+1;bumpCount(p,'relic:up')},'Реликвия усилена');
}
// ── Companions ──
export interface SummonResult {id:string;shards:number;unlocked:boolean}
export function summon(times:1|10,pay:'seal'|'gems'){
 const cost=pay==='seal'?SUMMON.seal*times:SUMMON.gems*times,results:SummonResult[]=[];
 const ok=tx(p=>pay==='seal'?resCount(p,'seal')<cost?`Нужно ${cost} × ${resources.seal.name}`:null:p.gems<cost?'Недостаточно самоцветов':null,
  p=>{if(pay==='seal')addRes(p,'seal',-cost);else p.gems-=cost;const box=squadBox(p);
   for(let n=0;n<times;n++){const roll=rollSummon(),pet=box.own[roll.id],def=companions[roll.id];pet.sh+=roll.shards;let unlocked=false;if(pet.lv<=0&&pet.sh>=def.shards){pet.sh-=def.shards;pet.lv=1;unlocked=true}results.push({...roll,unlocked})}
   bumpCount(p,'summon',times)});
 return ok?results:null;
}
const owned=(p:Player,id:string)=>Object.hasOwn(companions,id)&&squadState(p).own[id].lv>0;
export const petLevelCost=(level:number)=>120*level;
export function petLevel(id:string){
 return tx(p=>!owned(p,id)?'Спутник ещё не призван':p.gold<petLevelCost(squadState(p).own[id].lv)?'Недостаточно золота':null,
  p=>{const legacy=legacyPet(id),level=squadState(p).own[id].lv;p.gold-=petLevelCost(level);if(legacy>=0)p.companions[legacy]++;else squadBox(p).own[id].lv=level+1},'Уровень спутника повышен');
}
export function petStar(id:string){
 return tx(p=>{if(!owned(p,id))return 'Спутник ещё не призван';const pet=squadState(p).own[id];return pet.st>=STAR_MAX?'Достигнуто 5 звёзд':pet.sh<starCost[pet.st]?`Нужно ${starCost[pet.st]} осколков спутника`:null},
  p=>{const pet=squadBox(p).own[id];pet.sh-=starCost[pet.st];pet.st++;bumpCount(p,'pet:star')},'Звезда получена · спутник стал сильнее');
}
export function petAwaken(id:string){
 return tx(p=>{if(!owned(p,id))return 'Спутник ещё не призван';const pet=squadState(p).own[id];return pet.aw?'Спутник уже пробуждён':pet.st<AWAKEN.stars?`Нужно ${AWAKEN.stars} звезды`:pet.lv<AWAKEN.level?`Нужен ${AWAKEN.level} уровень спутника`:duskCount(p)<AWAKEN.dusk?`Нужно ${AWAKEN.dusk} × Камень Сумрака`:p.gold<AWAKEN.gold?'Недостаточно золота':null},
  p=>{addDusk(p,-AWAKEN.dusk);p.gold-=AWAKEN.gold;squadBox(p).own[id].aw=true;bumpCount(p,'pet:awaken')},'Пробуждение свершилось!');
}
export function petTalent(id:string,index:number){
 return tx(p=>{if(!owned(p,id)||index<0||index>2)return 'Спутник ещё не призван';const pet=squadState(p).own[id];return pet.t[index]>=TALENT_MAX?'Талант изучен полностью':talentSpent(pet)>=talentPoints(pet)?'Нет свободных очков · очко за каждые 5 уровней':null},p=>{squadBox(p).own[id].t[index]++});
}
export function petTalentReset(id:string){return tx(p=>!owned(p,id)||!talentSpent(squadState(p).own[id])?'Очки не распределены':p.gold<200?'Нужно 200 золота':null,p=>{p.gold-=200;squadBox(p).own[id].t=[0,0,0]},'Таланты сброшены')}
export function petActivate(id:string){
 return tx(p=>!owned(p,id)?'Спутник ещё не призван':squadState(p).act.includes(id)?'Спутник уже в строю':null,p=>{const box=squadBox(p);box.act[companions[id].role==='striker'?0:1]=id},`${companions[id]?.name??''} встаёт в строй`)&&(battle?.tuneTeam(),true);
}
export {darkName};
