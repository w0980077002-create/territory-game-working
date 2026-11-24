/**
 * Regional atmosphere over the owner-approved painted scenery. Cosmetic only, derived from the
 * clock and camera. Instead of a flat colour wash (which dulled the art) each region gets its own
 * sky light, drifting cloud deck, horizon haze, ground tone and one signature motion:
 * storm flashes at the harbours, light shafts in the rune forest, dust haze in the peaks,
 * low sun over the Roman frontier, smoke and lava glow in the ember lands.
 * Region 1 keeps its approved look; it only gains slow, light clouds.
 */
import type {Region} from '../saga/regions';

interface Mood {sky:[string,string];skyAlpha:number;cloud:string;cloudAlpha:number;clouds:number;cloudSpeed:number;haze:string;hazeAlpha:number;ground:string;groundAlpha:number;signature:'none'|'storm'|'shafts'|'dust'|'sun'|'smoke';dim?:string}
const MOODS:Record<string,Mood>={
 ice:{sky:['#ffffff','#ffffff'],skyAlpha:0,cloud:'#ffffff',cloudAlpha:.32,clouds:4,cloudSpeed:6,haze:'#e6f6ff',hazeAlpha:0,ground:'#ffffff',groundAlpha:0,signature:'none'},
 harbor:{sky:['#16283a','#6d8ea6'],skyAlpha:.6,cloud:'#55687c',cloudAlpha:.55,clouds:6,cloudSpeed:22,haze:'#b9cfdf',hazeAlpha:.28,ground:'#8ea8bd',groundAlpha:.32,signature:'storm',dim:'#8ea3b8'},
 forest:{sky:['#0f2c26','#5f9c86'],skyAlpha:.42,cloud:'#6f9c87',cloudAlpha:.4,clouds:5,cloudSpeed:7,haze:'#a8f0c8',hazeAlpha:.32,ground:'#8fc9a0',groundAlpha:.34,signature:'shafts'},
 peaks:{sky:['#3e3a36','#a8988a'],skyAlpha:.5,cloud:'#a99a8c',cloudAlpha:.45,clouds:5,cloudSpeed:12,haze:'#f0d6a8',hazeAlpha:.34,ground:'#c9b8a2',groundAlpha:.36,signature:'dust'},
 limes:{sky:['#b8611f','#ffc46a'],skyAlpha:.5,cloud:'#f3c98e',cloudAlpha:.42,clouds:5,cloudSpeed:9,haze:'#ffe2a8',hazeAlpha:.26,ground:'#f0d2a0',groundAlpha:.3,signature:'sun'},
 ember:{sky:['#1e0603','#c2421a'],skyAlpha:.6,cloud:'#3b2420',cloudAlpha:.6,clouds:6,cloudSpeed:10,haze:'#ff7a3a',hazeAlpha:.3,ground:'#8c7166',groundAlpha:.5,signature:'smoke',dim:'#a0705c'},
};
export const regionMood=(id:string)=>MOODS[id]??MOODS.ice;

const hash=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v)};
const cloudSprites=new Map<string,HTMLCanvasElement>();
/** A soft cumulus made of overlapping radial puffs, rendered once per colour. */
function cloudSprite(color:string,variant:number){
 const key=color+variant;let s=cloudSprites.get(key);if(s)return s;
 s=document.createElement('canvas');s.width=320;s.height=120;const c=s.getContext('2d')!;
 for(let i=0;i<9;i++){
  const x=40+hash(variant*17+i)*240,y=70-Math.sin((x-40)/240*Math.PI)*28+hash(variant*5+i)*12,r=26+hash(variant*3+i)*26;
  const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color+'ff');g.addColorStop(.6,color+'aa');g.addColorStop(1,color+'00');
  c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();
 }
 cloudSprites.set(key,s);return s;
}

/** Re-light the painted blue sky in the region's hue. 'hue' keeps the art's own saturation and
 * light, so the picture stays vivid instead of washed out; soft-light adds the mood's contrast. */
