import {sceneImage,sceneImageReady} from '../game/sceneImages';
import type {Portal} from './realm';

/** Shared canvas and touch coordinates. The left lane stays clear for the party. */
export const PORTALS={firstX:447,spacing:207,feetY:817,top:474,width:196,height:348};
export const portalColors=['#bd9bff','#79def4','#ffc284'] as const;
const depthColors=['#36204c','#153b4f','#4a271f'] as const;
let arch:HTMLImageElement|undefined;

export function portalAt(pair:readonly Portal[],x:number,y:number){
 if(y<PORTALS.top||y>PORTALS.top+PORTALS.height)return undefined;
 return pair.find((_,i)=>Math.abs(x-(PORTALS.firstX+i*PORTALS.spacing))<=PORTALS.width/2);
}

export function drawRealmPortals(c:CanvasRenderingContext2D,pair:readonly Portal[],clock:number,reduced=false){
 arch??=sceneImage('dark/portal');
 const time=reduced?0:clock;
 pair.forEach((portal,i)=>{
  const x=PORTALS.firstX+i*PORTALS.spacing,color=portalColors[portal.biome]??portalColors[0];
  const depth=depthColors[portal.biome]??depthColors[0];
  c.save();c.translate(x,PORTALS.feetY);
  c.save();c.scale(1,.23);
  const reflection=c.createRadialGradient(0,0,8,0,0,99);
  reflection.addColorStop(0,color+'a0');reflection.addColorStop(1,color+'00');
  c.fillStyle=reflection;c.fillRect(-99,-99,198,198);c.restore();

  // The portal image is a cutout. The moving light is painted inside its opening.
  c.save();c.beginPath();c.ellipse(1,-127,58,82,0,0,Math.PI*2);c.clip();
  const light=c.createRadialGradient(-10,-127,2,0,-128,85);
  light.addColorStop(0,'#fff4de');light.addColorStop(.15,color);
  light.addColorStop(.58,depth);light.addColorStop(.86,color);light.addColorStop(1,depth);
  c.fillStyle=light;c.fillRect(-65,-216,130,178);
  c.strokeStyle=color;
  for(let j=0;j<7;j++){
   const drift=(j/7+time*.29)%1;
   c.lineWidth=1+drift*3;c.globalAlpha=(1-drift)*.7;c.beginPath();
   c.ellipse(Math.sin(time+j)*5,-130,9+drift*54,15+drift*78,0,j*.8,j*.8+4.6);c.stroke();
  }
  c.restore();

  if(sceneImageReady(arch))c.drawImage(arch,-99,-242,198,242);
  else{
   c.strokeStyle='#58497a';c.lineWidth=13;c.beginPath();c.ellipse(1,-127,60,85,0,0,Math.PI*2);c.stroke();
  }
  if(!reduced){
   c.fillStyle=color;
   for(let j=0;j<7;j++){
    const life=(time*.4+j/7)%1;
    c.globalAlpha=Math.sin(life*Math.PI)*.85;c.beginPath();
    c.arc(Math.sin(j*2.7+time)*58,-20-life*190,1.7+j%2,0,Math.PI*2);c.fill();
   }
  }
  c.restore();
 });
}
