/**
 * CompanionBrain — gives the goose and the dog distinct jobs and visible character.
 *  Goose (air, anti-ranged, a bit of a show-off and a coward): dives to break an enemy shot the hero cannot answer.
 *  Dog (ground, loyal bodyguard): leaps in front of a heavy melee blow, and once per fight rushes his heal when the hero is in danger.
 * Codex's base feather shot and periodic heal are untouched; this adds reactions with cooldowns and clear cause→effect.
 * The brain only talks to the fight through the small `TeamHost` surface, so it is unit-testable without a canvas.
 */
import type {Fighter,TeamSnapshot} from '../core/types';
import {roleOf} from './EnemyTactics';
export const team={diveCooldown:14,diveFlight:.42,diveExposed:1.2,diveMinWindup:.45,guardCooldown:16,guardWindow:.9,guardReduction:.5,rescueBelow:.25,heavyBelow:.4} as const;
export interface TeamHost {
 units:Fighter[];boss:boolean;phase:string;intro:number;hp:number;maxHp:number;cooldowns:number[];compCd:number[];stun:number;
 companionRate():number;
 onDive(u:Fighter,broke:boolean):void;onGuardReady():void;onGuardHit():void;onRescue():void;
}
export interface Emote {who:'goose'|'dog'|'hero'|'spot';glyph:string;t:number;max:number;x?:number;y?:number}
type GooseAct={kind:'dive';t:number;target:Fighter}|{kind:'loop'|'cower'|'fetch';t:number;dur:number;tx?:number;ty?:number};
type DogAct={kind:'guard'|'dig'|'cheer'|'growl';t:number;dur:number;tx?:number};
const ease=(f:number)=>f*f*(3-2*f);
export class CompanionBrain {
 dive=5;guard=4;rescued=false;rescues=0;rescueMax=1;diveScale=1;guardScale=1;guardCut:number=team.guardReduction;armed=0;goose:GooseAct|null=null;dog:DogAct|null=null;emotes:Emote[]=[];private cowered=false;
 reset(){this.dive=5;this.guard=4;this.rescued=false;this.rescues=0;this.armed=0;this.goose=null;this.dog=null;this.cowered=false}
 snapshot():TeamSnapshot{return {dive:this.dive,guard:this.guard,rescued:this.rescued}}
 restore(s?:TeamSnapshot){this.reset();if(s){this.dive=s.dive;this.guard=s.guard;this.rescued=s.rescued;this.rescues=s.rescued?this.rescueMax:0}}
 emote(who:Emote['who'],glyph:string,seconds=1.4,x?:number,y?:number){this.emotes=this.emotes.filter(e=>e.who!==who||who==='spot');this.emotes.push({who,glyph,t:seconds,max:seconds,x,y})}
 /** Scripted moments requested by the world (events, victory). */
 play(who:'goose'|'dog',kind:string,dur:number,tx?:number,ty?:number){if(who==='goose')this.goose={kind:kind as 'loop',t:0,dur,tx,ty};else this.dog={kind:kind as 'dig',t:0,dur,tx}}
 step(dt:number,h:TeamHost){
  for(const e of this.emotes)e.t-=dt;this.emotes=this.emotes.filter(e=>e.t>0);
  const rate=h.companionRate();this.dive=Math.max(0,this.dive-dt*rate);this.guard=Math.max(0,this.guard-dt*rate);this.armed=Math.max(0,this.armed-dt);
  if(this.goose){this.goose.t+=dt;const g=this.goose;
   if(g.kind==='dive'){if(g.t>=team.diveFlight&&g.t-dt<team.diveFlight){const u=g.target,broke=u.hp>0&&u.windup>0;if(broke){u.windup=0;u.fury=0;u.ability='';u.cd=Math.max(u.cd,2.2);u.exposed=Math.max(u.exposed??0,team.diveExposed)}h.onDive(u,broke)}if(g.t>=team.diveFlight*2+.25)this.goose=null}
   else if(g.t>=g.dur)this.goose=null}
  if(this.dog){this.dog.t+=dt;if(this.dog.t>=this.dog.dur)this.dog=null}
  if(h.phase!=='fight')return;
  if(h.boss&&h.intro>0&&!this.cowered){this.cowered=true;this.play('goose','cower',1.3);this.emote('goose','!',1.2);this.play('dog','growl',1.1)}
  if(h.intro>0||h.stun>0)return;
  // Goose: only when the hero's own interrupt is on cooldown — the bird covers the gap, it does not play the game for you.
  if(!this.goose&&this.dive<=0&&!h.boss&&h.cooldowns[0]>.3){const u=h.units.find(u=>u.hp>0&&roleOf(u.id)==='ranged'&&u.windup>=team.diveMinWindup);if(u){this.goose={kind:'dive',t:0,target:u};this.dive=team.diveCooldown*this.diveScale;this.emote('goose','!',.7)}}
  // Dog: a heavy melee blow is about to land, or any melee blow while the hero is badly hurt.
  if(!this.dog&&this.guard<=0){const low=h.hp/h.maxHp<team.heavyBelow,u=h.units.find(u=>u.hp>0&&roleOf(u.id)!=='ranged'&&!/spider|fungal|fire_abyss/.test(u.id)&&u.windup>0&&u.windup<.32&&(low||h.boss||/boar|club/.test(u.id)));if(u){this.dog={kind:'guard',t:0,dur:team.guardWindow};this.guard=team.guardCooldown*this.guardScale;this.armed=team.guardWindow;this.emote('dog','!',.8);h.onGuardReady()}}
  if(!this.rescued&&h.hp>0&&h.hp/h.maxHp<team.rescueBelow&&h.compCd[1]>1.2){this.rescues++;this.rescued=this.rescues>=this.rescueMax;h.compCd[1]=.05;this.emote('dog','♥',1.4);h.onRescue()}
 }
 /** Asked by the fight when a melee hit lands on the hero. Consumes the dog's guard. */
 absorb(h:TeamHost){if(this.armed<=0)return 1;this.armed=0;h.onGuardHit();return this.guardCut}
 /** Offsets from the companion's home spot, in screen pixels. */
 goosePose(clock:number,home:{x:number;y:number},target?:{x:number;y:number}){
  const g=this.goose,bob=Math.sin(clock*3.1)*5;if(!g)return {dx:0,dy:bob,attack:0};
  if(g.kind==='dive'&&target){const out=Math.min(1,g.t/team.diveFlight),back=Math.max(0,(g.t-team.diveFlight-.12)/(team.diveFlight+.13)),f=ease(out)*(1-ease(Math.min(1,back)));return {dx:(target.x-60-home.x)*f,dy:(target.y-10-home.y)*f-Math.sin(Math.PI*Math.min(1,out))*46*(back>0?0:1),attack:out>=.8&&back<.2?.5:0}}
  if(g.kind==='loop'){const f=g.t/g.dur,a=f*Math.PI*2;return {dx:Math.sin(a)*46,dy:-(1-Math.cos(a))*38,attack:0}}
  if(g.kind==='cower'){const f=Math.sin(Math.min(1,g.t/g.dur)*Math.PI);return {dx:-26*f+Math.sin(clock*40)*2*f,dy:34*f,attack:0}}
  if(g.kind==='fetch'&&g.tx!==undefined&&g.ty!==undefined){const f=Math.sin(Math.min(1,g.t/g.dur)*Math.PI);return {dx:(g.tx-home.x)*ease(f),dy:(g.ty-home.y)*ease(f),attack:f>.9?.5:0}}
  return {dx:0,dy:bob,attack:0};
 }
 dogPose(clock:number,home:{x:number},heroX:number){
  const d=this.dog;if(!d)return {dx:0,dy:0,attack:0,run:false};const f=Math.min(1,d.t/d.dur);
  if(d.kind==='guard'){const hop=Math.sin(f*Math.PI);return {dx:(heroX+68-home.x)*ease(Math.min(1,hop*1.6)),dy:-Math.sin(Math.min(1,f*2.2)*Math.PI)*42,attack:f>.2&&f<.7?.5:0,run:false}}
  if(d.kind==='dig'&&d.tx!==undefined){const go=Math.min(1,d.t/.45),back=Math.max(0,(d.t-(d.dur-.45))/.45),at=ease(go)*(1-ease(Math.min(1,back)));return {dx:(d.tx-home.x)*at,dy:0,attack:at>.95&&Math.floor(clock*9)%2?.5:0,run:at<.95}}
  if(d.kind==='cheer')return {dx:0,dy:-Math.abs(Math.sin(f*Math.PI*3))*26,attack:0,run:false};
  return {dx:Math.sin(clock*50)*1.5,dy:0,attack:f<.8?.3:0,run:false};
 }
 drawEmotes(c:CanvasRenderingContext2D,at:(who:Emote['who'])=>{x:number;y:number}){
  for(const e of this.emotes){const p=e.who==='spot'?{x:e.x??0,y:e.y??0}:at(e.who),age=e.max-e.t,pop=Math.min(1,age/.12),scale=.6+.4*pop+(age<.25?Math.sin(age/.25*Math.PI)*.15:0);
   c.save();c.translate(p.x,p.y-Math.min(8,age*20));c.scale(scale,scale);c.globalAlpha=Math.min(1,e.t/.2);
   c.fillStyle='#fffdf2';c.strokeStyle='#1b2b44';c.lineWidth=3;c.beginPath();c.arc(0,0,19,0,Math.PI*2);c.moveTo(-6,17);c.lineTo(-11,29);c.lineTo(4,18);c.fill();c.stroke();c.beginPath();c.arc(0,0,17,0,Math.PI*2);c.fill();
   c.fillStyle=e.glyph==='♥'?'#e5484d':e.glyph==='!'?'#d9480f':e.glyph==='♪'?'#2b6fb3':'#3d4f66';c.font='900 27px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText(e.glyph,0,2);c.restore()}
 }
}
