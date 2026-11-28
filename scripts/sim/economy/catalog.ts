/** Extracts versioned definitions from gameplay and the Stars migration. No network. */
import {readFileSync, writeFileSync} from 'node:fs';
import {freshPlayer, makeItem, salvageYield} from '../../../src/core/store';
import {uniques, gearRules} from '../../../src/core/gear';
import {SHIP_RULES, shipBuyCost, shipUpgradeCost} from '../../../src/core/shipyard';
import {upgradePreview} from '../../../src/core/forge';
import {slots, slotNames, rarityNames, skillData} from '../../../src/data/catalog';
import {materials, materialIds, sets, perks, professions, engravings, dropRules} from '../../../src/saga/gear';
import {workshopRanks} from '../../../src/saga/professions';
import {craftPlan} from '../../../src/saga/actions';
import {runeRules, runeName, runeUpgradeCost} from '../../../src/saga/runes';
import {dailyVictoryRewards, soloResources, followerEconomy} from '../../../src/saga/soloEconomy';
import {dailyPool, weeklyPool, storyQuests, mastery, masteryTiers, masteryGems} from '../../../src/saga/quests';
import {shopOffers} from '../../../src/saga/shop';
import {carnivalDays, carnivalMilestones} from '../../../src/saga/carnivalRules';
import {eventSchedule} from '../../../src/saga/soloCalendar';
import {eventPrizes, seaBoard, fortuneBoard, fortuneExchange} from '../../../src/saga/soloEvents';
import {dailyGift, seasonTierReward} from '../../../src/saga/events';
import {wingLookList, gearEntries, collectionSteps, collectionReward} from '../../../src/saga/collections';
import {wingRules} from '../../../src/saga/soloProgress';
import {honorRanks} from '../../../src/saga/honor';
import {lairRules, lairTrials, lairTrophies} from '../../../src/saga/lair';
import {activityMilestones, activityReward} from '../../../src/saga/activity';
import {
  resources, gemTypes, gemValue, gemSynthGold, GEM_SHOP_PRICE, relics, relicUnlockCost, relicUpgradeCost,
  companions, darkRarity, darkSlots, darkMaxUpgrade, darkSalvageValue, darkUpgradeCost, darkEffects, relicRarity,
} from '../../../src/dark/rules';
import {offerOdds} from '../../../src/dark/followerMarket';
import {roomReward, ROOMS, REALM_COST} from '../../../src/dark/realm';
import {consumableRules, consumableIds, consumablePrice, consumableBattle} from '../../../src/arena/potion';
import {dropRarityOdds} from '../../../src/saga/blessingOdds';
import {stageGold,stageXp} from '../../../src/saga/regions';
import {previewMine} from '../../../src/core/mine';
import {heroTracks} from '../../../src/saga/soloProgress';
import balance from '../../../config/test-balance.v1.json';
import economy from '../../../config/solo-economy.v1.json';
import {starOffers, starsSource} from './stars';

