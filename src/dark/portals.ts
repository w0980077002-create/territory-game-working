import type {Portal} from './realm';
/** World-space feet and hit bounds, shared with the accessible HTML targets. */
export const PORTALS={firstX:470,spacing:245,feetY:782,top:550,width:200,height:280};
export const portalColors=['#bd9bff','#79def4','#ffc284'] as const;
export function portalAt(pair:readonly Portal[],x:number,y:number){
 if(y<PORTALS.top||y>PORTALS.top+PORTALS.height)return undefined;
 return pair.find((_,i)=>Math.abs(x-(PORTALS.firstX+i*PORTALS.spacing))<=PORTALS.width/2);
}
/** Stone arches, with the gate light reflected on the path at their feet. */
export function drawRealmPortals(c:CanvasRenderingContext2D,pair:readonly Portal[],clock:number,biomes:readonly string[],reduced=false){
 const time=reduced?0:clock;
 pair.forEach((portal,i)=>{
  const x=PORTALS.firstX+i*PORTALS.spacing,y=PORTALS.feetY,color=portalColors[portal.biome]??portalColors[0];
  c.save();c.translate(x,y);
  c.save();c.scale(1,.24);
  const reflection=c.createRadialGradient(0,0,6,0,0,102);
  reflection.addColorStop(0,color+'aa');reflection.addColorStop(.53,color+'48');reflection.addColorStop(1,color+'00');
  c.fillStyle=reflection;c.fillRect(-102,-102,204,204);c.restore();
  c.fillStyle='#080b1799';c.beginPath();c.ellipse(0,0,77,12,0,0,Math.PI*2);c.fill();

  const shape=()=>{c.beginPath();c.moveTo(-56,-7);c.lineTo(-58,-108);c.ellipse(0,-105,58,77,0,Math.PI,2*Math.PI);c.lineTo(56,-7);c.closePath()};
  const light=c.createRadialGradient(0,-86,0,0,-86,111);
  light.addColorStop(0,color+'cb');light.addColorStop(.51,color+'54');light.addColorStop(1,'#110d27');
  shape();c.fillStyle=light;c.fill();
  c.save();c.clip();
  for(let j=0;j<5;j++){
   const drift=j/5+(time*.36)%1,alpha=Math.sin(drift%1*Math.PI);
   c.globalAlpha=alpha*.48;c.strokeStyle=color;c.lineWidth=2.6;c.beginPath();
   c.ellipse(Math.sin(j+time*.9)*15,-9-(drift%1)*165,54,24,-.23,0,Math.PI*1.3);c.stroke();
  }
  c.restore();
  shape();c.strokeStyle='#171726';c.lineWidth=24;c.stroke();
  c.strokeStyle='#53506b';c.lineWidth=15;c.stroke();
  c.strokeStyle=color+'d9';c.lineWidth=3;c.stroke();
  for(let j=0;j<7;j++){
   const angle=Math.PI+j*Math.PI/6,px=Math.cos(angle)*67,py=-105+Math.sin(angle)*87;
   c.save();c.translate(px,py);c.rotate(angle+Math.PI/2);c.fillStyle='#43445c';c.strokeStyle='#9a93ad';
   c.lineWidth=1.6;c.beginPath();c.moveTo(-11,-10);c.lineTo(11,-9);c.lineTo(9,10);c.lineTo(-9,9);c.closePath();c.fill();c.stroke();c.restore();
  }
  for(const px of [-61,61]){c.fillStyle='#373447';c.fillRect(px-16,-13,32,14);c.fillStyle=color+'90';c.fillRect(px-13,-13,26,2)}
  c.textAlign='center';c.lineJoin='round';c.lineWidth=5;c.strokeStyle='#111423';c.font='bold 29px sans-serif';c.fillStyle='#ffe3a2';
  c.strokeText('★'.repeat(portal.stars),0,-210);c.fillText('★'.repeat(portal.stars),0,-210);
  c.font='bold 22px sans-serif';c.fillStyle='#fff4da';
  c.strokeText(biomes[portal.biome],0,-168);c.fillText(biomes[portal.biome],0,-168);
  c.font='bold 23px sans-serif';c.fillStyle=color;
  c.strokeText(`${portal.count} врагов`,0,-133);c.fillText(`${portal.count} врагов`,0,-133);c.restore();
 });
}
