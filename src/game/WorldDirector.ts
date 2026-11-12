/**
 * WorldDirector — stages road events and the mood of the world on top of Codex's Journey/Battle.
 * It does not replace the loop: Battle calls a handful of hooks (travel, tick, onArrive, onVictory, draw layers).
 * Events live in world coordinates on the current leg; rewards are settled once through WorldEvents.settle.
 * Auto never chooses for the player, and an unanswered event simply times out and the party walks on.
 */
import type {Battle} from './Battle';
import type {WorldEventSnapshot} from '../core/types';
import {useGame,rollItem,addLoot} from '../core/store';
import {legOf,type EventKind} from '../core/world';
import {planLeg,settle,afterVictory,bump,activeBoon,activeGift,weatherOf,stageDeck,bossOf,type LegPlan,type Outcome} from './WorldEvents';
import {variants,boonById,boonValues,eventNames,weathers,type WeatherId} from '../data/world-variants';
import {stepJourney,projectX} from './Journey';
import {chapterOne} from './Chapter';
import {WorldLife,type LifeEnv} from './WorldLife';
import {useWorld,type WorldCard} from './worldUi';
import {audio} from './AudioDirector';
import {haptic} from '../core/telegram';
type State='none'|'approach'|'decide'|'act'|'after';
const decideSeconds:Record<EventKind,number>={cache:9,caravan:9,altar:12,ambush:7,omen:0};
const actSeconds:Record<EventKind,number>={cache:2.6,caravan:3.2,altar:1.5,ambush:1,omen:0};
const INK='#1b2b44';
const raiders:Record<string,string[]>={sled:['03_pirate_bandit','04_club_raider'],courier:['02_roman_spearman','01_sword_shield_veteran'],boar:['08_armored_boar']};
interface Bolt {x0:number;y0:number;x1:number;y1:number;life:number}
export class WorldDirector {
 ev:LegPlan|null=null;open=false;state:State='none';t=0;choice='';ambush:''|'ready'|'sprung'='';x=0;
 danger=0;relief=0;bossFree=0;gloom=0;weather:WeatherId='clear';life=new WorldLife();
 private fired=new Set<string>();private bolts:Bolt[]=[];private lines:string[]=[];private cardKey='';private cardAt=0;private signaled=false;private saluted=-1;
 constructor(private b:Battle){this.life.onFlutter=()=>this.sfx('flutter');}
 private sfx(kind:Parameters<typeof audio.play>[0]){if(useGame.getState().p.sound)audio.play(kind)}
 private campaign(){return this.b.mode==='campaign'}
 stopX(){return this.x-170}
 /** Plan the event of the current leg. Called after every spawn and restore. */
 begin(resume=false){
  const b=this.b,p=useGame.getState().p;this.fired.clear();this.bolts=[];this.lines=[];this.signaled=false;this.t=0;this.choice='';
  this.weather=weatherOf(p.world,b.stage);
  this.gloom=this.campaign()?[0,.04,.09,.15,.3][b.wave-1]??0:b.mode==='darkness'?.3:b.mode==='dungeon'?.2:0;
  this.ev=this.campaign()?planLeg(p.world,b.stage,b.wave):null;this.open=!!this.ev;this.x=b.journey.targetX-(this.ev?.kind==='omen'&&b.journey.worldX<b.journey.targetX-1000?640:300);
  this.state=this.ev&&b.phase==='walk'&&(resume||b.journey.worldX<(this.ev.kind==='omen'?this.x-60:this.stopX()-30))?'approach':'none';
  if(this.state==='none'){this.ev=null;this.open=false}
  this.publish(true);
 }
 onSpawn(){this.ambush='';this.begin()}
 onRestore(s?:WorldEventSnapshot){
  const b=this.b,same=!!s&&s.leg===legOf(b.stage,b.wave)&&this.campaign();this.ambush='';this.begin(same&&(s!.state==='approach'||s!.state==='decide'));
  if(!s||!same)return;
  this.ambush=s.ambush??'';
  if(this.ev&&this.open&&(s.state==='approach'||s.state==='decide')){this.state=s.state;this.t=s.t;return}
  // The leg is already settled: rebuild the scene in its "after" look. Nothing can be rewarded twice.
  if(s.state==='act'||s.state==='after'||s.state==='decide'){const kind=(s.kind as EventKind|undefined)??(b.wave===5?'omen':stageDeck(useGame.getState().p.world?.seed??0x5eed,b.stage)[b.wave]),variant=kind&&(variants[kind].find(v=>v.id===s.variant)??(kind==='omen'?variants.omen.find(v=>v.id===bossOf(b.stage)):variants[kind][0]));if(kind&&variant){this.ev={leg:s.leg,stage:b.stage,wave:b.wave,kind,variant,options:[]};this.open=false;this.state='after';this.t=s.state==='after'?s.t:0;if(kind==='omen')this.x=b.journey.targetX-640;this.choice=s.choice??'pass'}}
 }
 snapshot():WorldEventSnapshot|undefined{
  const live=!!this.ev&&this.state!=='none'&&(this.b.phase==='walk'||this.state==='act'||this.state==='after');
  if(!this.campaign()||!live&&!this.ambush)return undefined;
  return {leg:legOf(this.b.stage,this.b.wave),state:live?this.state:'none',t:this.t,...(this.choice?{choice:this.choice}:{}),...(this.ambush?{ambush:this.ambush}:{}),...(live?{kind:this.ev!.kind,variant:this.ev!.variant.id}:{})};
 }
 /** Replaces the plain stepJourney call: the party brakes smoothly at an event and holds there while it plays. */
 travel(dt:number){
  const j=this.b.journey;
  if(this.ev&&this.ev.kind!=='omen'&&(this.state==='approach'||this.state==='decide'||this.state==='act')){
   const real=j.targetX;j.targetX=Math.max(j.worldX,this.stopX());stepJourney(j,dt);const reached=j.worldX>=j.targetX-.01;j.targetX=real;
   if(reached&&this.state==='approach'){this.state='decide';this.t=0;this.sfx(this.ev.kind==='ambush'?'growl':this.ev.kind==='altar'?'rune':this.ev.kind==='caravan'?'alarm':'bark');haptic();this.publish(true);this.b.checkpoint()}
   return false;
  }
  return stepJourney(j,dt);
 }
 /** Player's answer from the card. Valid while paused too: the reward is settled immediately, the scene plays on resume. */
 choose(id:string){
  const ev=this.ev;if(!ev||!this.open||this.state!=='decide')return;if(id!=='pass'&&!ev.options.includes(id))return;
  this.open=false;this.choice=id;this.state=id==='pass'?'after':'act';this.t=0;this.fired.clear();
  if(ev.kind==='ambush')this.ambush=id==='act'?'ready':'sprung';
  let out:Outcome|null=null;useGame.getState().mutate(p=>{out=settle(p,ev,id,p=>{const item=rollItem(p);addLoot(p,item);return item})});
  this.lines=(out as Outcome|null)?.lines??[];this.announce(out);
  if(id!=='pass'){haptic(true);this.sfx(ev.kind==='altar'?'rune':'whoosh')}
  this.publish(true);this.b.checkpoint();
 }
 private announce(out:Outcome|null){for(const f of out?.feats??[]){useGame.getState().notice(`Достижение: ${f.title} · ${f.gold?`+${f.gold} золота`:''}${f.gems?`${f.gold?' · ':''}+${f.gems} самоцветов`:''}`);this.sfx('feat')}}
 private once(key:string,at:number){if(this.t<at||this.fired.has(key))return false;this.fired.add(key);return true}
 private sx(dx=0){return projectX(this.x+dx,this.b.journey.cameraX)}
 /** Per-frame simulation. Only called while the fight is running, so OFF freezes the whole world. */
 tick(dt:number,realDt:number){
  const b=this.b,j=b.journey,remaining=j.targetX-j.worldX,reduced=b.reducedMotion();
  const target=b.phase==='fight'?(b.boss?1:.7):b.phase==='walk'?Math.max(0,Math.min(1,(520-remaining)/400))*.7+(this.state==='decide'&&(this.ev?.kind==='ambush'||this.ev?.kind==='caravan')?.35:0):0;
  this.danger+=(target-this.danger)*Math.min(1,dt*2.5);
  if(b.phase==='walk'){this.relief=Math.max(0,this.relief-dt*.12);this.bossFree=Math.max(0,this.bossFree-dt*.05)}
  this.life.step(dt,this.env(reduced));
  for(const bolt of this.bolts)bolt.life-=dt;this.bolts=this.bolts.filter(v=>v.life>0);
  if(b.phase==='walk'&&this.life.flock>.25&&this.life.flock<.4&&this.saluted!==Math.floor(b.clock/47)){this.saluted=Math.floor(b.clock/47);b.brain.emote('goose','♪',1.6);this.sfx('honk')}
  if(b.phase!=='walk'&&(this.state==='approach'||this.state==='decide')){this.state='none';this.ev=null;this.open=false}
  const ev=this.ev;if(!ev){this.publish();return}
  if(this.state==='approach'){
   const near=this.stopX()-j.worldX<260||ev.kind==='omen'&&this.x-j.worldX<520;
   if(near&&!this.signaled){this.signaled=true;
    if(ev.kind==='ambush'){this.life.scatter(j.cameraX);b.brain.emote('dog','!',1.6);b.brain.play('dog','growl',1.2)}
    else if(ev.kind==='cache'){b.brain.emote(ev.variant.id==='nest'?'goose':'dog','?',1.6)}
    else if(ev.kind==='caravan'){b.brain.emote('spot','!',1.8,this.sx(-70),640)}
    else if(ev.kind==='altar'){b.brain.emote('spot','?',1.8,this.sx(0),600)}
   }
   if(ev.kind==='omen'&&this.x-j.worldX<430){
    this.state='after';this.t=0;this.open=false;this.choice='see';let out:Outcome|null=null;useGame.getState().mutate(p=>{out=settle(p,ev,'see')});this.announce(out);
    this.life.scatter(j.cameraX);b.brain.emote('goose','!',1.6);b.brain.play('goose','cower',1.4);b.brain.play('dog','growl',1.2);this.sfx('alarm');this.publish(true);
   }
  }else if(this.state==='decide'){
   this.t+=realDt;if(this.t>=decideSeconds[ev.kind])this.choose('pass');
  }else if(this.state==='act'){
   this.t+=dt;this.act(ev);
   if(this.t>=actSeconds[ev.kind]){this.state='after';this.t=0;this.reward(ev)}
  }else if(this.state==='after')this.t+=dt;
  this.publish();
 }
 private reward(ev:LegPlan){
  const b=this.b;for(const [n,line] of this.lines.entries())b.effect(b.heroX+40+n*26,560-n*34,line,n===0?'#ffe08a':'#bff3ff',n===0?27:23);
  this.sfx(ev.kind==='cache'||ev.kind==='caravan'?(this.lines.length>1?'loot':'coin'):'feat');this.relief=Math.max(this.relief,.6);this.lines=[];
 }
 private strike(target:{x:number;y:number},comic?:string){
  const b=this.b;b.heroAttack=.65;this.bolts.push({x0:b.heroX+70,y0:b.journey.worldY-120,x1:target.x,y1:target.y,life:.22});
  b.burst(target.x,target.y,'#b9f7ff',10);this.sfx('hit');if(comic&&b.comics.emit(target.x,target.y,b.comicObstacles(),comic))this.sfx('critical');
 }
 /** Scripted beats of the short event scenes. Purely visual: the outcome is already saved. */
 private act(ev:LegPlan){
  const b=this.b,brain=b.brain;
  if(ev.kind==='cache'){
   if(ev.variant.id==='nest'){if(this.once('go',.1)){brain.play('goose','fetch',1.7,this.sx(0),560);this.sfx('honk')}if(this.once('grab',.95)){b.burst(this.sx(0),590,'#ffe9a3',10);this.sfx('flutter')}}
   else if(ev.variant.id==='barrel'){for(const [n,at] of [.25,1.05,1.8].entries())if(this.once('hit'+n,at)){this.strike({x:this.sx(0),y:735});this.life.puff(this.sx(0),730,'#d9f3ff',9,170,160)}}
   else{if(this.once('go',.05)){brain.play('dog','dig',2.4,this.sx(-58));this.sfx('bark')}for(const [n,at] of [.6,1.05,1.5].entries())if(this.once('dig'+n,at)){this.life.puff(this.sx(-30),752,'#f4fbff',10,150,170);this.sfx('dig')}}
   if(this.once('open',2.05)){b.burst(this.sx(0),728,'#ffe08a',16);this.sfx('coin');brain.emote(ev.variant.id==='nest'?'goose':'dog','♥',1.3)}
  }else if(ev.kind==='caravan'){
   const foes=raiders[ev.variant.id]??raiders.sled,a={x:this.sx(96),y:700},second={x:this.sx(foes.length>1?170:96),y:680};
   if(this.once('s1',.3))this.strike(a,'БАМ!');
   if(this.once('g',.75)){brain.play('goose','fetch',.9,second.x-40,second.y-20);this.sfx('honk')}
   if(this.once('g2',1.2)){b.burst(second.x,second.y,'#fff4d2',9)}
   if(this.once('s2',1.5))this.strike(a);
   if(this.once('d',1.95)){brain.play('dog','growl',.9);this.sfx('bark');brain.emote('dog','!',.9)}
   if(this.once('thanks',2.7)){brain.emote('spot','♥',1.6,this.sx(-70),640);this.sfx('potion')}
  }else if(ev.kind==='altar'){
   const boon=boonById(this.choice);if(this.once('beam',.35)&&boon){b.burst(b.heroX,b.journey.worldY-110,boon.color,22);this.life.puff(this.sx(0),690,boon.color,12,120,220)}
  }else if(ev.kind==='ambush'){
   if(this.once('ready',.15)){b.burst(b.heroX+30,b.journey.worldY-100,'#8ee6ff',14);this.sfx('block');b.effect(b.heroX+30,560,'ГОТОВ!','#bff3ff',26)}
  }
 }
 /** The fight is about to start: apply what the road gave or cost. Everything here is announced on screen. */
 onArrive(){
  const b=this.b,p=useGame.getState().p;this.life.scatter(b.journey.cameraX);if(b.boss)this.sfx('boss');
  if(!this.campaign())return;
  if(this.ambush==='ready'){b.shield=Math.max(b.shield,b.maxHp*.12);for(const u of b.units){u.guard=0;u.exposed=chapterOne.counter_exposure_seconds}b.effect(520,500,'ЗАСАДА РАСКРЫТА!','#bff3ff',29)}
  else if(this.ambush==='sprung'){
   if(this.ev?.variant.id==='slide'){b.slow=Math.max(b.slow,3);b.shake=8;this.life.shake(b.heroX,3,b.journey.cameraX);b.effect(450,500,'СНЕЖНЫЙ ОБВАЛ!','#e6f6ff',29)}
   else{for(const u of b.units)u.cd=Math.min(u.cd,.12);b.effect(520,500,'ЗАСАДА!','#ffb09c',31)}
   this.sfx('alarm');
  }
  if(activeBoon(p,b.stage,b.wave,b.mode)==='ice'){b.shield=Math.max(b.shield,b.maxHp*boonValues.iceShield);b.effect(b.heroX,540,'Руна Льда','#8ee6ff',24)}
  if(activeGift(p,b.stage,b.wave,b.mode)&&b.hp<b.maxHp){const heal=Math.round(b.maxHp*.3);b.hp=Math.min(b.maxHp,b.hp+heal);b.effect(b.heroX-10,600,`Зелье торговки +${heal}`,'#8cffa1',23);this.sfx('potion')}
 }
 onVictory(){
  const b=this.b;this.relief=1;if(b.boss){this.bossFree=1;b.brain.play('goose','loop',1.3);b.brain.emote('goose','♪',1.8);b.brain.play('dog','cheer',1.4);b.brain.emote('dog','♥',1.8)}else if(Math.random()<.5)b.brain.play('dog','cheer',.9);else b.brain.play('goose','loop',1.1);
  if(!this.campaign()){this.ambush='';return}
  let out:Outcome|null=null;const ambushed=this.ambush==='sprung';this.ambush='';
  useGame.getState().mutate(p=>{out=afterVictory(p,b.stage,b.wave,ambushed)});
  for(const [n,line] of ((out as Outcome|null)?.lines??[]).entries())b.effect(430,455+n*30,line,'#ffe08a',24);this.announce(out);this.publish(true);
 }
 /** Count a team/tactic achievement. Rare by design (cooldown-gated callers). */
 count(key:'dive'|'guard'|'rescue'|'interrupt'){const out:Outcome={lines:[],feats:[]};useGame.getState().mutate(p=>{out.feats=bump(p,key)});this.announce(out)}
 impact(x:number,crit:boolean){if(crit||Math.random()<.2)this.life.shake(x,crit?1.6:.4,this.b.journey.cameraX)}
 // Boon multipliers read by Battle. 1 means "no change".
 private boon(){const b=this.b;return activeBoon(useGame.getState().p,b.stage,b.wave,b.mode)}
 damageRate(){return this.boon()==='fury'?boonValues.fury:1}
 cooldownRate(){return this.boon()==='wind'?boonValues.windRate:1}
 companionRate(){return this.boon()==='pack'?boonValues.packRate:1}
 lifesteal(){return this.boon()==='blood'?boonValues.blood:0}
 hidesResident(){return !!this.ev&&this.state!=='none'}
 env(reduced=this.b.reducedMotion()):LifeEnv{const b=this.b;return {cameraX:b.journey.cameraX,heroX:b.journey.worldX,time:b.clock,quality:b.quality,reduced,danger:this.danger,relief:this.relief,gloom:this.gloom,weather:this.weather,fighting:b.phase==='fight',bossFree:this.bossFree}}
 private publish(force=false){
  const b=this.b,j=b.journey,ev=this.ev,p=useGame.getState().p;if(!force&&b.clock-this.cardAt<.2&&b.clock>=this.cardAt)return;this.cardAt=b.clock;
  let card:WorldCard|null=null;
  if(ev&&this.state==='decide')card={key:ev.leg+':'+ev.kind,kind:ev.kind,tag:eventNames[ev.kind].toUpperCase(),title:ev.variant.title,text:ev.variant.text,pass:ev.kind==='ambush'?'Идти как есть':'Пройти мимо',left:Math.max(0,decideSeconds[ev.kind]-this.t),total:decideSeconds[ev.kind],options:ev.kind==='altar'?ev.options.map(id=>{const boon=boonById(id)!;return {id,label:boon.name,detail:boon.short,color:boon.color}}):[{id:'act',label:ev.variant.act,detail:ev.variant.actDetail}]};
  else if(ev&&ev.kind==='omen'&&this.state==='after'&&this.t<3.6&&b.phase==='walk'&&j.targetX-j.worldX>330)card={key:ev.leg+':omen',kind:'omen',tag:'ПРЕДВЕСТНИК',title:ev.variant.title,text:ev.variant.text,pass:'',left:0,total:0,options:[]};
  const boon=boonById(p.world?.boon?.id),key=(card?card.key+Math.ceil(card.left*2):'')+'|'+(boon?.id??'')+'|'+!!p.world?.gift+'|'+this.weather;
  if(key===this.cardKey)return;this.cardKey=key;
  useWorld.setState({card,boon:boon?{name:boon.name,short:boon.short,color:boon.color}:null,gift:!!p.world?.gift,weather:this.weather==='clear'?'':weathers.find(w=>w.id===this.weather)?.name??''});
 }
 // ───────────── drawing ─────────────
 back(c:CanvasRenderingContext2D){this.life.back(c,this.env());this.prop(c)}
 front(c:CanvasRenderingContext2D){
  this.life.front(c,this.env());
  for(const v of this.bolts){c.save();c.globalAlpha=Math.min(1,v.life*6);c.lineCap='round';for(const [w,color] of [[11,'#16479499'],[6,'#8eefff'],[2,'#ffffff']] as const){c.strokeStyle=color;c.lineWidth=w;c.beginPath();c.moveTo(v.x0,v.y0);for(let n=1;n<=6;n++){const f=n/6,jag=n===6?0:Math.sin(n*2.7+v.life*90)*9;c.lineTo(v.x0+(v.x1-v.x0)*f,v.y0+(v.y1-v.y0)*f+jag)}c.stroke()}c.restore()}
  const boon=boonById(this.boon());if(boon&&this.b.phase!=='victory'){const b=this.b,pulse=.5+.25*Math.sin(b.clock*4);c.save();c.strokeStyle=boon.color;c.globalAlpha=pulse;c.lineWidth=3;c.setLineDash([10,9]);c.lineDashOffset=-b.clock*30;c.beginPath();c.ellipse(b.heroX,b.journey.worldY-2,52,10,0,0,Math.PI*2);c.stroke();c.restore()}
 }
 /** Event characters join Battle's depth-sorted actor list. */
 actors():Array<{y:number;paint:()=>void}>{
  const ev=this.ev,b=this.b;if(!ev||ev.kind!=='caravan'||this.state==='none')return [];
  const list:Array<{y:number;paint:()=>void}>=[],x=this.sx(),saved=this.choice==='act',t=this.t,clock=b.clock;if(x<-320||x>1180)return list;
  const cheer=saved&&(this.state==='after'||this.state==='act'&&t>2.6),scared=!saved&&this.state!=='after';
  list.push({y:742,paint:()=>b.character('cappuccina_approved',x-70+(scared?Math.sin(clock*38)*1.5:0),742,98,cheer&&Math.floor(clock*4)%2?.5:0,scared&&Math.sin(clock*3)>.2?.2:0,false,0,0,cheer,false,false,clock)});
  for(const [n,id] of (raiders[ev.variant.id]??raiders.sled).entries()){
   const boar=id.includes('boar'),homeX=x+96+n*74,y=boar?748:n?730:752,height=boar?132:n?104:112;let fx=homeX,hurt=0,attack=0,alpha=1,flee=false;
   if(this.state==='approach'||this.state==='decide')attack=Math.sin(clock*3.4+n*2)>.55?.5:0;
   else if(this.state==='act'){const hits=n===0?[.3,1.5]:[1.2],run=n===0?1.75:2.15;hurt=hits.some(h=>t>=h&&t<h+.3)?.25:0;if(t>=run){flee=true;fx+=(t-run)*290;alpha=Math.max(0,1-(t-run)/.9)}}
   else{if(saved)continue;flee=true;fx+=t*250;alpha=Math.max(0,1-t/1.4)}
   if(alpha<=0)continue;
   list.push({y,paint:()=>{const c=b.ctx;c.save();c.globalAlpha*=alpha;b.character(id,fx,y,height,attack,hurt,flee,0,0,false,true,flee,clock);c.restore()}});
  }
  return list;
 }
 private prop(c:CanvasRenderingContext2D){
  const ev=this.ev;if(!ev||this.state==='none')return;const x=this.sx(),b=this.b,t=b.clock,done=this.state==='after'&&this.choice!=='pass',acting=this.state==='act';if(x<-260||x>1120)return;
  c.save();c.lineJoin='round';c.lineCap='round';c.strokeStyle=INK;c.lineWidth=3;
  const snow=(cx:number,cy:number,w:number,h:number)=>{c.fillStyle='#3d6f9455';c.beginPath();c.ellipse(cx,cy+3,w*1.08,7,0,0,Math.PI*2);c.fill();c.fillStyle='#f4fbff';c.beginPath();c.moveTo(cx-w,cy);c.quadraticCurveTo(cx-w*.5,cy-h*1.5,cx,cy-h);c.quadraticCurveTo(cx+w*.6,cy-h*1.3,cx+w,cy);c.closePath();c.fill();c.strokeStyle='#5f8fb0';c.stroke();c.strokeStyle=INK};
  const glint=(gx:number,gy:number,s=1)=>{const a=.5+.5*Math.sin(t*5);c.save();c.translate(gx,gy);c.rotate(t);c.fillStyle='#fff7c2';c.globalAlpha=a;c.beginPath();for(let n=0;n<8;n++){const r=n%2?3*s:11*s,q=n*Math.PI/4;c.lineTo(Math.cos(q)*r,Math.sin(q)*r)}c.fill();c.restore()};
  const chest=(cx:number,cy:number,open:boolean)=>{c.fillStyle='#8a5a33';c.beginPath();c.roundRect(cx-26,cy-30,52,30,4);c.fill();c.stroke();c.fillStyle='#e9c36a';c.fillRect(cx-4,cy-22,8,12);c.strokeRect(cx-4,cy-22,8,12);c.save();c.translate(cx-26,cy-30);c.rotate(open?-1.05:0);c.fillStyle='#a8703f';c.beginPath();c.roundRect(0,-16,52,17,[9,9,0,0]);c.fill();c.stroke();c.restore();if(open){c.fillStyle='#ffd24a';for(let n=0;n<5;n++){c.beginPath();c.arc(cx-16+n*8,cy-31-(n%2)*4,5,0,Math.PI*2);c.fill();c.stroke()}}};
  if(ev.kind==='cache'){
   const rise=done?1:acting?Math.max(0,Math.min(1,(this.t-1.3)/.7)):0,y=760;
   if(ev.variant.id==='nest'){c.fillStyle='#7b5b3f';c.beginPath();c.roundRect(x-5,y-150,10,150,3);c.fill();c.stroke();c.fillStyle='#5b4230';c.beginPath();c.ellipse(x,y-152,27,11,0,0,Math.PI*2);c.fill();c.stroke();c.strokeStyle='#8a6a45';for(let n=0;n<7;n++){c.beginPath();c.moveTo(x-24+n*8,y-150);c.lineTo(x-28+n*9,y-160-(n%3)*3);c.stroke()}c.strokeStyle=INK;if(!done&&!(acting&&this.t>.95))glint(x+4,y-166)}
   else if(ev.variant.id==='barrel'){const broken=done||acting&&this.t>1.8;c.fillStyle='#8a5a33';c.beginPath();c.roundRect(x-22,y-56,44,56,8);c.fill();c.stroke();c.strokeStyle='#4b3524';c.beginPath();c.moveTo(x-22,y-40);c.lineTo(x+22,y-40);c.moveTo(x-22,y-16);c.lineTo(x+22,y-16);c.stroke();c.strokeStyle=INK;if(!broken){c.fillStyle='#bfeaffb0';c.beginPath();c.moveTo(x-36,y);c.lineTo(x-30,y-58);c.lineTo(x-6,y-74);c.lineTo(x+28,y-62);c.lineTo(x+38,y);c.closePath();c.fill();c.stroke();glint(x+8,y-50,.8)}else{c.fillStyle='#ffd24a';for(let n=0;n<4;n++){c.beginPath();c.arc(x-12+n*8,y-60-(n%2)*4,5,0,Math.PI*2);c.fill();c.stroke()}}snow(x,y+4,46,10)}
   else{const peek=Math.max(.42,rise);if(ev.variant.id!=='shield'||rise>0)chest(x,y-peek*26+8,rise>=1);if(ev.variant.id==='shield'&&rise<1){c.fillStyle='#b8352f';c.beginPath();c.ellipse(x+10,y-22,20,26,.4,Math.PI,0);c.fill();c.stroke();c.fillStyle='#e9c36a';c.beginPath();c.arc(x+10,y-30,5,0,Math.PI*2);c.fill()}snow(x,y+6,58-rise*14,24-rise*13);if(rise<=0)glint(x+6,y-34)}
  }else if(ev.kind==='caravan'){
   const y=752,looted=this.state==='after'&&this.choice==='pass';
   c.strokeStyle='#5c3f28';c.lineWidth=6;c.beginPath();c.moveTo(x-64,y);c.lineTo(x+52,y);c.quadraticCurveTo(x+72,y-2,x+70,y-20);c.stroke();c.strokeStyle=INK;c.lineWidth=3;
   c.fillStyle='#9a6a40';c.beginPath();c.roundRect(x-56,y-40,104,34,5);c.fill();c.stroke();c.strokeStyle='#5c3f28';for(let n=1;n<4;n++){c.beginPath();c.moveTo(x-56+n*26,y-40);c.lineTo(x-56+n*26,y-6);c.stroke()}c.strokeStyle=INK;
   if(!looted){c.fillStyle='#c98f52';c.beginPath();c.roundRect(x-46,y-70,36,30,3);c.fill();c.stroke();c.fillStyle='#b77a45';c.beginPath();c.roundRect(x-6,y-64,30,24,3);c.fill();c.stroke();c.fillStyle='#d9534a';c.beginPath();c.roundRect(x-40,y-92,26,22,3);c.fill();c.stroke()}else{c.save();c.translate(x+40,y-8);c.rotate(.5);c.fillStyle='#c98f52';c.beginPath();c.roundRect(-15,-12,30,24,3);c.fill();c.stroke();c.restore()}
   c.fillStyle='#7b5b3f';c.beginPath();c.roundRect(x+34,y-104,6,66,2);c.fill();c.stroke();const sway=Math.sin(t*2.4)*(.15+this.life.wind*.4);c.save();c.translate(x+37,y-104);c.rotate(sway);c.globalAlpha=.75;c.drawImage(lampGlow(),-30,-12,60,60);c.globalAlpha=1;c.fillStyle='#ffc569';c.beginPath();c.roundRect(-7,4,14,19,5);c.fill();c.stroke();c.restore();
   if(ev.variant.id==='courier'){c.fillStyle='#2f6fc4';c.beginPath();c.moveTo(x-58,y-100);c.lineTo(x-20,y-92+Math.sin(t*5)*4);c.lineTo(x-58,y-78);c.closePath();c.fill();c.stroke();c.fillStyle='#7b5b3f';c.fillRect(x-61,y-104,5,66);c.strokeRect(x-61,y-104,5,66)}
   snow(x-4,y+8,84,9);
  }else if(ev.kind==='altar'){
   const y=748,boon=boonById(this.choice),color=boon?.color??'#7ff0ff',pulse=.5+.4*Math.sin(t*3),live=this.state==='approach'||this.state==='decide';
   c.globalAlpha=(done?.35:.75)*pulse;c.drawImage(tint(color),x-95,y-170,190,190);c.globalAlpha=1;
   if(ev.variant.id==='tree'){c.fillStyle='#5b4636';c.beginPath();c.moveTo(x-20,y);c.quadraticCurveTo(x-12,y-70,x-30,y-128);c.lineTo(x-12,y-104);c.lineTo(x-4,y-150);c.lineTo(x+8,y-108);c.lineTo(x+34,y-134);c.quadraticCurveTo(x+12,y-70,x+22,y);c.closePath();c.fill();c.stroke()}
   else{c.fillStyle='#8496ab';c.beginPath();c.moveTo(x-34,y);c.lineTo(x-26,y-108);c.quadraticCurveTo(x-4,y-146,x+22,y-112);c.lineTo(x+36,y);c.closePath();c.fill();c.stroke();c.fillStyle='#f4fbff';c.beginPath();c.moveTo(x-26,y-108);c.quadraticCurveTo(x-4,y-148,x+22,y-112);c.quadraticCurveTo(x,y-122,x-26,y-108);c.fill()}
   c.save();c.strokeStyle=color;c.lineWidth=4;c.globalAlpha=.5+pulse*.5;c.beginPath();c.moveTo(x-10,y-92);c.lineTo(x-10,y-58);c.lineTo(x+9,y-75);c.lineTo(x-10,y-84);c.moveTo(x-12,y-44);c.lineTo(x+12,y-44);c.moveTo(x,y-52);c.lineTo(x,y-22);c.stroke();c.restore();
   for(const n of [-1,1]){c.fillStyle='#9aa9ba';c.beginPath();c.ellipse(x+n*58,y+2,17,11,0,Math.PI,0);c.fill();c.stroke()}
   if(live)for(const [n,id] of ev.options.entries()){const o=boonById(id);if(!o)continue;const a=t*1.2+n*Math.PI,ox=x+Math.cos(a)*62,oy=y-128+Math.sin(a*1.4)*14;c.globalAlpha=.9;c.drawImage(tint(o.color),ox-26,oy-26,52,52);c.globalAlpha=1;c.fillStyle=o.color;c.beginPath();c.arc(ox,oy,9,0,Math.PI*2);c.fill();c.stroke()}
   if(acting&&boon){const f=Math.min(1,this.t/.4),ox=x+(b.heroX-x)*f,oy=y-128+(b.journey.worldY-110-(y-128))*f;c.drawImage(tint(boon.color),ox-34,oy-34,68,68);c.fillStyle=boon.color;c.beginPath();c.arc(ox,oy,10,0,Math.PI*2);c.fill();c.stroke()}
  }else if(ev.kind==='ambush'){
   const y=742,hidden=this.state==='approach'||this.state==='decide';
   if(ev.variant.id==='slide'){const tremble=hidden?Math.sin(t*30)*1.5:0;c.fillStyle='#7f8ea3';c.beginPath();c.moveTo(x-40,y-150);c.lineTo(x+120,y-176);c.lineTo(x+150,y-120);c.lineTo(x-10,y-110);c.closePath();c.fill();c.stroke();if(hidden||this.ambush==='ready')snow(x+52+tremble,y-146,92,30)}
   for(const [n,dx] of [-6,96].entries()){snow(x+dx,y+4,56,34);c.fillStyle='#3f6b4f';c.beginPath();c.moveTo(x+dx-34,y-8);c.quadraticCurveTo(x+dx-20,y-46,x+dx,y-30);c.quadraticCurveTo(x+dx+22,y-50,x+dx+34,y-8);c.closePath();c.fill();c.stroke();
    if(hidden){const blink=Math.sin(t*1.7+n*2)>.93?0:1;c.fillStyle='#ffe37a';for(const ex of [-9,9]){c.beginPath();c.ellipse(x+dx+ex,y-20,5,5*blink+.6,0,0,Math.PI*2);c.fill()}c.fillStyle=INK;for(const ex of [-9,9])c.fillRect(x+dx+ex-1.5+Math.sin(t*.9)*2,y-22,3,4*blink)}}
  }else{
   const y=742,id=ev.variant.id;
   if(id==='spider_queen'){for(const px of [x-70,x+70]){c.fillStyle='#6f5038';c.beginPath();c.roundRect(px-5,y-150,10,150,3);c.fill();c.stroke()}c.save();c.strokeStyle='#f6f9ff';c.lineWidth=2.6;c.shadowColor='#3b2a5c';c.shadowBlur=3;c.globalAlpha=.95;for(let n=0;n<7;n++){c.beginPath();c.moveTo(x-66,y-140+n*4);c.quadraticCurveTo(x,y-96+n*12+Math.sin(t*1.5+n)*3,x+66,y-140+n*4);c.stroke()}for(let n=-3;n<=3;n++){c.beginPath();c.moveTo(x+n*20,y-134);c.lineTo(x+n*16,y-70);c.stroke()}c.restore();const sw=Math.sin(t*1.8)*.12;c.save();c.translate(x+18,y-108);c.rotate(sw);c.strokeStyle='#eef4ff';c.beginPath();c.moveTo(0,0);c.lineTo(0,34);c.stroke();c.strokeStyle=INK;c.fillStyle='#e8eef7';c.beginPath();c.ellipse(0,54,13,22,0,0,Math.PI*2);c.fill();c.stroke();c.restore();const drop=(Math.sin(t*.9)+1)/2;c.strokeStyle='#eef4ff';c.lineWidth=1.5;c.beginPath();c.moveTo(x-34,y-118);c.lineTo(x-34,y-110+drop*40);c.stroke();c.fillStyle='#2a2233';c.beginPath();c.arc(x-34,y-106+drop*40,5,0,Math.PI*2);c.fill()}
   else if(id==='fungal_king'){for(const [dx,h,col] of [[-50,44,'#b06cd9'],[-8,70,'#7fd98a'],[36,52,'#d96ca8'],[70,34,'#7fd98a']] as const){c.globalAlpha=.6+.3*Math.sin(t*2+dx);c.drawImage(tint(col),x+dx-46,y-h-46,92,92);c.globalAlpha=1;c.fillStyle='#efe6d2';c.beginPath();c.roundRect(x+dx-6,y-h,12,h,4);c.fill();c.stroke();c.fillStyle=col;c.beginPath();c.ellipse(x+dx,y-h,24,15,0,Math.PI,0);c.fill();c.stroke()}c.fillStyle='#d9ffd0';for(let n=0;n<8;n++){const age=(t*.25+n*.125)%1;c.globalAlpha=1-age;c.fillRect(x-60+n*18+Math.sin(t+n)*8,y-70-age*90,3,3)}c.globalAlpha=1}
   else if(id==='minotaur_echo'){c.strokeStyle='#2b4763';c.lineWidth=3;c.beginPath();c.moveTo(x-90,y+26);c.lineTo(x-40,y+12);c.lineTo(x-10,y+30);c.lineTo(x+34,y+10);c.lineTo(x+90,y+24);c.moveTo(x-40,y+12);c.lineTo(x-52,y-6);c.moveTo(x+34,y+10);c.lineTo(x+50,y-8);c.stroke();c.fillStyle='#2b476388';for(const dx of [-60,0,60]){for(const s of [-1,1]){c.beginPath();c.ellipse(x+dx+s*9,y+44+(dx?0:8),8,13,s*.25,0,Math.PI*2);c.fill()}}c.strokeStyle=INK;c.save();c.translate(x+10,y-6);c.rotate(-.5);c.fillStyle='#b8352f';c.beginPath();c.ellipse(0,0,22,30,0,0,Math.PI*2);c.fill();c.stroke();c.strokeStyle='#1b2b44';c.beginPath();c.moveTo(-14,-18);c.lineTo(6,4);c.lineTo(-4,22);c.stroke();c.restore()}
   else{c.fillStyle='#3a2a2a';c.beginPath();c.ellipse(x,y+10,90,14,0,0,Math.PI*2);c.fill();c.fillStyle='#4b3a36';c.beginPath();c.roundRect(x-5,y-150,10,150,3);c.fill();c.stroke();c.fillStyle='#2c2226';c.beginPath();c.moveTo(x+5,y-146);c.lineTo(x+62,y-136+Math.sin(t*4)*4);c.lineTo(x+40,y-112);c.lineTo(x+56,y-92);c.lineTo(x+5,y-96);c.closePath();c.fill();c.stroke();c.globalAlpha=.5+.3*Math.sin(t*6);c.drawImage(tint('#ff7a22'),x-70,y-60,140,90);c.globalAlpha=1;c.fillStyle='#ff9a4d';for(let n=0;n<9;n++){const age=(t*.4+n*.11)%1;c.globalAlpha=1-age;c.fillRect(x-70+n*17+Math.sin(t*2+n)*6,y-age*120,3,3)}c.globalAlpha=1}
  }
  c.restore();
 }
}
const tints=new Map<string,HTMLCanvasElement>();
function tint(color:string){let g=tints.get(color);if(!g){g=document.createElement('canvas');g.width=g.height=64;const c=g.getContext('2d')!,r=c.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,color+'cc');r.addColorStop(.4,color+'55');r.addColorStop(1,color+'00');c.fillStyle=r;c.fillRect(0,0,64,64);tints.set(color,g)}return g}
const lampGlow=()=>tint('#ffc569');