type Row = {category:string;id:string;name:string;source:string;data:unknown};
const items: Row[] = [];
function add(category:string,id:string,name:string,source:string,data:unknown) {
  items.push({category,id,name,source,data});
}
const fixtureTime=Date.UTC(2026,0,1);
const start = {...freshPlayer(),hornAt:fixtureTime};
const sample = {...start,stage:61,level:25,darkFloor:20,bosses:60};
for (const [id, name, source] of [
  ['gold','Золото Solo','src/core/battleGold.ts'],
  ['gems','Самоцветы Solo','src/saga/rewards.ts'],
  ['tokens','Жетоны Арены Solo','src/core/store.ts'],
  ['chaosite','Хаосит Solo','src/core/mine.ts'],
  ['horn','Заряды Рога Solo','src/saga/shop.ts'],
  ['xp','Опыт героя','src/core/experience.ts'],
  ['redDiamonds','Красные алмазы (игровые)','src/core/shipyard.ts'],
]) {
  add('wallet.solo',id,name,source,{startingBalance:start[id as keyof typeof start],trade:false,withdrawal:false});
}
for (const id of ['gold','chaosite','tokens','gems','horn','rune_scrolls','summon_seals','relic_shards','paid_gems']) {
  add('wallet.server',id,id,'supabase/migrations/20261127141117_vvr_premium_gem_wallet.sql',
    {withdrawal:false,marketSettlement:id==='gold',sameAsSoloBalance:false});
}
for (const [id, def] of Object.entries(resources)) add('resource.dark',id,def.name,'src/dark/rules.ts',def);
for (const [id, def] of Object.entries(soloResources)) add('resource.solo',id,def.name,'src/saga/soloEconomy.ts',def);
for (const [id, def] of Object.entries(materials)) {
  add('material',id,def.name,'src/saga/gear.ts',{
    ...def,regional:materialIds.includes(id),exchange:materialIds.includes(id)?{input:3,output:1}:null,
  });
}
for (const [id, def] of Object.entries(sets)) {
  const key = id as keyof typeof sets;
  add('set',id,def.name,'src/saga/gear.ts; src/saga/actions.ts',
    {...def,regularCraftAtSample:craftPlan(key,sample),masterworkAtSample:craftPlan(key,sample,true)});
}
for (const [id, def] of Object.entries(perks)) add('item.perk',id,def.name,'src/saga/gear.ts',def);
for (const [id, def] of Object.entries(uniques)) {
  const modeOdds = Object.fromEntries(Object.entries(gearRules.drops).map(([mode, rows]) => [
    mode,rows.filter(row => JSON.stringify(row).includes('"'+id+'"')),
  ]));
  add('item.unique',id,def.name,'src/core/gear.ts',{...def,modeOdds});
}
for (const [id, def] of Object.entries(engravings)) add('engraving',id,def.name,'src/saga/gear.ts',def);
for (const slot of slots) {
  for (const [rarity,name] of rarityNames.entries()) {
    const record = {...makeItem(slot,25,rarity),id:slot+":"+rarity+":sample"};
    const {attack,hp,defense} = record;
    add('item.template',slot+':'+rarity,slotNames[slot]+' · '+name,'src/core/store.ts',{
      syntheticCatalogId:true,runtimeId:'instance.id',level:25,rarity,attack,hp,defense,
      upgrade:upgradePreview(record),salvageNaturalDrop:salvageYield(record),genericRandomRarityAtBlessing1:dropRarityOdds(1)[rarity],
    });
  }
}
for (const [id, def] of Object.entries(darkEffects)) {
  add('dark.effect',id,def.name,'src/dark/rules.ts',{values:def.values,description:def.values.map(def.text)});
}
for (const [slot,def] of darkSlots.entries()) {
  for (const [rarity,name] of darkRarity.entries()) {
    const record = {id:'sample',s:slot,r:rarity,l:20,u:0};
    add('item.dark',slot+':'+rarity,def.name+' · '+name,'src/dark/rules.ts',{
      syntheticCatalogId:true,level:20,rarity,...def,upgrade:darkUpgradeCost(record),maxUpgrade:darkMaxUpgrade(rarity),
      salvage:darkSalvageValue(record),
    });
  }
}
for (const [type,def] of Object.entries(gemTypes)) for (let level=1; level<=10; level++) {
  const key=type as keyof typeof gemTypes;
  add('socket.gem',type+':'+level,def.name+' '+level,'src/dark/rules.ts',{
    ...def,level,bonus:gemValue(key,level),randomTypeChance:1/6,
    level1ShopRandomPrice:GEM_SHOP_PRICE,nextLevelInputs:level<10?{copies:3,gold:gemSynthGold(level)}:null,
  });
}
for (const [id, def] of Object.entries(relics)) {
  const key = id as keyof typeof relics;
  add('relic',id,def.name,'src/dark/rules.ts; src/core/progression.ts',{
    rarity:relicRarity[def.rarity],material:def.material,passive:def.passive,
    unlock:id==='heart'?null:relicUnlockCost(key),
    upgrade:id==='heart'?'300 * (level+1) gold':Array.from({length:9},(_,level)=>relicUpgradeCost(key,level+1)),
    unlockAtStart:def.need(start),abilityAt1:def.ability(1,start),
  });
}
for (const [id, def] of Object.entries(companions)) {
  add('follower',id,def.name,'src/dark/rules.ts; src/dark/followerMarket.ts',
    {...def,souls:followerEconomy.prices[def.rarity],levelCost:'120 * currentLevel gold',offerOdds:[0,1,2].map(slot=>offerOdds(slot))});
}
for (const def of professions) add('profession',def.id,def.name,'src/saga/professions.ts',{...def,ranks:workshopRanks});
for (let i=0;i<9;i++) {
  add('rune',String(i),runeName(i),'src/saga/runes.ts',{
    rankOneRandomOdds:1/9,rule:skillData[Math.floor(i/3)].runes[i%3],summonScrolls:runeRules.summon,
    upgrades:runeRules.rankCosts.map((_,rank)=>runeUpgradeCost(rank,0)),
  });
}
for (const id of consumableIds) {
  add('consumable',id,consumableRules[id].name,'src/arena/potion.ts',{
    ...consumableRules[id],pricesGold:Object.fromEntries([1,10,30,60,100].map(stage=>[stage,consumablePrice(id,stage)])),
  });
}
for (const offer of shopOffers(sample,fixtureTime)) add('shop',offer.id,offer.name,'src/saga/shop.ts',offer);
for (const offer of starOffers) add('stars',offer.id,offer.name,starsSource,offer);
add('premium','horn-10','10 зарядов доверенного Рога',
  'supabase/migrations/20261127141117_vvr_premium_gem_wallet.sql',{currency:'paid_gems',cost:10,amount:10});
