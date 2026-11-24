import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {applyCommand,appendMessage,newMatch,viewMatch,type Match,type Entrant} from '../../server/arena/duel';
import {CHAT_MS,type ArenaCommand} from '../../src/arena/protocol';

const [box,step]=process.argv.slice(2);
const sql=(query:string,variables:Record<string,string>={})=>execFileSync('docker',[
 'exec','-i',box,'psql','-XqAt','-h','127.0.0.1','-v','ON_ERROR_STOP=1','-U','postgres',
 ...Object.entries(variables).flatMap(([key,value])=>['-v',key+'='+value]),
],{input:query,encoding:'utf8'}).trim();
const start=1_800_000_000_000;
const actor:Entrant={id:'a',name:'A',level:1,rating:1000,hero:'ranger',kit:'offensive',controller:'a-tab'};
const opponent:Entrant={...actor,id:'b',name:'B',kit:'balanced',controller:'b-tab'};
const move: ArenaCommand={kind:'move',move:{attack:'head',blocks:['belly','legs'],skill:null}};
const reply: ArenaCommand={kind:'move',move:{attack:'legs',blocks:['chest','belly'],skill:null}};
const rng=()=>.5;
const fresh=()=>newMatch('assessment',actor,opponent,start,false,rng);
function checkpoint(){
 const match=fresh();
 assert.ok(applyCommand(match,actor.id,move,1,1,start,rng));
 appendMessage(match,start,'Хорошего боя',actor.name);
 return match;
}
function finish(match:Match){
 assert.equal(applyCommand(match,actor.id,move,1,1,start,rng),false);
 assert.ok(applyCommand(match,opponent.id,reply,1,1,start,rng));
 for(let i=0;i<59&&!match.result;i++){
  const a=match.players[0],b=match.players[1],at=start+i+1;
  assert.ok(applyCommand(match,actor.id,move,match.round,a.sequence+1,at,rng));
  assert.ok(applyCommand(match,opponent.id,reply,match.round,b.sequence+1,at,rng));
 }
 assert.ok(match.result);
 return viewMatch(match,actor.id,actor.controller,match.result.finishedAt);
}
if(step==='seed'){
 const saved=checkpoint();
 sql("update public.assessment_rooms set snapshot=:'snapshot'::jsonb where id=1;",{snapshot:JSON.stringify(saved)});
}else{
 const persisted=JSON.parse(sql("select snapshot from public.assessment_rooms where id=1;")) as Match;
 assert.deepEqual(persisted,JSON.parse(JSON.stringify(checkpoint())));
 const later=finish(persisted);
 assert.deepEqual(later,finish(checkpoint()));
 assert.equal(later.chatDeadline,(later.result?.finishedAt??0)+CHAT_MS);
 assert.equal(later.chat[0].text,'Хорошего боя');
 console.log('Same battle engine: persisted first move, health and round recovery, duplicate rejection, matching result and chat window after restart');
}
