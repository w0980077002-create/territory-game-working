import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installHeadless} from '../scripts/sim/bot';
import {freshPlayer,parseSave,useGame,raidLair} from '../src/core/store';
import {stats} from '../src/core/formulas';
import {Battle} from '../src/game/Battle';
import {miniIds} from '../src/data/catalog';
import {companionIds,companions,followerId,squadBox,squadState,followerStarCap,addRes,resCount,addDusk,duskCount} from '../src/dark/rules';
import {advanceAwakening,buyFollower,exchangeAwakeningShards,exchangeFollowerShards,exchangeSeal,followerMarket,followerMerge,grantFollower,mergeFollower,offerOdds,refreshFollowers,rollOffers} from '../src/dark/followerMarket';
import {balanceOf,followerEconomy,grantSolo,soloVictory} from '../src/saga/soloEconomy';
import {applyRuneAction,runeBonuses,runeMultiplier,runeState} from '../src/saga/runes';
import {eventPeriod,eventWindow,recordSprintSpend} from '../src/saga/soloCalendar';
import {claimEvent,openChest,rollEvent,savedChests} from '../src/saga/soloEvents';
import {applyMail,mailbox} from '../src/saga/mail';
import {count,sagaOf} from '../src/saga/save';
import {selectLair,noteLairWin,lairRules,lairReviveCost} from '../src/saga/lair';
import {claimTrack,growWings,wingRank} from '../src/saga/soloProgress';
import {applyPurchase,shopOffers,shopSold} from '../src/saga/shop';

installHeadless();
const game=()=>useGame.getState();
const live=()=>game().p;
const reset=()=>assert.equal(game().importSave(freshPlayer()),true);
const mutate=(fn:(p:ReturnType<typeof freshPlayer>)=>unknown)=>assert.equal(game().mutate(fn),true);
const time=(day:number,month=0)=>Date.UTC(2027,month,day,12);

test('offers persist, purchase consumes one offer and failed writes preserve seals, souls and receipts',()=>{
 reset();
 mutate(p=>{grantSolo(p,'soul',2000);addRes(p,'seal',5);squadBox(p).shards.goose_aviator=43});
 assert.ok(refreshFollowers(0,false,time(9)));
 const market=followerMarket(live(),time(9));
 assert.deepEqual(followerMarket(parseSave(JSON.stringify(live()))!,time(9)).offers,market.offers);
 const cost=followerEconomy.prices[companions[market.offers[0]!.species].rarity],gold=live().gold;
 const storage=localStorage.setItem;
 try {
  localStorage.setItem=()=>{throw Error('quota')};
  assert.equal(buyFollower(0,market.revision,time(9)),false);
  assert.equal(exchangeSeal(5),false);
  assert.equal(balanceOf(live(),'soul'),2000);
  assert.equal(resCount(live(),'seal'),5);
  assert.equal(eventPeriod(live(),'followers:2027-01').progress,0);
 } finally {localStorage.setItem=storage}
 assert.ok(buyFollower(0,market.revision,time(9)));
 assert.equal(buyFollower(0,market.revision,time(9)),false);
 assert.equal(balanceOf(live(),'soul'),2000-cost);
 assert.equal(live().gold,gold);
 assert.equal(eventPeriod(live(),'followers:2027-01').progress,cost);
 assert.ok(exchangeSeal(5));
 assert.equal(exchangeSeal(5),false);
 assert.ok(exchangeFollowerShards('goose_aviator',43));
 assert.equal(exchangeFollowerShards('goose_aviator',43),false);
 assert.ok(refreshFollowers(followerMarket(live(),time(9)).revision,false,time(9)));
 assert.equal(eventPeriod(live(),'followers:2027-01').progress,cost);
});

test('legendary guarantees persist and mythic guarantee is ready only with available catalog',()=>{
 const current=companionIds.map(id=>({id,rarity:companions[id].rarity}));
 assert.equal(rollOffers({legendary:6,mythic:20},current,()=>.42).filter(x=>x.guarantee).length,1);
 const catalog=[...current,...Array.from({length:8},(_,i)=>({id:'fixture-'+i,rarity:4}))];
 assert.equal(rollOffers({legendary:6,mythic:20},catalog,()=>.01).at(-1)?.species,'fixture-0');
 assert.equal(rollOffers({legendary:6,mythic:20},catalog,()=>.99).at(-1)?.species,'fixture-7');
 assert.ok(Math.abs(offerOdds(2).reduce((n,x)=>n+x.chance,0)-1)<1e-12);
 reset();
 mutate(p=>{grantSolo(p,'soul',500);sagaOf(p).box.followerMarket={v:1,legendary:5,mythic:20,revision:0,offers:[null,null,null]}});
 assert.ok(refreshFollowers(0,false,time(9)));
 assert.equal(refreshFollowers(1,false,time(10)),false);
 assert.equal(followerMarket(live(),time(10)).mythic,20);
 assert.equal(followerMarket(live(),time(10)).offers.some(o=>o?.guarantee==='legendary'),true);
 assert.ok(refreshFollowers(1,true,time(10)));
 assert.equal(followerMarket(live(),time(10)).mythic,20);
});

