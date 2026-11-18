import type {Portal} from './realm';
/** World-space feet and hit bounds, shared with the accessible HTML targets. */
export const PORTALS={firstX:470,spacing:245,feetY:782,top:550,width:200,height:280};
export function portalAt(pair:readonly Portal[],x:number,y:number){
 if(y<PORTALS.top||y>PORTALS.top+PORTALS.height)return undefined;
 return pair.find((_,i)=>Math.abs(x-(PORTALS.firstX+i*PORTALS.spacing))<=PORTALS.width/2);
}
/** Original vector art: grounded stone rim, contact shadow and moving inner runes. */
export function drawRealmPortals(c:CanvasRenderingContext2D,pair:readonly Portal[],clock:number,biomes:readonly string[],reduced=false){
 const time=reduced?0:clock;
 pair.forEach((portal,i)=>{
  const x=PORTALS.firstX+i*PORTALS.spacing,y=PORTALS.feetY,color=['#9c81ff','#63d9ef','#ffbe72'][portal.biome];
  c.save();c.fillStyle='#05081699';c.beginPath();c.ellipse(x,y,85,17,0,0,Math.PI*2);c.fill();
  const light=c.createRadialGradient(x,y-95,4,x,y-95,95);light.addColorStop(0,color);light.addColorStop(1,'#15122a');
  c.fillStyle=light;c.strokeStyle='#5d536b';c.lineWidth=18;c.beginPath();c.ellipse(x,y-90,62,91,0,0,Math.PI*2);c.fill();c.stroke();
  c.strokeStyle=color;c.lineWidth=4;c.stroke();c.lineWidth=2;
  for(let j=0;j<6;j++){c.globalAlpha=.3+j*.08;c.beginPath();c.ellipse(x+Math.sin(time*2+j)*10,y-90,18+j*7,25+j*10,time*.4+j,0,Math.PI*1.6);c.stroke()}
  c.globalAlpha=1;c.font='bold 27px sans-serif';c.textAlign='center';c.fillStyle='#ffe3a2';c.fillText('★'.repeat(portal.stars),x,y-205);
  c.font='24px sans-serif';c.fillStyle='#fff';c.fillText(portal.label,x,y+38);c.font='20px sans-serif';c.fillText(biomes[portal.biome],x,y+64);c.restore();
 });
}
