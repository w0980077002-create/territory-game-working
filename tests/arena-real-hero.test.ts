import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {freshPlayer,parseSave,rewardLocalArenaDuel} from '../src/core/store';
import {damage,stats} from '../src/core/formulas';
import {arenaBuild,validArenaBuild} from '../src/arena/hero';
import {localArena,SOLO_ACTOR,startLocalArena,updateLocalArena} from '../src/arena/local';
import {advanceLive,applyLive,capacities,viewLive,type ArenaMode} from '../src/arena/match';
import {CHAT_MS,MATCH_WAIT_MS} from '../src/arena/protocol';
import {healingPotion} from '../src/arena/potion';
import {createFighter,resolveStrike} from '../server/arena/duel';
import {LiveArena} from '../server/arena/live';
import {hero,seeded} from '../scripts/sim/arena';

test('the arena build uses the actual hero statistics with no normalization or double counting',()=>{
 const p=hero(120,true);
 const {cp:_,...expected}=stats(p), build=arenaBuild(p);
 assert.deepEqual(build.stats,expected);
 assert.equal(build.level,120);
 assert.equal(build.hero,'runologist');
 assert.equal(build.sets.rune,4);
 assert.deepEqual(build.skills,p.skills);
 assert.equal(validArenaBuild(build),true);
 for(const invalid of [
  {...build,stats:{...build.stats,attack:1e100}},
  {...build,stats:{...build.stats,crit:2}},
  {...build,skillDamage:100},
  {...build,runes:[0,1,3]},
 ])assert.equal(validArenaBuild(invalid),false);
});

test('real attack, defence, crit, block, dodge and lifesteal resolve through the shared strike',()=>{
 const p=hero(35,true),target=hero(35,false);
 p.heroClass='ranger';target.talents[1]=6;
 const a=arenaBuild(p),b=arenaBuild(target);
 const fighter=(id:string,build:typeof a)=>createFighter({id,name:id,hero:build.hero,level:build.level,
  rating:1000,kit:'balanced',controller:'tab',build},0);
 const attacker=fighter('1',a),defender=fighter('2',b);
 for(const skill of ['call','strike','hammer'] as const)attacker.ready[skill]=Infinity;
 attacker.hp=Math.floor(attacker.maxHp/2);
 const starting=attacker.hp;
 const action={attack:'chest',blocks:['head','legs'],skill:null} as const;
 const move={...action,blocks:[...action.blocks] as ['head','legs']};
 const feed={log:[],chat:[],messageId:0};
 const strike=(blocks:Parameters<typeof resolveStrike>[4],rolls:number[])=>resolveStrike(feed,attacker,defender,move,blocks,0,()=>rolls.shift()??.5);
 const amount=damage(a.stats.attack,b.stats.defense,b.level,1,false,a.stats.critDamage);
 strike([], [.99,.5,.5]);
 assert.equal(defender.hp,defender.maxHp-amount);
 assert.equal(attacker.hp,starting+Math.round(amount*a.stats.lifesteal));
 const after=defender.hp;
 strike(['chest'],[.99,.5]);
 strike([],[.99,0]);
 assert.equal(defender.hp,after);
 strike(['chest'],[0,.5,.5]);
 assert.equal(defender.hp,after-damage(a.stats.attack,b.stats.defense,b.level,.8,false,a.stats.critDamage));
});

test('a trained Odin call uses the rune shield and runic set cooldown',()=>{
 const p=hero(35,true);
 p.runes[1]=1;
 const build=arenaBuild(p);
 const entry={name:'Воин',level:p.level,hero:p.heroClass,build,kit:'balanced' as const,controller:'tab',rating:1000};
 const a=createFighter({...entry,id:'1'},0),b=createFighter({...entry,id:'2'},0);
 const log={log:[],chat:[],messageId:0};
 resolveStrike(log,a,b,{attack:'head',blocks:['chest','legs'],skill:null},['head'],0,()=>.99);
 assert.equal(a.combat!.shield,Math.round(a.maxHp*.15));
 assert.equal(a.ready.call,12_000/1.15);
 assert.ok(a.combat!.callsUntil>5_000);
 assert.ok(b.hp===b.maxHp);
});

test('the local potion spends existing Solo gold once, respects the cooldown, and survives save hydration',()=>{
 const p=freshPlayer(),now=Date.now();
 assert.ok(startLocalArena(p,'local','duel',now));
 const fighter=localArena(p)!.match.game.players[0];
 fighter.hp=Math.floor(fighter.maxHp*.5);
 const gold=p.gold,before=fighter.hp,cost=healingPotion.cost(p.stage);
 assert.ok(updateLocalArena(p,now,{kind:'item',item:'potion'}));
 assert.equal(fighter.hp,before+Math.round(fighter.maxHp*.45));
 assert.equal(p.gold,gold-cost);
 assert.equal(updateLocalArena(p,now,{kind:'item',item:'potion'}),false);
 assert.equal(p.gold,gold-cost);
 assert.equal(updateLocalArena(p,now,{kind:'item',item:'attack'}),false);
 const restored=parseSave(JSON.stringify(p))!;
 assert.equal(restored.gold,gold-cost);
 assert.equal(localArena(restored)!.match.game.players[0].itemAt.potion,now+healingPotion.cooldown);
 assert.equal(updateLocalArena(restored,now+1,{kind:'item',item:'potion'}),false);
});

