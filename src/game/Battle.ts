import {isPaidLairAttempt,lairRules,lairReviveCost} from '../saga/lair';
import {soloVictory} from '../saga/soloEconomy';
import {carnivalNow} from '../core/profile';
import {runeMultiplier} from '../saga/runes';
import {BALANCE_REVISION,rebaseEncounter} from './balanceRevision';
import {GearEffects} from './GearEffects';
import {gearRules} from '../core/gear';
import {useGame,registerEncounterProvider,mayStartLoot} from '../core/store';
import {stats,damage,skillPowerMultiplier,odinCallSeconds} from '../core/formulas';
import type {EncounterSnapshot,Fighter,Projectile,BattleView,Player,Stats,FollowerEncounter,FollowerImpact} from '../core/types';
import balance from '../../config/test-balance.v1.json';
import {characters,enemyIds,bossIds,miniIds,heroArt,skillData,rarityColors} from '../data/catalog';
import {haptic} from '../core/telegram';
import {validEncounter,encounterData} from './snapshot';
import {sound,unlockAudio} from './Sound';
import {drawActor,drawFallback,warmRun} from './animation';
import {sceneImage,sceneImageReady,sceneImageRevision} from './sceneImages';
import {enemyPlacement,travelActorSafe,healthAnchorX} from './sceneLayout';
import {clips,legacyBodyHeight} from './actorGeometry';
import {newJourney,nextSite,stepJourney,projectX,districts,siteX} from './Journey';
import {chapterOne,encounterBriefs,firstChapter} from './Chapter';
import {ComicFeedback} from './ComicFeedback';
import {poseFrame,enemyLunge,type Rect} from './actorGeometry';
import {swordTip,swordCanReach,reactionOffset,projectilePoint,projectileVisualPath,drawSwordWave} from './Impact';
import {layoutLabels,feedbackBands,type CombatLabel,type PlacedLabel} from './CombatLabels';
import {WorldRenderer} from './WorldRenderer';
import {drawRealmPortals,portalAt} from '../dark/portals';
import {RealmWorld,realmSceneIdentity,realmEffectsQuality,type RealmView} from '../dark/RealmWorld';
import {WorldDirector} from './WorldDirector';
import {CompanionBrain,type TeamHost} from './CompanionBrain';
import {think,interrupted,onWindup,strikeMultiplier,absorb,breakCovers,died,type TacticEvent} from './EnemyTactics';
import {audio} from './AudioDirector';
import type {WorldEventSnapshot,TeamSnapshot} from '../core/types';
import {planFor} from '../saga/encounters';
import {hazards,hazardPhase,affixes,regionOf,stageGold,type EncounterPlan,type HazardId} from '../saga/regions';
import {paintBiomeBack,paintBiomeFront,paintHazard} from './BiomeArt';
import {setCounts,hasPerk} from '../saga/gear';
import {specId} from '../saga/specs';
import {branchOf,evoPower,combos} from '../saga/companions';
import {bumpCount} from '../saga/save';
import {combatAura,squadCombat,type CombatFollower} from '../dark/rules';
import {realmRun,realmLast,realmDefeat,realmVictory,realmChoose,realmPlan} from '../dark/realm';
type Unit=Fighter;
interface Effect {x:number;y:number;vx:number;vy:number;life:number;max:number;text?:string;color:string;size:number;ring?:boolean;tag?:string;amount?:number;critical?:boolean;labelKey?:string}
const config=balance.combat_test_settings;
const rules=balance.locked_owner_rules;
const newId=()=>`enc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const MODE_TITLES:Record<string,string>={campaign:'Основная глава',farm:'Бесконечный фарм',arena:'Поединок Арены',dungeon:'Логово мини-босса',darkness:'Царство тьмы'};
export class Battle implements TeamHost {
 canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;images=new Map<string,HTMLImageElement>();world=sceneImage('ice-world','high');units:Unit[]=[];fx:Effect[]=[];projectiles:Projectile[]=[];
 plan:EncounterPlan=planFor(useGame.getState().p,'campaign');curse=0;hazardCycle=-1;hazardWarn=-1;hazardFlash=0;castingSkill=false;
 /** Fight-local saga counters (strikes, combo window, second wind…). Saved with the encounter. */
 perk:Record<string,number>={};tally:Record<string,number>={};
 pendingMode:string|undefined;entryPaid=false;intro=0;combatTime=0;impactStop=0;autoDecision=0;hazard={remaining:0,tick:0,damage:0};
 labelPositions=new Map<string,Rect>();lastLabels:PlacedLabel[]=[];labelSerial=0;
 gear=new GearEffects();
 /** Dark gear, relic and companion effects of the current hero; refreshed on every spawn and resume. */
 squad=squadCombat(useGame.getState().p);aura=combatAura(useGame.getState().p,this.squad);
 followers:FollowerEncounter|undefined;
 followerSavePending=false;
 reservePose=0;
 comics=new ComicFeedback();systemReduced=typeof window!=='undefined'&&!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 journey=newJourney();scenery=new WorldRenderer();
 private realmRenderer?:RealmWorld;
 private realmDefeatScene?:{id:string;chamber:RealmView['chamber']};
 get realmScenery(){return this.realmRenderer??=new RealmWorld()}
 // Living World extension points (see WorldDirector / CompanionBrain / EnemyTactics).
 brain=new CompanionBrain();director=new WorldDirector(this);worldEvent:WorldEventSnapshot|undefined;team:TeamSnapshot|undefined;walked=0;coverNote=0;
 heroX=285;hp=1;maxHp=1;heroAttack=0;heroHurt=0;heroPending=0;cooldowns=[0,0,0];timer=rules.boss_timer_seconds as number;phase:BattleView['phase']='walk';mode='campaign';delay=0;clock=0;last=0;raf=0;autoCd=0;compCd=[1,3];buff=0;shield=0;burn=0;burnTick=0;stun=0;shake=0;stopped=false;lastPublish=0;lastSave=0;enemyLevel=1;boss=false;running=false;id=newId();stage=1;wave=1;rewarded=false;pressure=0;defensePressure=0;poison=0;poisonTick=0;slow=0;quality=1;gooseAttack=0;dogCast=0;unbind:()=>void=()=>{};
 constructor(canvas:HTMLCanvasElement){this.canvas=canvas;this.ctx=canvas.getContext('2d')!;for(const id of [heroArt[useGame.getState().p.heroClass],...this.visibleFollowers().map(pet=>pet.id)])this.warmActor(id,'high');this.maxHp=stats(useGame.getState().p).hp;this.hp=this.maxHp;this.journey=newJourney(useGame.getState().p.stage,useGame.getState().p.wave);this.spawn();this.restorePlayer();const unregister=registerEncounterProvider(()=>this.snapshot(),{pause:()=>this.pause(),restore:()=>this.restorePlayer(),resume:()=>this.resume()});const stopGear=useGame.subscribe((state,previous)=>{if(state.p.equipment!==previous.p.equipment)this.gear.sync(state.p)});this.unbind=()=>{stopGear();unregister()};this.canvas.addEventListener?.('pointerup',this.portalTap);this.publish();this.raf=requestAnimationFrame(this.frame)}
 destroy(){this.canvas.removeEventListener?.('pointerup',this.portalTap);this.checkpoint();this.stopped=true;this.unbind();cancelAnimationFrame(this.raf)}
 lairRevives=0;
 snapshot():EncounterSnapshot{const worldEvent=this.director.snapshot();return structuredClone({version:1,balanceRevision:BALANCE_REVISION,gearProcs:this.gear.entries,...(this.mode==='dungeon'?{lairRevives:this.lairRevives}:{}),followers:this.followers,...(worldEvent?{worldEvent}:{}),team:this.brain.snapshot(),...(this.pendingMode?{pendingMode:this.pendingMode}:{}),entryPaid:this.entryPaid,intro:this.intro,combatTime:this.combatTime,impactStop:this.impactStop,autoDecision:this.autoDecision,hazard:this.hazard,journey:this.journey,id:this.id,stage:this.stage,wave:this.wave,mode:this.mode,hp:this.hp,maxHp:this.maxHp,potionCd:this.potionCd,...(this.hammerKills?{hammerKills:this.hammerKills}:{}),heroX:this.heroX,phase:this.phase,units:this.units,cooldowns:this.cooldowns,timer:this.timer,delay:this.delay,clock:this.clock,autoCd:this.autoCd,compCd:this.compCd,buff:this.buff,shield:this.shield,burn:this.burn,burnTick:this.burnTick,stun:this.stun,boss:this.boss,heroAttack:this.heroAttack,heroHurt:this.heroHurt,heroPending:this.heroPending,projectiles:this.projectiles,pressure:this.pressure,defensePressure:this.defensePressure,poison:this.poison,poisonTick:this.poisonTick,slow:this.slow,rewarded:this.rewarded,...(this.curse?{curse:this.curse}:{}),...(Object.keys(this.perk).length?{perk:this.perk}:{})})}
 restorePlayer(){this.hammerKills=0;this.lairRevives=0;this.potionCd=0;this.gear.reset();this.followers=undefined;this.followerSavePending=false;this.gooseAttack=0;this.dogCast=0;this.reservePose=0;this.curse=0;this.perk={};this.hazardCycle=-1;this.hazardWarn=-1;this.worldEvent=undefined;this.team=undefined;this.comics.reset();this.running=false;this.pendingMode=undefined;this.entryPaid=false;this.intro=0;this.combatTime=0;this.impactStop=0;this.autoDecision=0;this.hazard={remaining:0,tick:0,damage:0};const p=useGame.getState().p,s=p.encounter;if(validEncounter(s)&&(s.mode==='darkness'&&!!realmRun(p)||isPaidLairAttempt(s)&&s.id===p.lairAttempt?.id||(s.stage===p.stage&&s.wave===p.wave)||s.phase==='victory'&&s.id===p.lastBattleReward)){Object.assign(this,structuredClone(encounterData(rebaseEncounter(s,planFor({...p,stage:s.stage,wave:s.wave},s.mode,s.mode==='dungeon'?s.units[0]?.id:undefined)))));this.entryPaid=s.entryPaid??['dungeon','darkness'].includes(s.mode);this.journey=s.journey?structuredClone(s.journey):newJourney(s.stage,s.wave,s.phase!=='walk');this.heroX=projectX(this.journey.worldX,this.journey.cameraX);this.plan=planFor({...p,stage:s.stage},this.mode,this.mode==='dungeon'?s.units[0]?.id:undefined);this.placeEncounter(!s.journey);if(this.realmWaiting()){this.phase='waiting';for(const u of this.units){u.hp=0;u.dead=2}}this.running=false;this.fx=[];this.projectiles=this.projectiles.map(b=>({...b,encounterId:b.encounterId??this.id,targetId:b.targetId??this.units[b.target]?.id,targetRole:b.targetRole??this.units[b.target]?.role}));}else{this.journey=newJourney(p.stage,p.wave);this.mode='campaign';this.hp=stats(p).hp;this.maxHp=this.hp;this.spawn()}this.gear.entries=validEncounter(s)&&s.id===this.id?structuredClone(s.gearProcs??[]):[];this.gear.sync(p);this.tuneTeam();this.brain.restore(this.team);this.director.onRestore(this.worldEvent);this.worldEvent=undefined;this.team=undefined;if(this.mode==='darkness'){const run=realmRun(p),last=realmLast(p);if(run?.lastCombatId===s?.id&&!this.realmWaiting())this.spawn(false);if(!run&&last&&!last.ack){this.phase=last.win?'victory':'defeat';this.running=false;useGame.getState().open('realm')}}this.publish()}
 checkpoint(){return useGame.getState().persist()}
 /** Reserve actions and their impacts stop on an unsuccessful write. Resume retries the same state. */
 saveFollowerAction(){
  this.followerSavePending=!this.checkpoint();
  if(!this.followerSavePending)return true;
  this.running=false;
  this.publish();
  useGame.getState().notice('Бой приостановлен · повторите сохранение кнопкой боя');
  return false;
 }
 toggle(){if(useGame.getState().recoveryRequired)return;unlockAudio(useGame.getState().p.sound);const g=useGame.getState();if(this.mode==='darkness'&&!realmRun(g.p)&&realmLast(g.p)){this.running=false;if(!realmLast(g.p)!.ack)g.open('realm');else this.leaveRealm();return}if(this.running){this.pause();return}if(g.p.rewardOffer&&!g.p.rewardOffer.resolved){if(this.mode==='campaign')g.keepReward();else{g.notice('Трофей босса ждёт выбора');return}}
  if(this.followerSavePending&&!this.saveFollowerAction())return;
  const modeToStart=this.pendingMode??(this.phase==='walk'&&!this.entryPaid?this.mode:undefined);
  if((modeToStart==='campaign'||modeToStart==='dungeon')&&!mayStartLoot())return;
  if(!this.pendingMode&&this.mode==='dungeon'&&this.entryPaid&&this.phase==='defeat'){g.open('lair');return}
  if(this.pendingMode==='dungeon'&&g.p.lairAttempt){g.open('lair');return}
  if(this.pendingMode){const mode=this.pendingMode,cost=['dungeon','darkness'].includes(mode)?config.mode_entry_chaosite:0;if(g.p.chaosite<cost){g.notice(`Нужно ${cost} Хаосита`);return}this.pendingMode=undefined;this.mode=mode;this.hp=stats(g.p).hp;this.maxHp=this.hp;this.spawn(true);this.entryPaid=cost>0;if(!g.mutate(p=>{if(mode==='dungeon'&&(p.lairAttempt||p.chaosite<cost))return false;p.chaosite-=cost},cost>0)){this.restorePlayer();g.notice('Не удалось сохранить вход в бой');return}}
  this.tuneTeam();this.running=true;this.publish();this.checkpoint();haptic()
 }
 /** Resume only a previously started free encounter. No paid mode, active menu or corrupt save can auto-start. */
 resume(){const g=useGame.getState();if(this.mode==='darkness'&&!realmRun(g.p)&&realmLast(g.p))return;if(this.running||this.phase==='defeat'||this.pendingMode||g.panel||g.recoveryRequired)return;if(this.phase==='walk'&&!this.entryPaid&&(this.mode==='campaign'||this.mode==='dungeon')&&!mayStartLoot())return;if(this.followerSavePending&&!this.saveFollowerAction())return;if(g.p.rewardOffer&&!g.p.rewardOffer.resolved){if(this.mode==='campaign')g.keepReward();else return}this.tuneTeam();this.running=true;this.publish();this.checkpoint()}
 continueAfterLoot(){const g=useGame.getState();if(g.continueOnVictory&&this.phase==='victory'&&g.p.rewardOffer?.resolved&&!g.panel&&!this.running)this.resume()}
 pause(){if(this.running){this.running=false;this.publish()}this.flushTally();const saved=this.checkpoint();this.audioFrame();return saved}
 /** Quest and mastery counters are buffered during the fight and written in one save. */
 note(key:string,by=1){this.tally[key]=(this.tally[key]??0)+by}
 flushTally(){const keys=Object.keys(this.tally);if(!keys.length||useGame.getState().recoveryRequired)return;const t=this.tally;if(useGame.getState().mutate(p=>{for(const k of keys)bumpCount(p,k,t[k])}))this.tally={}}
 tuneTeam(){
  const p=useGame.getState().p;
  this.squad=squadCombat(p);
  this.aura=combatAura(p,this.squad);
  const members=[this.squad.striker,this.squad.guardian,this.squad.reserve] as const;
  const formation:FollowerEncounter['formation']=[members[0].instanceId,members[1].instanceId,members[2]?.instanceId??null];
  const previous=this.followers;
  if(!previous){
   this.followers={formation,thirdCooldown:members[2]?.interval??0,charges:{}};
   // The old checkpoint stored the main attacker's burst progress in a shared perk.
   if(this.perk.sq!==undefined){
    this.followers.charges[formation[0]]=Math.max(0,Math.trunc(this.perk.sq))%3;
    delete this.perk.sq;
   }
  }else if(formation.some((id,i)=>id!==previous.formation[i])){
   const before=[...this.compCd,previous.thirdCooldown];
   const cooldown=(i:0|1|2)=>{
    if(formation[i]===previous.formation[i])return before[i];
    const member=members[i];
    return member?Math.max(before[i],before[previous.formation.indexOf(member.instanceId)]??0,member.interval):before[i];
   };
   this.compCd=[cooldown(0),cooldown(1)];
   this.followers={formation,thirdCooldown:cooldown(2),charges:previous.charges};
   if(formation[0]!==previous.formation[0]){
    this.gooseAttack=0;this.brain.goose=null;
    this.brain.emotes=this.brain.emotes.filter(e=>e.who!=='goose');
   }
   if(formation[1]!==previous.formation[1]){
    this.dogCast=0;this.brain.dog=null;this.brain.armed=0;
    this.brain.emotes=this.brain.emotes.filter(e=>e.who!=='dog');
   }
   if(formation[2]!==previous.formation[2])this.reservePose=0;
   for(const pet of this.visibleFollowers())this.warmActor(pet.id,'high');
  }
  this.brain.diveScale=branchOf(p,0)===0?.7:1;this.brain.guardScale=branchOf(p,1)===0?.7:1;
  this.brain.guardCut=branchOf(p,1)===0?.25:.5;this.brain.rescueMax=branchOf(p,1)===1?2:1;
 }
 visibleFollowers(){
  const visible:CombatFollower[]=[];
  for(const pet of [this.squad.striker,this.squad.guardian,this.squad.reserve]){
   if(pet&&!visible.some(actor=>actor.fly===pet.fly))visible.push(pet);
  }
  return visible;
 }
 foeDef(u:Unit){return u.def*(hasPerk(useGame.getState().p,'boots')?.6:1)*(1-.03*(this.perk.drill??0))}
 foeRate(u:Unit,p=useGame.getState().p){return this.gear.enemyRate(u.role,p)*(setCounts(p).frost>=2?.92:1)*((u.chill??0)>0?.8:1)}
 /** Returns true when the hero really falls. «Сердце Бездны» refuses the first lethal blow of a fight. */
 fatal(){if(this.hp>0)return false;if(hasPerk(useGame.getState().p,'heart')&&!this.perk.revived){this.perk.revived=1;this.hp=Math.round(this.maxHp*.35);this.effect(this.heroX,560,'ВТОРОЕ ДЫХАНИЕ!','#ff9a5c',29);this.burst(this.heroX,720,'#ff9a5c',26);this.shake=6;sound('rare',useGame.getState().p.sound);return false}this.defeat();return true}
 private statPlayer?:Player;
 private cachedStats?:Stats;
 private statsFor(p:Player){
  if(this.statPlayer!==p||!this.cachedStats){this.statPlayer=p;this.cachedStats=stats(p)}
  return this.cachedStats;
 }
 syncStats(s=this.statsFor(useGame.getState().p)){
  if(s.hp===this.maxHp)return false;
  this.hp=this.hp<=0?0:Math.min(s.hp,this.hp*s.hp/this.maxHp);this.maxHp=s.hp;
  return true;
 }
 private warmActor(id:string, priority:'high'|'auto'='auto'){
  if(!this.images.has(id))this.images.set(id,sceneImage(id,priority));
  warmRun(id);
 }
 spawn(advance=false){this.hammerKills=0;this.lairRevives=0;this.gear.reset();this.followers=undefined;this.reservePose=0;if(advance)nextSite(this.journey);const p=useGame.getState().p;this.id=newId();this.stage=p.stage;this.wave=p.wave;this.enemyLevel=p.stage;this.rewarded=false;this.intro=0;this.combatTime=0;this.impactStop=0;this.autoDecision=.5;this.hazard={remaining:0,tick:0,damage:0};this.entryPaid=false;this.plan=planFor(p,this.mode);this.curse=0;this.perk={};this.hazardCycle=-1;this.hazardWarn=-1;this.boss=this.plan.boss;this.timer=this.plan.timer||rules.boss_timer_seconds;this.phase='walk';this.heroX=projectX(this.journey.worldX,this.journey.cameraX);this.projectiles=[];this.heroPending=0;this.autoCd=.5;this.compCd=[1.5,5];this.cooldowns=[0,0,0];this.units=this.plan.units.map((f,i)=>({id:f.id,x:(this.boss?680:670)+i*85,y:800+i*5,hp:f.hp,max:f.hp,atk:f.atk,def:f.def,cd:1+i*.7,attack:0,hurt:0,dead:0,size:this.boss?250:170,role:i,windup:0,ability:'',bossPhase:1,specialCd:5+i,actionTime:0,guard:0,exposed:0,strikes:0,...(f.affix?{affix:f.affix}:{}),...(f.title?{title:f.title}:{})}));this.burn=0;this.stun=0;this.buff=0;this.shield=0;this.pressure=0;this.defensePressure=0;this.poison=0;this.poisonTick=0;this.slow=0;this.placeEncounter();this.tuneTeam();this.openFight();this.brain.reset();this.director.onSpawn();this.publish()}
 startMode(mode:string,fresh=false){const g=useGame.getState();if(mode==='darkness'){g.open('realm');return}if(!['campaign','farm','arena','dungeon','darkness'].includes(mode))return;if(!this.pause()&&this.mode==='dungeon'&&this.entryPaid&&!this.rewarded){g.notice('Не удалось сохранить попытку Логова');return}if(mode==='dungeon'&&useGame.getState().p.lairAttempt){g.open('lair');return}if(g.p.rewardOffer&&!g.p.rewardOffer.resolved){g.notice('Сначала разберите трофей босса');return}this.pendingMode=mode===this.mode&&!fresh?undefined:mode;g.open(null);this.publish();this.checkpoint();const cost=this.pendingMode&&['dungeon','darkness'].includes(this.pendingMode)?config.mode_entry_chaosite:0;g.notice(this.pendingMode?`${MODE_TITLES[this.pendingMode]} · нажмите топоры${cost?` · ${cost} Хаосита при старте`:''}`:'Продолжить тот же бой · нажмите топоры')}
 /** «Войти»: choose the main chapter. A chapter fight already in progress is never paused by it. */
 challenge(){if(this.mode==='campaign'&&this.running&&!this.pendingMode){useGame.getState().notice('Основная глава уже идёт · топоры — пауза');return}this.startMode('campaign')}
 resumeLair(id:string){
  const g=useGame.getState();
  if(g.p.rewardOffer&&!g.p.rewardOffer.resolved){g.notice('Сначала разберите трофей босса');return false}
  if(!g.mutate(p=>{
   const attempt=p.lairAttempt;
   if(!attempt||attempt.id!==id)return false;
   // A pending mode belongs to the main scene, never to the saved Lair attempt.
   p.encounter={...attempt,pendingMode:undefined};
  },true)){g.notice('Не удалось восстановить попытку Логова');return false}
  this.restorePlayer();
  g.open(null);
  this.resume();
  return true;
 }

 abandonLair(id:string){
  const g=useGame.getState();
  if(!g.mutate(p=>{
   if(p.lairAttempt?.id!==id)return false;
   delete p.lairAttempt;
   if(p.encounter?.id===id)delete p.encounter;
  },true)){g.notice('Не удалось завершить попытку Логова');return false}
  if(this.id===id)this.restorePlayer();
  g.notice('Попытка Логова завершена');
  return true;
 }

 reviveLair(id:string,expected:number){
  const g=useGame.getState(),cost=lairReviveCost(this.stage);
  if(this.id!==id||this.mode!=='dungeon'||this.phase!=='defeat'||this.timer<=0||!this.entryPaid||
   this.lairRevives!==expected||expected>=lairRules.revives||g.p.gold<cost)return false;
  const before={hp:this.hp,phase:this.phase,poison:this.poison,slow:this.slow,lairRevives:this.lairRevives};
  this.hp=Math.round(this.maxHp*lairRules.heal);
  this.phase='fight';
  this.poison=0;
  this.slow=0;
  this.lairRevives++;
  if(!g.mutate(p=>{
   const attempt=p.lairAttempt;
   if(attempt?.id!==id||attempt.phase!=='defeat'||(attempt.lairRevives??0)!==expected||p.gold<cost)return false;
   p.gold-=cost;
  },true)){
   // If the write found a newer save, keep the engine state restored from that save.
   if(useGame.getState().p===g.p)Object.assign(this,before);
   g.notice('Не удалось сохранить возрождение');
   return false;
  }
  g.open(null);
  this.running=true;
  this.publish();
  return true;
 }
 potionCd=0;
 hammerKills=0;
 /** A potion costs about one regular victory of the current stage (never less than the approved first-chapter price). */
 potionCost(){return Math.max(config.potion_gold_cost,Math.round(stageGold(this.stage,false)*config.potion_stage_gold_share))}
 heal(){
  const g=useGame.getState();
  if(this.hp<=0||this.phase==='defeat'){g.notice('Герой повержен · зелье не оживляет');return}
  if(!this.running){g.notice('Бой остановлен');return}
  if(this.hp>=this.maxHp){g.notice('Здоровье полное');return}
  if(this.potionCd>0){g.notice(`Зелье будет готово через ${Math.ceil(this.potionCd)} с`);return}
  const cost=this.potionCost();
  if(g.p.gold<cost){g.notice('Недостаточно золота для зелья');return}

  const hp=Math.min(this.maxHp,this.hp+this.maxHp*config.potion_heal_fraction);
  const restored=Math.round(hp)-Math.round(this.hp);
  const potionCd=config.potion_cooldown_seconds, defensePressure=this.defensePressure+1;
  try{
   const saved=g.mutate(p=>{
    if(p.encounter?.id!==this.id||p.gold<cost)return false;
    const encounter={...p.encounter,hp,potionCd,defensePressure};
    if(!validEncounter(encounter))return false;
    p.gold-=cost;
    p.encounter=encounter;
   },true);
   if(!saved){
    const current=useGame.getState();
    if(current.toastId===g.toastId)current.notice('Не удалось сохранить лечение');
    return;
   }
  }catch{
   g.notice('Не удалось сохранить лечение');
   return;
  }
  Object.assign(this,{hp,potionCd,defensePressure});
  this.effect(this.heroX,610,restored>0?`+${restored} HP`:'Лечение','#7aff9b',30);
  this.burst(this.heroX,735,'#8affa4',15);
  this.publish();
 }
 skill(index:number){if(!this.running||this.phase!=='fight'||this.cooldowns[index]>0||index<0||index>2)return;const g=useGame.getState(),p=g.p,s=this.statsFor(p),r=p.runes[index];this.cooldowns[index]=skillData[index].cd;this.intro=0;this.heroAttack=.75;this.shake=3;this.note('skill:'+index);const sets=setCounts(p),spec=specId(p);if(hasPerk(p,'crown')&&this.hp>0){const heal=Math.round(this.maxHp*.04);this.hp=Math.min(this.maxHp,this.hp+heal);this.effect(this.heroX-40,640,`+${heal}`,'#c9a6ff',22)}if(index!==0)this.counterSkill(index);sound(index===2?'thunder':'skill',p.sound);haptic();const power=s.attack*s.skillDamage*skillPowerMultiplier(p.skills[index])*runeMultiplier(p,index)*this.damageRate();this.castingSkill=true;if(index===0){const targets=r===1?this.units.filter(u=>u.hp>0):this.units.filter(u=>u.hp>0).slice(0,1);for(const u of targets)this.swordStrike(u,damage(power,this.foeDef(u),this.stage,2.2),true,0,r);}if(index===1){const echo=hasPerk(p,'echo');this.buff=odinCallSeconds(p.skills[index],echo);if(echo){this.shield=Math.max(this.shield,this.maxHp*.08);this.effect(this.heroX,560,'ЭХО КЛИЧА','#e3c59c',23)}if(r===1){this.shield=this.maxHp*.15*runeMultiplier(p,index);this.defensePressure++}if(r===2)this.cooldowns=this.cooldowns.map((c,i)=>i===1?c:Math.max(0,c-2));this.effect(this.heroX,588,'КЛИЧ ОДИНА','#ffe294',28);this.burst(this.heroX,735,'#ffe294',24)}if(index===2){const targets=this.units.filter(u=>u.hp>0).slice(0,spec==='chain'||r===1?3:1),blows=sets.rune>=6?4:3;if(sets.rune>=6){this.shield=Math.max(this.shield,this.maxHp*.1);this.effect(this.heroX,575,'РУННЫЙ ЩИТ','#c59bff',22)}for(let i=0;i<blows;i++)for(const u of targets){const wasAlive=u.hp>0;this.hit(u,damage(power,r===0?0:this.foeDef(u),this.stage,1.2),true,'#8cf4ff','hero');if(r===2&&wasAlive&&u.hp===0&&this.mode!=='darkness'){this.hammerKills++}this.lightning(this.visual(u).x,this.visual(u).barY-20+i*10,this.visual(u).bodyY);}}this.castingSkill=false;this.publish();this.checkpoint()}
 swordStrike(u:Unit,amount:number,crit:boolean,lifesteal=0,strikeRune?:number){
  const end=this.targetBody(u);
  if(useGame.getState().p.heroClass!=='berserker'||swordCanReach(this.heroX,this.journey.worldY,end)){this.resolveSword(u,amount,crit,lifesteal,strikeRune);return}
  this.shoot('hero','sword-wave',this.units.indexOf(u),amount,crit);const b=this.projectiles.at(-1)!;b.lifesteal=lifesteal;if(strikeRune!==undefined){b.strikeRune=strikeRune;b.launchDelay=.34;}this.checkpoint();
 }
 resolveSword(u:Unit,amount:number,crit:boolean,lifesteal=0,rune?:number){
  if(u.hp<=0)return;if(rune!==undefined)this.counterSkill(0,u);const wasCasting=this.castingSkill;this.castingSkill=rune!==undefined;const dealt=this.hit(u,amount,crit,crit?'#ffe0a1':'#bbf6ff','hero');this.castingSkill=wasCasting;this.hp=Math.min(this.maxHp,this.hp+dealt*lifesteal);
  if(rune!==undefined&&u.hp>0&&specId(useGame.getState().p)==='frostweave'){u.frozen=1.5;this.effect(this.visual(u).barX,this.visual(u).barY-30,'ЗАМОРОЖЕН','#9af2ff',22)}if(rune===0)this.burn=4;if(rune===1){this.stun=1.5;this.burst(this.visual(u).x,this.visual(u).bodyY,'#a5dbff',20)}if(rune===2){this.hp=Math.min(this.maxHp,this.hp+this.maxHp*.2);this.effect(this.heroX,605,'+20%','#89ffb6',28)}
 }
 targetBody(u:Unit){const v=this.visual(u),frame=poseFrame({attack:u.attack,hurt:u.hurt,windup:u.windup,death:u.dead}),band=clips[u.id].frames[frame].bands.find(b=>b[1]<=-.5&&b[3]>=-.5),dx=band?(band[0]+band[2])*.5*v.height:0;return {x:v.x+(v.flip?-dx:dx)+reactionOffset(u.reaction??0,u.reactionStrength??0,this.reducedMotion()),y:v.bodyY}}
 projectileTarget(b:Projectile){const u=this.units[b.target];return u&&(!b.encounterId||b.encounterId===this.id)&&(!b.targetId||b.targetId===u.id)&&(b.targetRole===undefined||b.targetRole===u.role)?u:null}
 projectileEnds(b:Projectile){const u=this.projectileTarget(b),v=u?this.visual(u):null;return {start:{x:b.source==='enemy'&&v?v.x-v.height*.18:b.x0+(b.originCameraX??this.journey.cameraX)-this.journey.cameraX,y:b.source==='enemy'&&v?v.bodyY:b.y0},end:{x:b.source!=='enemy'&&u?this.targetBody(u).x:b.x1,y:b.source!=='enemy'&&u?this.targetBody(u).y:b.y1}}}
 stepProjectiles(dt:number){
  const arrived:Projectile[]=[];this.projectiles=this.projectiles.filter(b=>{
   const u=this.projectileTarget(b);if(!u||u.hp<=0)return false;
   let travelDt=dt;if((b.launchDelay??0)>0){travelDt=Math.max(0,dt-b.launchDelay!);b.launchDelay=Math.max(0,b.launchDelay!-dt);const tip=swordTip(this.heroX,this.journey.worldY,this.heroAttack,this.heroHurt);b.x0=tip.x;b.y0=tip.y;b.originCameraX=this.journey.cameraX;if(b.launchDelay>0)return true}
   b.t+=travelDt;if(b.t+1e-8<b.duration)return true;arrived.push(b);return false;
  });
  for(const b of arrived){if(this.hp<=0||this.phase!=='fight')break;const u=this.projectileTarget(b);if(!u||u.hp<=0)continue;
   if(b.source==='enemy'){this.takeDamage(b.damage);if(b.kind==='web')this.slow=3;if(b.kind==='spore'||b.kind==='fire'){this.poison=Math.max(this.poison,4);this.poisonTick=Math.max(.5,this.poisonTick)}}
   else if(b.kind==='sword-wave')this.resolveSword(u,b.damage,b.crit,b.lifesteal,b.strikeRune);
   else{if(b.stun&&u.windup>0&&!this.boss){u.windup=0;u.ability='';u.cd=Math.max(u.cd,1.6);u.fury=0;this.effect(this.visual(u).barX,this.visual(u).barY-30,'ОГЛУШЁН','#ffe3a1',22);this.note('interrupt')}const dealt=this.hit(u,b.damage,b.crit,b.kind==='arrow'?'#ffe3a1':'#a9f9ff',b.source,b.follower);if(b.lifesteal)this.hp=Math.min(this.maxHp,this.hp+dealt*b.lifesteal)}
  }
  if(arrived.some(b=>b.follower&&!b.follower.primary))this.saveFollowerAction();
  else if(arrived.length)this.checkpoint();
 }
 reducedMotion(){return useGame.getState().p.reducedMotion??this.systemReduced}
 comicObstacles():Rect[]{
  const heroId=heroArt[useGame.getState().p.heroClass],heroHeight=legacyBodyHeight(heroId,214),heroTop=805+Math.min(clips[heroId].envelope[1],clips[heroId+':run']?.envelope[1]??0)*heroHeight,heroBarY=Math.min(571,heroTop-18);
  const blocked:Rect[]=[[0,0,864,440],[0,110,120,826],[748,110,864,516],[737,731,864,866],[0,846,864,1536],[this.heroX-60,heroBarY-4,this.heroX+60,heroBarY+14]];
  const add=(id:string,x:number,y:number,height:number,pose:number,flip=false)=>{for(const band of feedbackBands(id,pose===7)){const b=flip?[-band[2],band[1],-band[0],band[3]]:band;blocked.push([x+b[0]*height,y+b[1]*height,x+b[2]*height+8,y+b[3]*height])}};
  const p=useGame.getState().p;add(heroArt[p.heroClass],this.heroX,this.journey.worldY,legacyBodyHeight(heroArt[p.heroClass],214),poseFrame({attack:this.heroAttack,hurt:this.heroHurt}));
  for(const member of this.visibleFollowers()){
   const main=member===this.squad.striker,guard=member===this.squad.guardian;
   const at=guard?{x:this.guardianX(),y:this.journey.dog.worldY}:this.strikerPos(member.fly);
   const attack=main?this.gooseAttack:guard?this.dogCast:this.reservePose;
   add(member.id,at.x,at.y,legacyBodyHeight(member.id,156),poseFrame({attack}));
  }
  for(const u of this.units){if(u.dead>1.1)continue;const v=this.visual(u);add(u.id,v.x,v.y,v.height,poseFrame({attack:u.attack,hurt:u.hurt,death:u.dead,windup:u.windup}),v.flip);if(u.hp>0)blocked.push([v.barX-(this.boss?94:48),v.barY-42,v.barX+(this.boss?94:48),v.barY+12]);}
  return blocked;
 }
 chapterBoss(){return firstChapter(this.stage,this.mode)&&this.boss&&this.units[0]?.id==='spider_queen'}
 damageRate(){return this.director.damageRate()*(1-.12*this.curse)*this.auraDamage()}
 /** Blessing of the active Dark Realm run, if the hero is fighting there. */
 bless(){return this.mode==='darkness'?realmRun(useGame.getState().p)?.b:undefined}
 auraDamage(){const a=this.aura;return (this.bless()==='fury'?1.2:1)*(1+a.heroDamage)*((this.perk.horn??0)>0?1+a.rally:1)*((this.perk.howl??0)>0?1.15:1)*(a.opening>0&&this.combatTime<6?1+a.opening:1)}
 auraHit(u:Unit){const a=this.aura;return 1+(u.hp<u.max*.3?a.execute30:0)+(u.hp<u.max*.35?a.execute35:0)+(this.boss?a.boss:0)}
 /** Fight opening: «Пелена» shield, «Рог Вальхаллы» rally and «Тень Гиннунгагап» on the enemies. */
 openFight(){const a=this.aura;if(a.veil>0)this.shield=Math.round(this.maxHp*a.veil);if(a.rally>0)this.perk.horn=8;if(a.foeHpCut>0)for(const u of this.units)u.hp=Math.max(1,Math.round(u.hp*(1-a.foeHpCut)))}
 strikerPos(fly=this.squad.striker.fly){const j=this.journey,x=projectX(j.goose.worldX,j.cameraX);return fly?{x:x-40,y:j.goose.worldY-25}:{x:x-25,y:j.dog.worldY+14}}
 guardianX(){return projectX(this.journey.dog.worldX,this.journey.cameraX)-48-(this.squad.striker.fly?0:48)}
 guardianAid(guardian=this.squad.guardian){const id=guardian.id;if(id==='capybara_bruiser')this.shield=Math.max(this.shield,Math.round(this.maxHp*.06));if(id==='moss_eater'){this.poison=0;this.slow=0}if(guardian.awake){this.perk.howl=3;this.effect(this.heroX+30,560,'БОЕВОЙ ДУХ','#ffe08a',22)}}
 /** Starts or continues the paid Dark Realm run chosen in its window. The entry was charged by the action. */
 enterRealm(){const g=useGame.getState(),run=realmRun(g.p);if(g.recoveryRequired||!run)return;const same=this.mode==='darkness';if(!this.pause()&&this.mode==='dungeon'&&this.entryPaid&&!this.rewarded){g.notice('Не удалось сохранить попытку Логова');return}g.open(null);unlockAudio(g.p.sound);this.pendingMode=undefined;this.mode='darkness';if(!same){if(validEncounter(run.checkpoint)){useGame.setState({p:{...useGame.getState().p,encounter:run.checkpoint}});this.restorePlayer()}else{this.hp=stats(g.p).hp;this.maxHp=this.hp;this.spawn(true)}}if(this.realmWaiting()){this.phase='waiting';for(const u of this.units){u.hp=0;u.dead=2}}this.entryPaid=true;this.running=true;this.publish();this.checkpoint();haptic()}
 continueRealm(){const run=realmRun(useGame.getState().p);if(!run||run.stage.startsWith('CHOICE'))return;this.spawn(true);this.entryPaid=true;this.publish();this.checkpoint()}
 choosePortal(id:string){const g=useGame.getState();if(!this.running||g.panel)return false;let chosen=false;if(!g.mutate(p=>{chosen=realmChoose(p,id)})||!chosen)return false;this.continueRealm();return true}
 realmWaiting(){return this.mode==='darkness'&&!!realmRun(useGame.getState().p)?.stage.startsWith('CHOICE')}
 portalTap=(event:PointerEvent)=>{if(!this.realmWaiting())return;const rect=this.canvas.getBoundingClientRect(),x=(event.clientX-rect.left)*864/rect.width,y=(event.clientY-rect.top)*940/rect.height;const run=realmRun(useGame.getState().p),portal=run?.pair&&portalAt(run.pair,x,y);if(portal)this.choosePortal(portal.id)};
 realmView(run=realmRun(useGame.getState().p)):RealmView{
  const p=useGame.getState().p,identity=realmSceneIdentity(run,run?undefined:realmLast(p),p.darkFloor);
  const fallen=this.realmDefeatScene;
  const chamber=!run&&this.phase==='defeat'&&fallen?.id===this.id?fallen.chamber:identity.chamber;
  return {...identity,chamber,phase:this.phase,clock:this.clock,combatTime:this.combatTime,impact:this.shake,quality:realmEffectsQuality(this.quality),reduced:this.reducedMotion()};
 }

 leaveRealm(){if(this.mode!=='darkness')return;this.pause();this.mode='campaign';this.hp=this.maxHp;this.spawn(false);this.publish();this.checkpoint()}
 ultimate(u:Unit){return !this.chapterBoss()&&!!this.plan.ultimates?.includes(u.ability)}
 counterSkill(index:number,target?:Unit){
  if(index===2){if(this.curse>0){this.curse=0;this.note('cleanse');this.effect(this.heroX,600,'ПРОКЛЯТИЕ СНЯТО','#d9c2ff',24)}if(this.hazard.remaining>0||this.poison>0){this.hazard.remaining=0;this.poison=0;this.effect(this.heroX,640,'ПАУТИНА РАССЕЯНА','#9ef6ff',24)}for(const u of this.units)if(u.hp>0&&u.guard>0){u.guard=0;u.exposed=chapterOne.counter_exposure_seconds;this.effect(this.visual(u).barX,this.visual(u).barY-12,'ЩИТ РАЗБИТ','#b8efff',24)}if(breakCovers(this.units))this.effect(560,520,'ПРИКРЫТИЕ СБИТО','#b8efff',24)}
  if(index===0)for(const u of target?[target]:this.units)if(u.hp>0&&(u.windup>0&&u.windup<=.85||u.actionTime>.08)){
   u.windup=0;u.actionTime=0;u.exposed=chapterOne.counter_exposure_seconds*(this.ultimate(u)?1.7:1);u.ability='';u.cd=2.5;u.guard=0;u.fury=0;this.impactStop=.065;this.effect(this.visual(u).barX,this.visual(u).barY-14,'СОРВАНО!','#a9f7ff',28);this.burst(this.visual(u).x,this.visual(u).bodyY,'#b6f5ff',18);sound('block',useGame.getState().p.sound);
   for(const e of interrupted(this.units,u))this.tacticEvent(e);this.director.count('interrupt');this.note('interrupt');{const p=useGame.getState().p,n=setCounts(p);if(n.frost>=4){u.frozen=Math.max(u.frozen??0,1.5);this.effect(this.visual(u).barX,this.visual(u).barY-34,'ЗАМОРОЖЕН','#9af2ff',22)}if(n.stone>=4){this.shield=Math.max(this.shield,this.maxHp*.12);this.effect(this.heroX,585,'КАМЕННЫЙ ЩИТ','#e3c59c',22)}if(specId(p)==='bastion'){this.shield=Math.max(this.shield,this.maxHp*.1);this.perk.combo=combos.riposte.window;this.perk.kind=2}}if(this.gearEvent()&&this.gear.trigger('bulwark',useGame.getState().p,-1,this.maxHp)){this.effect(this.heroX,620,'НЕРУШИМАЯ КЛЯТВА','#9fd9ff',24);this.burst(this.heroX,730,'#9fd9ff',16)}
  }
 }
 autoSkills(dt:number){
  this.autoDecision=Math.max(0,this.autoDecision-dt);if(this.autoDecision>0)return;
  const danger=this.units.some(u=>u.hp>0&&(u.windup>0&&u.windup<=.65||u.actionTime>.12)),soon=this.units.some(u=>u.hp>0&&(u.windup>0||u.cd<1)),exposed=this.units.some(u=>u.hp>0&&((u.exposed??0)>0||u.guard>0));
  let index=-1;if(danger&&this.cooldowns[0]<=0)index=0;else if((this.hazard.remaining>0||exposed)&&this.cooldowns[2]<=0)index=2;else if(this.buff<=0&&this.cooldowns[1]<=0)index=1;else if(!soon&&this.cooldowns[2]<=0&&this.combatTime>.7)index=2;else if(!this.boss&&!soon&&this.cooldowns[0]<=0&&this.combatTime>1)index=0;
  if(index>=0){this.skill(index);this.autoDecision=.65}
 }
 placeEncounter(reset=true){for(const [i,u] of this.units.entries()){this.warmActor(u.id);const v=enemyPlacement(this.units,i);if(reset||u.worldX===undefined)u.worldX=this.journey.targetX+v.barX-375;if(reset||u.worldY===undefined)u.worldY=this.phase==='walk'?724:v.y;if(reset){u.reveal=this.phase==='walk'?0:1;u.travelSpeed=0;}}}
 travelEnemies(dt:number){
  const offset=this.journey.targetX-this.journey.cameraX-375;
  for(const [i,u] of this.units.entries()){
   const v=enemyPlacement(this.units,i),right=clips[u.id].envelope[v.flip?0:2]*(v.flip?-1:1),threshold=Math.max(15,725-v.barX-right*v.height);
   const t=Math.max(0,Math.min(1,1-offset/threshold)),smooth=t*t*(3-2*t),y=724+(v.y-724)*smooth,oldY=u.worldY??y;
   u.worldY=y;u.travelSpeed=Math.abs(y-oldY)/dt;
   const x=projectX(u.worldX!,this.journey.cameraX),safe=travelActorSafe(u.id,x,y,v.height,v.flip,this.boss,u.travelSpeed>3);
   u.reveal=safe?Math.min(1,(u.reveal??0)+dt*5):0;
  }
 }
 visual(u:Unit){const v=enemyPlacement(this.units,this.units.indexOf(u));const x=projectX(u.worldX??this.journey.targetX+v.barX-375,this.journey.cameraX),dy=(u.worldY??v.y)-v.y;return {...v,x:x+v.x-v.barX,barX:this.phase==='walk'?healthAnchorX(x,v.barY+dy,this.boss):x,y:u.worldY??v.y,barY:v.barY+dy,bodyY:v.bodyY+dy};}
 hit(u:Unit,amount:number,crit=false,color='#fff4ce',source?:'hero'|'goose',follower?:FollowerImpact){if(u.hp<=0)return 0;const before=u.hp,blocked=u.guard>0&&!crit;if((u.exposed??0)>0)amount=Math.round(amount*chapterOne.counter_damage_multiplier);else if(this.plan.hazard==='phalanx'&&this.units.filter(a=>a.hp>0).length>1)amount=Math.max(1,Math.round(amount*.65));if(u.affix==='warded')amount=Math.max(1,Math.round(amount*(this.castingSkill?1.3:.7)));const belt=source==='hero'&&hasPerk(useGame.getState().p,'belt');if(source==='hero'){const n=setCounts(useGame.getState().p);amount=Math.round(amount*(n.frost>=6&&((u.exposed??0)>0||(u.frozen??0)>0)?1.3:1)*(belt&&u.guard>0?1.25:1)*(1+.02*(u.dusk??0))*this.auraHit(u))}if(source==='goose'){const sid=follower?.species??this.squad.striker.id;if(sid==='08_armored_boar'&&u.guard>0)amount=Math.round(amount*1.5);if(sid==='senior_driller')this.perk.drill=Math.min(10,(this.perk.drill??0)+1)}const v=this.visual(u),contact=this.targetBody(u);if(u.guard>0&&!crit){amount=Math.max(1,Math.round(amount*(belt?.65:.4)));this.effect(v.barX,v.barY-20,'БЛОК','#96d9ff',23);sound('block',useGame.getState().p.sound)}const cover=absorb(this.units,u,amount);if(cover.coverer){amount=cover.amount;const c=cover.coverer;c.hp=Math.max(1,c.hp-cover.shared);c.hurt=.18;this.damageNumber(c,cover.shared,'#96d9ff',false);if(this.clock-this.coverNote>1.2){this.coverNote=this.clock;this.effect(v.barX,v.barY-20,'ПРИКРЫТ','#96d9ff',22);sound('block',useGame.getState().p.sound)}}u.hp=Math.max(0,u.hp-amount);this.director.impact(contact.x,crit);u.hurt=crit?.30:.22;u.reaction=.30;u.reactionStrength=blocked?3:crit?8:5;u.blockedHit=blocked;this.damageNumber(u,amount,color,crit);this.fx.push({x:contact.x,y:contact.y,vx:0,vy:0,life:.23,max:.23,color,size:crit?42:25,ring:true});this.burst(contact.x,contact.y,color,crit?18:7);const comic=crit&&this.comics.emit(contact.x,contact.y,this.comicObstacles(),u.hp===0?'БДЫЩ!':(u.exposed??0)>0?'ХРЯСЬ!':undefined);sound(comic?'critical':'hit',useGame.getState().p.sound);if(comic)this.impactStop=this.reducedMotion()||this.quality<.6?0:.03;if(u.hp===0){u.dead=.01;u.windup=0;u.actionTime=0;this.burst(v.x,v.y-50,'#ffdb5d',18);sound('death',useGame.getState().p.sound);for(const e of died(this.units,u))this.tacticEvent(e);if(source&&this.aura.killHeal>0&&this.hp>0){const heal=Math.round(this.maxHp*this.aura.killHeal);this.hp=Math.min(this.maxHp,this.hp+heal);this.effect(this.heroX-30,585,`ГОЛОД ТЕНИ +${heal}`,'#b98cff',22)}if(source&&setCounts(useGame.getState().p).ember>=6&&this.hp>0){const heal=Math.round(this.maxHp*.15);this.hp=Math.min(this.maxHp,this.hp+heal);this.burn=4;this.effect(this.heroX,600,`ЖАР БЕЗДНЫ +${heal}`,'#ff9a5c',23)}if(this.plan.hazard==='phalanx'&&this.units.filter(a=>a.hp>0).length===1&&this.units.length>1){for(const a of this.units)if(a.hp>0){a.exposed=Math.max(a.exposed??0,3);a.guard=0}this.note('phalanx:break');this.effect(560,500,'СТРОЙ СЛОМАН!','#ffe08a',28)}}if(before>u.hp&&source&&follower?.primary!==false)this.gearHit(u,source,crit);return before-u.hp;}
 gearEvent(){return this.running&&this.phase==='fight'&&this.hp>0&&!useGame.getState().panel}
 gearHit(u:Unit,source:'hero'|'goose',crit:boolean){if(!this.gearEvent()||u.hp<=0)return;const p=useGame.getState().p,v=this.visual(u);
  if(source==='hero'){if(hasPerk(p,'void'))u.dusk=Math.min(10,(u.dusk??0)+1);if(!this.castingSkill&&(specId(p)==='trapper'||specId(p)==='frostweave'))u.chill=2}
  if(source==='hero'&&this.gear.trigger('frost',p,u.role)){this.effect(v.barX,v.barY-28,'ЛЕДЯНОЙ ШЁЛК','#9af2ff',24);this.burst(v.x,v.bodyY,'#9af2ff',12)}
  if(source==='hero'&&crit&&this.gear.trigger('tempo',p)){this.effect(this.heroX,620,'ГРОЗОВОЙ РИТМ','#ffdd8f',24);this.burst(this.heroX,745,'#ffdd8f',12)}
  if(source==='goose'&&this.gear.trigger('pack',p)){const heal=Math.round(this.maxHp*gearRules.effects.pack.heal_fraction);this.hp=Math.min(this.maxHp,this.hp+heal);this.compCd[1]=Math.max(0,this.compCd[1]-gearRules.effects.pack.dog_seconds);this.effect(this.heroX,620,'СТАЯ +'+heal,'#9bffcc',24);this.burst(this.heroX,745,'#9bffcc',12)}
 }
 damageNumber(u:Unit,amount:number,color:string,critical:boolean){const tag=u.id+':'+u.role,existing=this.fx.find(f=>f.tag===tag&&f.life>.82);if(existing){existing.amount=(existing.amount??0)+amount;existing.critical=existing.critical||critical;existing.text=(existing.critical?'✦ ':'')+existing.amount;existing.size=existing.critical?34:28;return}const v=this.visual(u);this.fx.push({x:v.x-v.height*.18,y:v.bodyY-20,vx:0,vy:-42,life:1,max:1,text:(critical?'✦ ':'')+amount,color,size:critical?34:28,amount,tag,critical})}
 effect(x:number,y:number,text:string,color:string,size:number){this.fx.push({labelKey:`status-${++this.labelSerial}`,x,y,vx:(Math.random()-.5)*24,vy:-55,life:1,max:1,text,color,size})}
 burst(x:number,y:number,color:string,count:number){for(let i=0;i<Math.ceil(count*this.quality);i++)this.fx.push({x,y,vx:(Math.random()-.5)*260,vy:-Math.random()*220,life:.45+Math.random()*.4,max:1,color,size:3+Math.random()*6})}
 lightning(x:number,y:number,end:number){for(let k=0;k<10;k++)this.fx.push({x:x+(Math.random()-.5)*35,y:y+(end-y)*k/10,vx:0,vy:0,life:.35,max:1,color:'#b9f7ff',size:5})}
 takeDamage(attack:number,mult=1,piercing=false,melee=false){if(this.hp<=0)return;const p=useGame.getState().p,s=this.statsFor(p);if(Math.random()<s.dodge){this.effect(this.heroX,610,'УКЛОНЕНИЕ','#b2ecff',22);return}if(this.aura.firstBlock&&!this.perk.aegis){this.perk.aegis=1;this.effect(this.heroX,600,'ЭГИДА ТЮРА','#ffd27a',25);this.burst(this.heroX+30,720,'#ffd27a',12);sound('block',p.sound);return}mult*=(1-s.reduction)*(this.bless()==='ward'?.8:1);if(melee)mult*=this.brain.absorb(this);const amt=damage(attack,piercing?s.defense*.25:s.defense*(this.buff>0&&p.runes[1]===1?1.5:1),this.stage,mult);const absorbed=Math.min(this.shield,amt);this.shield-=absorbed;const incoming=this.gear.absorb(amt-absorbed,p);this.hp=Math.max(0,this.hp-incoming);this.heroHurt=.3;this.effect(this.heroX,610,`−${Math.round(incoming)}`,'#ff9c91',27);this.burst(this.heroX+40,710,'#ffc495',7);this.fatal();if(this.aura.thorns>0&&incoming>=1){const foe=this.units.find(u=>u.hp>0);if(foe)this.hit(foe,Math.max(1,Math.round(incoming*this.aura.thorns)),false,'#b98cff')}}
 shoot(source:Projectile['source'],kind:string,target:number,amount:number,crit=false,follower?:FollowerImpact){const u=this.units[target];if(!u)return;const v=this.visual(u),tip=swordTip(this.heroX,this.journey.worldY,this.heroAttack,this.heroHurt),sword=kind==='sword-wave',origin=follower&&!follower.primary?this.strikerPos(!!this.squad.reserve?.fly):this.strikerPos(),x0=sword?tip.x:source==='enemy'?v.x-v.height*.18:source==='goose'?origin.x:this.heroX+55,y0=sword?tip.y:source==='goose'?origin.y-100:source==='enemy'?v.bodyY:695;
 this.projectiles.push({encounterId:this.id,targetId:u.id,targetRole:u.role,originCameraX:this.journey.cameraX,x0,y0,x1:source==='enemy'?this.heroX+10:v.x,y1:source==='enemy'?710:v.bodyY,t:0,duration:sword?Math.max(.22,Math.min(.42,Math.hypot(v.x-x0,v.bodyY-y0)/800)):kind==='arrow'?.35:.55,damage:amount,target,kind,crit,source,...(follower?{follower}:{})})}

 enemyAbility(u:Unit){const enraged=u.bossPhase>1;switch(u.id){case '01_sword_shield_veteran':return this.pressure>4?'Контрудар щитом':'Удар мечом';case '02_roman_spearman':return 'Бросок пилума';case '03_pirate_bandit':return 'Рывок пирата';case '04_club_raider':return 'Тяжёлый замах';case '05_shield_spearman':return this.defensePressure>1?'Пробивающее копьё':'Стена щитов';case '06_red_crest_legionary':return 'Римская черепаха';case '07_purple_mage':return enraged?'Теневой залп':'Тёмная сфера';case '08_armored_boar':return 'Таран';case 'capybara_bruiser':return enraged?'Двойной раскол':'Удар булавой';case 'senior_driller':return enraged?'Перегрев бура':'Буровой прорыв';case 'moss_eater':return enraged?'Шипы корней':'Поглощение мха';case 'spider_queen':return enraged?'Паутина и яд':'Ловчая сеть';case 'fungal_king':return enraged?'Взрыв спор':'Споровое облако';case 'minotaur_echo':return enraged?'Грохот лавины':'Топот минотавра';case 'fire_abyss_lord':return enraged?'Огненный шторм':'Дыхание Бездны';default:return 'Сильный удар'}}
 enemyStep(u:Unit,dt:number){if(u.hp<=0)return;if((u.frozen??0)>0){u.frozen=Math.max(0,u.frozen!-dt);return}const tactic=think(this.units,u,dt,{interruptCooldown:this.cooldowns[0],stunned:this.stun>0,boss:this.boss});if(tactic)this.tacticEvent(tactic);u.exposed=Math.max(0,(u.exposed??0)-dt);if(u.affix==='regen'&&this.burn<=0&&this.stun<=0&&u.exposed<=0&&u.hp<u.max&&this.combatTime>1)u.hp=Math.min(u.max,u.hp+u.max*.012*dt);if(u.affix==='bulwark'&&u.specialCd<=0&&u.guard<=0&&this.stun<=0){u.guard=2.6;u.specialCd=9;this.effect(this.visual(u).barX,this.visual(u).barY-20,'ЩИТ ПОДНЯТ','#8fd8ff',21)}const phase=u.hp/u.max<.35?3:u.hp/u.max<.65?2:1;if((this.boss||u.id.includes('mage'))&&phase>u.bossPhase){u.bossPhase=phase;u.cd=.7;if(this.chapterBoss()){u.actionTime=0;u.windup=phase===2?1.7:1.35;u.ability=phase===2?'Ледяной кокон':'Ядовитый прилив';u.castTotal=u.windup;}else if(this.plan.ultimates&&u.role===0&&this.boss){u.actionTime=0;u.windup=phase===2?2.1:1.8;u.ability=this.plan.ultimates[phase-2];u.castTotal=u.windup;u.guard=0}this.effect(this.visual(u).barX,this.visual(u).barY-35,phase===3?'ЯРОСТЬ!':'ФАЗА II','#ffd58b',29);this.burst(this.visual(u).x,this.visual(u).bodyY,'#ffad72',18)}u.guard=Math.max(0,u.guard-dt);u.specialCd-=dt;if(this.stun>0)return;
 if(u.actionTime>0){u.actionTime-=dt;if(u.actionTime<=0){u.strikes=(u.strikes??0)+1;if(u.affix==='frenzy')u.fury=Math.min(5,(u.fury??0)+1);const ult=this.ultimate(u);if(this.chapterBoss()&&u.bossPhase>1||ult){this.hazard={remaining:u.bossPhase===3?4:3,tick:.7,damage:u.atk*.65};this.burst(this.heroX,784,'#b0a2ff',14);}let mult=(ult?1.55:1)*(u.bossPhase===3?1.6:u.bossPhase===2?1.25:1)*(u.id.includes('pirate')&&(u.strikes??0)%2===0?1.3:1)*strikeMultiplier(u);const ranged=/spearman|mage|spider|fungal|fire_abyss/.test(u.id);if(ranged){const kind=u.affix==='venom'?'spore':u.id.includes('spider')?'web':u.id.includes('fire')?'fire':u.id.includes('fungal')?'spore':u.id.includes('mage')?'orb':'arrow';this.shoot('enemy',kind,this.units.indexOf(u),u.atk*mult);sound('whoosh',useGame.getState().p.sound);if(u.bossPhase>1&&this.boss){this.shoot('enemy',kind,this.units.indexOf(u),u.atk*.35);this.projectiles[this.projectiles.length-1].duration+=.25;if(u.id==='fungal_king'){const heal=u.max*.035;u.hp=Math.min(u.max,u.hp+heal);this.effect(this.visual(u).barX,this.visual(u).barY-20,`+${Math.round(heal)}`,'#baff9c',23)}}}else{this.takeDamage(u.atk,mult,u.ability.includes('Пробивающее')||u.id==='senior_driller'&&u.bossPhase>1,true);if(u.affix==='venom'&&this.hp>0){this.poison=Math.max(this.poison,3);this.poisonTick=Math.max(.5,this.poisonTick)}if(u.ability==='Таран'||u.ability.includes('прорыв')){this.shake=7;this.burst(this.heroX+45,770,'#cfb69b',16)}if(u.id==='minotaur_echo'&&u.bossPhase>1){this.shoot('enemy','shock',this.units.indexOf(u),u.atk*.5);if(u.bossPhase===3){this.shoot('enemy','shock',this.units.indexOf(u),u.atk*.4);this.projectiles[this.projectiles.length-1].duration+=.3}this.shake=8}if(u.id==='moss_eater'&&u.bossPhase>1)this.slow=3;if(u.id==='capybara_bruiser'&&u.bossPhase>1)this.shoot('enemy','shock',this.units.indexOf(u),u.atk*.5);if(u.id==='senior_driller'&&u.bossPhase>1)this.shield=Math.max(0,this.shield-u.atk);if(u.id==='moss_eater'&&u.bossPhase===1){u.hp=Math.min(u.max,u.hp+u.max*.06);this.effect(this.visual(u).barX,this.visual(u).barY-20,'+6%','#9affb1',23)}}}return}
 if(u.windup>0){u.windup-=dt;if(u.windup<=0){u.attack=.7;u.actionTime=.28;u.cd=(u.id.includes('pirate')?((u.strikes??0)%2===0?1.8:.85):u.id.includes('boar')?2.6:2.1)/(1+(u.bossPhase-1)*.15)/(1+(u.fury??0)*.12)*(u.affix==='swift'?.85:1);if(u.ability.includes('щито')||u.id.includes('legionary'))u.guard=1.6;}return}
 u.cd-=dt;if(u.cd<=0&&this.stun<=0){u.ability=this.chapterBoss()&&u.bossPhase>1?(u.bossPhase===3?'Ядовитый прилив':'Ледяной кокон'):this.enemyAbility(u);u.windup=this.chapterBoss()?(u.bossPhase>1?1.6:1.25):this.boss?1.15:u.id.includes('club')||u.id.includes('boar')?.95:.6;if(u.affix==='swift')u.windup*=.75;u.castTotal=u.windup;if(!this.boss&&onWindup(u))this.effect(this.visual(u).barX,this.visual(u).barY-40,'МЕНЯЕТ ТАКТИКУ','#e3c2ff',21);if((u.id.includes('shield')||u.id.includes('veteran'))&&this.pressure>4){u.guard=1.7;this.pressure=0}if(this.defensePressure>1&&u.id.includes('spearman'))this.defensePressure=0;}}
 update(dt:number,visualDt=dt/useGame.getState().speed){if(!this.running||!(dt>0)||!Number.isFinite(dt))return;if(useGame.getState().panel){this.pause();return;}const g=useGame.getState(),p=g.p,s=this.statsFor(p);this.syncStats(s);this.clock+=dt;const realDt=visualDt;this.comics.step(realDt);const poseDt=this.impactStop>0?0:dt;this.impactStop=Math.max(0,this.impactStop-realDt);this.heroAttack=Math.max(0,this.heroAttack-poseDt);this.heroHurt=Math.max(0,this.heroHurt-poseDt);this.gooseAttack=Math.max(0,this.gooseAttack-dt);this.dogCast=Math.max(0,this.dogCast-dt);this.reservePose=Math.max(0,this.reservePose-dt);this.buff=Math.max(0,this.buff-dt);this.potionCd=Math.max(0,this.potionCd-dt);this.stun=Math.max(0,this.stun-dt);this.shake=Math.max(0,this.shake-dt*35);{const rate=this.director.cooldownRate()*(setCounts(p).rune>=4?1/.85:1)*this.aura.cooldownRate;if(this.perk.combo)this.perk.combo=Math.max(0,this.perk.combo-dt);if(this.perk.rally)this.perk.rally=Math.max(0,this.perk.rally-dt);this.cooldowns=this.cooldowns.map(c=>Math.max(0,c-dt*rate))}for(const u of this.units){u.attack=Math.max(0,u.attack-poseDt);u.hurt=Math.max(0,u.hurt-poseDt);u.reaction=Math.max(0,(u.reaction??0)-poseDt);if(u.chill)u.chill=Math.max(0,u.chill-dt);if(u.dead>0)u.dead+=dt}for(const f of this.fx){f.life-=dt;f.x+=f.vx*dt;f.y+=f.vy*dt;if(!f.text&&!f.ring)f.vy+=350*dt}this.fx=this.fx.filter(f=>f.life>0).slice(-Math.round(160*this.quality));this.director.tick(dt,realDt);this.brain.step(dt,this);
 if(this.realmWaiting())return;
 if(this.phase==='victory'||this.phase==='defeat'){this.delay-=dt;
  if(this.phase==='victory'&&g.p.rewardOffer&&!g.p.rewardOffer.resolved){
   // Campaign keeps the earned item in the inventory; never discard or auto-equip it.
   // The brief victory interval leaves time to tap and inspect the trophy.
   if(this.mode==='campaign'&&this.running&&this.delay<=.45){g.keepReward();g.notice('Трофей босса сохранён · поход продолжается')}
   else {if(this.delay<=.45){this.comics.active=null;this.running=false;this.publish();this.checkpoint()}return;}
  }
  if(this.delay<=0){
   const wasDefeated=this.phase==='defeat';
   const realm=this.mode==='darkness'&&!!realmLast(useGame.getState().p)&&!realmRun(useGame.getState().p);
   if((this.mode==='campaign'||this.mode==='dungeon'&&!wasDefeated)&&!mayStartLoot()){
    this.running=false;this.publish();this.checkpoint();return;
   }
   if(wasDefeated&&this.mode==='dungeon'&&this.entryPaid){this.running=false;this.publish();this.checkpoint();return}
   if(wasDefeated){this.hp=this.maxHp;if(this.mode!=='campaign'&&this.mode!=='farm'&&this.mode!=='arena')this.mode=realm?'campaign':'farm'}
   else if(this.mode==='darkness'&&realmRun(useGame.getState().p)){/* the next room of the same floor */}
   else if(this.mode!=='campaign'&&this.mode!=='farm'&&this.mode!=='arena')this.mode='campaign';
   this.hp=Math.min(this.maxHp,this.hp+this.maxHp*.25);
   // Defeat replays the same stage/wave; only a victory advances to next site.
   this.spawn(!wasDefeated);this.checkpoint();
   // The Dark Realm run is over: stop and show its result with the earned rewards.
   if(realm){this.running=false;this.publish();this.checkpoint();useGame.getState().open('realm')}
  }return}
 if(this.phase==='walk'){
  const before=this.journey.worldX,arrived=this.director.travel(dt);this.walked+=this.journey.worldX-before;this.travelEnemies(dt);this.heroX=projectX(this.journey.worldX,this.journey.cameraX);
  if(arrived){this.phase='fight';this.intro=this.mode==='campaign'||this.mode==='trial'?this.boss?chapterOne.boss_intro_seconds:chapterOne.encounter_intro_seconds:0;for(const u of this.units){u.x=585+u.role*98;u.reveal=1;u.travelSpeed=0;if(this.mode==='campaign'&&/veteran|shield|legionary/.test(u.id))u.guard=2;u.worldY=enemyPlacement(this.units,this.units.indexOf(u)).y;}this.director.onArrive();}
  return;
 }if(this.phase!=='fight')return;if(this.units.every(u=>u.hp<=0)){this.victory();return;}if(this.intro>0){this.intro=Math.max(0,this.intro-dt);return;}this.combatTime+=dt;this.gear.step(dt,p);this.regionStep(dt);if(this.hp<=0)return;if(hasPerk(p,'moss'))this.hp=Math.min(this.maxHp,this.hp+this.maxHp*.01*dt);if(this.aura.regen>0)this.hp=Math.min(this.maxHp,this.hp+this.maxHp*this.aura.regen*dt);if(this.perk.horn)this.perk.horn=Math.max(0,this.perk.horn-dt);if(this.perk.howl)this.perk.howl=Math.max(0,this.perk.howl-dt);
 if(this.hazard.remaining>0){this.hazard.remaining=Math.max(0,this.hazard.remaining-dt);this.hazard.tick-=dt;if(this.hazard.tick<=0){this.hazard.tick=.85;this.takeDamage(this.hazard.damage);this.burst(this.heroX,780,'#b0a2ff',4);if(this.hp<=0)return}}
 this.slow=Math.max(0,this.slow-dt);if(this.poison>0){this.poison-=dt;this.poisonTick-=dt;if(this.poisonTick<=0){this.poisonTick=1;this.takeDamage(this.maxHp*.025);this.burst(this.heroX,745,'#a5db79',6)}}if(this.hp<=0)return;
 if(this.boss){this.timer=Math.max(0,this.timer-dt);if(this.timer<=0){this.defeat();return}}
 this.stepProjectiles(dt);
 if(this.followerSavePending)return;
 if(this.hp<=0)return;let live=this.units.filter(u=>u.hp>0);if(live.length===0){this.victory();return}if(this.hp<=0)return;
 if(this.heroPending>0){this.heroPending-=dt;if(this.heroPending<=0){const target=this.units.findIndex(u=>u.hp>0),u=this.units[target];if(u){
   const pk=this.perk,spec=specId(p),sets=setCounts(p);let crit=Math.random()<s.crit+(this.buff>0&&p.runes[1]===0?.25:0),mult=this.buff>0?1+.3*runeMultiplier(p,1):1;pk.strikes=(pk.strikes??0)+1;
   if(!pk.opened){pk.opened=1;if(hasPerk(p,'cutlass')){mult*=3;crit=true;this.stun=Math.max(this.stun,1);this.effect(this.heroX+30,560,'АБОРДАЖ!','#9fd0ff',28)}}
   if((pk.combo??0)>0){mult*=1+combos.finish.bonus;const riposte=pk.kind===2;if(riposte)crit=true;this.effect(this.heroX+30,535,riposte?combos.riposte.label:combos.finish.label,'#ffe08a',28);this.note(riposte?'combo:riposte':'combo:finish');pk.combo=0}
   if(spec==='onslaught'){if(pk.rampRole===u.role)pk.ramp=Math.min(5,(pk.ramp??0)+1);else{pk.ramp=0;pk.rampRole=u.role}mult*=1+.08*pk.ramp}
   const amount=damage(s.attack*this.damageRate(),this.foeDef(u),this.stage,mult,crit,s.critDamage),steal=s.lifesteal+this.director.lifesteal();
   if(p.heroClass==='berserker'){this.swordStrike(u,amount,crit,steal)}else{this.shoot('hero',p.heroClass==='ranger'?'arrow':'ice',target,amount,crit);const shot=this.projectiles.at(-1)!;shot.lifesteal=steal;if(spec==='trapper'&&pk.strikes%4===0)shot.stun=true;
    if(spec==='chain'){const second=this.units.findIndex((a,i)=>i!==target&&a.hp>0);if(second>=0){this.shoot('hero','ice',second,Math.max(1,Math.round(amount*.5)),false);this.projectiles.at(-1)!.duration+=.12}}}
   if(sets.storm>=6&&pk.strikes%5===0){this.effect(540,470,'ШТОРМ!','#bfe6ff',27);for(const a of this.units)if(a.hp>0){const v=this.visual(a);this.lightning(v.x,v.barY-20,v.bodyY);this.hit(a,damage(s.attack*1.5*this.damageRate(),this.foeDef(a),this.stage),true,'#bfe6ff')}}
   if(this.aura.boltEvery&&pk.strikes%this.aura.boltEvery===0&&u.hp>0){const v=this.visual(u);this.lightning(v.x,v.barY-20,v.bodyY);this.effect(v.barX,v.barY-44,'МЬЁЛЬНИР!','#bfe6ff',23);this.hit(u,damage(s.attack*this.aura.boltPower*this.damageRate(),this.foeDef(u),this.stage),false,'#bfe6ff')}
   if(hasPerk(p,'aquila')&&pk.strikes%4===0)for(const a of this.units)if(a!==u&&a.hp>0)this.hit(a,Math.max(1,Math.round(amount*.6)),false,'#ffd27a');
   this.pressure++;}}}
 this.autoCd-=dt*(this.slow>0?.6:1)*this.gear.attackRate(p);if(this.autoCd<=0){this.autoCd=1/s.aspd;this.heroAttack=.65;this.heroPending=.23}
 if(!this.stepFollowers(dt,p))return;
 if(this.burn>0){this.burn-=dt;this.burnTick-=dt;if(this.burnTick<=0){this.burnTick=1;const target=this.units.find(u=>u.hp>0);if(target)this.hit(target,Math.round(s.attack*.5),false,'#ff9555')}}if(g.auto)this.autoSkills(dt);
 live=this.units.filter(u=>u.hp>0);if(live.length===0){this.victory();return}for(const u of live){if(this.hp<=0)break;if(u.hp<=0)continue;this.enemyStep(u,dt*this.foeRate(u,p))}
 }
 stepFollowers(dt:number,p:Player){
  const elapsed=dt*this.companionRate();
  const pair=[this.squad.striker,this.squad.guardian] as const;
  for(const [i,member] of pair.entries()){
   this.compCd[i]-=elapsed;
   if(this.compCd[i]>0)continue;
   this.compCd[i]=member.interval;
   if(i===0){this.gooseAttack=.75;this.followerAttack(member,true)}
   else{this.dogCast=.9;this.followerHeal(member,p,true)}
  }
  const reserve=this.squad.reserve,clock=this.followers;
  if(!reserve||!clock)return true;
  clock.thirdCooldown-=elapsed;
  if(clock.thirdCooldown>0)return true;
  clock.thirdCooldown=reserve.interval;
  this.reservePose=reserve.role==='striker'?.75:.9;
  if(reserve.role==='striker')this.followerAttack(reserve,false);
  else this.followerHeal(reserve,p,false);
  return this.saveFollowerAction();
 }
 followerAttack(member:CombatFollower,primary:boolean){
  let target=this.units.length-1;
  while(target>=0&&this.units[target].hp<=0)target--;
  if(target<0)return;
  const amount=this.followerDamage(member);
  const impact:FollowerImpact={instanceId:member.instanceId,species:member.id,primary,
   hidden:!this.visibleFollowers().includes(member)};
  this.shoot('goose','feather',target,amount,false,impact);
  if(!member.awake||!this.followers)return;
  const charges=this.followers.charges;
  charges[member.instanceId]=((charges[member.instanceId]??0)+1)%3;
  if(charges[member.instanceId]===0){
   for(const [i,unit] of this.units.entries()){
    if(i!==target&&unit.hp>0)this.hit(unit,Math.max(1,Math.round(amount*.5)),false,'#fff4d2',undefined,impact);
   }
  }
 }
 followerHeal(member:CombatFollower,p:Player,primary:boolean){
  const heal=Math.round(this.maxHp*this.followerHealFraction(member,p,primary));
  this.hp=Math.min(this.maxHp,this.hp+heal);
  this.effect(this.heroX-20,620,`+${heal}`,'#8cffa1',26);
  this.burst(this.heroX,750,'#8affc0',18);
  this.guardianAid(member);
  sound('potion',p.sound);
 }
 victory(){if(this.rewarded)return;if(this.mode==='darkness'&&realmRun(useGame.getState().p)){if(this.units.some(u=>u.hp>0))return;const g=useGame.getState();if(!g.mutate(p=>{if(realmVictory(p,this.id,this.units.length))soloVictory(p,carnivalNow());else return false},true)){this.running=false;this.publish();return}this.projectiles=[];const run=realmRun(useGame.getState().p);if(run){if(run.stage.startsWith('CHOICE')){this.phase='waiting';this.plan=realmPlan(run.f,run.r,run);this.publish();this.checkpoint()}else this.continueRealm();return}this.rewarded=true;this.phase='victory';this.running=false;this.publish();this.checkpoint();sound('rare',g.p.sound);g.open('realm');return;}this.phase='victory';this.curse=0;this.hazardWarn=-1;this.hazard.remaining=0;this.poison=0;this.delay=1.7;this.rewarded=true;this.projectiles=[];if(!useGame.getState().win(this.mode,this.id,this.snapshot(),this.tally,gold=>{this.effect(this.heroX,610,`+${gold.toLocaleString('ru')} зол.`,'#ffdd75',24)})){this.phase='fight';this.rewarded=false;this.running=false;this.publish();useGame.getState().notice('Победа ожидает сохранения · освободите место и нажмите топоры');return}this.tally={};this.director.onVictory();if(this.mode==='arena'||!useGame.getState().continueOnVictory){this.running=false;this.checkpoint()}if(this.mode==='darkness'&&realmLast(useGame.getState().p)?.win&&!realmRun(useGame.getState().p)){this.effect(432,400,'ЭТАЖ ПРОЙДЕН!','#d9b8ff',36);this.burst(432,560,'#b98cff',34)}if(this.boss)this.burst(550,640,'#ffe2a0',24);else this.effect(445,410,'ПОБЕДА!','#fff1a1',31);sound(this.boss?'rare':'win',useGame.getState().p.sound);haptic(true);this.publish();if(this.mode==='arena')useGame.getState().open('arena')}
 // ── Saga: region hazards. Timing is a pure function of combatTime, so pause/reload never repeat a strike. ──
 rawDamage(amount:number,color='#ffb09c'){if(this.hp<=0)return 0;const p=useGame.getState().p,absorbed=Math.min(this.shield,amount);this.shield-=absorbed;const incoming=Math.round(this.gear.absorb(amount-absorbed,p));if(incoming<=0){this.effect(this.heroX,610,'ЩИТ ВЫДЕРЖАЛ','#9fe2ff',23);return 0}this.hp=Math.max(0,this.hp-incoming);this.heroHurt=.3;this.effect(this.heroX,610,`−${incoming}`,color,27);this.fatal();return incoming}
 regionStep(dt:number){
  const id=this.plan.hazard;this.hazardFlash=Math.max(0,this.hazardFlash-dt);if(!id){this.hazardWarn=-1;return}
  const ph=hazardPhase(id,this.combatTime,dt),h=hazards[id];this.hazardWarn=ph.telegraph;
  if(ph.telegraph>=0&&ph.cycle!==this.hazardCycle){this.hazardCycle=ph.cycle;this.effect(432,470,h.warn,h.color,26);sound('whoosh',useGame.getState().p.sound)}
  if(ph.strike)this.hazardStrike(id,ph.cycle);
 }
 hazardStrike(id:HazardId,cycle:number){
  const h=hazards[id],snd=useGame.getState().p.sound;this.hazardFlash=.45;
  if(id==='blizzard'){if(this.buff>0){this.effect(this.heroX,600,'КЛИЧ СОГРЕВАЕТ','#ffe294',24)}else{this.slow=Math.max(this.slow,4);this.effect(this.heroX,600,'ШКВАЛ · АТАКИ МЕДЛЕННЕЕ','#bfeaff',23)}this.director.life.shake(this.heroX,2,this.journey.cameraX)}
  else if(id==='storm'){const steady=this.buff>0||this.brain.armed>0;if(steady){this.effect(this.heroX,585,'УСТОЯЛ!','#ffe294',26);this.note('stood')}const took=this.rawDamage(this.maxHp*(steady?.04:.14),'#9fd0ff');if(took>0&&!steady){this.autoCd=Math.max(this.autoCd,1.1);this.heroPending=0}this.shake=7;this.burst(this.heroX,760,'#bfe6ff',22);sound('whoosh',snd)}
  else if(id==='curse'){this.curse=Math.min(3,this.curse+1);this.effect(this.heroX,600,`МЕТКА ${this.curse}/3 · −${this.curse*12}% УРОНА`,h.color,23);this.burst(this.heroX,700,h.color,12);sound('rune',snd)}
  else if(id==='rockfall'){this.rawDamage(this.maxHp*.15,'#e3c59c');for(const u of this.units)if(u.hp>0){const open=this.stun>0||(u.exposed??0)>0;const amount=Math.round(u.max*(this.boss?.03:.06)*(open?2:1));u.hp=Math.max(1,u.hp-amount);u.hurt=.2;if(open)this.note('rock:open');this.damageNumber(u,amount,'#e3c59c',open)}this.shake=9;this.burst(520,720,'#cdb596',26);sound('hit',snd)}
  else if(id==='phalanx'){const idx=this.units.findIndex(u=>u.hp>0);if(idx>=0){this.shoot('enemy','arrow',idx,this.units[idx].atk*1.5);this.projectiles.at(-1)!.duration=.5;sound('whoosh',snd)}}
  else if(id==='heat'){this.rawDamage(this.maxHp*Math.min(.2,.05+.02*cycle),'#ff9a5c');this.burst(this.heroX,790,'#ff9a5c',20);if(this.hp>0)this.note('heat');this.shake=5;sound('whoosh',snd)}
 }
 // ── Living World hooks ──
 audioFrame(){const p=useGame.getState().p,d=this.director;audio.frame({enabled:p.sound,running:this.running,hidden:typeof document!=='undefined'&&document.hidden,volume:p.volume??2,mood:this.boss&&this.phase==='fight'?'boss':d.danger>.4||d.gloom>=.15?'tense':'city',wind:d.life.wind,walked:this.walked,quality:this.quality});this.walked=0}
 companionRate(){return this.director.companionRate()*(setCounts(useGame.getState().p).legion>=2?1.2:1)}
 followerDamage(member:CombatFollower){
  const p=useGame.getState().p;
  return Math.round(this.statsFor(p).attack*member.power*(setCounts(p).legion>=4?2:1));
 }
 followerHealFraction(member:CombatFollower,p:Player,primary:boolean){
  return Math.min(.45,member.power*(primary&&branchOf(p,1)===1?1.4:1)*(setCounts(p).legion>=4?1.3:1));
 }
 gooseDamage(){return this.followerDamage(this.squad.striker)}
 teamCombo(kind:1|2){this.perk.combo=combos.finish.window;this.perk.kind=kind;if(setCounts(useGame.getState().p).legion>=6){this.perk.rally=4;this.effect(this.heroX,545,'ОРЁЛ ЛЕГИОНА +40%','#ffd27a',22)}}
 onDive(u:Unit,broke:boolean){const v=this.visual(u),p=useGame.getState().p;this.burst(v.x,v.bodyY-20,'#fff4d2',14);sound('honk',p.sound);if(broke){this.effect(v.barX,v.barY-16,'ГУСЬ СОРВАЛ!','#fff0b0',26);this.impactStop=this.reducedMotion()?0:.04;this.director.count('dive');this.note('dive');this.teamCombo(1);if(branchOf(p,0)===0&&u.hp>0)this.hit(u,Math.round(this.gooseDamage()*1.5),false,'#fff4d2','goose')}else if(u.hp>0)this.hit(u,this.gooseDamage(),false,'#fff4d2','goose')}
 onGuardReady(){sound('bark',useGame.getState().p.sound)}
 onGuardHit(){this.effect(this.heroX+70,640,'ПЁС ПРИКРЫЛ!','#ffe08a',25);this.burst(this.heroX+62,745,'#ffe9a3',12);sound('block',useGame.getState().p.sound);this.director.count('guard');this.note('guard');this.teamCombo(2)}
 onRescue(){this.effect(this.heroX-30,585,'ПЁС ВЫРУЧАЕТ!','#8cffa1',25);sound('bark',useGame.getState().p.sound);this.director.count('rescue')}
 tacticEvent(e:TacticEvent){const v=this.visual(e.from),text={'cover-call':'','cover':'ПОД ЗАЩИТОЙ','combo':'КОМБО!','moment':'ЛОВИТ МОМЕНТ','quick':'','confused':'РАСТЕРЯН!','flinch':'ДРОГНУЛ!'}[e.type];if(!text)return;const at=e.type==='cover'&&e.to?this.visual(e.to):v;this.effect(at.barX,at.barY-38,text,e.type==='confused'||e.type==='flinch'?'#b7f9ff':'#ffcf9c',22)}
 defeat(){this.hammerKills=0;if(this.mode==='darkness'&&realmRun(useGame.getState().p)){const g=useGame.getState(),scene={id:this.id,chamber:this.realmView().chamber};if(!g.mutate(p=>{realmDefeat(p)})){this.running=false;this.publish();return}this.realmDefeatScene=scene;this.phase='defeat';this.running=false;this.projectiles=[];this.publish();this.checkpoint();g.open('realm');return}this.flushTally();const fallen=this.mode==='darkness'&&!!realmRun(useGame.getState().p)&&useGame.getState().mutate(p=>{realmDefeat(p)});this.phase='defeat';this.delay=fallen?1.5:2;this.running=fallen?this.running:this.running&&!useGame.getState().stopOnDeath&&(this.mode==='campaign'||this.mode==='farm');this.projectiles=[];this.effect(430,480,'ПОРАЖЕНИЕ','#ffb09c',34);sound('death',useGame.getState().p.sound);this.publish();this.checkpoint();if(this.mode==='arena'){useGame.getState().open('arena');return}useGame.getState().notice(fallen?'Герой пал во Тьме · поход завершён':this.running?'Герой погиб · повторная попытка автоматически':'Герой погиб · нажмите топоры для повторной попытки')}
 publish(){this.renderDirty=true;const run=this.mode==='darkness'?realmRun(useGame.getState().p):undefined;useGame.setState({battle:{realmKilled:run?run.killed+(this.realmWaiting()?0:this.units.filter(u=>u.hp<=0).length):undefined,hp:Math.round(this.hp),maxHp:this.maxHp,enemyHp:Math.ceil(this.units.reduce((a,u)=>a+u.hp,0)),enemyMax:this.units.reduce((a,u)=>a+u.max,0),phase:this.phase,boss:this.boss,timer:this.timer,cooldowns:[...this.cooldowns],enemyName:this.plan.bossName??characters.find(c=>c.id===this.units[0]?.id)?.name??'',mode:this.mode,running:this.running,bossPhase:Math.max(...this.units.map(u=>u.bossPhase)),ability:this.units.find(u=>u.windup>0)?.ability??'',distance:Math.floor(this.journey.worldX/10),district:(this.mode==='campaign'?this.plan.region.districts:regionOf(this.stage).districts)[this.journey.encounterIndex%5],region:this.plan.region.name,hazard:this.plan.hazard&&this.phase==='fight'?hazards[this.plan.hazard].name:undefined,curse:this.curse,encounterRole:this.plan.role,travelRemaining:Math.max(0,(this.journey.targetX-this.journey.worldX)/10),intro:this.intro,combatTime:this.combatTime,encounterTitle:this.mode==='campaign'||this.mode==='trial'||this.mode==='darkness'?this.plan.title:undefined,encounterHint:this.mode==='campaign'||this.mode==='trial'||this.mode==='darkness'?this.plan.hint:undefined,counterReady:this.units.some(u=>u.hp>0&&(u.windup>0&&u.windup<=.85||u.actionTime>0&&u.actionTime>.08))&&this.cooldowns[0]<=0,potionCost:this.potionCost(),potionCd:this.potionCd,pendingMode:this.pendingMode,entryCost:this.pendingMode&&['dungeon','darkness'].includes(this.pendingMode)?config.mode_entry_chaosite:0}})}
 character(id:string,x:number,y:number,size:number,attack:number,hurt:number,walking=false,death=0,windup=0,victory=false,registeredHeight=false,flip=false,walkTime=this.journey.distance/160,equippedHero=false){const c=this.ctx,p=useGame.getState().p,wings=equippedHero&&p.equipment.wings&&p.wingVisible?this.wingImage():undefined,attachments=sceneImageReady(wings)?{wings,reducedMotion:this.reducedMotion()}:undefined;c.save();c.fillStyle='#1c3559';c.globalAlpha*=.2;c.beginPath();c.ellipse(x,y+1,size*.3,9,0,0,Math.PI*2);c.fill();c.restore();if(drawActor(c,id,x,y,size,walking?walkTime:this.clock,walking,attack,hurt,death,windup,victory,registeredHeight,flip,attachments))return;this.warmActor(id);const img=this.images.get(id)!;drawFallback(c,img,id,x,y,size,registeredHeight,flip,attachments)}
 bar(x:number,y:number,w:number,f:number,color:string){const c=this.ctx;c.fillStyle='#202a38';c.fillRect(x-w/2-2,y-2,w+4,12);c.fillStyle='#4a2632';c.fillRect(x-w/2,y,w,8);c.fillStyle=color;c.fillRect(x-w/2,y,w*Math.max(0,f),8);c.fillStyle='#ffffff55';c.fillRect(x-w/2,y,w*Math.max(0,f),2)}
 private renderDirty=true;
 private rasterDirty=true;
 private rasterDpr=0;
 private drawnPlayer?:Player;
 private drawnAssets=-1;
 private lastAudio=0;
 invalidateViewport(){this.rasterDirty=true;this.renderDirty=true}
 private wingImage(){
  let image=this.images.get('wings');
  if(!image){image=sceneImage('ui-wings');this.images.set('wings',image)}
  return image;
 }
 syncCanvasResolution(){
  if(typeof window==='undefined'||!this.canvas.getBoundingClientRect)return;
  const dpr=window.devicePixelRatio||1;
  if(!this.rasterDirty&&this.rasterDpr===dpr)return;
  this.rasterDirty=false;this.rasterDpr=dpr;
  const displayedWidth=this.canvas.getBoundingClientRect().width;
  const ratio=Math.max(1,Math.min(3,dpr*displayedWidth/864));
  const width=Math.ceil(864*ratio),height=Math.ceil(940*ratio);
  if(this.canvas.width!==width)this.canvas.width=width;
  if(this.canvas.height!==height)this.canvas.height=height;
  this.ctx.setTransform(ratio,0,0,ratio,0,0);
 }
 draw(){this.syncCanvasResolution();const c=this.ctx,labels:CombatLabel[]=[];c.clearRect(0,0,864,940);const dark=this.mode==='darkness',run=dark?realmRun(useGame.getState().p):undefined,realm=dark?this.realmView(run):undefined;
 const gates=realm?.phase==='waiting'?run?.pair:undefined;
 if(realm)this.realmScenery.drawBack(c,this.journey,realm);
 else{this.scenery.draw(c,this.journey,this.clock,this.world,this.chapterBoss()&&this.phase==='fight'?.08+(this.units[0].bossPhase-1)*.06:0,this.quality,sky=>this.director.life.sky(sky,this.director.env()));paintBiomeBack(c,this.plan.region,this.clock,this.journey.cameraX,this.quality,this.reducedMotion());this.director.back(c);}
 // Environmental light and fog are independent of combat actors and UI.
 c.save();if(this.running&&!this.reducedMotion()){const [sx,sy]=this.comics.offset(false,this.quality);c.translate(Math.max(-4,Math.min(4,sx+(Math.random()-.5)*this.shake)),Math.max(-4,Math.min(4,sy+(Math.random()-.5)*this.shake)));}const p=useGame.getState().p,walking=this.phase==='walk'&&this.journey.velocity>3,attackLunge=this.heroAttack>.2&&p.heroClass==='berserker'?Math.sin(this.heroAttack*5)*20:0;
 if(!dark&&this.phase==='walk'&&!this.director.hidesResident()){
  const residentWorld=siteX(this.journey.encounterIndex)-420+Math.sin(this.clock*.45+this.journey.encounterIndex)*24,residentX=projectX(residentWorld,this.journey.cameraX);
  if(residentX>235&&residentX<765){c.save();c.globalAlpha*=Math.min(1,(residentX-235)/35,(765-residentX)/25);this.character('cappuccina_approved',residentX,710,98,Math.sin(this.clock*2)>.65?.25:0,0,Math.abs(Math.cos(this.clock*.45))>.5,0,0,false,false,false,this.clock*.4);if(residentX>480&&residentX<690){c.save();c.font='800 20px system-ui';c.textAlign='center';c.lineWidth=5;c.strokeStyle='#183247';c.fillStyle='#f6e8bb';c.strokeText('Берегись паутины!',residentX,580);c.fillText('Берегись паутины!',residentX,580);c.restore()}c.restore()}
 }
 const actors:Array<{y:number;paint:()=>void}>=[];
 const heroDrawX=this.heroX-(gates?130:0);
 const visible=this.visibleFollowers();
 const showMain=visible.includes(this.squad.striker),showGuard=visible.includes(this.squad.guardian);
 const rawGooseX=projectX(this.journey.goose.worldX,this.journey.cameraX)-40;
 const gooseX=gates?Math.min(200,rawGooseX):rawGooseX;

 const dogX=gates?Math.min(214,this.guardianX()):this.guardianX();
 const dive=this.brain.goose?.kind==='dive'?this.targetBody(this.brain.goose.target):undefined,gp=this.brain.goosePose(this.clock,{x:gooseX,y:this.journey.goose.worldY-25},dive),dp=this.brain.dogPose(this.clock,{x:dogX},this.heroX);
 if(!dark)actors.push(...this.director.actors());
 const sp=this.strikerPos(),strikerLane=gates?Math.min(218,sp.x):sp.x,fly=this.squad.striker.fly,glow=(x:number,y:number)=>{c.save();c.globalAlpha=.35+.15*Math.sin(this.clock*3);c.fillStyle='#ffd86b';c.beginPath();c.ellipse(x,y+2,52,13,0,0,Math.PI*2);c.fill();c.restore()};
 if(showMain)actors.push({y:sp.y,paint:()=>{if(this.squad.striker.awake)glow(strikerLane+(gates?0:gp.dx),fly?sp.y+gp.dy-70:sp.y);this.character(this.squad.striker.id,strikerLane+(gates?0:gp.dx),sp.y+gp.dy*(fly?1:.12),fly?156:136,Math.max(this.gooseAttack,gp.attack),0,this.phase==='walk'&&(this.journey.goose.speed??0)>3,0,0,false,!fly,this.squad.striker.id!=='goose_aviator',fly?this.clock:this.journey.distance/160)}});
 if(showGuard)actors.push({y:this.journey.dog.worldY+(dp.dx>60?8:0),paint:()=>{if(this.squad.guardian.awake)glow(dogX+(gates?0:dp.dx),this.journey.dog.worldY);this.character(this.squad.guardian.id,dogX+(gates?0:dp.dx),this.journey.dog.worldY+dp.dy,this.squad.guardian.id==='brown_white_dog'?156:132,Math.max(this.dogCast,dp.attack),0,dp.run||this.phase==='walk'&&(this.journey.dog.speed??0)>3,0,0,false,this.squad.guardian.id!=='brown_white_dog',this.squad.guardian.id!=='brown_white_dog',(this.journey.dog.stride??0)/160)}});
 const reserve=this.squad.reserve;
 if(reserve&&visible.includes(reserve)){
  const at=this.strikerPos(reserve.fly),x=gates?Math.min(218,at.x):at.x;
  actors.push({y:at.y,paint:()=>{
   if(reserve.awake)glow(x,reserve.fly?at.y-70:at.y);
   this.character(reserve.id,x,at.y,reserve.fly?156:136,this.reservePose,0,
    this.phase==='walk'&&(this.journey.goose.speed??0)>3,0,0,false,!reserve.fly,reserve.id!=='goose_aviator',
    reserve.fly?this.clock:this.journey.distance/160);
  }});
 }
 actors.push({y:this.journey.worldY,paint:()=>this.character(heroArt[p.heroClass],heroDrawX+(gates?0:attackLunge),this.journey.worldY,214,gates?0:this.heroAttack,gates?0:this.heroHurt,walking,this.phase==='defeat'?.65:0,0,this.phase==='victory',false,false,this.journey.distance/160,true)});
 if(!dark&&this.phase==='victory'&&this.boss)actors.push({y:724,paint:()=>this.character('cappuccina_approved',650,724,110,Math.floor(this.clock*4)%2?.5:.2,0,false)});
 for(const [i,u] of this.units.entries()){
  const reveal=this.phase==='walk'?(u.reveal??0):1;if(u.dead>1.1||reveal<=0)continue;const v=this.visual(u);
  actors.push({y:v.y,paint:()=>{c.save();c.globalAlpha*=reveal;
   if(u.windup>0){c.save();const glow=c.createRadialGradient(v.x,v.y,5,v.x,v.y,this.boss?85:50);glow.addColorStop(0,'#ffb06c66');glow.addColorStop(1,'#ff533600');c.fillStyle=glow;c.fillRect(v.x-90,v.y-35,180,45);c.strokeStyle='#ffbd79';c.lineWidth=3;c.beginPath();c.ellipse(v.x,v.y,this.boss?74:45,9,0,0,Math.PI*2);c.stroke();c.save();c.translate(v.x,v.y);c.scale(1,.18);c.strokeStyle=u.windup<=.85?'#c2faff':'#ffbb78';c.lineWidth=5;c.beginPath();c.arc(0,0,this.boss?74:45,-Math.PI/2,-Math.PI/2+Math.PI*2*(1-u.windup/(u.castTotal??1.7)));c.stroke();c.restore();c.restore()}
   if((u.cover??0)>0){c.save();c.strokeStyle='#8fd8ff';c.lineWidth=3;c.setLineDash([9,7]);c.lineDashOffset=-this.clock*26;c.beginPath();c.ellipse(v.x,v.y-v.height*.5,v.height*.36,v.height*.56,0,0,Math.PI*2);c.stroke();c.restore()}
   if((this.foeRate(u,p)<1||(u.frozen??0)>0)&&u.hp>0){c.save();c.strokeStyle='#9aefff';c.lineWidth=3;c.beginPath();c.ellipse(v.x,v.y-4,v.height*.34,10,0,0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(v.x-30,v.y-9);c.lineTo(v.x-10,v.y-26);c.lineTo(v.x+8,v.y-10);c.lineTo(v.x+30,v.y-24);c.stroke();c.restore()}
   if((u.exposed??0)>0){c.save();c.strokeStyle='#b7f9ff99';c.lineWidth=3;c.beginPath();c.ellipse(v.x,v.y-3,v.height*.32,8,0,0,Math.PI*2);c.stroke();c.restore()}
   // Give physical motion to the approved original enemy sprites. Previously the
   // attack flags changed atlas frames but did not move the enemy toward its hit.
   // Keep this cosmetic: no damage, timers, collisions or save state changes.
   const recoil=reactionOffset(u.reaction??0,u.reactionStrength??0,this.reducedMotion());
   const ranged=/spearman|mage|spider|fungal|fire_abyss/.test(u.id);
   const active=u.hp>0&&this.phase==='fight'&&!this.reducedMotion();
   const lunge=active?enemyLunge(u.attack,ranged):0;
   const winding=active&&u.windup>0;
   const windT=winding?1-Math.min(1,u.windup/Math.max(.01,u.castTotal??.7)):0;
   const brace=winding?Math.sin(windT*Math.PI)*5:0;
   const idle=active&&u.windup<=0&&u.attack<=0&&u.hurt<=0?Math.sin(this.clock*2.4+u.role*.7)*2.25:0;
   this.character(u.id,v.x+recoil+lunge+brace,v.y+idle,v.height,u.blockedHit&&u.hurt>0?0:u.attack,u.blockedHit?0:u.hurt,this.phase==='walk'&&(u.travelSpeed??0)>3,u.dead,u.windup,false,true,v.flip,this.clock);c.restore();
  }});
 }
 if(this.plan.hazard&&this.phase==='fight')paintHazard(c,this.plan.hazard,this.hazardWarn,this.hazardFlash,this.heroX,this.clock,this.curse);if(this.hazard.remaining>0){c.save();c.translate(this.heroX,799);c.scale(1,.19);c.fillStyle='#9c65d62a';c.beginPath();c.arc(0,0,91,0,Math.PI*2);c.fill();c.strokeStyle='#cfb6ff';c.lineWidth=2;for(let ring=1;ring<=3;ring++){c.beginPath();c.arc(0,0,ring*29,0,Math.PI*2);c.stroke()}for(let n=0;n<10;n++){c.beginPath();c.moveTo(0,0);c.lineTo(Math.cos(n*Math.PI/5)*91,Math.sin(n*Math.PI/5)*91);c.stroke()}c.restore()}
 for(const actor of actors.sort((a,b)=>a.y-b.y))actor.paint();
 // Draw health and telegraphs after bodies, above the union of every registered pose.
 for(const [i,u] of this.units.entries())if(u.hp>0&&(this.phase!=='walk'||(u.reveal??0)>0)){const v=this.visual(u);c.save();if(this.phase==='walk')c.globalAlpha*=u.reveal??0;
  if(this.boss&&u.windup<=0){c.save();c.textAlign='center';c.font='900 24px system-ui';c.lineWidth=5;c.strokeStyle='#17283d';c.fillStyle='#ffe7b7';const label=u.title??this.plan.bossName??characters.find(a=>a.id===u.id)?.name??'';c.strokeText(label,Math.min(595,v.barX),v.barY-14,260);c.fillText(label,Math.min(595,v.barX),v.barY-14,260);c.restore()}this.bar(v.barX,v.barY,this.boss?180:88,u.hp/u.max,this.stun>0?'#af9eff':u.guard>0?'#77d3e7':'#f24e4c');
  if(!dark&&u.tactic==='cover-call')labels.push({key:'tactic:'+i,text:'Прикрываю!',x:v.barX,y:v.barY-32,size:21,color:'#9fdcff',alpha:1,priority:4});
  if(!dark&&u.affix&&u.windup<=0&&!this.boss&&this.phase==='fight')labels.push({key:'affix:'+i,text:affixes[u.affix as keyof typeof affixes]?.name??'',x:v.barX,y:v.barY-14,size:17,color:affixes[u.affix as keyof typeof affixes]?.color??'#fff',alpha:.95,priority:1});if(u.windup>0)labels.push({key:'ability:'+i,text:u.ability,x:v.barX,y:v.barY-32,size:21,color:'#ffe0a1',alpha:1,priority:4});
  if(this.stun>0){c.fillStyle='#fff19c';c.font='25px serif';c.fillText('✦',v.barX-12,v.barY-17)}c.restore();
 }
 if(!gates&&this.dogCast>0){c.strokeStyle='#a8ffd0';c.lineWidth=4;if(showGuard){c.beginPath();c.ellipse(dogX,797,59,12,0,0,Math.PI*2);c.stroke()}c.beginPath();c.ellipse(this.heroX,800,72,13,0,0,Math.PI*2);c.stroke()}
 const heroId=heroArt[p.heroClass],heroHeight=legacyBodyHeight(heroId,214),heroTop=805+Math.min(clips[heroId].envelope[1],clips[heroId+':run']?.envelope[1]??0)*heroHeight;this.bar(heroDrawX,Math.min(571,heroTop-18),114,this.hp/this.maxHp,'#72e46a');if(!gates&&this.heroAttack>.18&&p.heroClass==='berserker'){c.save();c.strokeStyle='#cdf6ffbb';c.lineWidth=10;c.shadowBlur=this.quality>.6?14:0;c.shadowColor='#78dfff';c.beginPath();c.arc(this.heroX+62,704,92,-1.4,.8);c.stroke();c.lineWidth=3;c.strokeStyle='#fff';c.stroke();c.restore()}
 if(!gates&&this.gear.active('tempo',p)){c.strokeStyle='#ffdc8f';c.lineWidth=3;c.beginPath();c.ellipse(this.heroX,800,78,13,0,0,Math.PI*2);c.stroke()}
 if(!gates&&(this.buff>0||this.shield>0||this.gear.active('bulwark',p)?.pool)){c.strokeStyle=(this.shield>0||this.gear.active('bulwark',p)?.pool)?'#88eaff':'#ffda6b';c.lineWidth=4;c.beginPath();c.ellipse(this.heroX,790,(this.shield>0||this.gear.active('bulwark',p)?.pool)?76:64,(this.shield>0||this.gear.active('bulwark',p)?.pool)?105:14,0,0,Math.PI*2);c.stroke()}
 for(const b of this.projectiles){if(b.follower?.hidden||!this.projectileTarget(b))continue;if(b.kind==='sword-wave'){if((b.launchDelay??0)<=0){const ends=this.projectileEnds(b);drawSwordWave(c,b,ends.start,ends.end,this.quality)}continue}const {start,end}=this.projectileEnds(b),{head,tail,angle}=projectileVisualPath(b,start,end),x=head.x,y=head.y; c.save();const trail=c.createLinearGradient(tail.x,tail.y,x,y);trail.addColorStop(0,'#b7eeff00');trail.addColorStop(1,b.kind==='fire'?'#ffb36aa0':b.kind==='web'?'#ddbaffb0':'#b7eeffa0');c.strokeStyle=trail;c.lineWidth=b.kind==='arrow'?3:8;c.beginPath();c.moveTo(tail.x,tail.y);c.lineTo(x,y);c.stroke();c.translate(x,y);c.rotate(angle);if(b.kind==='arrow'||b.kind==='feather'){c.strokeStyle=b.kind==='feather'?'#fff4d2':b.stun?'#ffe08a':'#dba966';c.lineWidth=5;c.beginPath();c.moveTo(-31,0);c.lineTo(13,0);c.stroke();c.fillStyle='#eff9ff';c.beginPath();c.moveTo(20,0);c.lineTo(7,-6);c.lineTo(7,6);c.closePath();c.fill()}else{const color=b.kind==='fire'?'#ff9e49':b.kind==='spore'?'#b6f58f':b.kind==='web'?'#eee2ff':b.kind==='orb'?'#da93ff':'#9cf9ff';c.shadowBlur=this.quality>.6?18:0;c.shadowColor=color;c.fillStyle=color;c.beginPath();c.arc(0,0,b.kind==='web'?10:11,0,Math.PI*2);c.fill();if(b.kind==='web'){c.shadowBlur=0;c.strokeStyle='#f1e4ff';c.lineWidth=1.5;for(let n=0;n<6;n++){const a=n*Math.PI/3;c.beginPath();c.moveTo(0,0);c.lineTo(Math.cos(a)*22,Math.sin(a)*22);c.stroke()}c.beginPath();for(let n=0;n<=6;n++){const a=n*Math.PI/3;c.lineTo(Math.cos(a)*17,Math.sin(a)*17)}c.stroke()}c.fillStyle='#fff';c.beginPath();c.arc(-2,-3,4,0,Math.PI*2);c.fill()}c.restore()}
 for(const f of this.fx){if(gates||f.text)continue;c.globalAlpha=Math.min(1,f.life*2);if(f.ring){const radius=f.size*(1-f.life/f.max);c.strokeStyle=f.color;c.lineWidth=3;c.beginPath();c.arc(f.x,f.y,radius,0,Math.PI*2);c.stroke();}else{c.fillStyle=f.color;c.beginPath();c.arc(f.x,f.y,f.size*Math.min(1,f.life*2),0,Math.PI*2);c.fill()}}c.globalAlpha=1;c.restore();
 const blocked=this.comicObstacles(),comic=this.comics.active;if(!dark&&comic)blocked.push([comic.x-106,comic.y-56,comic.x+106,comic.y+56]);
 const floating=dark?this.fx.filter(f=>f.tag||f.text?.startsWith('−')).slice(-3):this.fx;
 for(const [i,f] of floating.entries())if(!gates&&f.text)labels.push({key:f.tag??f.labelKey??f.text+':'+Math.round(f.max*100)+':'+i,text:f.text,x:f.x,y:f.y,size:dark?Math.min(25,f.size):f.size,color:f.color,alpha:Math.min(1,f.life*3),priority:f.tag?3:2});
 this.lastLabels=layoutLabels(labels,blocked,(text,size)=>{c.font=`900 ${size}px system-ui`;return c.measureText(text).width},this.labelPositions);this.labelPositions=new Map(this.lastLabels.map(f=>[f.key,f.rect]));
 for(const f of this.lastLabels){c.save();c.globalAlpha=f.alpha;c.font=`900 ${f.size}px system-ui`;c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';c.lineWidth=5;c.strokeStyle='#26354c';c.fillStyle=f.color;for(const [n,line] of f.lines.entries()){const y=f.y+(n-(f.lines.length-1)/2)*f.size*1.12;c.strokeText(line,f.x,y);c.fillText(line,f.x,y)}c.restore()}if(!dark)this.comics.draw(c,this.reducedMotion(),this.quality);
 if(realm){
  this.realmScenery.drawFront(c,this.journey,realm);
  if(gates)drawRealmPortals(c,gates,realm.clock,realm.reduced);
  this.realmScenery.drawCrossing(c,this.journey,realm);
 }
 if(!dark){this.director.front(c);paintBiomeFront(c,this.plan.region,this.clock,this.journey.cameraX,this.quality,this.reducedMotion());}if(!dark)this.brain.drawEmotes(c,who=>who==='goose'?(showMain?{x:gooseX+gp.dx+60,y:this.journey.goose.worldY+gp.dy-132}:null):who==='dog'?(showGuard?{x:dogX+(gates?0:dp.dx)+64,y:this.journey.dog.worldY+dp.dy-128}:null):{x:this.heroX+70,y:560});

 c.fillStyle='#fff';if(!dark&&this.plan.region.look.particles==='snow')for(let i=0;i<Math.round(32*this.quality);i++){const x=((i*137+this.clock*(8+i%4)-this.journey.cameraX*(.12+(i%3)*.08))%864+864)%864,y=(i*97+this.clock*(16+i%7))%900;c.globalAlpha=.2+(i%3)*.13;c.beginPath();c.arc(x,y,1.3+i%3,0,Math.PI*2);c.fill()}c.globalAlpha=1}
 frame=(time:number)=>{
  if(this.stopped)return;
  const delta=(time-this.last)/1000||.016,dt=Math.min(.05,delta);
  this.last=time;
  if(!document.hidden){
   const {p,panel,speed}=useGame.getState();
   if(this.running){
    if(delta>.04)this.quality=Math.max(.45,this.quality-.005);
    else this.quality=Math.min(1,this.quality+.001);
    this.update(dt*speed,delta);
   }else if(this.statPlayer!==p&&this.syncStats(this.statsFor(p)))this.publish();
   const assets=sceneImageRevision();
   if(!panel&&(this.running||this.renderDirty||this.drawnPlayer!==p||this.drawnAssets!==assets||this.rasterDpr!==(window.devicePixelRatio||1))){
    this.draw();
    this.drawnPlayer=p;this.drawnAssets=assets;this.renderDirty=false;
   }
   // Keep audio fades and the music scheduler alive, including on the pause screen.
   if(this.running||time-this.lastAudio>100){this.audioFrame();this.lastAudio=time}
   if(this.running&&time-this.lastPublish>120){this.publish();this.lastPublish=time}
   if(this.running&&time-this.lastSave>1000){this.checkpoint();this.lastSave=time}
  }
  this.raf=requestAnimationFrame(this.frame);
 }
}
export let battle:Battle|null=null;
export function mountBattle(canvas:HTMLCanvasElement){battle=new Battle(canvas);return()=>{battle?.destroy();battle=null}}
