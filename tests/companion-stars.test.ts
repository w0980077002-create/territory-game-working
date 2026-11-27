import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {companions,companionIds,followerId,squadBox,squadState,newFollower} from '../src/dark/rules';
import {followerMerge,offerOdds} from '../src/dark/followerMarket';
import {freshPlayer} from '../src/core/store';
import {loadDictionary,translate} from '../src/i18n';
import en from '../src/i18n/en.json';
import polish from '../src/i18n/en.polish.json';

// Player feedback: «Старший бурильщик» ★ 1/40 with 18/20 old shards could not find a way to the next star.
const save=(squad:unknown)=>{const p=freshPlayer();p.saga={v:1,n:{},flags:[],seen:[],trophies:[],box:{squad}} as never;return p};

test('an old squad save keeps level, stars and old shards after migration',()=>{
 const p=save({own:{senior_driller:{lv:100,st:1,sh:18,aw:false,t:[0,0,0]}},act:['goose_aviator','brown_white_dog']});
 const s=squadState(p),pet=s.instances[followerId('senior_driller')];
 assert.deepEqual([pet.lv,pet.st,s.shards.senior_driller],[100,1,18]);
});

test('every species of every rarity can appear in the Summon and gains a star from a copy',()=>{
 const offered=new Set([0,1,2].flatMap(slot=>offerOdds(slot).filter(x=>x.chance>0).map(x=>x.id)));
 for(const species of companionIds){
  assert.ok(offered.has(species),species+' can be summoned');
  const p=save({v:2,instances:{[followerId(species)]:newFollower(species,100,[],1),'follower:copy:1':newFollower(species)},shards:{},
   formation:[followerId('goose_aviator'),followerId('brown_white_dog'),null]});
  squadBox(p);
  const plan=followerMerge(p,followerId(species),'follower:copy:1',null);
  assert.equal(plan?.result.st,2,companions[species].name+' ★1 + copy ★0 → ★2');
 }
});

test('the star guide is translated for English players',()=>{
 loadDictionary({...en,...polish} as Record<string,string>);
 for(const [ru,expected] of [
  ['Как получить ★ 2','How to get ★ 2'],
  ['Свободные копии: 0 · Души: 40 · Печати призыва: 3','Free copies: 0 · Souls: 40 · Summon seals: 3'],
  ['Звезда 2 за старые осколки: 18/20. Не хватает 2, а новых осколков не будет.','Star 2 for old shards: 18/20. 2 short, and no new shards will drop.'],
 ])assert.equal(translate(ru),expected);
 assert.ok(readFileSync('src/ui/DarkPanels.tsx','utf8').includes('StarGuide'));
});

test('companion balance D2: capped squad bonus, softer star and level growth, capped Goose HP; saves untouched',async()=>{
 const {companionBalance,companionPower}=await import('../src/dark/rules');
 const {stats}=await import('../src/core/formulas');
 const roster=(st:number)=>({v:2,shards:{senior_driller:18},formation:[followerId('goose_aviator'),followerId('brown_white_dog'),null],
  instances:Object.fromEntries(companionIds.map(id=>[followerId(id),newFollower(id,100,[],st)]))});
 const {squadBonus}=await import('../src/dark/rules');
 assert.ok(Math.abs(squadBonus(save(roster(10))).hpPct-companionIds.length*10*.0015)<1e-9,'0.15% per star');
 assert.equal(squadBonus(save(roster(40))).hpPct,companionBalance.squadCap,'6 × 40★ would be +36%: capped at +35%');
 const pet=(lv:number,st:number)=>({lv,st,sh:0,aw:false,t:[0,0,0]});
 const boar=(lv:number,st:number)=>companionPower('08_armored_boar',pet(lv,st)).power;
 assert.ok(Math.abs(boar(1,40)/boar(1,0)-(1+2+.4))<1e-9,'+0.1 per star to 20, then +0.02');
 assert.ok(Math.abs(boar(20,0)/boar(1,0)-(.34+20*.045)/(.34+.045)*(1+.12*2)/1)<1e-9,'full level growth to 20');
 assert.ok(boar(100,0)<boar(20,0)*1.6,'level growth softened after 20');
 const goose=(lv:number)=>{const p=freshPlayer();p.companions=[lv,1];return stats(p).hp};
 assert.equal(goose(10),goose(100),'Goose level adds at most +20% hero HP');
 const p=save(roster(37));squadBox(p);const kept=squadState(p);
 assert.deepEqual([kept.instances[followerId('senior_driller')].st,kept.instances[followerId('senior_driller')].lv,kept.shards.senior_driller],[37,100,18],'stars, levels and old shards kept');
});

test('update news arrive as an unread letter, are read once and deleted for good',async()=>{
 const {mailbox,unreadMail,applyMail}=await import('../src/saga/mail');
 const {newsLetters}=await import('../src/saga/news');
 const {migrateNews}=await import('../src/saga/news');
 const news=newsLetters[0],now=news.date+1000;
 const fresh=save({});fresh.savedAt=news.date+5;migrateNews(fresh);
 assert.equal(mailbox(fresh,now).some(l=>l.id===news.id),false,'a hero started after the update gets no news');
 const p=save({});p.savedAt=news.date-86_400_000;migrateNews(p);
 assert.equal(unreadMail(p,news.date-1),0,'not before its date');
 const before=unreadMail(p,now);
 const letter=mailbox(p,now).find(l=>l.id===news.id)!;
 assert.ok(letter&&!letter.read&&!letter.pending&&letter.body?.length,'text letter without attachments');
 applyMail(p,{kind:'read',id:news.id},now,now);
 assert.equal(unreadMail(p,now),before-1);
 assert.ok(mailbox(p,now).find(l=>l.id===news.id)!.read);
 applyMail(p,{kind:'deleteRead'},now,now);
 assert.equal(mailbox(p,now).find(l=>l.id===news.id),undefined,'deleted');
 assert.equal(unreadMail(p,now),before-1,'never comes back as unread');
 applyMail(p,{kind:'read',id:news.id},now,now);
 assert.equal(mailbox(p,now).find(l=>l.id===news.id),undefined,'a stale read does not restore it');
});