for (let i=1;i<=SHIP_RULES.maxShips;i++) {
  add('ship','drakkar-'+i,'Драккар '+i,'src/core/shipyard.ts',{
    gold: i===1?0:shipBuyCost(i-1),levels:[1,2,3,4,5].map(shipUpgradeCost),...SHIP_RULES,
    trade:false,canSalvage:false,withdrawal:false,
  });
}
for (const [kind, pool] of [['daily',dailyPool],['weekly',weeklyPool]] as const) for (const q of pool) {
  add('quest.'+kind,q.id,q.text,'src/saga/quests.ts',{
    keys:q.keys,goal:q.goal,rewardStart:q.reward(start),rewardSample:q.reward(sample),
  });
}
for (const q of storyQuests(sample)) add('quest.story',q.id,q.text,'src/saga/quests.ts',q);
for (const q of mastery) add('mastery',q.id,q.name,'src/saga/quests.ts',{...q,masteryTiers,masteryGems});
for (const [i,def] of carnivalDays.entries()) add('carnival.day',String(i+1),def.title,'src/saga/carnivalRules.ts',def);
for (const milestone of carnivalMilestones) add('carnival.milestone',String(milestone.points),
  String(milestone.points)+' очков','src/saga/carnivalRules.ts',milestone);
for (const wing of wingLookList) add('wing.skin',wing.id,wing.name,'src/saga/collections.ts',wing);
for (const [i, def] of honorRanks.entries()) add('honor',String(i),def.name,'src/saga/honor.ts',def);
for (const [i, def] of activityMilestones.entries()) add('activity',String(def),String(def)+' очков','src/saga/activity.ts',
  {rewardStart:activityReward(start,i),rewardSample:activityReward(sample,i)});
for (const [id,prizes] of Object.entries(eventPrizes)) add('event',id,id,'src/saga/soloEvents.ts',{prizes});