function skyLight(c:CanvasRenderingContext2D,m:Mood,strength:number){
 const hue=c.createLinearGradient(0,0,0,600);hue.addColorStop(0,m.sky[1]);hue.addColorStop(.7,m.sky[1]);hue.addColorStop(1,m.sky[1]+'00');
 c.globalCompositeOperation='hue';c.globalAlpha=Math.min(1,m.skyAlpha*1.35*strength);c.fillStyle=hue;c.fillRect(0,0,864,600);
 const g=c.createLinearGradient(0,0,0,600);g.addColorStop(0,m.sky[0]);g.addColorStop(.6,m.sky[1]);g.addColorStop(1,m.sky[1]+'00');
 c.globalCompositeOperation='soft-light';c.globalAlpha=m.skyAlpha*strength;c.fillStyle=g;c.fillRect(0,0,864,600);
 if(m.dim){const d=c.createLinearGradient(0,0,0,600);d.addColorStop(0,m.dim);d.addColorStop(1,m.dim+'00');c.globalCompositeOperation='multiply';c.globalAlpha=strength;c.fillStyle=d;c.fillRect(0,0,864,600)}
 c.globalCompositeOperation='source-over';
}
/** Between the far mountains and the city: sky light and the cloud deck. */
export function paintRegionSky(c:CanvasRenderingContext2D,region:Region,time:number,cameraX:number,quality:number,reduced:boolean){
 if(typeof document==='undefined')return;
 const m=regionMood(region.id);
 c.save();
 if(m.skyAlpha>0)skyLight(c,m,1);
 // Storm flash: a rare, soft brightening of the clouds, never a strobe.
 let flash=0;
 if(m.signature==='storm'&&!reduced){const slot=Math.floor(time/7),t=time-slot*7-hash(slot)*4;if(hash(slot+11)>.45&&t>0&&t<.5)flash=Math.sin(t/.5*Math.PI)*(t<.12?1:.6)}
 const n=Math.max(2,Math.round(m.clouds*Math.max(.6,quality)));
 for(let i=0;i<n;i++){
  const depth=.03+hash(i+1)*.05,w=300+hash(i+7)*260,h=w*.38,span=864+w;
  const x=((hash(i+3)*span+time*m.cloudSpeed*(.6+depth*8)-cameraX*depth)%span+span)%span-w;
  const y=60+hash(i+5)*200;
  c.globalAlpha=m.cloudAlpha*(.65+hash(i+9)*.35);
  c.drawImage(cloudSprite(m.cloud,i%3),x,y,w,h);
  if(flash>0){c.globalAlpha=flash*.35;c.drawImage(cloudSprite('#e8f4ff',i%3),x,y,w,h)}
 }
 if(m.signature==='sun'){
  // Low western sun with a warm corona behind the city.
  const x=700-((cameraX*.02)%120),y=170,g=c.createRadialGradient(x,y,0,x,y,260);
  g.addColorStop(0,'#fff6d8');g.addColorStop(.12,'#ffe2a0cc');g.addColorStop(1,'#ffb35a00');
  c.globalAlpha=.75;c.fillStyle=g;c.fillRect(x-260,y-260,520,520);
 }
 if(m.signature==='smoke'&&!reduced){
  // Distant smoke columns rising from the burning lands.
  for(let k=0;k<3;k++){const base=((k*331+140-cameraX*.1)%1100+1100)%1100-120;
   for(let p=0;p<Math.round(6*quality)+2;p++){const age=(time*.05+p/8+hash(k))%1,r=24+age*70;
    c.globalAlpha=(1-age)*.32;c.drawImage(cloudSprite('#2a1714',k%3),base+Math.sin(age*3+k)*30+age*60-r,470-age*380-r*.4,r*2,r*.8)}}
 }
 c.restore();
}

