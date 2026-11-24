/** Original illustrated underground world, driven solely by the existing Journey and battle clock.
 * No gameplay state, save schema, combat RNG, damage or encounter timing is changed here.
 * The three art sheets are shared by every room/floor (~1.8 MB transfer, ~19 MB decoded).
 * Low quality preserves all illustration layers and reduces only optional moving effects.
 */
import {SITE_SPACING,type JourneyState} from '../game/Journey';
import {sceneImage,sceneImageReady} from '../game/sceneImages';
import {ROOMS,type RealmRun,type RealmLast} from './realm';
import {portalColors} from './portals';
import {paintRealmGloom,paintRealmVignette} from './realmAtmosphere';
export type RealmChamber='entry'|'ruins'|'crypt'|'abyss'|'sanctum';
export interface RealmView {
 floor:number;chamber:RealmChamber;phase:string;clock:number;combatTime:number;crossing:boolean;
 impact:number;quality:number;reduced:boolean;
}
type C=CanvasRenderingContext2D;
type Rect=readonly [number,number,number,number];
type Prop='crag'|'column'|'lantern'|'amethyst'|'brazier'|'ceiling';
interface Decoration {kind:Prop;x:number;y:number;height:number;depth:number;flip?:boolean}
const frames:Record<Prop,Rect>={crag:[0,0,289,863],column:[290,0,288,863],lantern:[580,0,307,863],amethyst:[0,890,286,770],brazier:[288,890,265,770],ceiling:[552,900,335,750]};
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const noise=(n:number)=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)};
const chambers={
 entry:{art:0,stone:'#102942',light:'#68f4de',hot:'#99c3ff',lightLevel:.49},
 ruins:{art:0,stone:'#17233e',light:portalColors[0],hot:'#a8b5ed',lightLevel:.52},
 crypt:{art:1,stone:'#15243e',light:portalColors[1],hot:'#95beff',lightLevel:.62},
 abyss:{art:0,stone:'#192b2c',light:portalColors[2],hot:'#7af3bd',lightLevel:.55},
 sanctum:{art:2,stone:'#2b1935',light:'#ffc67c',hot:'#f786c1',lightLevel:.75},
};
const portalChambers:readonly RealmChamber[]=['ruins','crypt','abyss'];
/** Stable tiers prevent particle counts shimmering as the adaptive FPS estimate drifts. */
export const realmEffectsQuality=(quality:number)=>quality<.65?.45:1;
export function realmSceneIdentity(run:RealmRun|undefined,last:RealmLast|undefined,fallbackFloor:number):Pick<RealmView,'floor'|'chamber'|'crossing'>{
 const chamber=run?.stage==='FINAL_BOSS'||(!run&&last&&(last.win||last.rooms===ROOMS-1))?'sanctum':portalChambers[run?.selected?.biome??-1]??'entry';
 const crossing=!!run&&run.killed===0&&(run.stage.startsWith('SEGMENT_')||run.stage==='FINAL_BOSS');
 return {floor:run?.f??last?.f??fallbackFloor,chamber,crossing};
}
export function realmLighting(j:JourneyState,v:RealmView){return chambers[v.chamber].lightLevel+(1-clamp((j.targetX-j.worldX)/675))*.22}
export function realmCrossing(j:JourneyState,v:RealmView){
 if(!v.crossing||v.phase!=='walk'||v.reduced)return 0;
 return 1-clamp((SITE_SPACING-(j.targetX-j.worldX))/115);
}
/** World addresses, not repeated wallpaper. Each chamber has a different silhouette and approach. */
export function realmDecorations(floor:number,chamber:RealmChamber):Decoration[]{
 const n=(noise(floor*71)-.5)*38;
 const approach:Decoration[]=[
  {kind:'crag',x:-1580+n,y:750,height:360,depth:.7},
  {kind:'ceiling',x:-1230,y:170,height:360,depth:.52,flip:true},
  {kind:'column',x:-1010+n,y:736,height:420,depth:.65},
  {kind:'amethyst',x:-620,y:748,height:230,depth:.8,flip:true},
  {kind:'ceiling',x:-340+n,y:125,height:380,depth:.58},
 ];
 const rooms:Record<RealmChamber,Decoration[]>={
  entry:[{kind:'crag',x:48,y:735,height:340,depth:.73},{kind:'ceiling',x:195,y:138,height:330,depth:.58,flip:true},{kind:'brazier',x:530,y:723,height:190,depth:.82},{kind:'crag',x:898,y:730,height:360,depth:.74,flip:true}],
  ruins:[{kind:'column',x:110,y:729,height:450,depth:.72,flip:true},{kind:'brazier',x:378,y:731,height:190,depth:.73},{kind:'column',x:780,y:725,height:430,depth:.78},{kind:'crag',x:924,y:734,height:370,depth:.86}],
  crypt:[{kind:'column',x:65,y:728,height:495,depth:.73},{kind:'ceiling',x:810,y:130,height:300,depth:.55},{kind:'brazier',x:483,y:727,height:195,depth:.8},{kind:'column',x:880,y:728,height:500,depth:.72,flip:true},{kind:'amethyst',x:820,y:735,height:230,depth:.82}],
  abyss:[{kind:'crag',x:76,y:733,height:330,depth:.73,flip:true},{kind:'ceiling',x:680,y:136,height:340,depth:.64,flip:true},{kind:'crag',x:898,y:730,height:360,depth:.74}],
  sanctum:[{kind:'column',x:30,y:736,height:530,depth:.75},{kind:'amethyst',x:200,y:734,height:245,depth:.68},{kind:'ceiling',x:130,y:115,height:340,depth:.6},{kind:'column',x:910,y:729,height:540,depth:.76,flip:true},{kind:'amethyst',x:850,y:738,height:290,depth:.81,flip:true}],
 };
 return [...approach,...rooms[chamber]].sort((a,b)=>a.depth-b.depth);
}
function glow(c:C,x:number,y:number,r:number,color:string,alpha=1){
 c.save();c.globalAlpha*=alpha;const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,color.slice(0,7)+'00');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore();
}
function rune(c:C,x:number,y:number,s:number,color:string,variant=0){
 c.save();c.translate(x,y);c.scale(s,s);c.strokeStyle=color;c.lineWidth=.15;c.lineCap='round';c.lineJoin='round';
 c.beginPath();c.moveTo(0,-1);c.lineTo(0,1);c.moveTo(-.55,-.5);c.lineTo(0,0);c.lineTo(.55,-.5);
 if(variant%2){c.moveTo(0,.5);c.lineTo(.6,0);c.lineTo(0,-.5)}else{c.moveTo(-.5,.2);c.lineTo(0,.7);c.lineTo(.5,.2)}c.stroke();c.restore();
}
export class RealmWorld {
 private chambers:HTMLImageElement;private props:HTMLImageElement;private road:HTMLImageElement;private fungi?:HTMLImageElement;
 constructor(){
  const load=(id:string)=>sceneImage('dark/'+id);
  this.chambers=load('chambers');this.props=load('props');this.road=load('road');
 }
 ready(){return [this.chambers,this.props,this.road].every(i=>i.complete&&i.naturalWidth>0)}
 private prop(c:C,kind:Prop,x:number,y:number,height:number,flip=false,angle=0){
  if(!sceneImageReady(this.props))return;
  const [sx,sy,sw,sh]=frames[kind],width=height*sw/sh;
  if(x+width<0||x-width>864)return;
  c.save();c.translate(x,y);if(angle)c.rotate(angle);if(flip)c.scale(-1,1);
  // Ceiling/lantern anchors are at the top; standing props are planted on the ground.
  c.drawImage(this.props,sx,sy,sw,sh,-width/2,kind==='ceiling'||kind==='lantern'?0:-height,width,height);c.restore();
 }
 drawBack(c:C,j:JourneyState,v:RealmView){
  const p=chambers[v.chamber],delta=j.targetX-375-j.cameraX,t=v.reduced?0:v.clock,power=realmLighting(j,v);
  c.fillStyle=p.stone;c.fillRect(0,0,864,940);
  if(sceneImageReady(this.chambers)){
   // Separate authored rooms in a single texture, cropped clear of panel seams; preserve aspect.
   const h=this.chambers.naturalHeight/3,sw=this.chambers.naturalWidth,sh=h-4;
   const width=v.chamber==='abyss'?1570:1320;
   if(v.chamber==='abyss'){c.save();c.translate(864,0);c.scale(-1,1)}
   c.drawImage(this.chambers,0,p.art*h+2,sw,sh,-300+Math.min(280,delta*.16),0,width,width*sh/sw);
   if(v.chamber==='abyss'){c.restore();c.fillStyle='#25493655';c.fillRect(0,0,864,745)}
  }
  // Subterranean falls shimmer inside the far plane, behind every creature.
  if(v.chamber==='crypt'&&!v.reduced){c.save();c.globalAlpha=.13*power;c.strokeStyle='#c9ffff';c.lineWidth=2;for(let i=0;i<5;i++){const x=48+i*34+delta*.16,y=490+(t*65+i*61)%170;c.beginPath();c.moveTo(x,y);c.lineTo(x-3,y+28);c.stroke()}c.restore()}
  const sanctum=v.chamber==='sanctum';
  const opening=sanctum?(v.phase==='walk'?1-clamp((j.targetX-j.worldX)/455):v.phase==='fight'?1-clamp(v.combatTime/1.2):0):0;
  glow(c,640+delta*.24,650,230,p.hot+'48',power+opening*.6);
  for(const o of realmDecorations(v.floor,v.chamber)){
   const x=o.x+delta*o.depth;this.prop(c,o.kind,x,o.y,o.height,o.flip);
   if(o.kind==='brazier'&&x>-100&&x<964){const fy=o.y-o.height*.82,flicker=.85+Math.sin(t*8+x)*.08+Math.sin(t*13)*.06;glow(c,x,fy,82,'#72ffc35c',flicker*power);if(!v.reduced){c.save();c.globalAlpha=.6;for(let k=0;k<3;k++){const life=(t*.6+k/3)%1;c.fillStyle='#bdffe5';c.fillRect(x+Math.sin(k+t*2)*12,fy-life*58,2,4)}c.restore()}}
  }
  // Suspended lamps sway independently; their reflected light stays behind the party.
  const lamps=v.chamber==='abyss'?[]:v.chamber==='entry'?[{x:320,y:205,h:260}]:[{x:270,y:175,h:300},{x:805,y:185,h:270}];
  for(const [i,l] of lamps.entries()){
   const x=l.x+delta*.48,angle=v.reduced?0:Math.sin(t*.85+i*2+v.floor)*.025;
   glow(c,x-Math.sin(angle)*l.h*.67,l.y+l.h*.68,95,'#ffbe5c65',power*(.92+Math.sin(t*6+i)*.08));
   this.prop(c,'lantern',x,l.y,l.h,false,angle);
  }
  // One continuous road uses a mirrored stone strip. Authored scenery above never tiles.
  // The back edge of the road also supports enemies stepping into view.
  if(sceneImageReady(this.road)){
   const width=1180,shift=j.cameraX,index=Math.floor(shift/width),scale=width/1774;
   for(let n=index;n<=index+1;n++){
    const x=n*width-shift;c.save();c.translate(x,716);if(n%2){c.translate(width,0);c.scale(-1,1)}
    c.drawImage(this.road,0,276,1774,611,0,0,width+1,611*scale);c.restore();
   }
  }
  if(v.chamber==='abyss'){
   this.fungi??=sceneImage('dark/fungi');
   if(sceneImageReady(this.fungi)){
    for(const [i,root] of [-1100,-650,-220,90,490,875].entries()){
     const x=root+delta*(.58+i%2*.17),height=94+Math.floor(noise(i+11)*99),width=height*this.fungi.naturalWidth/this.fungi.naturalHeight;
     if(x+width/2<0||x-width/2>864)continue;
     c.save();c.translate(x,729-i%2*9);if(i%2)c.scale(-1,1);
     c.drawImage(this.fungi,-width/2,-height,width,height);c.restore();
     glow(c,x,729-height*.52,height*.49,'#7bddc74c',.74+Math.sin(t*1.7+i)*.13);
    }
   }
  }
  paintRealmGloom(c,v.clock,delta,v.floor,v.chamber==='sanctum'?'#ff6a8a':v.chamber==='abyss'?'#9dff7a':'#ff4d6a',v.quality,v.reduced);
  // The boss's own rising rune seal is anchored to the arena, not the screen.
  if(sanctum){
   c.save();c.translate(645+delta,807);c.scale(1,.18);c.strokeStyle=p.light;c.globalAlpha=.45+opening*.4;c.lineWidth=4;c.beginPath();c.arc(0,0,115,0,Math.PI*2);c.stroke();
   for(let n=0;n<8;n++){c.save();c.rotate(n*Math.PI/4);rune(c,0,-96,13,p.hot,n);c.restore()}c.restore();
  }
  if(opening>0){
   // Boss entrance: a luminous seal unfolds behind its silhouette, with no delay to combat.
   const x=645+delta*.72,y=636,r=117+(1-opening)*70;
   c.save();c.globalAlpha=opening*.65;c.strokeStyle=p.light;c.lineWidth=3;c.beginPath();c.ellipse(x,y,r,r*.75,0,0,Math.PI*2);c.stroke();
   for(let n=0;n<6;n++){const a=n*Math.PI/3;rune(c,x+Math.cos(a)*r,y+Math.sin(a)*r*.75,12,p.light,n)}c.restore();
  }
 }
 drawFront(c:C,j:JourneyState,v:RealmView){
  const p=chambers[v.chamber],delta=j.targetX-375-j.cameraX,t=v.reduced?0:v.clock,power=realmLighting(j,v);
  paintRealmVignette(c);
  // Near crystals peek from below the lane. Their silhouettes never cover feet or HP.
  for(const [i,x] of [-60,910].entries())this.prop(c,i?'amethyst':'crag',x+delta*1.12,1080,212,!!i);
  if(!v.reduced){
   // Fog is a handful of transparent ribbons below feet; no opaque actor-wide veil.
   c.save();c.strokeStyle=p.light;c.lineCap='round';
   for(let n=0;n<Math.round(4*v.quality);n++){const x=((n*263+t*(12+n)-j.cameraX*.26)%1160+1160)%1160-170,y=866+n*13;c.globalAlpha=.06;c.lineWidth=8;c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x+45,y-9,x+110,y+7,x+175,y-2);c.stroke()}c.restore();
   c.save();for(let i=0;i<Math.round(26*v.quality);i++){
    const life=(t*(.065+i%3*.011)+noise(i+v.floor))%1,x=((i*173-j.cameraX*.24+Math.sin(t*.5+i)*22)%940+940)%940-40,y=865-life*510;
    c.globalAlpha=Math.sin(life*Math.PI)*(.3+power*.3);c.fillStyle=i%4?p.light:p.hot;c.beginPath();c.ellipse(x,y,1.3+i%2,2.1+i%3,0,0,Math.PI*2);c.fill();
   }c.restore();
  }
  if(v.impact>0){
   // Existing powerful hits illuminate stone, never affect real damage or tint the actors.
   const a=clamp(v.impact/8);glow(c,660,872,170,p.hot+'77',a);
   c.save();c.globalAlpha=a*.75;c.strokeStyle=p.light;c.lineWidth=3;for(let n=0;n<4;n++){const x=100+n*212+delta%37;c.beginPath();c.moveTo(x,854);c.lineTo(x+13,862);c.lineTo(x+8,879);c.stroke()}c.restore();
  }
  if(v.phase==='victory'&&v.chamber==='sanctum'){
   glow(c,635+delta,798,135,'#ffce6559',power);
   for(let i=0;i<5;i++)rune(c,563+i*36+delta,768-i%2*20,7,'#ffdda0',i);
  }
 }
 // Travel distance keeps the reveal in sync with pauses, resume, and x1/x2.
 drawCrossing(c:C,j:JourneyState,v:RealmView){
  const veil=realmCrossing(j,v);
  if(veil<=0)return;
  const p=chambers[v.chamber],radius=90+(1-veil)*630;
  c.save();c.globalAlpha=veil**1.35;
  const view=c.createRadialGradient(375,704,radius*.4,375,704,radius);
  view.addColorStop(0,p.stone+'00');view.addColorStop(.73,p.stone+'70');view.addColorStop(1,'#090c19');
  c.fillStyle=view;c.fillRect(0,0,864,940);
  c.strokeStyle=p.light;c.lineWidth=3;c.beginPath();c.ellipse(375,700,radius*.74,radius,0,0,Math.PI*2);c.stroke();c.restore();
 }
}
