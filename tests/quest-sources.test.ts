import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {installHeadless} from '../scripts/sim/bot';
installHeadless();
import {freshPlayer} from '../src/core/store';
import {dailyPool,weeklyPool,mastery,ensureQuests,dailyView,weeklyView,dayOf,weekOf,DAILY_COUNT,WEEKLY_COUNT} from '../src/saga/quests';

const files=(dir:string):string[]=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):/\.tsx?$/.test(e.name)?[path.join(dir,e.name)]:[]);
const code=files('src').filter(f=>!f.endsWith(path.join('saga','quests.ts'))).map(f=>fs.readFileSync(f,'utf8')).join('\n');
/** A saga counter is reachable only if game code (not the quest board itself) writes it. */
function reachable(key:string){
 if(/^(stat|state|world):/.test(key))return true;
 if(code.includes(`'${key}'`))return true;
 const [prefix,rest]=key.split(':');
 return rest!==undefined&&code.includes(`'${prefix}:'`)&&(/^\d+$/.test(rest)||code.includes(`'${rest}'`));
}

test('quests: every daily, weekly and mastery goal can actually progress in the game',()=>{
 for(const q of [...dailyPool,...weeklyPool])for(const k of q.keys)assert.ok(reachable(k),`${q.id} waits for «${k}», which nothing in the game counts`);
 for(const m of mastery)for(const k of m.keys)assert.ok(reachable(k),`mastery ${m.id} waits for «${k}», which nothing in the game counts`);
});

test('quests: a saved board with a retired goal gets a playable replacement, claims kept',()=>{
 const now=Date.UTC(2026,10,18,12),p=freshPlayer();ensureQuests(p,now);
 const box=p.saga!.box.quests as {day:{picks:string[];claimed:string[]};week:{picks:string[];claimed:string[]}};
 box.day.picks[0]='d_sea';box.day.picks[1]='retired_goal';box.day.claimed.push(box.day.picks[2]);box.week.picks[0]='w_tower';
 const kept=box.day.picks[2];
 assert.equal(ensureQuests(p,now),true);
 assert.equal(dailyView(p,now).length,DAILY_COUNT);assert.equal(weeklyView(p,now).length,WEEKLY_COUNT);
 assert.equal(new Set(box.day.picks).size,DAILY_COUNT);assert.equal(new Set(box.week.picks).size,WEEKLY_COUNT);
 assert.ok(dailyView(p,now).find(q=>q.def.id===kept)?.claimed);
 assert.equal(ensureQuests(p,now),false,'repair is idempotent');
 assert.equal(dayOf(now),'2026-11-18');assert.ok(weekOf(now));
});

test('lair: the first victory over each keeper grants its promised named trophy exactly once',async()=>{
 const {useGame}=await import('../src/core/store');const {perks}=await import('../src/saga/gear');
 useGame.setState({p:freshPlayer(),auto:false,panel:null,selected:null,recoveryRequired:false});
 const items=()=>{const p=useGame.getState().p;return [...p.inventory,...(p.pendingLoot??[])]};
 const fight=(id:string,n:number)=>useGame.getState().win('dungeon','lair-'+id+'-'+n,{units:[{id}]} as never);
 for(const [id,perk] of [['senior_driller','boots'],['moss_eater','moss'],['capybara_bruiser','belt']] as const){
  assert.ok(fight(id,1));assert.equal(items().filter(i=>i.perk===perk).length,1,perks[perk].name+' after first win');
  assert.ok(fight(id,2));assert.equal(items().filter(i=>i.perk===perk).length,1,perks[perk].name+' is not duplicated');
 }
});
