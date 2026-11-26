import test from 'node:test';
import assert from 'node:assert/strict';
import {battleLimit,consumableIds,consumablePrice,consumableRules,consumableStock,healingPotion,type ConsumableId} from '../src/arena/potion';
import {createFighter,drinkStatElixir,type Entrant,type Fighter} from '../server/arena/duel';
import {newTeamMatch,drinkTeamElixir} from '../server/arena/team';
import {resolveHeroTurn} from '../src/arena/heroCombat';
import {arenaBuild} from '../src/arena/hero';
import {LiveArena} from '../server/arena/live';
import {localArena,startLocalArena,updateLocalArena} from '../src/arena/local';
import {applyPurchase,shopOffers} from '../src/saga/shop';
import {hero,seeded} from '../scripts/sim/arena';

// Owner-approved table V1.0 (Issue #81, comment 7186062726): value, duration s, cooldown s, price multiplier.
const approved:Record<ConsumableId,[string,number,number,number,number]>={
 potion:['Сердце Вальгаллы',.45,0,4,1],tear:['Слеза Иггдрасиля',.6,12,25,1.2],berserk:['Кровь Берсерка',.35,10,25,1.3],
 thor:['Гром Тора',.6,10,25,1.5],odin:['Око Одина',.25,12,25,1],niflheim:['Дыхание Нифльхейма',.25,10,25,1.2],
 muspel:['Пламя Муспельхейма',.08,8,30,1.3],aegis:['Эгида Юпитера',.25,12,30,1.4],mars:['Ярость Марса',.2,10,25,1.2],
 mercury:['Крылья Меркурия',.2,10,25,1.2],minerva:['Мудрость Минервы',1,0,20,1],venom:['Яд Ёрмунганда',.5,12,30,1.3],
 fenrir:['Клык Фенрира',.3,10,25,1.3],hel:['Поцелуй Хель',.25,12,30,1.4],loki:['Хитрость Локи',.5,10,25,1.2],
 steel:['Сталь Свартальвхейма',.4,12,25,1.2],neptune:['Прилив Нептуна',.2,0,40,1.6],apollo:['Свет Аполлона',.3,12,30,1.3],
 valkyrie:['Обет Валькирии',.1,15,0,2.5],bifrost:['Радуга Биврёста',1,8,40,1.5],
};
const belt=(...ids:ConsumableId[])=>[...ids,...Array(7-ids.length).fill(null)] as (ConsumableId|null)[];
const developed=arenaBuild(hero(30,false));
// A plain build so a test sees only the consumable: no companions, perks, regeneration, lifesteal, crit or dodge.
const build={...developed,followers:[],perks:[],unique:[],stats:{...developed.stats,lifesteal:0,dodge:0,crit:0},
 aura:{...developed.aura,regen:0,thorns:0,veil:0,opening:0,rally:0,firstBlock:false}};
function fighter(id:string,ids:ConsumableId[],count=9):Fighter{
 const entrant:Entrant={id,name:id,level:build.level,rating:1000,hero:build.hero,kit:'balanced',controller:id,build,potions:count,
  loadout:belt(...ids),stock:Object.fromEntries(ids.map(kind=>[kind,count]))};
 const f=createFighter(entrant,0);
 f.ready={strike:1e9,call:1e9,hammer:1e9};f.crit=0;
 return f;
}
const messages=()=>({log:[] as {text:string}[],chat:[],messageId:0}) as never;
const quiet=()=>{};
const high=()=>.99;// no crit, no dodge, top of the damage spread

test('the 20 consumables carry exactly the approved names and numbers, in the owner order',()=>{
 assert.deepEqual(consumableIds,Object.keys(approved));
 for(const id of consumableIds){
  const [name,value,duration,cooldown,price]=approved[id],rule=consumableRules[id];
  assert.deepEqual([rule.name,rule.value,rule.duration,rule.cooldown,rule.price],[name,value,duration,cooldown,price],id);
 }
 assert.equal(healingPotion.fraction,.45);assert.equal(healingPotion.cooldown,4000);
});

test('shop: every kind is sold for gold at the Heart of Valhalla price times its multiplier; buying adds one unit',()=>{
 const p=hero(40,false);p.gold=1e9;
 const offers=shopOffers(p).filter(offer=>offer.category==='elixirs');
 assert.equal(offers.length,20);
 assert.equal(offers[0].id,'arena-potion','existing shop id kept');
 for(const [index,id] of consumableIds.entries()){
  assert.equal(offers[index].currency,'gold');
  assert.equal(offers[index].price,Math.round(healingPotion.cost(p.stage)*approved[id][4]));
  assert.equal(offers[index].price,consumablePrice(id,p.stage));
  applyPurchase(p,offers[index],Date.now());
  assert.equal(consumableStock(p,id),id==='potion'?(hero(40,false).arenaPotions??0)+1:1,id);
 }
});

