import {damage,odinCallSeconds,skillPowerMultiplier} from '../core/formulas';
import {gearRules} from '../core/gear';
import {companions} from '../dark/rules';
import {skillData} from '../data/catalog';
import {combos} from '../saga/companions';
import {team as companionTactics} from '../game/CompanionBrain';
import {zones,type ArenaMove,type ArenaSkill,type ArenaZone} from './protocol';
import type {ArenaBuild} from './hero';
import {consumableBattle,consumableRules,healingPotion,type ConsumableId} from './potion';

export type HeroState={
 build:ArenaBuild;started:number;lastAction:number;shield:number;callsUntil:number;controlUntil:number;
 turns:number;strikes:number;mark:Record<string,number>;ramp:number;target?:string;firstBlock:boolean;
 revived:boolean;burn:number;burnTarget?:string;cooldowns:Partial<Record<string,number>>;
 followerAt:number[];followerHits:number[];rescues:number;combo:number;comboUntil:number;fx?:ElixirState;
};
/** Arena consumable effects V1.0 (approved 26.11): expiry per timed effect, the Aegis shield, healing and burning over time. */
export type ElixirState={until:Partial<Record<ConsumableId,number>>;aegis:number;oath:boolean;neptuneAt:number;
 hot?:{rate:number;last:number;until:number};burn?:{rate:number;last:number;until:number;from:string}};
export type HeroFighter={id:string;name:string;hp:number;maxHp:number;attack:number;defense:number;crit:number;level:number;
 ready:Record<ArenaSkill,number>;combat?:HeroState};
export const ATTACK_INTERVAL_MS=3000;
const skills=['strike','call','hammer'] as const;
const has=(s:HeroState,id:ArenaBuild['perks'][number])=>s.build.perks.includes(id);
const unique=(s:HeroState,id:ArenaBuild['unique'][number])=>s.build.unique.includes(id);
type Log=(text:string)=>void;

export function makeHeroState(build:ArenaBuild,now:number):HeroState{
 return {build,started:now,lastAction:now,shield:Math.round(build.stats.hp*build.aura.veil),
  callsUntil:0,controlUntil:0,turns:0,strikes:0,mark:{},ramp:0,firstBlock:build.aura.firstBlock,
  revived:false,burn:0,cooldowns:{guard:now+4000,dive:now+5000},followerAt:build.followers.map((_,i)=>now+[1000,3000,5000][i]),
  followerHits:build.followers.map(()=>0),rescues:0,combo:0,comboUntil:0};
}

function available(s:HeroState,key:string,now:number){return now>=(s.cooldowns[key]??0)}
function start(s:HeroState,key:string,now:number,seconds:number){s.cooldowns[key]=now+1000*seconds}
function active(s:HeroState,key:string,now:number){return now<(s.cooldowns[key]??0)}
export const fxState=(s:HeroState)=>s.fx??=({until:{},aegis:0,oath:false,neptuneAt:0});
export const fxOn=(s:HeroState|undefined,id:ConsumableId,now:number)=>!!s?.fx&&now<(s.fx.until[id]??0);
/** Every heal is capped at max HP; the Jörmungandr venom halves healing the target receives. */
export function recover(p:HeroFighter,amount:number,log:Log,label:string,now:number){
 if(!p.hp)return 0;
 if(fxOn(p.combat,'venom',now))amount*=1-consumableRules.venom.value;
 const healed=Math.min(p.maxHp-p.hp,Math.round(amount));
 if(healed>0){p.hp+=healed;log(p.name+' · '+label+' +'+healed+' HP')}
 return Math.max(0,healed);
}

