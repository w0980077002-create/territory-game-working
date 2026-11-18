import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {installHeadless} from '../scripts/sim/bot';
installHeadless();
import {cloudSave,measureCloudSave,readCloud,CLOUD_MAX_CHUNKS} from '../src/core/telegram';
import {freshPlayer,makeItem,makePerkItem,mayStartLoot,parseSave,SAVE_KEY,useGame,trimBattleReceipts,BATTLE_RECEIPTS} from '../src/core/store';
import {slots} from '../src/data/catalog';
import {Battle} from '../src/game/Battle';
import type {Player,Item} from '../src/core/types';

type Row={key:string;value:string;done:(e:unknown,stored?:boolean)=>void};
/** Telegram CloudStorage as documented: ≤1024 keys, values ≤4096 characters. `hold` keeps callbacks for interruption tests. */
function mockCloud(opts:{hold?:boolean;fail?:(key:string)=>boolean}={}){
 const data=new Map<string,string>(),pending:Row[]=[];
 const CloudStorage={
  getItem:(k:string,cb:(e:unknown,v?:string)=>void)=>cb(null,data.get(k)??''),
  setItem:(key:string,value:string,done:(e:unknown,stored?:boolean)=>void)=>{
   assert.ok(value.length<=4096,`value for ${key} is ${value.length} characters`);
   const row={key,value,done:(e:unknown,stored?:boolean)=>{if(!e&&stored!==false)data.set(key,value);done(e,stored)}};
   if(opts.fail?.(key)){done(new Error('network lost'));return}
   if(opts.hold)pending.push(row);else row.done(null,true);
   assert.ok(data.size<=1024,'Telegram key limit');
  }
 };
 Object.defineProperty(globalThis,'window',{value:{Telegram:{WebApp:{initData:'test',CloudStorage}}},configurable:true});
 return {data,pending};
}
const save=(raw:string)=>new Promise<{ok:boolean;reason?:string}>(resolve=>void cloudSave(raw,(ok,reason)=>resolve({ok,reason})));
const read=async()=>{const r=await readCloud();return r.status==='found'?r.raw:r.status};

/** A late-game hero: 12+wings worn, named trophies, a full backpack and `stored` items in storage. */
function bigPlayer(stored:number):Player{
 const p=freshPlayer();p.level=90;p.stage=61;p.gold=987654321;
 p.equipment=Object.fromEntries(slots.map(s=>[s,{...makeItem(s,90,6),upgrade:12}])) as Player['equipment'];
 p.equipment.boots=makePerkItem('boots',90,'Трофей Логова · Старший бурильщик');
 p.equipment.ring2=makePerkItem('moss',90,'Трофей Логова · Пожиратель мха');
 p.inventory=Array.from({length:80},(_,i)=>i%10===0?makePerkItem(i%20===0?'belt':'void',80,'Трофей · '+i):makeItem(slots[i%slots.length],80,i%9));
 p.pendingLoot=Array.from({length:stored},(_,i)=>({...makeItem(slots[i%slots.length],70+i%20,i%9),...(i%7===0?{locked:true}:{})}));
 p.claimed=['wings','first-boss-relic',...Array.from({length:BATTLE_RECEIPTS},(_,i)=>`battle:enc-${(1e12+i*997).toString(36)}-${(i*7919).toString(36)}x`)];
 return p;
}
const ids=(p:Player)=>[...Object.values(p.equipment).map(i=>i!.id),...p.inventory.map(i=>i.id),...(p.pendingLoot??[]).map(i=>i.id)];

for(const stored of [300,800,1500])test(`cloud: ${stored} stored items survive upload, restart and parsing without loss or duplicates`,async()=>{
 const cloud=mockCloud(),p=bigPlayer(stored),raw=JSON.stringify(p);
 const result=await save(raw);assert.deepEqual(result,{ok:true,reason:undefined});
 const meta=JSON.parse(cloud.data.get('save_meta')!);assert.equal(meta.z,1,'compressed');
 const measured=await measureCloudSave(raw);
 assert.equal(measured.chunks,meta.count);
 assert.equal(measured.bytes,[...cloud.data].filter(([key])=>key.startsWith('save_'+meta.generation+'_')).reduce((sum,[,v])=>sum+v.length,0));
 console.log(`${stored} stored: ${Buffer.byteLength(raw)} UTF-8 bytes → ${measured.bytes} gzip+base64 bytes, ${meta.count} chunks`);
 assert.ok(meta.count<=20,`${raw.length} chars took ${meta.count} chunks`);
 const restored=await read();assert.equal(restored,raw,'byte-identical after restart');
 const back=parseSave(restored as string,true)!;assert.ok(back);
 assert.deepEqual(ids(back),ids(p));assert.equal(new Set(ids(back)).size,ids(p).length,'no duplicated items');
 assert.equal(back.pendingLoot!.length,stored);assert.deepEqual(back.equipment,p.equipment,'12 slots + wings and worn trophies kept');
 assert.deepEqual(back.inventory.filter(i=>i.perk).map(i=>i.perk),p.inventory.filter(i=>i.perk).map(i=>i.perk),'named trophies kept');
});