for (const track of heroTracks) {
  add('progression',track.id,track.name,'src/saga/soloProgress.ts',{
    route:track.route,points:track.targets.map((target,index)=>({target,reward:track.reward(index)})),
  });
}
const worldBossSource='supabase/migrations/20261124155539_vvr_world_boss.sql';
const worldBossConfig=readFileSync(worldBossSource,'utf8').match(/world_boss_default_config\(\)[\s\S]*?as \$\$ select '(\{[\s\S]*?\})'::jsonb/);
if (!worldBossConfig) throw new Error('Review the World Boss SQL configuration.');
add('worldBoss','default','Мировой босс',worldBossSource,JSON.parse(worldBossConfig[1]));
add('item.server','world-boss-trophy','Трофей Мирового босса','supabase/migrations/20261124160303_vvr_trusted_equipment.sql',
    {trade:'server-auction',buyPrice:'listing.price',feeInBaseline:0});
add('market','auction','Аукцион','supabase/migrations/20261124155535_vvr_community.sql',
    {currency:'server:gold',itemInventory:'network_items',feeInBaseline:0,listingType:'fixed-price'});
add('server','arena','Доверенная Арена','server/arena; supabase/migrations/20261124222840_vvr_arena_rooms.sql',
    {supportedModes:['1v1','3v3','chaos'],receiptBased:true,playerRewardsAuthoritative:true,withdrawal:false});
add('server','brotherhood','Братство','supabase/migrations/20261125052619_vvr_brotherhood.sql',
    {sharedProgress:true,delivery:'receipts',giftCatalog:'supabase/migrations/20261125145918_vvr_brotherhood_solo_delivery.sql'});
add('server','referrals','Приглашения','supabase/migrations/20261125024312_vvr_referrals.sql',
    {monetaryRewards:false});
const keys = items.map(row=>row.category+'/'+row.id);
if (keys.length !== new Set(keys).size) throw new Error('Duplicate catalog IDs');
writeFileSync('docs/economy-1.0/catalog.json',JSON.stringify({
  sourceRevision:'3f4a4d9c428e7fa976776b73d8161c560a706507',
  sample:{heroLevel:25,stage:61,darkFloor:20,utc:new Date(Date.UTC(2026,0,1)).toISOString()},
  coverage:['current source definitions','procedural templates','versioned rules; see Audit for market and authority'],
  priceBasis:'Sample costs use the actual engine. Missing item-level price/time fields are unknown or not a game mechanic.',
  items,rules:{
    configs:{testBalance:balance,soloEconomy:economy},
    stageSamples:[1,10,30,60,100,180,365].map(stage=>({
      stage,gold:{wave:stageGold(stage,false),boss:stageGold(stage,true)},
      xp:{wave:stageXp(stage,false),boss:stageXp(stage,true)},
    })),
    forgeMaterialShopSamples:[1,11,21,31,41,51,61].map(stage=>({
      stage,offers:shopOffers({...sample,stage},fixtureTime).filter(row=>row.category==='materials'),
    })),
    mine:[1,6,12,24].map(hours=>({hours,...previewMine(fixtureTime,fixtureTime+hours*3600000)})),dropRules,gearRules,lairRules,lairTrials,lairTrophies,
    dailyVictoryRewards,runeRules,followerEconomy,consumableBattle,wingRules,gearEntries,eventSchedule,
    seaBoard,fortuneBoard,fortuneExchange,
    dailyDates:Array.from({length:7},(_,i)=>dailyGift(Date.UTC(2026,0,i+1))),
    season:Array.from({length:10},(_,i)=>seasonTierReward(i+1)),
    collections:Object.fromEntries((['gear','wings','companions','relics'] as const).map(id=>[
      id,collectionSteps.map((target,index)=>({target,reward:collectionReward(id,index)})),
    ])),
    cave:{entryChaosite:REALM_COST,samples:[1,5,10,15,20,25].map(floor=>({
      floor,rooms:Array.from({length:ROOMS+1},(_,i)=>({i,first:roomReward(floor,i,true),repeat:roomReward(floor,i,false)})),
    }))},
  },
},null,2)+'\n');
console.log(items.length+' catalog entries');