function strikeDamage(p:HeroFighter,amount:number,now:number,log:Log){
 const s=p.combat;
 if(s?.fx?.aegis&&fxOn(s,'aegis',now)){
  const soaked=Math.min(s.fx.aegis,amount);
  amount-=soaked;s.fx.aegis-=soaked;
  if(soaked)log(p.name+' · Эгида Юпитера поглощает '+soaked+' HP');
 }
 if(s){
  const soaked=Math.min(s.shield,amount);
  amount-=soaked;s.shield-=soaked;
  if(soaked)log(p.name+' · щит поглощает '+soaked+' HP');
 }
 const taken=Math.min(p.hp,Math.round(amount));
 p.hp-=taken;
 if(s?.fx&&!p.hp&&taken>0&&fxOn(s,'valkyrie',now)&&!s.fx.oath){
  s.fx.oath=true;delete s.fx.until.valkyrie;
  p.hp=Math.max(1,Math.round(p.maxHp*consumableRules.valkyrie.value));log(p.name+' · Обет Валькирии');
 }
 if(s&&!p.hp&&taken>0&&has(s,'heart')&&!s.revived){
  s.revived=true;p.hp=Math.max(1,Math.round(p.maxHp*.35));log(p.name+' · Второе дыхание');
 }
 return taken;
}

export function arenaAttackInterval(a:HeroFighter,b:HeroFighter,now:number){
 const s=a.combat,t=b.combat;
 if(!s)return ATTACK_INTERVAL_MS;
 const attackRate=s.build.stats.aspd*(active(s,'tempo',now)?gearRules.effects.tempo.rate:1);
 const control=(t&&t.build.sets.frost>=2?.92:1)*(active(s,'chill',now)?.8:1)*
  (active(s,'frost',now)?gearRules.effects.frost.rate:1);
 return Math.ceil(ATTACK_INTERVAL_MS/(attackRate*control));
}

export function pickHeroSkill(p:HeroFighter,now:number){
 if(!p.combat)return null;
 return (['call','strike','hammer'] as const).find(id=>p.ready[id]<=now)??null;
}

function startSkill(p:HeroFighter,skill:ArenaSkill,s:HeroState,now:number,log:Log){
 const i=skills.indexOf(skill),{sets,aura,runes,runePower,skills:levels}=s.build;
 p.ready[skill]=now+1000*skillData[i].cd/(aura.cooldownRate*(sets.rune>=4?1.15:1));
 if(has(s,'crown'))recover(p,p.maxHp*.04,log,'Корона Морока',now);
 if(skill==='call'){
  s.callsUntil=now+1000*odinCallSeconds(levels[1],has(s,'echo'));
  if(has(s,'echo'))s.shield=Math.max(s.shield,Math.round(p.maxHp*.08));
  if(runes[1]===1)s.shield=Math.max(s.shield,Math.round(p.maxHp*.15*runePower[1]));
  if(runes[1]===2)for(const other of ['strike','hammer'] as const)p.ready[other]=Math.max(now,p.ready[other]-2000);
  log(p.name+' · Клич Одина');
 }
 if(skill==='hammer'&&sets.rune>=6)s.shield=Math.max(s.shield,Math.round(p.maxHp*.1));
}

function companionTurn(a:HeroFighter,b:HeroFighter,s:HeroState,others:readonly HeroFighter[],now:number,log:Log){
 const {sets,followers,branches}=s.build;
 const healingBranch=branches[1]===1;
 for(const [i,member] of followers.entries()){
  const rescue=i===1&&a.hp/a.maxHp<companionTactics.rescueBelow&&s.rescues<(healingBranch?2:1);
  if((now<s.followerAt[i]&&!rescue)||!a.hp)continue;
  if(rescue)s.rescues++;
  s.followerAt[i]=now+member.interval*1000/(sets.legion>=2?1.2:1);
  const label=companions[member.id]?.name??'Спутник';
  if(member.role==='guardian'){
   recover(a,a.maxHp*Math.min(.45,member.power*(i===1&&healingBranch?1.4:1)*(sets.legion>=4?1.3:1)),log,label,now);
   if(member.id==='capybara_bruiser')s.shield=Math.max(s.shield,Math.round(a.maxHp*.06));
   if(member.id==='moss_eater'){s.controlUntil=0;delete s.cooldowns.chill;}
   if(member.awake)start(s,'howl',now,3);
  }else if(b.hp){
   const amount=Math.round(a.attack*member.power*(sets.legion>=4?2:1));
   const dealt=strikeDamage(b,amount,now,log);
   log(a.name+' → '+b.name+': '+label+' · −'+dealt+' HP');
   if(member.awake&&++s.followerHits[i]%3===0)
    for(const target of others)if(target.hp)strikeDamage(target,amount*.5,now,log);
   if(i===0&&unique(s,'pack')&&available(s,'pack',now)){
    const config=gearRules.effects.pack;
    start(s,'pack',now,config.cooldown);recover(a,a.maxHp*config.heal_fraction,log,'Стая',now);
    s.followerAt[1]-=config.dog_seconds*1000;
   }
  }
 }
}