test('local wins cannot reach the ranking and use the approved Solo duel reward',()=>{
 const p=hero(1,true);
 const clock=Date.now();
 assert.ok(startLocalArena(p,'bot-only','duel',clock));
 const {match}=localArena(p)!;
 const rng=seeded(17);
 const opponent=match.game.players[1];
 opponent.hp=1;
 assert.ok(applyLive(match,SOLO_ACTOR,{kind:'auto',enabled:true},1,1,clock,rng));
 for(let step=0;step<200&&!match.game.result;step++)advanceLive(match,clock+100*step,rng);
 const view=viewLive(match,SOLO_ACTOR,SOLO_ACTOR,clock+20_000,true);
 assert.equal(view.result?.outcome,'win');
 assert.equal(view.result?.points,0);
 const startGold=p.gold,startTokens=p.tokens;
 rewardLocalArenaDuel(p);
 assert.equal(p.gold,startGold+100);
 assert.equal(p.tokens,startTokens+10);
 assert.equal(p.arenaWins,1);
 assert.equal(startLocalArena(p,'bot-only','duel',clock+1000),false);
});

for(const mode of Object.keys(capacities) as ArenaMode[]){
 test(mode+': one local fallback, reconnect, full human settlement and duplicate command rejection',()=>{
  const root=mkdtempSync(join(tmpdir(),'vvr-live-test-')),path=join(root,'arena.sqlite');
  let arena=new LiveArena(path,seeded(17));
  let now=Date.now();
  const build=arenaBuild(hero(35,true));
  const joinMode=(actor:{id:string;controller:string},level=35)=>arena.join(actor,mode,{...build,level},'Игрок '+actor.id,now,true);
  try{
   const solo={id:'900',controller:'one'};
   const search=joinMode(solo).search!;
   assert.equal(search.deadline,now+MATCH_WAIT_MS);
   for(let step=0;step<20;step++){now+=1000;arena.state(solo,now);arena.tick(now);}
   assert.deepEqual({...arena.state(solo,now).local},{id:search.id,mode});
   assert.deepEqual(arena.pending(),[]);
   assert.deepEqual(arena.pendingTeams(),[]);
   const actors=Array.from({length:capacities[mode]},(_,i)=>({id:String(100+i),controller:'one'}));
   for(const [i,actor] of actors.entries())joinMode(actor,35+(i%2)*7);
   const first=arena.state(actors[0],now).battle!;
   assert.equal(first.players.length,capacities[mode]);
   assert.equal(first.ranked,true);
   assert.equal(first.you.level,35);
   assert.ok(first.players.some(p=>p.level===42));
   arena.close();
   arena=new LiveArena(path,seeded(29));
   assert.equal(arena.state(actors[0],now).battle!.id,first.id);
   const visitor={...actors[0],controller:'two'};
   assert.equal(arena.state(visitor,now).battle!.control,false);
   assert.equal(arena.resume(visitor,first.id,first.revision,now).battle!.control,true);
   actors[0]=visitor;
   for(const actor of actors){
    const match=arena.state(actor,now).battle!;
    const command={kind:'auto',enabled:true} as const;
    const attempt=arena.act(actor,match.id,match.revision,command,match.round??0,match.nextSequence,now);
    assert.equal(attempt.accepted,true);
    assert.equal(arena.act(actor,match.id,match.revision,command,match.round??0,match.nextSequence,now).accepted,false);
   }
   for(let i=0;i<900&&!arena.state(actors[0],now).battle?.result;i++){
    now+=200;arena.tick(now);
   }
   const finished=arena.state(actors[0],now).battle!;
   assert.ok(finished.result);
   assert.ok(arena.recent(actors[0],now).some(room=>room.id===first.id));
   assert.equal(finished.chatDeadline,finished.result.finishedAt+CHAT_MS);
   assert.ok(arena.act(actors[0],first.id,finished.revision,{kind:'chat',text:'Хороший бой!'},
    finished.round??0,finished.nextSequence,now).accepted);
   const terminal=mode==='duel'?arena.pending():arena.pendingTeams();
   if(mode!=='duel')assert.equal(terminal.length,1);
   assert.ok(terminal.length<=1);
   arena.tick(now+CHAT_MS);
   assert.equal(arena.state(actors[0],now+CHAT_MS).battle,undefined);
   assert.deepEqual(arena.recent(actors[0],now+CHAT_MS),[]);
   assert.deepEqual(mode==='duel'?arena.pending():arena.pendingTeams(),terminal);
  }finally{arena.close();rmSync(root,{recursive:true,force:true});}
 });
}