/** After the painted scenery, before props and actors: horizon haze, ground tone and light. */
export function paintRegionGround(c:CanvasRenderingContext2D,region:Region,time:number,cameraX:number,quality:number,reduced:boolean){
 const m=regionMood(region.id);if(m.groundAlpha<=0&&m.hazeAlpha<=0)return;
 c.save();
 // The painted city carries its own blue sky; give it the same light so the horizon agrees.
 if(m.skyAlpha>0)skyLight(c,m,.5);
 if(m.groundAlpha>0){
  const tone=c.createLinearGradient(0,700,0,940);tone.addColorStop(0,m.ground+'00');tone.addColorStop(.3,m.ground);tone.addColorStop(1,m.ground);
  c.globalCompositeOperation='hue';c.globalAlpha=m.groundAlpha;c.fillStyle=tone;c.fillRect(0,700,864,240);c.globalCompositeOperation='source-over';
 }
 if(m.hazeAlpha>0){
  // Horizon haze softens the far city and adds depth between planes.
  const h=c.createLinearGradient(0,420,0,720);h.addColorStop(0,m.haze+'00');h.addColorStop(.7,m.haze);h.addColorStop(1,m.haze+'00');
  c.globalAlpha=m.hazeAlpha;c.fillStyle=h;c.fillRect(0,420,864,300);
 }
 if(m.groundAlpha>0){
  // Snow takes the region's tone: wet slate, moss, dust, sun-baked sand or ash.
  const g=c.createLinearGradient(0,690,0,940);g.addColorStop(0,m.ground+'00');g.addColorStop(.25,m.ground);g.addColorStop(1,m.ground);
  c.globalCompositeOperation='multiply';c.globalAlpha=m.groundAlpha;c.fillStyle=g;c.fillRect(0,690,864,250);
  c.globalCompositeOperation='source-over';
 }
 if(m.signature==='smoke'){
  // Lava light breathes along the road's edge.
  const pulse=reduced?.5:.5+.25*Math.sin(time*1.7)+.1*Math.sin(time*4.3);
  const g=c.createLinearGradient(0,940,0,760);g.addColorStop(0,'#ff5a1a');g.addColorStop(1,'#ff5a1a00');
  c.globalCompositeOperation='lighter';c.globalAlpha=.22*pulse;c.fillStyle=g;c.fillRect(0,760,864,180);
  c.globalCompositeOperation='source-over';
 }
 if(m.signature==='shafts'&&!reduced){
  // Slow light shafts through the canopy.
  c.globalCompositeOperation='lighter';
  for(let i=0;i<Math.round(3*quality)+1;i++){const x=((i*290+120-cameraX*.35)%1100+1100)%1100-120,a=.07+.05*Math.sin(time*.4+i*2);
   const g=c.createLinearGradient(x,120,x+180,820);g.addColorStop(0,'#eaffd0');g.addColorStop(1,'#eaffd000');
   c.globalAlpha=a;c.fillStyle=g;c.beginPath();c.moveTo(x,120);c.lineTo(x+70,120);c.lineTo(x+260,820);c.lineTo(x+120,820);c.closePath();c.fill()}
  c.globalCompositeOperation='source-over';
 }
 if(m.signature==='sun'&&!reduced){
  c.globalCompositeOperation='lighter';
  for(let i=0;i<3;i++){const a=.05+.03*Math.sin(time*.3+i);const x=700-i*90;
   const g=c.createLinearGradient(x,170,x-260,820);g.addColorStop(0,'#fff0c0');g.addColorStop(1,'#fff0c000');
   c.globalAlpha=a;c.fillStyle=g;c.beginPath();c.moveTo(x,170);c.lineTo(x+30,170);c.lineTo(x-200,820);c.lineTo(x-330,820);c.closePath();c.fill()}
  c.globalCompositeOperation='source-over';
 }
 if(m.signature==='dust'&&!reduced&&typeof document!=='undefined'){
  // Drifting dust veils at mid-depth.
  for(let i=0;i<2;i++){const x=((i*520+time*18-cameraX*.5)%1300+1300)%1300-400;c.globalAlpha=.2;c.drawImage(cloudSprite('#e9d2ac',i),x,560+i*60,560,150)}
 }
 c.restore();
}

/** District boundary: a drifting mist bank halfway between two sites, in the nearest parallax plane.
 * The party walks through it, so each new district is entered like a scene change. Stateless. */
export function paintDistrictMist(c:CanvasRenderingContext2D,region:Region,time:number,cameraX:number,quality:number,reduced:boolean,firstSite:number,spacing:number){
 if(typeof document==='undefined')return;
 const m=regionMood(region.id),color=m.hazeAlpha>0?m.haze:'#eef8ff';
 const i=Math.round((cameraX+432-firstSite+spacing/2)/spacing);
 if(i<1)return;
 const mid=firstSite+i*spacing-spacing/2,x=(mid-cameraX-432)*1.3+432;
 if(x<-520||x>1384)return;
 const near=1-Math.min(1,Math.abs(x-432)/900);
 c.save();
 for(let n=0;n<(quality<.6?3:5);n++){
  const drift=reduced?0:Math.sin(time*.4+n*1.7)*26,w=420+n*40,y=300+n*120;
  c.globalAlpha=(.3+.4*near*near)*(n===2||n===3?1:.85);
  c.drawImage(cloudSprite(color,n%3),x-w/2+drift+(n%2?60:-60),y-w*.2,w,w*.42);
 }
 c.restore();
}