export function resolveHeroTurn(a:HeroFighter,b:HeroFighter,move:ArenaMove,blocks:readonly ArenaZone[],now:number,rng:()=>number,log:Log,others:readonly HeroFighter[]=[]){
 const s=a.combat!,t=b.combat;
 const {sets,stats,aura,runes,runePower,spec,skills:levels}=s.build;
 const elapsed=Math.min(ATTACK_INTERVAL_MS,Math.max(0,now-s.lastAction))/1000;
 s.lastAction=now;
 s.turns++;
 recover(a,a.maxHp*(aura.regen+(has(s,'moss')?.01:0))*elapsed,log,'Восстановление',now);
 if(s.fx)tickElixirs(a,s.fx,now,log);
 if(!a.hp)return;
 const burnHits=Math.min(s.burn,Math.ceil(elapsed));
 if(b.hp&&s.burnTarget===b.id&&burnHits>0){
  s.burn-=burnHits;strikeDamage(b,Math.round(a.attack*.5)*burnHits,now,log);
 }
 const prefix=a.name+' → '+b.name+': ',impact=zones[move.attack].impact;
 if(!b.hp){companionTurn(a,b,s,others,now,log);return}
 if(now<s.controlUntil){log(prefix+'оглушение');return}
 if(now>=s.comboUntil)s.combo=0;
 const skill=move.skill??pickHeroSkill(a,now);
 const used=skill&&a.ready[skill]<=now?skill:null;
 if(used)startSkill(a,used,s,now,log);
 const skillIndex=used?skills.indexOf(used):-1;
 const special=used==='strike'||used==='hammer';
 const first=s.strikes===0&&has(s,'cutlass');
 s.strikes++;
 const blocked=blocks.includes(move.attack);
 const crit=first||special||s.combo===2||rng()<a.crit+(s.callsUntil>now&&runes[1]===0?.25:0)+(fxOn(s,'mars',now)?consumableRules.mars.value:0);
 const dodge=(t?.build.stats.dodge??.06)+(fxOn(t,'mercury',now)?consumableRules.mercury.value:0)-(fxOn(s,'odin',now)?consumableRules.odin.value:0);
 if(rng()<dodge){log(prefix+'уклонение от удара '+impact);companionTurn(a,b,s,others,now,log);return}
 if(t?.firstBlock){t.firstBlock=false;log(prefix+'блок · Эгида Тюра');companionTurn(a,b,s,others,now,log);return}
 // Loki: the next successful hit into a block ignores 50% of the block (a full block lets half through, a pierced one 90%).
 const loki=blocked&&fxOn(s,'loki',now);
 if(loki)delete s.fx!.until.loki;
 const fullBlock=blocked&&!crit&&!has(s,'belt');
 if(fullBlock&&!loki){log(prefix+'блок удара '+impact);companionTurn(a,b,s,others,now,log);return}
 let rate=(1+aura.heroDamage)*(b.hp<b.maxHp*.3?1+aura.execute30:1)*(b.hp<b.maxHp*.35?1+aura.execute35:1);
 if(now-s.started<6000)rate*=1+aura.opening;
 if(now-s.started<8000)rate*=1+aura.rally;
 if(sets.ember>=4&&a.hp<a.maxHp*.5)rate*=1.25;
 if(sets.stone>=6&&s.shield>0)rate*=1.25;
 if(sets.frost>=6&&t&&now<t.controlUntil)rate*=1.30;
 if(active(s,'howl',now))rate*=1.15;
 if(active(s,'rally',now))rate*=1.4;
 if(s.callsUntil>now&&!special)rate*=1+.3*runePower[1];
 if(s.combo){rate*=s.combo===2?2:1+combos.finish.bonus;s.combo=0;}
 if(first)rate*=3;
 if(has(s,'belt')&&(blocked||t?.shield))rate*=1.25;
 if(has(s,'void'))rate*=1+.02*(s.mark[b.id]??0);
 if(spec==='onslaught'){
  s.ramp=s.target===b.id?Math.min(s.ramp+1,5):0;
  s.target=b.id;rate*=1+.08*s.ramp;
 }
 // Berserker, Thor and Apollo add up instead of multiplying; Thor never joins Loki on the same hit.
 const thor=!loki&&fxOn(s,'thor',now);
 if(thor)delete s.fx!.until.thor;
 rate*=1+(fxOn(s,'berserk',now)?consumableRules.berserk.value:0)+(thor?consumableRules.thor.value:0)+(special&&fxOn(s,'apollo',now)?consumableRules.apollo.value:0);
 if(fxOn(s,'niflheim',now))rate*=1-consumableRules.niflheim.value;
 const blockScale=!blocked?1:fullBlock?1-consumableRules.loki.value:loki?.9:.8;
 const power=special?a.attack*stats.skillDamage*skillPowerMultiplier(levels[skillIndex])*runePower[skillIndex]:a.attack;
 const scale=rate*zones[move.attack].multiplier*(.85+rng()*.3)*blockScale;
 const hit=(target:HeroFighter,mult:number,useCrit:boolean)=>{
  const armor=1+(fxOn(target.combat,'steel',now)?consumableRules.steel.value:0)-(fxOn(target.combat,'berserk',now)?.2:0);
  const defense=used==='hammer'&&runes[2]===0?0:target.defense*(has(s,'boots')?.6:1)*armor*(fxOn(s,'fenrir',now)?1-consumableRules.fenrir.value:1);
  const reduction=1-(target.combat?.build.stats.reduction??0);
  const targetState=target.combat;
  const callDefense=targetState&&targetState.callsUntil>now&&targetState.build.runes[1]===1?1.5:1;
  let guard=1;
  if(targetState?.build.followers[1]&&s.build.hero==='berserker'&&available(targetState,'guard',now)&&
   (special||target.hp/target.maxHp<companionTactics.heavyBelow)){
   const guardBranch=targetState.build.branches[1]===0;
   guard=guardBranch?.25:companionTactics.guardReduction;
   start(targetState,'guard',now,companionTactics.guardCooldown*(guardBranch?.7:1));
   targetState.combo=2;targetState.comboUntil=now+combos.riposte.window*1000;
   if(targetState.build.sets.legion>=6)start(targetState,'rally',now,4);
   log(target.name+' · Спутник прикрывает удар');
  }
  return strikeDamage(target,damage(power,defense*callDefense,target.level,mult*reduction*guard,useCrit,stats.critDamage),now,log);
 };
 const wasAlive=b.hp>0;
 let dealt=0;
 if(used==='hammer'){
  const targets=[b,...(spec==='chain'||runes[2]===1?others.slice(0,2):[])];
  for(let i=0;i<(sets.rune>=6?4:3);i++)for(const target of targets)if(target.hp){
   const amount=hit(target,1.2*scale,crit&&!blocked);
   if(target===b)dealt+=amount;
  }
 }else{
  dealt=hit(b,(used==='strike'?2.2:1)*scale,crit&&!blocked);
  if(used==='strike'&&runes[0]===1){
   for(const target of others)if(target.hp)hit(target,2.2*scale,false);
  }else if(!special&&spec==='chain'&&others[0]?.hp)hit(others[0],scale*.5,false);
 }
 log(prefix+(loki?'Хитрость Локи, ':'')+(thor?'Гром Тора, ':'')+(blocked?'пробитие блока, ':crit?'критический удар ':'удар ')+impact+' · −'+dealt+' HP');
 if(dealt>0){
  if(!special)recover(a,dealt*stats.lifesteal,log,'Вампиризм',now);
  if(fxOn(s,'hel',now))recover(a,dealt*consumableRules.hel.value,log,'Поцелуй Хель',now);
  if(used==='strike'&&runes[0]===2)recover(a,a.maxHp*.2,log,'Руна лечения',now);
  if(used==='strike'&&runes[0]===0){s.burn=4;s.burnTarget=b.id}
  if(wasAlive&&!b.hp){recover(a,a.maxHp*(aura.killHeal+(sets.ember>=6?.15:0)),log,'Сила победы',now);if(sets.ember>=6){s.burn=4;s.burnTarget=others[0]?.id}}
  if(has(s,'void'))s.mark[b.id]=Math.min(10,(s.mark[b.id]??0)+1);
  if(t){
   if(s.build.followers[0]&&t.build.hero!=='berserker'&&a.ready.strike>now&&available(s,'dive',now)){
    const diveBranch=s.build.branches[0]===0;
    start(s,'dive',now,companionTactics.diveCooldown*(diveBranch?.7:1));
    t.controlUntil=Math.max(t.controlUntil,now+companionTactics.diveExposed*1000);
    s.combo=1;s.comboUntil=now+combos.finish.window*1000;
    if(sets.legion>=6)start(s,'rally',now,4);
    if(diveBranch&&b.hp)strikeDamage(b,Math.round(a.attack*s.build.followers[0].power*1.5*(sets.legion>=4?2:1)),now,log);
    log(a.name+' · Пике спутника');
   }
   const interrupt=first||used==='strike'&&runes[0]===1||spec==='trapper'&&s.strikes%4===0;
   if(interrupt||used==='strike'&&spec==='frostweave')t.controlUntil=Math.max(t.controlUntil,now+(first?1000:1500));
   if(interrupt){
    if(sets.frost>=4)t.controlUntil=Math.max(t.controlUntil,now+1500);
    if(sets.stone>=4)s.shield=Math.max(s.shield,Math.round(a.maxHp*.12));
    if(spec==='bastion'){s.shield=Math.max(s.shield,Math.round(a.maxHp*.1));s.combo=2;s.comboUntil=now+combos.riposte.window*1000;}
    if(unique(s,'bulwark')&&available(s,'bulwark',now)){
     const config=gearRules.effects.bulwark;
     start(s,'bulwark',now,config.cooldown);s.shield=Math.max(s.shield,Math.round(a.maxHp*config.hp_fraction));
    }
   }
   if(!special&&(spec==='trapper'||spec==='frostweave'))start(t,'chill',now,2);
   if(unique(s,'frost')&&available(s,'frostGear',now)){
    const config=gearRules.effects.frost;
    start(s,'frostGear',now,config.cooldown);start(t,'frost',now,config.duration);
   }
   if(t.build.aura.thorns>0&&a.hp)strikeDamage(a,dealt*t.build.aura.thorns,now,log);
  }
  if(crit&&unique(s,'tempo')&&available(s,'tempoGear',now)){
   const config=gearRules.effects.tempo;
   start(s,'tempoGear',now,config.cooldown);start(s,'tempo',now,config.duration);
  }
  if(!special&&has(s,'aquila')&&s.strikes%4===0)for(const target of others)if(target.hp)hit(target,scale*.6,false);
  if(!special&&sets.storm>=6&&s.strikes%5===0)
   for(const target of [b,...others])if(target.hp)strikeDamage(target,damage(a.attack,target.defense,target.level,1.5*rate),now,log);
  if(!special&&aura.boltEvery&&s.strikes%aura.boltEvery===0&&b.hp)
   strikeDamage(b,damage(a.attack,b.defense,b.level,aura.boltPower*rate),now,log);
 }
 companionTurn(a,b,s,others,now,log);
}