test('a fighter brings at most 5 of each chosen kind (the Oath once) and only kinds on its belt',()=>{
 const f=fighter('a',['tear','valkyrie','potion']);
 assert.equal(f.belt.tear,5);assert.equal(f.belt.potion,5);assert.equal(f.belt.valkyrie,1);
 assert.equal(f.belt.thor,0,'not on the belt');
 assert.equal(battleLimit('valkyrie'),1);
});

test('shared 2 s cooldown, individual cooldowns, no stacking, nothing wasted when an item would do nothing',()=>{
 const a=fighter('a',['berserk','mars','potion']),b=fighter('b',[]),m=messages();
 assert.equal(drinkStatElixir(m,a,'potion',1000,b),false,'full health: potion refused and kept');
 assert.equal(a.belt.potion,5);
 assert.equal(drinkStatElixir(m,a,'berserk',1000,b),true);
 assert.equal(a.belt.berserk,4);
 assert.equal(drinkStatElixir(m,a,'mars',2999,b),false,'shared 2 s cooldown');
 assert.equal(drinkStatElixir(m,a,'mars',3000,b),true);
 assert.equal(drinkStatElixir(m,a,'berserk',25_999,b),false,'individual 25 s cooldown');
 assert.equal(drinkStatElixir(m,a,'berserk',26_000,b),true);
 assert.equal(a.combat!.fx!.until.berserk,36_000,'a repeat refreshes, never stacks');
});

test('Heart of Valhalla heals 45% max HP; healing never exceeds max HP; venom halves received healing',()=>{
 const a=fighter('a',['potion']),b=fighter('b',['venom']),m=messages();
 a.hp=Math.round(a.maxHp*.2);
 assert.ok(drinkStatElixir(m,a,'potion',0,b));
 assert.equal(a.hp,Math.round(a.maxHp*.2)+Math.round(a.maxHp*.45));
 a.hp=a.maxHp-10;
 assert.ok(drinkStatElixir(m,a,'potion',4000,b));
 assert.equal(a.hp,a.maxHp,'capped');
 assert.ok(drinkStatElixir(m,b,'venom',0,a));
 a.hp=1;
 assert.ok(drinkStatElixir(m,a,'potion',8000,b));
 assert.equal(a.hp,1+Math.round(a.maxHp*.45*.5),'venom: half the healing');
});

test('Bifrost blocks new negative consumable effects; Minerva removes one active negative effect',()=>{
 const a=fighter('a',['bifrost','minerva']),b=fighter('b',['venom','niflheim']),m=messages();
 assert.ok(drinkStatElixir(m,b,'venom',0,a));
 assert.ok(drinkStatElixir(m,a,'bifrost',0,b));
 assert.ok(drinkStatElixir(m,b,'niflheim',2000,a),'spent');
 assert.equal(a.combat!.fx!.until.niflheim,undefined,'blocked by Bifrost');
 assert.ok((a.combat!.fx!.until.venom??0)>2000,'existing effect stays');
 assert.ok(drinkStatElixir(m,a,'minerva',2000,b));
 assert.equal(a.combat!.fx!.until.venom,undefined,'Minerva removed the venom');
 assert.equal(drinkStatElixir(m,a,'minerva',30_000,b),false,'nothing to remove: not spent');
});

test('Muspelheim burns 8% max HP over 8 s in total; burns from different players do not add up',()=>{
 const a=fighter('a',['muspel']),c=fighter('c',['muspel']),b=fighter('b',[]),m=messages();
 assert.ok(drinkStatElixir(m,a,'muspel',0,b));
 assert.ok(drinkStatElixir(m,c,'muspel',0,b),'second burner refreshes, not stacks');
 const before=b.hp;
 b.combat!.lastAction=0;
 resolveHeroTurn(b,a,{attack:'head',blocks:['chest','legs'],skill:null},['chest','legs'],20_000,high,quiet);
 assert.equal(before-b.hp,Math.round(b.maxHp*.08),'exactly one 8% burn');
});

test('Aegis shields 25% max HP without stacking; the Valkyrie Oath saves once at 10% max HP',()=>{
 const a=fighter('a',['aegis','valkyrie']),b=fighter('b',[]),m=messages();
 assert.ok(drinkStatElixir(m,a,'aegis',0,b));
 assert.equal(a.combat!.fx!.aegis,Math.round(a.maxHp*.25));
 assert.ok(drinkStatElixir(m,a,'valkyrie',2000,b));
 assert.equal(a.belt.valkyrie,0,'once per fight');
 // Lethal blow: the shield soaks first, then the Oath leaves 10% HP; a second lethal blow kills.
 b.attack=a.maxHp*50;
 resolveHeroTurn(b,a,{attack:'head',blocks:['chest','legs'],skill:null},['chest','legs'],3000,high,quiet);
 assert.equal(a.hp,Math.round(a.maxHp*.1));
 assert.equal(a.combat!.fx!.oath,true);
 resolveHeroTurn(b,a,{attack:'head',blocks:['chest','legs'],skill:null},['chest','legs'],6000,high,quiet);
 assert.equal(a.hp,0);
});