test('merge quotes protect active and locked donors and retain level, old awakening and exact stars',()=>{
 reset();
 const target=followerId('goose_aviator');
 mutate(p=>{
  p.companions[0]=100;
  assert.ok(grantFollower(p,'goose_aviator'));
  assert.ok(grantFollower(p,'goose_aviator'));
  const box=squadBox(p);
  box.instances[target].talents[0].rank=4;
  const donor=box.instances['follower:copy:1'];
  donor.st=34;donor.aw=true;donor.talents[0].rank=7;
  box.instances['follower:copy:2'].locked=true;
  addDusk(p,9);grantSolo(p,'awakeShard',5);grantSolo(p,'awake',30);
 });
 assert.equal(followerMerge(live(),target,'follower:copy:2',null),null);
 assert.equal(followerMerge(live(),'follower:copy:1',target,null),null);
 const plan=followerMerge(live(),target,'follower:copy:1',0)!;
 assert.equal(plan.result.st,35);
 assert.equal(plan.result.lv,100);
 assert.equal(plan.result.talents[0].rank,8);
 assert.ok(mergeFollower(target,'follower:copy:1',0,plan.quote));
 assert.equal(mergeFollower(target,'follower:copy:1',0,plan.quote),false);
 assert.equal(squadState(parseSave(JSON.stringify(live()))!).instances[target].aw,true);
 assert.ok(exchangeAwakeningShards(5));
 assert.equal(exchangeAwakeningShards(5),false);
 assert.ok(advanceAwakening(target,0));
 assert.ok(advanceAwakening(target,1));
 const pet=squadState(live()).instances[target];
 assert.equal(pet.talents.filter(t=>t.open).length,5);
 assert.equal(followerStarCap(pet.step),50);
 assert.equal(duskCount(live()),9);
 assert.equal(balanceOf(live(),'awake'),23);
});

test('rune dust, spend receipts, passive and resonance use the real combat formulas',()=>{
 const p=freshPlayer(),before=stats(p);
 p.level=10;
 const trained=stats(p);
 grantSolo(p,'scroll',120);
 assert.ok(applyRuneAction(p,{kind:'summon'},0,()=>0,time(22)));
 assert.equal(applyRuneAction(p,{kind:'summon'},0,()=>0,time(22)),false);
 assert.ok(applyRuneAction(p,{kind:'summon'},1,()=>0,time(22)));
 assert.equal(runeState(p).dust,1);
 assert.ok(applyRuneAction(p,{kind:'rank',id:0},2,()=>0,time(22)));
 assert.equal(runeState(p).ranks[0],2);
 assert.equal(balanceOf(p,'scroll'),55);
 assert.equal(eventPeriod(p,'runes:2027-01').progress,65);
 p.runes[0]=1;
 assert.equal(runeMultiplier(p,0),1);
 assert.equal(eventPeriod(p,'runes:2027-01').progress,65);
 p.runes[0]=0;
 assert.equal(runeMultiplier(p,0),1.08);
 assert.ok(applyRuneAction(p,{kind:'summon'},3,()=>.18,time(25)));
 assert.ok(applyRuneAction(p,{kind:'passive',id:0},4));
 assert.equal(runeBonuses(p).rank,3);
 assert.ok(stats(p).hp>trained.hp&&stats(p).attack>trained.attack);
 assert.ok(trained.hp>before.hp);
});

test('calendar uses UTC windows; old months and event/mail claims share one receipt, including chests',()=>{
 const p=freshPlayer(),id='followers:2027-01';
 assert.equal(eventWindow('followers',Date.UTC(2027,0,9)-1).active,false);
 recordSprintSpend(p,'followers',500,time(8));
 recordSprintSpend(p,'followers',5200,time(9));
 assert.equal(eventPeriod(p,id).progress,5200);
 assert.ok(claimEvent(p,id,0,'event',time(13)));
 assert.equal(claimEvent(p,id,1,'event',Date.UTC(2027,0,14)),false);
 assert.equal(claimEvent(p,id,25,'event',time(13)),false);
 assert.ok(mailbox(p,time(1,1)).some(x=>x.id===id&&x.pending));
 const input=parseSave(JSON.stringify(p),true)!;
 assert.match(applyMail(input,{kind:'claimAll'},time(1,1),time(1,1))!,/Вложения/);
 assert.equal(balanceOf(input,'soul'),545);
 assert.equal(claimEvent(input,id,0,'mail',time(1,1)),false);
 assert.equal(applyMail(input,{kind:'claimAll'},time(1,1),time(1,1)),undefined);
 assert.equal(mailbox(input,time(1,1)).find(x=>x.id===id)?.pending,false);
 const chest=savedChests(input).find(([,type])=>type==='legendary')![0];
 assert.equal(openChest(input,chest,'invalid'),false);
 assert.ok(openChest(input,chest,'goose_aviator'));
 assert.equal(openChest(input,chest,'goose_aviator'),false);
 assert.equal(Object.values(squadState(input).instances).filter(x=>x.species==='goose_aviator').length,2);
});