test('cloud: copies written by the previous version (plain JSON chunks) are still read',async()=>{
 const cloud=mockCloud(),raw=JSON.stringify(bigPlayer(120));
 const chunks=raw.match(/[\s\S]{1,3000}/g)!;cloud.data.set('save_meta',JSON.stringify({generation:'1',count:chunks.length}));chunks.forEach((c,i)=>cloud.data.set('save_1_'+i,c));
 assert.equal(await read(),raw);
 const next=JSON.stringify({...JSON.parse(raw),gold:1});assert.equal((await save(next)).ok,true);
 assert.equal(JSON.parse(cloud.data.get('save_meta')!).generation,'0','the old bank is not overwritten');assert.equal(await read(),next);
});

test('cloud: an oversized save is refused with a reason and the previous copy stays intact',async()=>{
 const cloud=mockCloud(),good=JSON.stringify(bigPlayer(50));assert.equal((await save(good)).ok,true);
 const before=new Map(cloud.data);
 let x=1,junk='';for(let i=0;i<CLOUD_MAX_CHUNKS*3500*1.2;i++){x=(Math.imul(x,1103515245)+12345)>>>0;junk+=String.fromCharCode(33+(x>>>16)%90)}
 assert.deepEqual(await save(junk),{ok:false,reason:'too-large'});
 assert.deepEqual(cloud.data,before,'nothing written');assert.equal(await read(),good);
});

test('cloud: an upload interrupted mid-way or at the final step keeps the previous complete copy',async()=>{
 let cloud=mockCloud();const first=JSON.stringify(bigPlayer(400));assert.equal((await save(first)).ok,true);
 const data=cloud.data;
 let n=0;cloud=mockCloud({fail:key=>key.startsWith('save_')&&key!=='save_meta'&&++n===2});data.forEach((v,k)=>cloud.data.set(k,v));
 const second=JSON.stringify(bigPlayer(401));assert.deepEqual(await save(second),{ok:false,reason:'failed'});assert.equal(await read(),first);
 const keep=new Map(cloud.data);cloud=mockCloud({fail:key=>key==='save_meta'});keep.forEach((v,k)=>cloud.data.set(k,v));
 assert.equal((await save(second)).ok,false);assert.equal(await read(),first,'metadata never points at a half-written bank');
 const ok=new Map(cloud.data);cloud=mockCloud();ok.forEach((v,k)=>cloud.data.set(k,v));
 assert.equal((await save(second)).ok,true);assert.equal(await read(),second,'the next attempt succeeds');
});

test('cloud: clients without CompressionStream fall back to plain chunks that still fit 1500 items',async()=>{
 const C=globalThis.CompressionStream;Object.defineProperty(globalThis,'CompressionStream',{value:undefined,configurable:true,writable:true});
 try{const cloud=mockCloud(),raw=JSON.stringify(bigPlayer(1500));assert.equal((await save(raw)).ok,true);
  const meta=JSON.parse(cloud.data.get('save_meta')!);assert.equal(meta.z,undefined);assert.ok(meta.count<=CLOUD_MAX_CHUNKS);assert.equal(await read(),raw);}
 finally{Object.defineProperty(globalThis,'CompressionStream',{value:C,configurable:true,writable:true})}
});

test('claims: battle receipts stay bounded, other claims are kept and recent victories cannot be paid twice',()=>{
 const p=freshPlayer();p.claimed=['wings','first-boss-relic','pack-1',...Array.from({length:3000},(_,i)=>'battle:old-'+i)];
 trimBattleReceipts(p);
 assert.equal(p.claimed.filter(c=>c.startsWith('battle:')).length,BATTLE_RECEIPTS);
 assert.deepEqual(p.claimed.slice(0,3),['wings','first-boss-relic','pack-1']);assert.equal(p.claimed.at(-1),'battle:old-2999','newest receipts kept');
 useGame.setState({p:freshPlayer(),auto:false,panel:null,selected:null,recoveryRequired:false});
 for(let i=0;i<BATTLE_RECEIPTS+50;i++)assert.ok(useGame.getState().win('farm','enc-'+i));
 const g=useGame.getState();assert.equal(g.p.claimed.filter(c=>c.startsWith('battle:')).length,BATTLE_RECEIPTS);
 const gold=g.p.gold;for(const id of ['enc-'+(BATTLE_RECEIPTS+49),'enc-'+(BATTLE_RECEIPTS+10),'enc-100'])assert.equal(useGame.getState().win('farm',id),false,id+' paid twice');
 assert.equal(useGame.getState().p.gold,gold);
});