test('Berserker, Thor and Apollo add up, Thor is spent by the next successful hit, Thor and Loki never share a hit',()=>{
 const hit=(ids:ConsumableId[],blocks:['head'|'chest','chest'|'legs']=['chest','legs'])=>{
  const a=fighter('a',ids),b=fighter('b',[]),m=messages();
  for(const [i,id] of ids.entries())assert.ok(drinkStatElixir(m,a,id,i*2000,b),id);
  const at=ids.length*2000,before=b.hp;
  resolveHeroTurn(a,b,{attack:'head',blocks:['chest','legs'],skill:null},blocks,at,high,quiet);
  return {dealt:before-b.hp,a};
 };
 const base=hit([]).dealt,berserk=hit(['berserk']).dealt,both=hit(['berserk','thor']);
 assert.ok(Math.abs(berserk/base-1.35)<.02,'berserk +35%');
 assert.ok(Math.abs(both.dealt/base-1.95)<.03,'additive: 1+.35+.6, not 1.35×1.6');
 assert.equal(both.a.combat!.fx!.until.thor,undefined,'Thor spent');
 const blocked=hit([],['head','chest']).dealt;
 assert.equal(blocked,0,'a plain block stops the hit');
 const loki=hit(['loki','thor'],['head','chest']);
 assert.ok(Math.abs(loki.dealt/base-.5)<.02,'Loki lets half of a full block through, without Thor');
 assert.ok((loki.a.combat!.fx!.until.thor??0)>0,'Thor waits for the next hit');
});

test('Neptune heals self 20% and living allies 10% at most once per 10 s, never revives',()=>{
 const entrants=Array.from({length:6},(_,i):Entrant=>({id:'p'+i,name:'p'+i,level:build.level,rating:1000,hero:build.hero,kit:'balanced',controller:'p'+i,build,
  loadout:belt('neptune'),stock:{neptune:5}}));
 const match=newTeamMatch('t','team',entrants,0,seeded(3));
 const [me,,ally,,dead]=match.players;
 for(const p of [me,ally])p.hp=Math.round(p.maxHp*.5);
 dead.hp=0;
 assert.ok(drinkTeamElixir(match,'p0','neptune',1,0));
 assert.equal(me.hp,Math.round(me.maxHp*.5)+Math.round(me.maxHp*.2));
 assert.equal(ally.hp,Math.round(ally.maxHp*.5)+Math.round(ally.maxHp*.1));
 assert.equal(dead.hp,0,'no revive');
 // The ally drank nothing yet, but every living recipient (itself included) got Neptune under 10 s ago: refused, kept.
 ally.hp=Math.round(ally.maxHp*.5);me.hp=Math.round(me.maxHp*.5);
 assert.equal(drinkTeamElixir(match,'p2','neptune',1,5000),false);
 assert.equal(ally.belt.neptune,5);
 assert.ok(drinkTeamElixir(match,'p2','neptune',1,10_000),'lock over');
 assert.equal(ally.hp,Math.round(ally.maxHp*.5)+Math.round(ally.maxHp*.2));
});

test('local fight: stock goes to the belt, each use spends one unit, unused units stay; the proof replays it',()=>{
 const p=hero(20,false);p.arenaConsumables={mars:7,aegis:2};p.arenaBelt=belt('mars','aegis');
 assert.ok(startLocalArena(p,'local-x','duel',Date.now()));
 const fighter=localArena(p)!.match.game.players[0];
 assert.equal(fighter.belt.mars,5);assert.equal(fighter.belt.aegis,2);
 assert.ok(updateLocalArena(p,Date.now(),{kind:'item',item:'mars'}));
 assert.equal(p.arenaConsumables.mars,6,'one unit spent, the rest restored to stock');
 assert.equal(updateLocalArena(p,Date.now(),{kind:'item',item:'thor'}),false,'not on the belt');
});

test('server: network PvP never trusts client stock of the 19 new kinds; local proof gets belt-capped stock',()=>{
 const live=new LiveArena(':memory:',seeded(5)),now=Date.now(),b=arenaBuild(hero(6,false));
 try{
  const loadout=belt('potion','mars');
  live.join({id:'901',controller:'t'},'duel',b,'A',now,true,0,undefined,undefined,loadout,{mars:50,thor:3,potion:9});
  live.join({id:'902',controller:'t'},'duel',b,'B',now,true,0,undefined,undefined,loadout,{mars:5});
  const view=live.state({id:'901',controller:'t'},now).battle!;
  assert.equal(view.belt.mars,0,'network fight: no trusted stock for new kinds');
  assert.equal(view.belt.thor,0);
 }finally{live.close()}
});
