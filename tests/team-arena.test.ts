import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {Entrant} from '../server/arena/duel';
import {advanceTeamMatch,newTeamMatch,strikeTeamMatch,teamArenaSize} from '../server/arena/team';
import {ROUND_MS} from '../src/arena/protocol';

const entrants=(count:number):Entrant[]=>Array.from({length:count},(_,i)=>({
 id:`player-${i}`,name:`Игрок ${i+1}`,level:1,rating:0,hero:'berserker',kit:'balanced',controller:`browser-${i}`,
}));
const normal=()=>0.5;

test('both team sizes form balanced rosters with no duplicate player',()=>{
 for(const mode of ['team','chaos'] as const){
  const roster=entrants(teamArenaSize[mode]*2);
  const match=newTeamMatch('match',mode,roster,0);
  for(const side of [0,1])assert.equal(match.players.filter(player=>player.side===side).length,teamArenaSize[mode]);
  assert.throws(()=>newTeamMatch('duplicate',mode,[roster[1],...roster.slice(1)],0));
  assert.throws(()=>newTeamMatch('incomplete',mode,roster.slice(1),0));
 }
});

test('a blocked attack refreshes the team clock and replay cannot alter a restored match',()=>{
 const [a,b,ally]=entrants(6);
 const match=newTeamMatch('match','team',entrants(6),0);
 assert.equal(strikeTeamMatch(match,a.id,ally.id,'head',['head','legs'],1,1,normal),false);
 assert.equal(strikeTeamMatch(match,b.id,a.id,'head',['head','chest'],1,10,normal),true);
 const restored:typeof match=JSON.parse(JSON.stringify(match));
 const originalHp=restored.players[1].hp;
 assert.equal(strikeTeamMatch(restored,a.id,b.id,'head',['head','legs'],1,100,normal),true);
 assert.equal(restored.players[1].hp,originalHp);
 assert.equal(strikeTeamMatch(restored,a.id,b.id,'belly',['head','legs'],1,3_200,normal),false);
 assert.equal(strikeTeamMatch(restored,a.id,b.id,'belly',['head','legs'],2,3_000,normal),false);
 assert.equal(restored.players[0].sequence,1);
 assert.equal(restored.sideDeadline[0],ROUND_MS+100);
 assert.equal(strikeTeamMatch(restored,a.id,b.id,'head',['chest','legs'],2,ROUND_MS+10,normal),false);
 assert.deepEqual(restored.result,{winner:0,reason:'afk',finishedAt:ROUND_MS+10});
});

test('late targeting is resolved against another live enemy and the last defeat settles once',()=>{
 const match=newTeamMatch('chaos','chaos',entrants(40),0);
 const [a,b,ally]=match.players;
 for(const fighter of match.players)if(fighter.side===1)fighter.hp=1;
 assert.equal(strikeTeamMatch(match,a.id,b.id,'head',['chest','legs'],1,1,normal),true);
 assert.equal(a.damage,1);
 assert.equal(a.kills,1);
 assert.equal(strikeTeamMatch(match,ally.id,b.id,'head',['chest','legs'],1,1,normal),true);
 assert.equal(ally.kills,1);
 for(let sequence=2;sequence<=19;sequence++)
  assert.equal(strikeTeamMatch(match,a.id,b.id,'head',['chest','legs'],sequence,(sequence-1)*3_000+1,normal),true);
 assert.equal(a.kills,19);
 assert.deepEqual(match.result,{winner:0,reason:'hp',finishedAt:54_001});
 advanceTeamMatch(match,200_000);
 assert.equal(strikeTeamMatch(match,a.id,b.id,'head',['chest','legs'],20,200_000,normal),false);
 assert.deepEqual(match.result,{winner:0,reason:'hp',finishedAt:54_001});
});
