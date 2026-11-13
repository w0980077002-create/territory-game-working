/**
 * Biome dressing for the saga regions. Cosmetic only: everything derives from the simulation clock and camera,
 * so a paused game is a frozen picture. Region 1 keeps the owner-approved look untouched (mode 'none').
 * Layers: colour grade over the original painted/parallax scenery → sparse weather in front.
 */
import type {Region,HazardId} from '../saga/regions';
import {hazards} from '../saga/regions';
const hash=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v)};
/** After the painted scenery, before props and actors. */
export function paintBiomeBack(c:CanvasRenderingContext2D,region:Region,_time:number,_cameraX:number,_quality:number,_reduced:boolean){
 // Keep the owner's approved painted scenery: region-wide colour washes and
 // dark veils made the original art dull, rather than supplying a true new biome.
 const look=region.look;
 if(look.mode==='none'||look.mode==='color')return;
 c.save();c.globalCompositeOperation=look.mode;c.globalAlpha=look.gradeAlpha;c.fillStyle=look.grade;c.fillRect(0,0,864,940);c.restore();
 if(look.veil){c.fillStyle=look.veil;c.fillRect(0,0,864,940)}
 // Regional identity comes from the grade, weather and gameplay telegraphs.
 // The authored snowy architecture already supplies buildings, bridges and terrain.
 // Procedural ships/piers, palisades, polygon pines and lava construction lines
 // had no matching terrain plane and covered that artwork at unrelated camera depths.

}
/** In front of the actors: sparse weather so the fighters stay readable. */
export function paintBiomeFront(c:CanvasRenderingContext2D,region:Region,time:number,cameraX:number,quality:number,reduced:boolean){
 const kind=region.look.particles;if(kind==='snow'||reduced)return;c.save();
 if(kind==='rain'){c.strokeStyle='#cfeaff';c.lineWidth=1.6;for(let i=0;i<Math.round(46*quality);i++){const x=((i*71+time*(260+i%5*30)-cameraX*.9)%940+940)%940-40,y=(i*137+time*(820+i%7*60))%880;c.globalAlpha=.22+(i%4)*.07;c.beginPath();c.moveTo(x,y);c.lineTo(x+9,y-30);c.stroke()}}
 else if(kind==='spores'){for(let i=0;i<Math.round(22*quality);i++){const age=(time*.07+i*.045)%1,x=((i*97-cameraX*.6+Math.sin(time*.7+i)*30)%900+900)%900,y=820-age*520;c.globalAlpha=Math.sin(age*Math.PI)*.75;c.fillStyle=i%3?'#a8ffc6':'#d9b8ff';c.beginPath();c.arc(x,y,1.8+(i%3),0,Math.PI*2);c.fill()}}
 else if(kind==='dust'){for(let i=0;i<Math.round(24*quality);i++){const x=((i*83+time*(26+i%4*8)-cameraX*.8)%900+900)%900,y=(i*61+time*(70+i%6*22))%850;c.globalAlpha=.25+(i%3)*.1;c.fillStyle=i%5?'#e6cfae':'#8a705c';c.fillRect(x,y,2+(i%3),2+(i%2))}}
 else if(kind==='banners'){for(let i=0;i<Math.round(18*quality);i++){const age=(time*.05+i*.055)%1,x=((i*119-cameraX*.5+Math.sin(time*.5+i)*40)%900+900)%900,y=300+hash(i)*480+Math.sin(time+i)*14;c.globalAlpha=Math.sin(age*Math.PI)*.55;c.fillStyle='#ffe6a8';c.beginPath();c.arc(x,y,1.6+(i%2),0,Math.PI*2);c.fill()}}
 else if(kind==='embers'){for(let i=0;i<Math.round(30*quality);i++){const age=(time*.16+i*.033)%1,x=((i*131-cameraX*.7+Math.sin(time*1.3+i)*24+age*60)%900+900)%900,y=846-age*560;c.globalAlpha=(1-age)*.85;c.fillStyle=i%4?'#ff9a4d':'#ffe08a';c.fillRect(x,y,3,3)}c.globalAlpha=.08;c.fillStyle='#ff5a1a';c.fillRect(0,640,864,206)}
 c.restore();
}
/** Telegraph of the region hazard around the hero: a filling ring, then a short flash on the strike. */
export function paintHazard(c:CanvasRenderingContext2D,id:HazardId,warn:number,flash:number,heroX:number,time:number,curse:number){
 const h=hazards[id];c.save();
 if(warn>=0){c.save();c.translate(heroX,800);c.scale(1,.2);c.globalAlpha=.25+warn*.3;c.fillStyle=h.color+'33';c.beginPath();c.arc(0,0,118,0,Math.PI*2);c.fill();c.strokeStyle=h.color;c.lineWidth=7;c.setLineDash([16,10]);c.lineDashOffset=-time*60;c.beginPath();c.arc(0,0,118,0,Math.PI*2);c.stroke();c.setLineDash([]);c.globalAlpha=.9;c.lineWidth=11;c.beginPath();c.arc(0,0,96,-Math.PI/2,-Math.PI/2+Math.PI*2*warn);c.stroke();c.restore();
  if(id==='storm'){const x=864-warn*(864-heroX-60);c.globalAlpha=.55;c.fillStyle='#bfe6ff';c.beginPath();c.moveTo(x,846);c.quadraticCurveTo(x-30,700-warn*60,x+70,690-warn*70);c.quadraticCurveTo(x+40,760,x+150,846);c.closePath();c.fill()}
  if(id==='rockfall')for(let n=0;n<5;n++){c.globalAlpha=.8;c.fillStyle='#7a6654';const x=heroX-60+n*95,y=180+warn*(430+n*14);c.beginPath();c.moveTo(x,y);c.lineTo(x+18,y+8);c.lineTo(x+12,y+26);c.lineTo(x-10,y+22);c.lineTo(x-16,y+6);c.closePath();c.fill()}
 }
 c.restore();c.save();
 if(flash>0){c.globalAlpha=flash*.5;c.fillStyle=h.color;c.fillRect(0,300,864,546)}
 if(curse>0){c.globalAlpha=1;c.font='900 24px system-ui';c.textAlign='center';for(let n=0;n<curse;n++){const a=time*1.5+n*Math.PI*2/3;c.fillStyle='#c59bff';c.strokeStyle='#26123f';c.lineWidth=4;const x=heroX+Math.cos(a)*56,y=690+Math.sin(a)*18;c.strokeText('ᛉ',x,y);c.fillText('ᛉ',x,y)}}
 c.restore();
}
