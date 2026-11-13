/**
 * WorldLife — the reactive scenery layer of the Living World.
 * It never owns gameplay state: everything here is cosmetic, derived from the simulation clock,
 * the camera and a few mood numbers handed over by WorldDirector. Paused game ⇒ frozen clock ⇒ frozen world.
 * Budget: only props of the two nearest sites are materialised; particles are capped and scale with `quality`.
 */
import {siteX,SITE_SPACING,FIRST_SITE} from './Journey';
import {scenery,contactShadow,paintedFire,paintedRaven,warmWorldArt} from './WorldArt';
import type {WeatherId} from '../data/world-variants';
export interface LifeEnv {cameraX:number;heroX:number;time:number;quality:number;reduced:boolean;danger:number;relief:number;gloom:number;weather:WeatherId;fighting:boolean;bossFree:number}
type PropKind='brazier'|'banner'|'lanterns'|'ropes'|'rune'|'folk';
interface Prop {kind:PropKind;x:number;seed:number;district:number;tone:number}
interface Bird {x:number;y:number;vx:number;vy:number;flying:boolean;gone:boolean;seed:number}
interface Mote {x:number;y:number;vx:number;vy:number;life:number;max:number;size:number;color:string;world:boolean;gravity:number}
const hash=(n:number)=>{const v=Math.sin(n*91.7+17.3)*43758.5453;return v-Math.floor(v)};
const glows=new Map<string,HTMLCanvasElement>();
function glow(color:string){let g=glows.get(color);if(!g){g=document.createElement('canvas');g.width=g.height=64;const c=g.getContext('2d')!,r=c.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,color);r.addColorStop(.35,color+'88');r.addColorStop(1,color+'00');c.fillStyle=r;c.fillRect(0,0,64,64);glows.set(color,g)}return g}
function light(c:CanvasRenderingContext2D,color:string,x:number,y:number,radius:number,alpha:number){if(alpha<=.01)return;const a=c.globalAlpha;c.globalAlpha=a*Math.min(1,alpha);c.drawImage(glow(color),x-radius,y-radius,radius*2,radius*2);c.globalAlpha=a}
/** Deterministic set dressing of one site's approach road. Exported for tests and budgets. */
export function propsOfSite(index:number):Prop[]{
 const a=siteX(index),d=index%5,s=index*13+5,P=(kind:PropKind,dx:number,tone=0):Prop=>({kind,x:a+dx,seed:hash(s+dx),district:d,tone});
 // Kept inside [-930,-580]: clear of the previous site's fight and of this leg's road event.
 if(d===0)return [P('brazier',-920),P('banner',-800,0),P('folk',-700,1),P('brazier',-590)];
 if(d===1)return [P('banner',-925,1),P('lanterns',-850),P('folk',-760,2),P('brazier',-590)];
 if(d===2)return [P('brazier',-925),P('ropes',-850),P('brazier',-600)];
 if(d===3)return [P('rune',-900),P('folk',-790,1),P('rune',-700),P('brazier',-590,1)];
 return [P('brazier',-900,2),P('banner',-760,2),P('brazier',-600,2)];
}
export class WorldLife {
 private props=new Map<number,Prop[]>();private birds=new Map<number,Bird[]>();private motes:Mote[]=[];
 wind=0;private gustAt=-1;private stride=0;private lastHero=0;flock=-1;onFlutter:()=>void=()=>{};onGust:()=>void=()=>{};
 private site(index:number){let list=this.props.get(index);if(!list){list=propsOfSite(index);this.props.set(index,list);const perches=list.filter(p=>p.kind==='banner'||p.kind==='ropes'||p.kind==='rune');this.birds.set(index,perches.slice(0,index%5===4?3:2).map((p,n)=>({x:p.x+(p.kind==='ropes'?0:4),y:p.kind==='banner'?560:p.kind==='rune'?616:622,vx:0,vy:0,flying:false,gone:false,seed:p.seed+n})));if(this.props.size>4){const far=[...this.props.keys()].sort((a,b)=>Math.abs(b-index)-Math.abs(a-index))[0];this.props.delete(far);this.birds.delete(far)}}return list}
 private near(cameraX:number){const lo=Math.max(0,Math.ceil((cameraX-FIRST_SITE+350)/SITE_SPACING)),hi=Math.max(lo,Math.floor((cameraX+2100-FIRST_SITE)/SITE_SPACING));return lo===hi?[lo]:[lo,hi]}
 /** Startle every perched bird on screen (ambush warning, boss roar, heavy impacts). */
 scatter(cameraX:number){let any=false;for(const list of this.birds.values())for(const b of list)if(!b.flying&&!b.gone&&b.x-cameraX>-40&&b.x-cameraX<900){b.flying=true;b.vx=(hash(b.seed)-.35)*160;b.vy=-150-hash(b.seed+1)*80;any=true}if(any)this.onFlutter()}
 /** Snow shaken loose by an impact at a screen position. */
 shake(x:number,strength:number,cameraX:number){for(let n=0;n<Math.round(4+strength*5);n++)this.motes.push({x:x+cameraX+(Math.random()-.5)*150,y:455+Math.random()*50,vx:(Math.random()-.5)*30,vy:40+Math.random()*60,life:1.1,max:1.1,size:2.5+Math.random()*3.5,color:'#f4fbff',world:true,gravity:260})}
 puff(x:number,y:number,color:string,count:number,spread=90,up=120,world=false,cameraX=0){for(let n=0;n<count;n++)this.motes.push({x:x+(world?cameraX:0)+(Math.random()-.5)*20,y,vx:(Math.random()-.5)*spread,vy:-Math.random()*up,life:.5+Math.random()*.5,max:1,size:2+Math.random()*4,color,world,gravity:240})}
 step(dt:number,e:LifeEnv){
  // Wind: a slow base per weather plus discrete gusts. Gust timing is derived from the clock, so it survives pause/reload.
  const base=e.weather==='gale'?.5:e.weather==='snow'?.22:.1,slot=Math.floor(e.time/(e.gloom>.2?6:9)),start=slot*(e.gloom>.2?6:9)+hash(slot)*3,g=e.time-start,gust=g>0&&g<1.8?Math.sin(g/1.8*Math.PI):0;
  if(gust>0&&this.gustAt!==slot){this.gustAt=slot;this.onGust()}
  this.wind+=(base+gust*.75+e.danger*.12-this.wind)*Math.min(1,dt*4);
  for(const i of this.near(e.cameraX))this.site(i);
  for(const list of this.birds.values())for(const b of list){if(b.gone)continue;if(!b.flying){if(Math.abs(b.x-e.heroX)<210){b.flying=true;b.vx=(b.x<e.heroX?-1:1)*(70+hash(b.seed)*80);b.vy=-170;this.onFlutter()}}else{b.x+=b.vx*dt;b.y+=b.vy*dt;b.vy-=40*dt;if(b.y<-40)b.gone=true}}
  const moved=e.heroX-this.lastHero;this.lastHero=e.heroX;if(moved>0&&moved<30){this.stride+=moved;if(this.stride>46){this.stride=0;this.puff(e.heroX-18,806,'#f1faff',Math.round(3*e.quality),50,45,true)}}
  for(const m of this.motes){m.life-=dt;m.x+=(m.vx+this.wind*60)*dt;m.y+=m.vy*dt;m.vy+=m.gravity*dt;if(m.gravity>0&&m.y>828&&m.vy>0){m.vy=0;m.vx*=.5;m.gravity=0;m.life=Math.min(m.life,.25)}}
  this.motes=this.motes.filter(m=>m.life>0).slice(-Math.round(90*e.quality));
 }
 /** Between the mountain sky and the city: aurora, festive sky lanterns, a passing flock. */
 sky(c:CanvasRenderingContext2D,e:LifeEnv){
  const aurora=Math.max(e.weather==='aurora'?.8:0,e.bossFree);
  if(aurora>.02&&!e.reduced){c.save();c.globalCompositeOperation='lighter';for(let band=0;band<3;band++){c.beginPath();const top=150+band*38;for(let x=-20;x<=884;x+=52)c.lineTo(x,top+Math.sin(x*.006+e.time*.35+band*2)*26+Math.sin(x*.017-e.time*.5)*9);for(let x=884;x>=-20;x-=52)c.lineTo(x,top+92+Math.sin(x*.008+e.time*.28+band)*30);c.closePath();const g=c.createLinearGradient(0,top-20,0,top+120);g.addColorStop(0,'#52ffb000');g.addColorStop(.35,band===1?'#9c7dff':'#4dffb4');g.addColorStop(1,'#3fa0ff00');c.fillStyle=g;c.globalAlpha=aurora*(.15+.05*Math.sin(e.time*.8+band));c.fill()}c.restore()}
  if(e.bossFree>.05){c.save();for(let n=0;n<7;n++){const age=(e.time*.045+n*.143+hash(n))%1,x=((n*131+70-e.cameraX*.2)%900+900)%900,y=640-age*470,sway=Math.sin(e.time+n)*8;c.globalAlpha=e.bossFree*Math.min(1,age*6,(1-age)*4);light(c,'#ffb861',x+sway,y,26,.8);c.fillStyle='#ffd58a';c.strokeStyle='#7a3d1c';c.lineWidth=1.5;c.beginPath();c.roundRect(x+sway-5,y-7,10,13,3);c.fill();c.stroke()}c.restore()}
  // A V of wild geese crosses the sky now and then; CompanionBrain lets our goose notice it.
  const period=47,k=Math.floor(e.time/period),t=(e.time-k*period)/9;this.flock=t<1&&hash(k+3)>.45?t:-1;
  if(this.flock>=0){c.save();c.strokeStyle='#22364f';c.lineWidth=2.2;c.lineCap='round';for(let n=0;n<7;n++){const row=Math.ceil(n/2),side=n%2?1:-1,x=-60+t*1000-row*24,y=215+side*row*11+Math.sin(e.time*2+n)*3,flap=Math.sin(e.time*9+n)*5;c.beginPath();c.moveTo(x-8,y-flap);c.lineTo(x,y);c.lineTo(x-8,y+flap*.4+4);c.stroke()}c.restore()}
 }
 constructor(){warmWorldArt()}
 private drawProp(c:CanvasRenderingContext2D,p:Prop,x:number,e:LifeEnv){
  const y=718,t=e.reduced?0:e.time,near=Math.max(0,1-Math.abs(e.heroX-p.x)/190),pulse=.5+.5*Math.sin(t*1.8+p.seed*20);
  c.save();
  if(p.kind==='folk'){
   const hide=Math.min(1,Math.max(0,(e.danger-.3)*3)),fx=x-hide*40*(p.seed>.5?1:-1);
   // Feet stay registered while the upper body breathes. The alternate pose blinks and adjusts the fur collar.
   const breathe=Math.sin(t*2.1+p.seed*8)*.65,cycle=(t+p.seed*17)%8,adjust=cycle>6.6&&cycle<7.4?Math.min(1,(cycle-6.6)/.18,(7.4-cycle)/.18):0;
   contactShadow(c,fx,y,22);c.globalAlpha*=1-hide;
   c.translate(fx,y);c.rotate(e.reduced?0:Math.sin(t*.85+p.seed*9)*.009+near*.015);
   const alpha=c.globalAlpha;c.globalAlpha=alpha*(1-adjust);scenery(c,'folk',0,0,83+breathe,57);
   if(adjust>0){c.globalAlpha=alpha*adjust;scenery(c,'folk-blink',0,0,83+breathe,57);}c.globalAlpha=alpha;
   if(cycle>3.2&&cycle<3.34){c.save();c.beginPath();c.rect(-29,-84,58,27);c.clip();scenery(c,'folk-blink',0,0,83+breathe,57);c.restore();}
  }else if(p.kind==='rune'){
   contactShadow(c,x,y,30);light(c,'#72dfff',x,y-46,73,.17+pulse*.09+near*.17);
   scenery(c,'rune',x,y,112);
   c.save();c.globalCompositeOperation='lighter';c.globalAlpha=.12+pulse*.15+near*.16;scenery(c,'rune',x,y,112);c.restore();
   if(!e.reduced)for(let n=0;n<Math.round(3*e.quality);n++){
    const age=(t*.23+n*.37+p.seed)%1;light(c,n%2?'#ffe1a2':'#85eeff',x+Math.sin(age*7+n*2)*26,y-22-age*96,5,Math.sin(age*Math.PI)*.7*(.5+near));
   }
  }else if(p.kind==='brazier'){
   contactShadow(c,x,y,29);
   // Flatten the reflection into the snow plane instead of washing out nearby actors.
   const color=p.tone===1?'#63d9ff':p.tone===2?'#bd80ff':'#ffbc65';
   c.save();c.translate(x,y+2);c.scale(1,.25);light(c,color,0,0,94,.28+pulse*.08+near*.13);c.restore();
   scenery(c,'brazier',x,y,73);
   light(c,color,x,y-65,58,.17+pulse*.045+near*.08);
   paintedFire(c,x,y-49,t,p.seed,e.reduced,p.tone,this.wind);
   if(!e.reduced)for(let n=0;n<Math.round(2*e.quality);n++){const age=(t*.5+n*.5+p.seed)%1;light(c,'#a7eeff',x+Math.sin(age*6+n)*14,y-65-age*55,3,Math.sin(age*Math.PI)*.6);}
  }else if(p.kind==='banner'){
   contactShadow(c,x,y,16);c.translate(x,y);c.transform(1,0,Math.sin(t*2+p.seed*4)*(.012+this.wind*.018),1,0,0);scenery(c,'banner',0,0,162);
  }else{
   // The rigging uses the same carved posts, braided rope and snow as the lantern garland.
   const height=p.kind==='lanterns'?128:105,center=x+95;
   contactShadow(c,center,y,85);scenery(c,'lanterns',center,y,height,202);
   for(let n=0;n<3;n++)light(c,'#ffc569',x+48+n*47,y-height*.28,24,.12+.04*Math.sin(t*3+n));
  }
  c.restore();
 }
 /** Mood grade + district props. Drawn after Codex scenery and before every actor. */
 back(c:CanvasRenderingContext2D,e:LifeEnv){
  c.save();
  const shade=(color:string,alpha:number)=>{if(alpha>.004){c.globalAlpha=Math.min(.6,alpha);c.fillStyle=color;c.fillRect(0,0,864,846)}};
  if(e.weather==='dusk'){const g=c.createLinearGradient(0,120,0,846);g.addColorStop(0,'#ff8a4a3d');g.addColorStop(.6,'#c2577a26');g.addColorStop(1,'#5b3f8a1f');c.fillStyle=g;c.fillRect(0,0,864,846)}
  if(e.weather==='aurora')shade('#081a4d',.3);if(e.weather==='snow')shade('#dcebff',.1);if(e.weather==='gale')shade('#dcebff',.16);
  if(e.relief>.25)shade('#ffd27a',e.relief*.1);else shade('#1a1240',e.gloom*.55);c.globalAlpha=1;
  if(!e.reduced&&e.quality>.8&&(e.weather==='clear'||e.weather==='dusk')&&e.gloom<.2&&e.danger<.5){for(let n=0;n<2;n++){const x=190+n*300-((e.cameraX*.05)%300),a=.05+.025*Math.sin(e.time*.6+n*2);c.globalAlpha=a*(1-e.danger*2);c.fillStyle=e.weather==='dusk'?'#ffc890':'#fff7d8';c.beginPath();c.moveTo(x,120);c.lineTo(x+70,120);c.lineTo(x-170,846);c.lineTo(x-300,846);c.closePath();c.fill()}c.globalAlpha=1}
  for(const i of this.near(e.cameraX))for(const p of this.site(i)){const x=p.x-e.cameraX;if(x<-240||x>1000)continue;this.drawProp(c,p,x,e)}
  for(const list of this.birds.values())for(const b of list){if(b.gone)continue;const x=b.x-e.cameraX;if(x<-40||x>904)continue;paintedRaven(c,x,b.y,e.time+b.seed,b.flying,b.flying&&b.vx<0,e.reduced)}
  c.restore();
 }
 /** In front of the actors: weather, impact snow, embers. Small on purpose — characters stay readable. */
 front(c:CanvasRenderingContext2D,e:LifeEnv){
  c.save();
  for(const m of this.motes){const x=m.world?m.x-e.cameraX:m.x;c.globalAlpha=Math.min(1,m.life/m.max*2);c.fillStyle=m.color;c.beginPath();c.arc(x,m.y,m.size,0,Math.PI*2);c.fill()}
  const flakes=Math.round((e.weather==='snow'?46:e.weather==='gale'?34:e.gloom>.2?0:8)*e.quality);c.fillStyle='#fff';
  for(let i=0;i<flakes;i++){const speed=30+(i%5)*14,x=((i*89+e.time*(40+this.wind*260+i%7*9)-e.cameraX*.9)%900+900)%900-18,y=(i*53+e.time*speed)%850;c.globalAlpha=.35+(i%4)*.12;c.beginPath();c.arc(x,y,1.6+(i%3)*.9,0,Math.PI*2);c.fill()}
  if(this.wind>.45&&!e.reduced){c.strokeStyle='#f2fbff';c.lineWidth=2;c.globalAlpha=(this.wind-.45)*.9;for(let i=0;i<Math.round(5*e.quality);i++){const x=((i*211+e.time*520)%1100)-120,y=520+i*58+Math.sin(e.time*3+i)*12;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+60,y-10,x+140,y+2);c.stroke()}}
  if(e.gloom>.2){for(let i=0;i<Math.round(16*e.quality);i++){const age=(e.time*.12+i*.0625)%1,x=((i*127-e.cameraX*.5+Math.sin(e.time+i)*20)%880+880)%880,y=840-age*420;c.globalAlpha=(1-age)*.7*(1-e.relief);c.fillStyle=i%3?'#ff9a4d':'#d9a2ff';c.fillRect(x,y,3,3)}}
  if(e.relief>.2){for(let i=0;i<Math.round(12*e.quality);i++){const age=(e.time*.2+i*.083)%1,x=(i*173+Math.sin(e.time*.7+i)*30)%864,y=830-age*330;c.globalAlpha=e.relief*(1-age)*.75;c.fillStyle='#ffe9a3';c.beginPath();c.arc(x,y,2.2,0,Math.PI*2);c.fill()}}
  c.restore();
 }
}
