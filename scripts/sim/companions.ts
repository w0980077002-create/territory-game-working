/**
 * Companion stars on the real Battle engine (TEST_ONLY). Reuses the fairness reference hero and fight loop and adds
 * a companion development scenario on top: stars, level, awakening and the squad collection bonus.
 * Usage: [PREP=neglected|mixed|prepared] [STAGES=60,150] [SEEDS=10] [SCEN='a|b'] [SCHEDULES='0:0,1.5:0.6,3:1.1,4.5:0.3']
 *  npx tsx scripts/sim/companions.ts → one JSON line per schedule × stage × scenario (median of seeds).
 * SCHEDULES = dog-heal start shift : skill cadence offset in seconds; '0:0' is the shipped fixed schedule (control).
 * Shifted schedules only check that conclusions do not hinge on one timing; they are not real-game win rates.
 */
import {fight,type Preparation} from './fairness';
import {companionIds,followerId,newFollower,squadBonus,followerStarCap} from '../../src/dark/rules';
import {stats} from '../../src/core/formulas';
import type {Player} from '../../src/core/types';

type Scenario={name:string;stars:Record<string,number>;lv?:number;step?:number;aw?:boolean};
const all=(n:number)=>Object.fromEntries(companionIds.map(id=>[id,n]));
const scenarios:Scenario[]=[
 {name:'без звёзд',stars:all(0)},
 {name:'ур.100 без звёзд',stars:all(0),lv:100},
 {name:'Добротные 40★',stars:{...all(0),'08_armored_boar':40,moss_eater:40}},
 {name:'все 20★, ур.60, ступень 2',stars:all(20),lv:60,step:2},
 {name:'все 40★, ур.100, ступень 4',stars:all(40),lv:100,step:4,aw:true},
 {name:'максимум: все 80★, ступень 8, дар',stars:all(80),lv:100,step:8,aw:true},
];
/** Puts one instance per species into the save; goose and dog stay the formation (starter striker and guardian). */
function develop(p:Player,s:Scenario){
 p.saga??={v:1,n:{},flags:[],seen:[],trophies:[],box:{}} as never;
 const instances=Object.fromEntries(companionIds.map(id=>{
  const lv=s.lv??(id==='goose_aviator'?p.companions[0]:id==='brown_white_dog'?p.companions[1]:1);
  const pet=newFollower(id,lv,[],Math.min(s.stars[id],followerStarCap(s.step??0)),!!s.aw);pet.step=s.step??0;
  pet.talents.forEach((slot,i)=>{if(i<4+Math.floor(pet.step/2))slot.open=true});
  return [followerId(id),pet];
 }));
 if(s.lv){p.companions=[s.lv,s.lv]}
 p.saga!.box.squad={v:2,instances,shards:{},formation:[followerId('goose_aviator'),followerId('brown_white_dog'),null]};
}
const median=(xs:number[])=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const seeds=Array.from({length:Number(process.env.SEEDS??5)},(_,i)=>i+1),prep=(process.env.PREP??'mixed') as Preparation;
const stages=(process.env.STAGES??'13,34,60,90').split(',').map(Number);
const only=process.env.SCEN?.split('|');
// Reproducible schedules: dog-heal start shift and skill cadence offset (s). '0:0' is the shipped fixed schedule.
const schedules=(process.env.SCHEDULES??'0:0').split(',').map(x=>{const [dog,skill]=x.split(':').map(Number);return {dog,skill}});
for(const schedule of schedules)for(const stage of stages)for(const s of scenarios.filter(x=>!only||only.includes(x.name))){
 let bonus=0,hp=0,attack=0;
 const rows=seeds.map(seed=>fight(stage,10,'berserker',prep,0,seed,'campaign',p=>{develop(p,s);bonus=squadBonus(p).atkPct;const st=stats(p);hp=st.hp;attack=st.attack},schedule));
 console.log(JSON.stringify({schedule:schedule.dog+':'+schedule.skill,stage,scenario:s.name,prep,wins:rows.filter(r=>r.win).length+'/'+seeds.length,
  petShare:median(rows.map(r=>(r as {petShare:number}).petShare)),seconds:median(rows.map(r=>r.seconds)),hpLeft:median(rows.map(r=>r.hpLeft)),taken:median(rows.map(r=>r.taken)),squad:'+'+Math.round(bonus*100)+'%',hp,attack}));
}
