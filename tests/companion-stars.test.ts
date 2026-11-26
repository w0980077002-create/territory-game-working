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
