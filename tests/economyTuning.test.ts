import {test} from 'node:test';
import assert from 'node:assert/strict';
import balance from '../config/test-balance.v1.json';
import {stageGold} from '../src/saga/regions';
import {freshPlayer} from '../src/core/store';
import {planFor} from '../src/saga/encounters';
import {rebaseEncounter,BALANCE_REVISION} from '../src/game/balanceRevision';
import type {EncounterSnapshot} from '../src/core/types';

const curve=balance.campaign_curve_test;
test('owner-approved economy values (25.11.2026): finale bosses 2.2× HP, gold grows exponentially to stage 30',()=>{
 assert.equal(curve.finale_hp,2.2);assert.equal(curve.gold_soft_cap_stage,30);
 assert.equal(balance.locked_owner_rules.boss_timer_seconds,30,'boss timer is unchanged');
});
test('regions 1–3 pay exactly as before; later stages grow linearly from stage 30',()=>{
 for(const s of [1,10,20,30])assert.equal(stageGold(s,false),Math.round(25*1.14**(s-1)));
 assert.equal(stageGold(40,false),Math.round(25*1.14**29*(1+10*.05)));
 assert.equal(stageGold(60,true),Math.round(150*1.14**29*(1+30*.05)),'linear tail after the cap');
});
test('only the region finale boss is tougher; its timer and other bosses are unchanged',()=>{
 const p=freshPlayer();
 const at=(stage:number)=>planFor({...p,stage,wave:5},'campaign');
 const finale=at(40),before=at(39);
 assert.equal(finale.finale,true);assert.equal(before.finale,false);
 assert.equal(finale.timer,balance.locked_owner_rules.boss_timer_seconds+curve.finale_timer_bonus);
 assert.ok(finale.units[0].hp>before.units[0].hp*1.5,'the finale is a real check');
});
test('saved fights and player values are never rewritten by the new numbers',()=>{
 const p=freshPlayer();p.stage=40;p.wave=5;
 const plan=planFor(p,'campaign');
 const saved={version:1,balanceRevision:BALANCE_REVISION,mode:'campaign',stage:40,wave:5,phase:'fight',units:plan.units.map((u,i)=>({...u,id:u.id,role:i,hp:123,max:456,atk:7})),projectiles:[]} as unknown as EncounterSnapshot;
 assert.deepEqual(rebaseEncounter(saved,plan),saved,'a fight saved mid-way restores exactly');
});
