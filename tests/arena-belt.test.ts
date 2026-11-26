import test from 'node:test';
import assert from 'node:assert/strict';
import {BELT_SLOTS,DEFAULT_BELT,beltHas,beltRules,beltSlotOpen,playerBelt,sanitizeBelt,setBeltSlot,validBelt} from '../src/arena/belt';
import {createFighter,type Entrant} from '../server/arena/duel';

test('the belt has exactly 7 slots and starts with the potion, so existing players keep their current behaviour',()=>{
 assert.equal(BELT_SLOTS,7);assert.equal(DEFAULT_BELT.length,7);
 assert.deepEqual(playerBelt({}),['potion',null,null,null,null,null,null]);
});

test('test mode opens all 7 slots; the TERRITORY unlock path is prepared but inactive',()=>{
 assert.equal(beltRules.testMode,true);
 for(let i=0;i<7;i++)assert.equal(beltSlotOpen(i,0),true);
 assert.equal(beltSlotOpen(7,0),false);
 assert.deepEqual(beltRules.unlockWins,[0,100,500,1000,2000,3500,5000]);
});

test('sanitizing drops unknown, unimplemented and duplicate kinds and always returns 7 slots',()=>{
 assert.deepEqual(sanitizeBelt(['potion','potion','heal_small','x',null],0),['potion',null,null,null,null,null,null]);
 assert.deepEqual(sanitizeBelt('junk',0),DEFAULT_BELT);
 assert.equal(validBelt([null,null,null,null,null,null,'potion']),true);
 for(const bad of [['potion'],[...DEFAULT_BELT,null],['potion','potion',null,null,null,null,null],['heal_small',null,null,null,null,null,null],null])
  assert.equal(validBelt(bad),false,JSON.stringify(bad));
});

test('putting a kind moves it between slots, removing empties a slot, the result persists in the save',()=>{
 const p:{arenaBelt?:unknown;arenaWins?:number}={};
 assert.equal(setBeltSlot(p,4,'potion'),true);
 assert.deepEqual(p.arenaBelt,[null,null,null,null,'potion',null,null]);
 assert.equal(setBeltSlot(p,4,'potion'),false,'no-op');
 assert.equal(setBeltSlot(p,4,null),true);
 assert.deepEqual(playerBelt(JSON.parse(JSON.stringify(p))),[null,null,null,null,null,null,null]);
 assert.equal(setBeltSlot(p,9,'potion'),false);
 assert.equal(setBeltSlot(p,0,'heal_small' as never),false);
});

test('a fighter carries potions only when its fixed belt holds them',()=>{
 const base:Entrant={id:'a',name:'A',level:1,rating:1000,hero:'berserker',kit:'balanced',controller:'c',potions:3,
  build:{hero:'berserker',level:1,stats:{hp:100,attack:10,defense:5,aspd:1,crit:0,critDamage:1.5,lifesteal:0,dodge:0,skillDamage:1,reduction:0},
   skills:[1,1,1],runes:[0,0,0],runePower:[1,1,1],spec:'onslaught',sets:{frost:0,storm:0,rune:0,stone:0,legion:0,ember:0},perks:[],unique:[],
   aura:{execute30:0,execute35:0,boss:0,opening:0,thorns:0,veil:0,killHeal:0,regen:0,firstBlock:false,boltEvery:0,boltPower:0,rally:0,cooldownRate:1,foeHpCut:0,heroDamage:0},followers:[],branches:[-1,-1]} as never};
 assert.equal(createFighter({...base,loadout:[...DEFAULT_BELT]},0).belt.potion,3);
 assert.equal(createFighter({...base,loadout:[null,null,null,null,null,null,null]},0).belt.potion,0);
 assert.equal(createFighter(base,0).belt.potion,3,'legacy entrant without belt');
 assert.equal(beltHas([null,'potion'],'potion'),true);
});

import {arenaBuild} from '../src/arena/hero';
import {LiveArena} from '../server/arena/live';
import {localArena,startLocalArena,updateLocalArena} from '../src/arena/local';
import {hero,seeded} from '../scripts/sim/arena';

test('the server fixes the belt at join: a potion outside it is neither reserved nor usable, the view shows 7 slots',()=>{
 const live=new LiveArena(':memory:',seeded(17)),now=Date.now(),build=arenaBuild(hero(6,false));
 const a={id:'801',controller:'tab'},b={id:'802',controller:'tab'};
 try{
  const empty=[null,null,null,null,null,null,null];
  live.join(a,'duel',build,'Алла',now,true,2,undefined,undefined,empty);
  assert.equal(live.potionQuote(a,2,1,30,100).reserved,0,'nothing reserved without the potion in the belt');
  live.join(b,'duel',build,'Борис',now,true,2,undefined,undefined,['potion',null,null,null,null,null,null]);
  const view=live.state(a,now).battle!;
  assert.deepEqual(view.loadout,empty);
  assert.equal(view.belt.potion,0);
  const other=live.state(b,now).battle!;
  assert.deepEqual(other.loadout,['potion',null,null,null,null,null,null]);
  assert.equal(other.belt.potion,2);
  const act=(actor:typeof a,at:number)=>{const v=live.state(actor,at).battle!;return live.act(actor,v.id,v.revision,{kind:'item',item:'potion'},v.round!,v.nextSequence,at)};
  assert.equal(act(a,now).accepted,false,'a client cannot drink a potion its fixed belt does not hold');
  // The belt cannot be changed mid-fight: a second join keeps the running battle and its belt.
  live.join(a,'duel',build,'Алла',now+1,true,2,undefined,undefined,['potion',null,null,null,null,null,null]);
  assert.deepEqual(live.state(a,now+1).battle!.loadout,empty);
  // A tampered belt from an old or forged client is sanitized: duplicates and unknown kinds are dropped.
  assert.doesNotThrow(()=>live.join({id:'803',controller:'tab'},'duel',build,'Ева',now,true,0,undefined,undefined,['potion','potion','hack']));
 }finally{live.close()}
});

test('a local fight fixes the belt at start and refuses the potion when the belt does not hold it',()=>{
 const p=hero(6,false);p.arenaPotions=3;p.arenaBelt=[null,null,null,null,null,null,null];
 assert.ok(startLocalArena(p,'local-1','duel',Date.now()));
 const fighter=localArena(p)!.match.game.players[0];
 assert.equal(fighter.belt.potion,0);
 assert.deepEqual(fighter.loadout,[null,null,null,null,null,null,null]);
 assert.equal(updateLocalArena(p,Date.now(),{kind:'item',item:'potion'}),false);
 assert.equal(p.arenaPotions,3,'stock untouched');
});
