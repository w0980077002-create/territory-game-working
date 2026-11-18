/** Original illustrated underground world, driven solely by the existing Journey and battle clock.
 * No gameplay state, save schema, combat RNG, damage or encounter timing is changed here.
 * The three art sheets are shared by every room/floor (~1.8 MB transfer, ~19 MB decoded).
 * Low quality preserves all illustration layers and reduces only optional moving effects.
 */
import type {JourneyState} from '../game/Journey';
import {art} from '../data/catalog';
export interface RealmView {
 floor:number;room:number;phase:string;clock:number;combatTime:number;delay:number;
 impact:number;quality:number;reduced:boolean;
}
type C=CanvasRenderingContext2D;
type Rect=readonly [number,number,number,number];
type Prop='crag'|'column'|'lantern'|'amethyst'|'brazier'|'ceiling';
interface Decoration {kind:Prop;x:number;y:number;height:number;depth:number;flip?:boolean}
const frames:Record<Prop,Rect>={crag:[0,0,289,863],column:[290,0,288,863],lantern:[580,0,307,863],amethyst:[0,890,286,770],brazier:[288,890,265,770],ceiling:[552,900,335,750]};
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const noise=(n:number)=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)};
interface Palette {stone:string;light:string;hot:string}
const palettes:Palette[]=[{stone:'#102942',light:'#68f4de',hot:'#99c3ff'},{stone:'#15243e',light:'#79d9ff',hot:'#ce8aff'},{stone:'#2b1935',light:'#ffc67c',hot:'#f786c1'}];
/** Stable tiers prevent particle counts shimmering as the adaptive FPS estimate drifts. */
export const realmEffectsQuality=(quality:number)=>quality<.65?.45:1;
export const realmPalette=(room:number)=>palettes[Math.max(0,Math.min(2,room-1))];
/** Rewards advance the persisted run before the victory animation finishes: use encounter identity. */
export function realmSceneIdentity(title:string,role:string,fallbackFloor=1){
 const floor=Number(title.match(/^Тьма (\d+)/)?.[1])||fallbackFloor;
 const section=Number(role.match(/([1-6])\/[36]/)?.[1])||3;const room=role.endsWith('/6')?1+(section-1)%3:section;return {floor,room};
}
export function realmLighting(j:JourneyState,v:RealmView){return .36+v.room*.13+(1-clamp((j.targetX-j.worldX)/675))*.22}
/** World addresses, not repeated wallpaper. Each chamber has a different silhouette and approach. */
export function realmDecorations(floor:number,room:number):Decoration[]{
 const n=(noise(floor*71)-.5)*38;
 const approach:Decoration[]=[
  {kind:'crag',x:-1580+n,y:750,height:360,depth:.7},
  {kind:'ceiling',x:-1230,y:170,height:360,depth:.52,flip:true},
  {kind:'column',x:-1010+n,y:736,height:420,depth:.65},
  {kind:'amethyst',x:-620,y:748,height:230,depth:.8,flip:true},
  {kind:'ceiling',x:-340+n,y:125,height:380,depth:.58},
 ];
 const rooms:Decoration[][]=[
  [{kind:'crag',x:48,y:749,height:340,depth:.73},{kind:'ceiling',x:195,y:138,height:330,depth:.58,flip:true},{kind:'brazier',x:530,y:739,height:190,depth:.82},{kind:'crag',x:898,y:750,height:360,depth:.74,flip:true}],
  [{kind:'column',x:65,y:738,height:495,depth:.73},{kind:'ceiling',x:810,y:130,height:300,depth:.55},{kind:'brazier',x:483,y:738,height:195,depth:.8},{kind:'column',x:880,y:738,height:500,depth:.72,flip:true},{kind:'amethyst',x:820,y:745,height:230,depth:.82}],
  [{kind:'column',x:30,y:740,height:530,depth:.75},{kind:'amethyst',x:200,y:744,height:245,depth:.68},{kind:'ceiling',x:130,y:115,height:340,depth:.6},{kind:'column',x:910,y:739,height:540,depth:.76,flip:true},{kind:'amethyst',x:850,y:750,height:290,depth:.81,flip:true}],
 ];
 return [...approach,...rooms[Math.max(0,Math.min(2,room-1))]].sort((a,b)=>a.depth-b.depth);
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
 private chambers:HTMLImageElement;private props:HTMLImageElement;private road:HTMLImageElement;
 constructor(){
  const load=(id:string)=>{const image=new Image();image.src=art('dark/'+id);return image};
  this.chambers=load('chambers');this.props=load('props');this.road=load('road');
 }
 ready(){return [this.chambers,this.props,this.road].every(i=>i.complete&&i.naturalWidth>0)}
 private prop(c:C,kind:Prop,x:number,y:number,height:number,flip=false,angle=0){
  if(!this.props.complete||!this.props.naturalWidth)return;
  const [sx,sy,sw,sh]=frames[kind],width=height*sw/sh;
  if(x+width<0||x-width>864)return;
  c.save();c.translate(x,y);if(angle)c.rotate(angle);if(flip)c.scale(-1,1);
  // Ceiling/lantern anchors are at the top; standing props are planted on the ground.
  c.drawImage(this.props,sx,sy,sw,sh,-width/2,kind==='ceiling'||kind==='lantern'?0:-height,width,height);c.restore();
 }
 drawBack(c:C,j:JourneyState,v:RealmView){
  const p=realmPalette(v.room),delta=j.targetX-375-j.cameraX,t=v.reduced?0:v.clock,power=realmLighting(j,v);
  c.fillStyle=p.stone;c.fillRect(0,0,864,940);
  if(this.chambers.complete&&this.chambers.naturalWidth){
   // Separate authored rooms in a single texture, cropped clear of panel seams; preserve aspect.
   const h=this.chambers.naturalHeight/3,sw=this.chambers.naturalWidth,sh=h-4;
   c.drawImage(this.chambers,0,(v.room-1)*h+2,sw,sh,-300+Math.min(280,delta*.16),0,1320,1320*sh/sw);
  }
  // Subterranean falls shimmer inside the far plane, behind every creature.
  if(v.room===2&&!v.reduced){c.save();c.globalAlpha=.13*power;c.strokeStyle='#c9ffff';c.lineWidth=2;for(let i=0;i<5;i++){const x=48+i*34+delta*.16,y=490+(t*65+i*61)%170;c.beginPath();c.moveTo(x,y);c.lineTo(x-3,y+28);c.stroke()}c.restore()}
  const opening=v.phase==='fight'&&v.room>1?1-clamp(v.combatTime/1.2):0;
  glow(c,640+delta*.24,650,230,p.hot+'48',power+opening*.6);
  for(const o of realmDecorations(v.floor,v.room)){
   const x=o.x+delta*o.depth;this.prop(c,o.kind,x,o.y,o.height,o.flip);
   if(o.kind==='brazier'&&x>-100&&x<964){const fy=o.y-o.height*.82,flicker=.85+Math.sin(t*8+x)*.08+Math.sin(t*13)*.06;glow(c,x,fy,82,'#72ffc35c',flicker*power);if(!v.reduced){c.save();c.globalAlpha=.6;for(let k=0;k<3;k++){const life=(t*.6+k/3)%1;c.fillStyle='#bdffe5';c.fillRect(x+Math.sin(k+t*2)*12,fy-life*58,2,4)}c.restore()}}
  }
  // Suspended lamps sway independently; their reflected light stays behind the party.
  const lamps=v.room===1?[{x:320,y:205,h:260}]:v.room===2?[{x:270,y:175,h:300},{x:805,y:185,h:270}]:[{x:320,y:185,h:300},{x:760,y:160,h:330}];
  for(const [i,l] of lamps.entries()){
   const x=l.x+delta*.48,angle=v.reduced?0:Math.sin(t*.85+i*2+v.floor)*.025;
   glow(c,x-Math.sin(angle)*l.h*.67,l.y+l.h*.68,95,'#ffbe5c65',power*(.92+Math.sin(t*6+i)*.08));
   this.prop(c,'lantern',x,l.y,l.h,false,angle);
  }
  // One continuous road uses a mirrored stone strip. Authored scenery above never tiles.
  if(this.road.complete&&this.road.naturalWidth){
   const width=1180,shift=j.cameraX,index=Math.floor(shift/width),scale=width/1774;
   for(let n=index;n<=index+1;n++){
    const x=n*width-shift;c.save();c.translate(x,735);if(n%2){c.translate(width,0);c.scale(-1,1)}
    c.drawImage(this.road,0,276,1774,611,0,0,width+1,611*scale);c.restore();
   }
  }
  // A short veil follows position: pause/reload reproduce precisely the same arrival.
  if(v.phase==='walk'){const reveal=clamp((1400-(j.targetX-j.worldX))/145);if(reveal<1){c.save();c.globalAlpha=(1-reveal)**2*.8;c.fillStyle='#102137';c.fillRect(0,0,864,940);c.restore()}}
  // The boss's own rising rune seal is anchored to the arena, not the screen.
  if(v.room===3){
   c.save();c.translate(645+delta,807);c.scale(1,.18);c.strokeStyle=p.light;c.globalAlpha=.45+opening*.4;c.lineWidth=4;c.beginPath();c.arc(0,0,115,0,Math.PI*2);c.stroke();
   for(let n=0;n<8;n++){c.save();c.rotate(n*Math.PI/4);rune(c,0,-96,13,p.hot,n);c.restore()}c.restore();
  }
  if(opening>0){
   // Boss entrance: a luminous seal unfolds behind its silhouette, with no delay to combat.
   const x=645+delta*.4,y=637,r=70+(1-opening)*110;
   c.save();c.globalAlpha=opening*.65;c.strokeStyle=p.light;c.lineWidth=3;c.beginPath();c.ellipse(x,y,r,r*.75,0,0,Math.PI*2);c.stroke();
   for(let n=0;n<6;n++){const a=n*Math.PI/3;rune(c,x+Math.cos(a)*r,y+Math.sin(a)*r*.75,12,p.light,n)}c.restore();
  }
 }
 drawFront(c:C,j:JourneyState,v:RealmView){
  const p=realmPalette(v.room),delta=j.targetX-375-j.cameraX,t=v.reduced?0:v.clock,power=realmLighting(j,v);
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
  if(v.phase==='victory'){
   const age=1.7-v.delay,k=clamp(age/.2)*(1-clamp((age-.55)/.65));
   if(k>0){c.save();c.globalAlpha=k*.8;c.translate(630+delta,803);c.scale(1,.2);c.strokeStyle='#ffe4a3';c.lineWidth=4;c.beginPath();c.arc(0,0,80+age*150,0,Math.PI*2);c.stroke();c.restore();
    c.save();c.globalAlpha=k;for(let i=0;i<(v.reduced?3:9);i++)rune(c,520+i*28+delta,735-age*(70+i%3*25),8,'#ffdda0',i);c.restore();
   }
  }
 }
}
