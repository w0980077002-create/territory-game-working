import landmarkFrames from '../data/world-landmarks.json';
import {art} from '../data/catalog';
import {SITE_SPACING,FIRST_SITE,siteX,type JourneyState} from './Journey';
export interface WorldObject {id:string;kind:number;worldX:number;worldY:number;width:number;height:number;depth:number;flip:boolean;lit:boolean}
const seed=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v)};
/** Authored districts have persistent world addresses. Only nearby scenery is materialised. */
export function worldObjectsAround(cameraX:number):WorldObject[]{
 const objects:WorldObject[]=[];
 const first=Math.max(0,Math.floor((cameraX-FIRST_SITE-1800)/SITE_SPACING)),last=Math.max(2,Math.ceil((cameraX+2100-FIRST_SITE)/SITE_SPACING));
 for(let i=first;i<=last;i++){
  const district=i%5,anchor=siteX(i),depth=.76;
  objects.push({id:`site-${i}`,kind:[0,1,2,3,5][district],worldX:anchor*depth+140,worldY:715,width:district===4?650:590,height:district===4?560:510,depth,flip:false,lit:district!==3});
  objects.push({id:`approach-${i}`,kind:(district+3)%5,worldX:(anchor-620)*.9-30,worldY:720,width:290+seed(i+3)*100,height:285+seed(i+7)*100,depth:.9,flip:i%2===0,lit:false});
  objects.push({id:`ridge-${i}`,kind:i%2?4:3,worldX:(anchor+640)*.58+80,worldY:706,width:390+seed(i+29)*100,height:320+seed(i+17)*80,depth:.58,flip:i%3===0,lit:false});
 }
 // Opening composition: a large dragon-roof gate at the left, with an open road ahead.
 if(cameraX<1200)objects.push({id:'arrival-gate',kind:0,worldX:75,worldY:710,width:470,height:500,depth:.88,flip:false,lit:true});
 return objects.sort((a,b)=>a.depth-b.depth);
}
export class WorldRenderer {
 textures=new Map<string,HTMLImageElement>();
 constructor(){for(const id of ['mountains','city','landmarks','road']){const image=new Image();image.src=art('world-'+id);this.textures.set(id,image)}}
 private ready(id:string){const i=this.textures.get(id);return i?.complete&&i.naturalWidth?i:null}
 private panorama(c:CanvasRenderingContext2D,img:HTMLImageElement,camera:number,depth:number,y:number,width:number,height:number,phase=0){
  const shift=camera*depth+phase,index=Math.floor(shift/width);
  for(let n=index;n<=index+1;n++){const x=n*width-shift;c.save();if(n%2){c.translate(x+width,y);c.scale(-1,1);c.drawImage(img,0,0,width+1,height)}else c.drawImage(img,x,y,width+1,height);c.restore()}
 }
 draw(c:CanvasRenderingContext2D,j:JourneyState,time:number,fallback:HTMLImageElement,tension=0,quality=1){
  const sky=this.ready('mountains'),city=this.ready('city'),atlas=this.ready('landmarks'),road=this.ready('road');
  c.fillStyle='#1286ed';c.fillRect(0,0,864,940);
  if(sky)this.panorama(c,sky,j.cameraX,.085,35,3900,1300,1700);
  else if(fallback.complete&&fallback.naturalWidth)c.drawImage(fallback,0,0,864,1040);
  if(city)this.panorama(c,city,j.cameraX,.27,55,2050,683);
  if(atlas){

   for(const o of worldObjectsAround(j.cameraX)){
    const x=o.worldX-j.cameraX*o.depth;if(x+o.width/2<0||x-o.width/2>864)continue;
    c.save();c.translate(x,o.worldY);if(o.flip)c.scale(-1,1);
    const [sx,sy,sw,sh]=landmarkFrames[o.kind];c.drawImage(atlas,sx,sy,sw,sh,-o.width/2,-o.height,o.width,o.height);c.restore();
    if(o.lit){const lightX=x-o.width*.22,lightY=o.worldY-o.height*.2,r=35+Math.sin(time*9+o.worldX)*4;const light=c.createRadialGradient(lightX,lightY,0,lightX,lightY,r);light.addColorStop(0,'#ffbd5c55');light.addColorStop(1,'#ff9a0000');c.fillStyle=light;c.fillRect(lightX-r,lightY-r,r*2,r*2);
     // Smoke shares the simulation clock and the landmark's depth.
     for(let puff=0;puff<Math.max(1,Math.round(3*quality));puff++){const age=(time*.22+puff/3+seed(o.worldX))%1,sx=x+Math.sin(age*4+o.worldX)*18+age*20,sy=o.worldY-o.height*.74-age*85,radius=12+age*25;c.save();c.globalAlpha=(1-age)*.13;const smoke=c.createRadialGradient(sx,sy,1,sx,sy,radius);smoke.addColorStop(0,'#dae6ed');smoke.addColorStop(1,'#c8dfec00');c.fillStyle=smoke;c.fillRect(sx-radius,sy-radius,radius*2,radius*2);c.restore()}
    }
   }
  }
  // Broad walkable surface and the nearer cliff are separately projected terrain strips.
  if(road){
   const width=1300,start=Math.floor(j.cameraX/width),snowY=road.naturalHeight*.38,snowH=road.naturalHeight*.10;
   c.fillStyle='#aedbf0';c.fillRect(0,710,864,134);
   for(let n=start;n<=start+1;n++){const x=n*width-j.cameraX;c.save();if(n%2){c.translate(x+width,0);c.scale(-1,1);c.drawImage(road,0,snowY,road.naturalWidth,snowH,0,710,width+1,134)}else c.drawImage(road,0,snowY,road.naturalWidth,snowH,x,710,width+1,134);c.restore()}
   const near=j.cameraX*1.08,cliffStart=Math.floor(near/width);
   for(let n=cliffStart;n<=cliffStart+1;n++){const x=n*width-near;c.save();if(n%2){c.translate(x+width,0);c.scale(-1,1);c.drawImage(road,0,road.naturalHeight*.48,road.naturalWidth,road.naturalHeight*.52,0,844,width+1,260)}else c.drawImage(road,0,road.naturalHeight*.48,road.naturalWidth,road.naturalHeight*.52,x,844,width+1,260);c.restore()}
  }
  // Small trail impressions belong to world space, so the party visibly leaves them behind.
  c.save();c.fillStyle='#5089a52b';const from=Math.max(j.worldX-j.distance,j.cameraX-30),to=Math.min(j.worldX-60,j.cameraX+880);
  for(let x=Math.ceil(from/32)*32;x<to;x+=32){const side=Math.floor(x/32)%2;c.beginPath();c.ellipse(x-j.cameraX,812+side*8,5,2.4,-.3,0,Math.PI*2);c.fill()}
  c.restore();
  // Low wind over the roadway; these strokes sit behind creatures.
  c.save();c.strokeStyle='#e8faff3a';c.lineWidth=2;for(let i=0;i<Math.round(2+2*quality);i++){const x=((i*273+time*38-j.cameraX*.7)%1000+1000)%1000-70,y=740+i*23;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+38,y-5,x+92,y+1);c.stroke()}c.restore();
  if(tension>0){const shade=c.createRadialGradient(455,670,150,455,670,500);shade.addColorStop(0,'#22133f00');shade.addColorStop(1,`rgba(38,18,66,${Math.min(.26,tension)})`);c.fillStyle=shade;c.fillRect(0,270,864,570)}
 }
}