test('boards use one ticket per committed result and grant 15/120 milestones once',()=>{
 const p=freshPlayer();
 grantSolo(p,'monopoly',50);grantSolo(p,'fortune',120);
 for(let i=0;i<50;i++)assert.ok(rollEvent(p,'monopoly',i,time(14),()=>.99));
 const moon=eventPeriod(p,'monopoly:2027-01');
 assert.equal(moon.last,6);
 assert.equal(moon.progress,15);
 assert.equal(rollEvent(p,'monopoly',49,time(14)),false);
 assert.ok(claimEvent(p,'monopoly:2027-01',4,'event',time(18)));
 assert.equal(claimEvent(p,'monopoly:2027-01',4,'mail',time(19)),false);
 for(let i=0;i<120;i++)assert.ok(rollEvent(p,'fortune',i,time(19),()=>i===0?.999:0));
 assert.equal(balanceOf(p,'jackpot'),1);
 assert.ok(claimEvent(p,'fortune:2027-01',3,'mail',time(22)));
 assert.equal(balanceOf(p,'awake'),4);
 assert.equal(balanceOf(p,'fortune'),0);
 assert.equal(rollEvent(p,'fortune',120,time(22)),false);
});

test('daily supplies, wings, tracks and weekly offers reuse the existing save',()=>{
 const p=freshPlayer();
 for(let i=0;i<6;i++)soloVictory(p,time(15));
 assert.equal(balanceOf(p,'monopoly'),15);
 assert.equal(balanceOf(p,'fortune'),8);
 assert.equal(balanceOf(p,'scroll'),30);
 soloVictory(p,time(14));
 assert.equal(balanceOf(p,'awakeShard'),10);
 p.level=5;
 assert.ok(claimTrack(p,'xp',0));
 assert.equal(claimTrack(p,'xp',0),false);
 assert.equal(growWings(p,0),false);
 p.equipment.wings={id:'wings',name:'Крылья',slot:'wings',level:1,rarity:0,attack:0,defense:0,hp:0,upgrade:0};
 const original=stats(p);
 grantSolo(p,'wing',1);
 assert.ok(growWings(p,0));
 assert.equal(growWings(p,0),false);
 assert.equal(wingRank(p),1);
 assert.ok(stats(p).hp>original.hp);
 p.wingVisible=false;
 assert.equal(stats(p).hp,stats({...p,wingVisible:true}).hp);
 const offer=shopOffers(p,time(15)).find(o=>o.id==='weekly-growth')!;
 applyPurchase(p,offer,time(15));
 assert.equal(shopSold(p,offer,time(16)),true);
 assert.equal(shopSold(p,offer,time(19)),false);
});

test('lair entry and revive persist the same chosen boss and attempt, raid cannot duplicate an input',()=>{
 reset();
 const b=new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement);
 try{
  mutate(p=>{p.gold=5000;p.chaosite=500;p.stage=3;assert.ok(selectLair(p,miniIds[2]));noteLairWin(p,miniIds[2])});
  b.startMode('dungeon',true);
  b.toggle();
  const id=b.id,keeper=b.units[0].id;
  assert.equal(keeper,miniIds[2]);
  b.hp=0;b.units[0].hp=Math.floor(b.units[0].max/2);b.defeat();
  const remaining=b.units[0].hp,gold=live().gold;
  b.restorePlayer();
  assert.ok(b.reviveLair(id,0));
  assert.equal(live().gold,gold-lairReviveCost(3));
  assert.equal(b.id,id);
  assert.equal(b.units[0].hp,remaining);
  assert.equal(live().encounter?.lairRevives,1);
  b.restorePlayer();
  assert.equal(b.reviveLair(id,0),false);
  assert.equal(b.lairRevives,1);
  const chaos=live().chaosite;
  assert.equal(raidLair(miniIds[0],0,time(15)),false);
  assert.ok(raidLair(keeper,0,time(15)));
  assert.equal(raidLair(keeper,0,time(15)),false);
  assert.equal(live().chaosite,chaos-lairRules.entry);
  assert.equal(count(live(),'lair:raid'),1);
  assert.equal(live().encounter?.id,id);
 } finally {b.destroy()}
});