/** Healing and burning over time settle on the owner's own turn, so the whole amount arrives even after a pause. */
function tickElixirs(p:HeroFighter,fx:ElixirState,now:number,log:Log){
 for(const key of ['hot','burn'] as const){
  const effect=fx[key];
  if(!effect)continue;
  const end=Math.min(now,effect.until),amount=effect.rate*Math.max(0,end-effect.last);
  effect.last=end;
  if(end>=effect.until)delete fx[key];
  if(amount<=0||!p.hp)continue;
  if(key==='hot')recover(p,amount,log,consumableRules.tear.name,now);
  else log(p.name+' · '+consumableRules.muspel.name+' −'+strikeDamage(p,amount,now,log)+' HP');
 }
}

const negative=['niflheim','venom'] as const;
/** Applies a consumable's effect. Returns the log text, or null when it would do nothing (the item is then not spent). */
export function applyConsumable(p:HeroFighter,id:ConsumableId,now:number,log:Log,foe?:HeroFighter,allies:readonly HeroFighter[]=[]):string|null{
 const s=p.combat;
 if(!s||!p.hp)return null;
 const fx=fxState(s),rule=consumableRules[id],until=now+rule.duration*1000;
 switch(id){
  case 'potion':{
   if(p.hp===p.maxHp)return null;
   return rule.name+' · +'+recover(p,p.maxHp*healingPotion.fraction,()=>{},'',now)+' HP';
  }
  case 'tear':fx.hot={rate:p.maxHp*rule.value/(rule.duration*1000),last:now,until};return rule.name;
  case 'aegis':fx.aegis=Math.round(p.maxHp*rule.value);fx.until.aegis=until;return rule.name+' · щит '+fx.aegis+' HP';
  case 'valkyrie':if(fx.oath)return null;fx.until.valkyrie=until;return rule.name;
  case 'niflheim':case 'venom':case 'muspel':{
   const target=foe?.hp?foe.combat:undefined;
   if(!foe||!target)return null;
   if(fxOn(target,'bifrost',now))return rule.name+' · '+foe.name+' под защитой Радуги Биврёста';
   const state=fxState(target);
   if(id==='muspel')state.burn={rate:foe.maxHp*rule.value/(rule.duration*1000),last:now,until,from:p.id};
   else state.until[id]=until;
   return rule.name+' → '+foe.name;
  }
  case 'minerva':{
   const effects:[string,number][]=[...negative.map(key=>[key,fx.until[key]??0] as [string,number]),['burn',fx.burn?.until??0],
    ['control',s.controlUntil],['chill',s.cooldowns.chill??0],['frost',s.cooldowns.frost??0]];
   const [key,end]=effects.filter(([,end])=>end>now).sort((x,y)=>y[1]-x[1])[0]??[];
   if(!key||!end)return null;
   if(key==='burn')delete fx.burn;else if(key==='control')s.controlUntil=now;
   else if(key==='chill'||key==='frost')delete s.cooldowns[key];else delete fx.until[key as ConsumableId];
   return rule.name+' · снят отрицательный эффект';
  }
  case 'neptune':{
   const gains=[p,...allies.filter(ally=>ally!==p&&ally.hp>0)].filter(target=>target.combat&&target.hp<target.maxHp&&now>=fxState(target.combat).neptuneAt);
   if(!gains.length)return null;
   let healed=0;
   for(const target of gains){
    fxState(target.combat!).neptuneAt=now+consumableBattle.neptuneLock*1000;
    healed+=recover(target,target.maxHp*(target===p?rule.value:.1),log,rule.name,now);
   }
   return rule.name+' · +'+healed+' HP';
  }
  default:fx.until[id]=until;return rule.name;
 }
}
