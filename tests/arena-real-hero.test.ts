import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {freshPlayer,parseSave,rewardLocalArenaDuel} from '../src/core/store';
import {damage,stats} from '../src/core/formulas';
import {arenaBuild,validArenaBuild} from '../src/arena/hero';
import {localArena,prepareLocalConsumable,prepareLocalPotion,settleLocalPotion,SOLO_ACTOR,startLocalArena,updateLocalArena} from '../src/arena/local';
import {advanceLive,applyLive,capacities,viewLive,type ArenaMode} from '../src/arena/match';
import {CHAT_MS,MATCH_WAIT_MS} from '../src/arena/protocol';
import {applyPurchase,shopOffers} from '../src/saga/shop';
import {localBattle,replayProof} from '../src/arena/localProof';
import {consumableStacks,healingPotion} from '../src/arena/potion';
import {createFighter,resolveStrike} from '../server/arena/duel';
import {LiveArena} from '../server/arena/live';
import {curve,threat} from '../src/saga/regions';
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

test('new Solo duels match bot strength to the hero while team bots retain campaign stats',()=>{
 const build=arenaBuild(hero(83,true));
 const duel=(stage:number)=>localBattle('duel','duel',build,stage,0,0,seeded(11));
 const t=threat(190),expectedHp=Math.round(t.bossHp*curve.arena_hp);
 const early=duel(20),late=duel(190);
 assert.equal(early.game.players[1].maxHp,late.game.players[1].maxHp);
 assert.equal(early.game.players[1].attack,late.game.players[1].attack);
 assert.equal(early.game.players[0].maxHp,build.stats.hp);
 assert.equal(viewLive(early,SOLO_ACTOR,SOLO_ACTOR,0,true).ranked,false);
 for(const mode of ['team','chaos'] as const){
  const team=localBattle(mode,mode,build,190,0,0,seeded(11));
  assert.equal(team.game.players[1].maxHp,expectedHp);
  assert.equal(team.game.players[1].defense,Math.round(t.def));
 }
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

test('the shop buys stock for Solo gold and the potion is spent once across save hydration',()=>{
 const p=freshPlayer(),now=Date.now(),gold=p.gold,cost=healingPotion.cost(p.stage);
 const offer=shopOffers(p,now).find(offer=>offer.id==='arena-potion')!;
 assert.equal(offer.price,cost);
 applyPurchase(p,offer,now);
 applyPurchase(p,offer,now);
 assert.equal(p.arenaPotions,2);
 assert.equal(p.gold,gold-2*cost);
 assert.ok(startLocalArena(p,'local','duel',now));
 const fighter=localArena(p)!.match.game.players[0];
 fighter.hp=Math.floor(fighter.maxHp*.5);
 const before=fighter.hp;
 assert.ok(updateLocalArena(p,now,{kind:'item',item:'potion'}));
 assert.equal(fighter.hp,before+Math.round(fighter.maxHp*.45));
 assert.equal(p.arenaPotions,1);
 assert.equal(updateLocalArena(p,now,{kind:'item',item:'potion'}),false);
 assert.equal(p.gold,gold-2*cost);
 assert.equal(updateLocalArena(p,now,{kind:'item',item:'attack'}),false);
 const restored=parseSave(JSON.stringify(p))!;
 assert.equal(restored.arenaPotions,1);
 assert.equal(restored.gold,gold-2*cost);
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

test('a closed network queue sends each player to local training separately',()=>{
 const arena=new LiveArena(':memory:',seeded(17));
 let now=Date.now();
 const build=arenaBuild(hero(35,true));
 const actors=Array.from({length:capacities.team},(_,i)=>({id:String(100+i),controller:'one'}));
 try{
  const tickets=actors.map(actor=>arena.join(actor,'team',build,'Игрок',now,false,0,
   undefined,undefined,undefined,undefined,{},true).search!.id);
  assert.equal(new Set(tickets).size,actors.length);
  for(let step=0;step<20;step++){
   now+=1000;
   for(const actor of actors)arena.state(actor,now);
   arena.tick(now);
  }
  for(const [index,actor] of actors.entries())assert.equal(arena.state(actor,now).local?.id,tickets[index]);
  assert.deepEqual(arena.pendingTeams(),[]);
 }finally{arena.close();}
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

test('one local team replay per UTC day is durable and publishes an oath without a rating',()=>{
 const p=hero(120,true),build=arenaBuild(p),actor={id:'500',controller:'tab'};
 let now=Date.parse('2026-11-26T12:00:00Z');
 const live=new LiveArena(':memory:',seeded(17));
 try{
  const search=live.join(actor,'team',build,'Герой',now,true,0,p.stage,0).search!;
  for(let i=0;i<20;i++){now+=1000;live.state(actor,now);live.tick(now);}
  const fallback=live.state(actor,now).local!;
  assert.equal(fallback.id,search.id);
  assert.ok(fallback.proof);
  assert.ok(startLocalArena(p,search.id,'team',now,fallback.proof));
  assert.ok(updateLocalArena(p,now,{kind:'auto',enabled:true}));
  for(let i=0;i<300&&!p.localArena!.match.game.result;i++){
   now+=1000;
   updateLocalArena(p,now);
  }
  const saved=p.localArena!;
  assert.ok(saved.match.game.result);
  const replay=replayProof(search.id,'team',fallback.proof,saved.proof!.moves,now);
  assert.deepEqual(replay,saved.match.game.result);
  assert.equal(live.prove({...actor,id:'501'},search.id,'Герой',saved.proof!.moves,now).status,'closed');
  assert.equal(live.prove(actor,search.id,'Герой',[[now+1,{kind:'auto',enabled:true}]],now).status,'closed');
  assert.equal(live.prove(actor,search.id,'Герой',saved.proof!.moves,now).status,'accepted');
  assert.equal(live.prove(actor,search.id,'Герой',saved.proof!.moves,now).status,'accepted');
  assert.equal(live.pending().length,0);
  assert.equal(live.pendingTeams().length,1);
  assert.equal(JSON.parse(live.pendingTeams()[0].json).local,true);
  live.join(actor,'chaos',build,'Герой',now,true,0,p.stage,0);
  for(let i=0;i<20;i++){now+=1000;live.state(actor,now);live.tick(now);}
  assert.equal(live.state(actor,now).local?.proof,undefined);
 }finally{live.close()}
});

test('a network reservation spends only accepted potions and releases unused stock on leave',()=>{
 const live=new LiveArena(':memory:',seeded(17)),now=Date.now(),build=arenaBuild(hero(6,false));
 const a={id:'111',controller:'tab'},b={id:'222',controller:'tab'};
 try{
  live.join(a,'duel',build,'Алла',now,true,2);
  assert.equal(live.potionQuote(a,2,1,30,100).reserved,2);
  live.join(b,'duel',build,'Борис',now,true,0);
  const action=(actor:typeof a,action:Parameters<typeof live.act>[3],at:number)=>{
   const view=live.state(actor,at).battle!;
   return live.act(actor,view.id,view.revision,action,view.round!,view.nextSequence,at);
  };
  assert.equal(action(a,{kind:'item',item:'potion'},now).accepted,false);
  const move={kind:'move',move:{attack:'head',blocks:['chest','legs'],skill:null}} as const;
  const attack={...move,move:{...move.move,blocks:[...move.move.blocks] as ['chest','legs']}};
  assert.ok(action(a,attack,now).accepted);
  assert.ok(action(b,attack,now).accepted);
  const damaged=live.state(a,now).battle!;
  assert.ok(damaged.you.hp<damaged.you.maxHp);
  assert.ok(action(a,{kind:'item',item:'potion'},now).accepted);
  assert.equal(action(a,{kind:'item',item:'potion'},now+1).accepted,false);
  assert.equal(live.potionQuote(a,2,1,30,100).stock,1);
  assert.equal(live.potionQuote(a,2,1,30,100).reserved,1);
  assert.ok(action(a,{kind:'leave'},now+1).accepted);
  assert.equal(live.potionQuote(a,2,1,30,100).stock,1);
  assert.equal(live.potionQuote(a,2,1,30,100).reserved,0);
 }finally{live.close()}
});

test('one confirmed potion stack serves local and network Arena and survives a lost response',()=>{
 const live=new LiveArena(':memory:',seeded(17));
 const p=hero(6,false),build=arenaBuild(p);
 const a={id:'300',controller:'tab'},b={id:'400',controller:'tab'};
 let now=Date.now();
 try{
  const ticket=live.join(a,'duel',build,'Герой',now,true,3).search!;
  for(let i=0;i<20;i++){now+=1000;live.state(a,now);live.tick(now);}
  const fallback=live.state(a,now).local!;
  assert.equal(fallback.id,ticket.id);
  assert.equal(fallback.confirmedPotions,3);
  assert.equal(live.potionQuote(a,3,1,30,100,now).reserved,3);
  assert.ok(startLocalArena(p,ticket.id,'duel',now,undefined,now,fallback.confirmedPotions));
  p.localArena!.match.game.players[0].hp=Math.floor(build.stats.hp/2);
  assert.ok(prepareLocalPotion(p,now,'operation'));
  assert.equal(updateLocalArena(p,now+5000),false);
  assert.ok(live.useLocalPotion(a,ticket.id,'operation',now));
  assert.equal(live.useLocalPotion(b,ticket.id,'operation',now),false);
  assert.ok(live.useLocalPotion(a,ticket.id,'operation',now+1000));
  const restored=parseSave(JSON.stringify(p))!;
  assert.ok(settleLocalPotion(restored,ticket.id,'operation',true));
  assert.equal(settleLocalPotion(restored,ticket.id,'operation',true),false);
  assert.equal(restored.localArena!.confirmedPotions,2);
  assert.equal(restored.localArena!.match.game.players[0].belt.potion,2);
  assert.equal(live.availablePotions(a.id,3),2);
  const stack=consumableStacks(restored,live.availablePotions(a.id,3));
  assert.deepEqual(stack.map(item=>[item.id,item.count]),[['potion',2]]);
  assert.equal(restored.inventory.length,p.inventory.length);
  live.releaseLocalPotions(a,ticket.id);
  assert.ok(live.useLocalPotion(a,ticket.id,'operation',now+2000));
  assert.equal(live.useLocalPotion(a,ticket.id,'new-operation',now+2000),false);
  live.join(a,'duel',build,'Герой',now,true,3);
  live.join(b,'duel',build,'Борис',now,true,0);
  assert.equal(live.state(a,now).battle?.belt.potion,2);
 }finally{live.close()}
});

test('confirmed elixirs share their reserve with local fallback and preserve unused units',()=>{
 const live=new LiveArena(':memory:',seeded(17)),p=hero(6,false);
 const a={id:'310',controller:'tab'},b={id:'410',controller:'tab'};
 const issued={aegis:2,tear:1},loadout=['aegis','tear',null,null,null,null,null] as const;
 p.arenaBelt=[...loadout];
 let now=Date.now();
 try{
  const ticket=live.join(a,'team',arenaBuild(p),'Герой',now,true,issued,p.stage,0,loadout).search!;
  for(let i=0;i<20;i++){now+=1000;live.state(a,now);live.tick(now);}
  const fallback=live.state(a,now).local!;
  assert.equal(fallback.id,ticket.id);
  assert.deepEqual(fallback.confirmedStock,issued);
  assert.deepEqual(fallback.proof?.stock,issued);
  assert.ok(startLocalArena(p,ticket.id,'team',now,fallback.proof,now,0,fallback.confirmedStock));
  assert.ok(prepareLocalConsumable(p,now,'aegis-operation','aegis'));
  assert.equal(live.useLocalConsumable(b,ticket.id,'aegis-operation','aegis',now),false);
  assert.ok(live.useLocalConsumable(a,ticket.id,'aegis-operation','aegis',now));
  assert.equal(live.useLocalConsumable(a,ticket.id,'aegis-operation','tear',now),false);
  assert.ok(live.useLocalConsumable(a,ticket.id,'aegis-operation','aegis',now));
  const restored=parseSave(JSON.stringify(p))!;
  assert.ok(settleLocalPotion(restored,ticket.id,'aegis-operation',true));
  assert.equal(restored.localArena?.confirmedStock?.aegis,1);
  assert.equal(prepareLocalConsumable(restored,now+1,'tear-operation','tear'),false);
  const quote=live.consumablesQuote(a,issued,{},1,100,now);
  assert.equal(quote.stock.aegis,1);
  assert.equal(quote.stock.tear,1);
  live.releaseLocalPotions(a,ticket.id);
  assert.equal(live.useLocalConsumable(a,ticket.id,'tear-operation','tear',now),false);
  assert.equal(live.consumablesQuote(a,issued,{},1,100,now).stock.tear,1);
 }finally{live.close()}
});
