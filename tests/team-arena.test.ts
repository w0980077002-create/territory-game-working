import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {Entrant} from '../server/arena/duel';
import {advanceTeamMatch,newTeamMatch,setTeamAuto,strikeTeamMatch,teamArenaSize,drinkTeamTimeElixir,type TeamMatch} from '../server/arena/team';
import {TeamRoomService} from '../server/arena/team-room';
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

test('a bot and an Auto player resume after reload without replaying a strike',()=>{
 const roster=entrants(6);
 const match=newTeamMatch('match','team',[roster[0],{...roster[1],bot:true},...roster.slice(2)],0,normal);
 assert.equal(setTeamAuto(match,roster[0].id,true,1,0,normal),true);
 assert.equal(setTeamAuto(match,roster[1].id,false,1,0,normal),false);
 assert.equal(strikeTeamMatch(match,roster[1].id,roster[0].id,'head',['chest','legs'],1,100,normal),false);
 advanceTeamMatch(match,6_499,normal);
 assert.equal(match.log.length,0);
 const restored:typeof match=JSON.parse(JSON.stringify(match));
 advanceTeamMatch(restored,6_500,normal);
 assert.equal(restored.log.length,2);
 assert.deepEqual(restored.sideDeadline,[ROUND_MS+6_500,ROUND_MS+6_500]);
 advanceTeamMatch(restored,6_500,normal);
 assert.equal(restored.log.length,2);
 assert.equal(restored.players[0].sequence,1);
 assert.equal(setTeamAuto(restored,roster[0].id,false,2,7_000,normal),true);
 advanceTeamMatch(restored,13_000,normal);
 assert.equal(restored.sideDeadline[0],ROUND_MS+6_500);
 assert.equal(restored.sideDeadline[1],ROUND_MS+13_000);
});

test('time elixir affects only the other team and resets on their next accepted strike',()=>{
 const match=newTeamMatch('match','team',entrants(6),0);
 const [a,b,ally]=match.players;
 assert.equal(drinkTeamTimeElixir(match,a.id,1,100,normal),true);
 assert.equal(drinkTeamTimeElixir(match,a.id,2,200,normal),false);
 assert.equal(drinkTeamTimeElixir(match,ally.id,1,300,normal),true);
 assert.deepEqual(match.sideDeadline,[60_000,40_000]);
 assert.equal(strikeTeamMatch(match,b.id,a.id,'chest',['head','legs'],1,39_999,normal),true);
 assert.deepEqual(match.sideDeadline,[60_000,99_999]);
 assert.deepEqual(match.timePenalty,[0,0]);
});

test('command handler retries concurrent room writes and only exposes the authenticated player controls',async()=>{
 const roster=entrants(6);
 const [a,b]=roster;
 const room={id:'team-room',mode:'team' as const,closesAt:new Date(20_000).toISOString(),
  readyAt:new Date(0).toISOString(),revision:0,players:roster.map(player=>player.id),snapshot:null as TeamMatch|null};
 const storage={
  async read(){return structuredClone(room)},
  async checkpoint(_room:string,expected:number,match:TeamMatch){
   if(expected!==room.revision)return null;
   room.snapshot=structuredClone(match);
   return ++room.revision;
  },
 };
 const service=new TeamRoomService(storage,async()=>roster,normal);
 const first={kind:'strike',attack:'head',blocks:['chest','legs'],sequence:1} as const;
 const results=await Promise.all([
  service.interact(a.id,room.id,100,{...first,blocks:[...first.blocks],target:b.id}),
  service.interact(a.id,room.id,100,{...first,blocks:[...first.blocks],target:b.id}),
  service.interact(b.id,room.id,100,{...first,blocks:[...first.blocks],target:a.id}),
 ]);
 assert.equal(results.filter(result=>result.accepted).length,2);
 assert.equal(room.revision,2);
 assert.equal(room.snapshot?.log.length,2);
 await assert.rejects(service.interact('other-player',room.id,100),/arena_not_member/);
 const {view}=await service.interact(a.id,room.id,200);
 assert.equal(view.you?.nextSequence,2);
 assert.equal(room.revision,2);
 assert.ok(view.players?.every(player=>!('controller' in player)&&!('belt' in player)));
});