test('continued campaign above 80/80 and 80 stored retains every item and each boss reward once',t=>{
 const p=bigPlayer(85);
 p.stage=1;
 p.claimed=[];
 p.preferences={auto:false,speed:1,autoSalvageWeaker:false};
 useGame.setState({p,auto:false,autoSalvageWeaker:false,panel:null,recoveryRequired:false});
 t.mock.method(Math,'random',()=>0);
 for(let i=0;i<250;i++)assert.equal(useGame.getState().win('campaign','long-run-'+i),true);
 const g=useGame.getState();
 assert.equal(g.p.bosses,50);
 assert.equal(g.p.inventory.length,80);
 assert.equal(g.p.pendingLoot?.length,335);
 assert.equal(g.p.pendingLoot?.filter(i=>i.uniqueId==='ice_silk'&&i.origin==='Трофей Матриарха').length,1);
 assert.equal(g.win('campaign','long-run-249'),false);
 const restored=parseSave(localStorage.getItem(SAVE_KEY),true);
 assert.ok(restored);
 assert.deepEqual(ids(restored),ids(g.p));
 assert.equal(new Set(ids(restored)).size,ids(restored).length);
 assert.equal(restored.gold,g.p.gold);
});

test('near the actual gzip bank limit, new Horn rolls are blocked but earned rewards and old saves are kept',async t=>{
 const p=bigPlayer(1840);
 p.wave=5;
 p.stage=1;
 // Valid older item records with unusually long, poorly compressible text.
 const field=(bytes:number)=>randomBytes(bytes).toString('base64');
 for(const item of p.pendingLoot!)Object.assign(item,{id:field(90),name:field(90),origin:field(120)});
 const raw=JSON.stringify(p);
 const measured=await measureCloudSave(raw);
 assert.ok(measured.compressed&&measured.chunks>=224&&measured.chunks<=CLOUD_MAX_CHUNKS,`compressed fixture used ${measured.chunks} chunks`);
 assert.ok(parseSave(raw,true));
 useGame.setState({p,panel:'loot',selected:null,recoveryRequired:false,storageError:false,continueOnVictory:true});
 const random=t.mock.method(Math,'random',()=>0.1);
 useGame.getState().hornLoot();
 assert.equal(random.mock.callCount(),0,'no roll while a large save is being measured');
 for(let waited=0;waited<3000&&/Проверяем размер/.test(useGame.getState().toast);waited+=10){
  await delay(10);
  useGame.getState().hornLoot();
 }
 const g=useGame.getState();
 assert.match(g.toast,/близко к пределу/);
 assert.equal(g.p,p);
 assert.equal(random.mock.callCount(),0,'a refused opening never rolls loot or charges the Horn');
 g.open(null);
 const battle=new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement);
 battle.toggle();
 assert.equal(battle.running,false,'a new encounter cannot start while the reserve is low');
 // The same profile can have a fight in progress when the size moves past the limit.
 battle.phase='fight';
 battle.running=true;
 for(const unit of battle.units)unit.hp=0;
 battle.victory();
 assert.equal(battle.phase,'victory','an earned boss reward still commits');
 const restored=parseSave(localStorage.getItem(SAVE_KEY),true);
 assert.ok(restored);
 assert.equal(restored.pendingLoot?.length,1841);
 assert.deepEqual(restored.pendingLoot?.slice(0,1840),p.pendingLoot);
 assert.equal(restored.rewardOffer?.itemId,restored.pendingLoot?.at(-1)?.id);
 assert.equal(useGame.getState().win('campaign',battle.id),false);
 g.keepReward();
 battle.delay=0;
 battle.update(.05);
 assert.equal(battle.running,false,'autobattle stops before the next encounter');
 assert.equal(battle.phase,'victory');
 // A much smaller saved inventory should resume new loot actions without a new profile.
 assert.equal(useGame.getState().mutate(draft=>{draft.pendingLoot=draft.pendingLoot!.slice(-80)}),true);
 assert.equal(mayStartLoot(),true);
 battle.toggle();
 battle.update(.05);
 assert.equal(battle.phase,'walk');
 assert.equal(useGame.getState().p.bosses,p.bosses+1);
 battle.destroy();
});
