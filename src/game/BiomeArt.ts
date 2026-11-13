/**
 * Biome dressing for the saga regions. Cosmetic only: everything derives from the simulation clock and camera,
 * so a paused game is a frozen picture. Region 1 keeps the owner-approved look untouched (mode 'none').
 * Layers: colour grade over the painted scenery → original vector set pieces with parallax → weather in front.
 */
import type {Region,HazardId} from '../saga/regions';
import {hazards} from '../saga/regions';
import {scenery} from './WorldArt';
const hash=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v)};
const INK='#14202e';
/** Repeats `paint(i, x)` along an endless parallax strip. */
function strip(cameraX:number,depth:number,period:number,paint:(i:number,x:number)=>void,pad=260){
 const shift=cameraX*depth,first=Math.floor((shift-pad)/period),last=Math.ceil((shift+864+pad)/period);
 for(let i=first;i<=last;i++)paint(i,i*period-shift+hash(i)*period*.35);
}
function longship(c:CanvasRenderingContext2D,x:number,y:number,s:number,time:number,seed:number,burning:boolean){
 const bob=Math.sin(time*1.1+seed*9)*3*s,tilt=Math.sin(time*.8+seed*5)*.025;c.save();c.translate(x,y+bob);c.rotate(tilt);c.scale(s,s);c.lineJoin='round';c.strokeStyle=INK;c.lineWidth=3;
 c.fillStyle='#3a2a22';c.beginPath();c.moveTo(-120,0);c.quadraticCurveTo(-138,-30,-150,-62);c.quadraticCurveTo(-118,-34,-96,-18);c.lineTo(96,-18);c.quadraticCurveTo(122,-36,150,-70);c.quadraticCurveTo(140,-28,118,0);c.closePath();c.fill();c.stroke();
 c.fillStyle='#57402f';c.fillRect(-98,-18,196,7);for(let n=0;n<6;n++){c.fillStyle=n%2?'#9c3b34':'#d8b765';c.beginPath();c.arc(-78+n*31,-10,10,0,Math.PI*2);c.fill();c.stroke()}
 c.strokeStyle='#2a1d17';c.lineWidth=6;c.beginPath();c.moveTo(0,-18);c.lineTo(0,-172);c.stroke();c.strokeStyle=INK;c.lineWidth=3;
 const belly=14+Math.sin(time*1.7+seed*3)*5;c.beginPath();c.moveTo(-70,-160);c.lineTo(70,-160);c.quadraticCurveTo(70+belly,-104,64,-52);c.lineTo(-64,-52);c.quadraticCurveTo(-70+belly,-104,-70,-160);c.closePath();c.fillStyle=burning?'#3d3037':'#cfc3a8';c.fill();c.stroke();
 c.save();c.clip();for(let n=0;n<5;n++){c.fillStyle=burning?'#231a20':'#8f3a35';c.fillRect(-70+n*32+belly*.5,-162,14,112)}c.restore();
 if(burning){for(let n=0;n<3;n++){const age=(time*.5+n*.33+seed)%1;c.globalAlpha=(1-age)*.75;c.fillStyle=n%2?'#ffb053':'#ff6a3a';c.beginPath();c.arc(-30+n*30+Math.sin(age*5)*8,-150-age*70,10*(1-age)+3,0,Math.PI*2);c.fill()}c.globalAlpha=1}
 c.restore();
}
function pine(c:CanvasRenderingContext2D,x:number,y:number,h:number,tone:string,rim:string){
 c.fillStyle=tone;c.beginPath();c.moveTo(x,y-h);for(let n=1;n<=4;n++){const w=h*.09+n*h*.075,py=y-h+n*h*.24;c.lineTo(x+w,py);c.lineTo(x+w*.45,py-h*.035)}c.lineTo(x+h*.05,y-h*.03);c.lineTo(x+h*.05,y);c.lineTo(x-h*.05,y);c.lineTo(x-h*.05,y-h*.03);for(let n=4;n>=1;n--){const w=h*.09+n*h*.075,py=y-h+n*h*.24;c.lineTo(x-w*.45,py-h*.035);c.lineTo(x-w,py)}c.closePath();c.fill();
 c.fillStyle=rim;c.beginPath();c.moveTo(x,y-h);c.lineTo(x+h*.16,y-h*.76);c.lineTo(x+h*.05,y-h*.79);c.lineTo(x+h*.24,y-h*.52);c.lineTo(x+h*.02,y-h*.6);c.closePath();c.fill();
}
function vexillum(c:CanvasRenderingContext2D,x:number,y:number,h:number,time:number,seed:number){
 const sway=Math.sin(time*2+seed*7)*4;c.save();c.strokeStyle=INK;c.lineWidth=3;c.lineJoin='round';c.strokeStyle='#4b3421';c.lineWidth=6;c.beginPath();c.moveTo(x,y);c.lineTo(x,y-h);c.stroke();c.strokeStyle=INK;c.lineWidth=2.5;
 c.fillStyle='#d6b25a';c.fillRect(x-h*.2,y-h,h*.4,h*.045);c.strokeRect(x-h*.2,y-h,h*.4,h*.045);
 c.fillStyle='#a8322e';c.beginPath();c.moveTo(x-h*.18,y-h*.95);c.lineTo(x+h*.18,y-h*.95);c.lineTo(x+h*.18+sway,y-h*.5);c.lineTo(x+sway*.6,y-h*.42);c.lineTo(x-h*.18+sway,y-h*.5);c.closePath();c.fill();c.stroke();
 c.fillStyle='#f0cf74';c.beginPath();c.arc(x+sway*.4,y-h*.72,h*.07,0,Math.PI*2);c.fill();c.stroke();
 c.beginPath();c.moveTo(x-h*.14,y-h*1.02);c.lineTo(x,y-h*1.13);c.lineTo(x+h*.14,y-h*1.02);c.closePath();c.fill();c.stroke();c.restore();
}
function palisade(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,tower:boolean){
 c.fillStyle='#4a3626';c.strokeStyle=INK;c.lineWidth=2.5;const stake=18;for(let n=0;n<w/stake;n++){const sx=x+n*stake,top=y-h-(n%3)*5;c.beginPath();c.moveTo(sx,y);c.lineTo(sx,top);c.lineTo(sx+stake/2,top-13);c.lineTo(sx+stake,top);c.lineTo(sx+stake,y);c.closePath();c.fillStyle=n%2?'#553e2b':'#4a3626';c.fill();c.stroke()}
 if(tower){c.fillStyle='#5d4530';c.fillRect(x+w*.4,y-h*2.1,w*.22,h*2.1);c.strokeRect(x+w*.4,y-h*2.1,w*.22,h*2.1);c.fillStyle='#7a3029';c.beginPath();c.moveTo(x+w*.36,y-h*2.1);c.lineTo(x+w*.51,y-h*2.65);c.lineTo(x+w*.66,y-h*2.1);c.closePath();c.fill();c.stroke();c.fillStyle='#1d1410';c.fillRect(x+w*.47,y-h*1.8,w*.08,h*.4)}
}
/** After the painted scenery, before props and actors. */
export function paintBiomeBack(c:CanvasRenderingContext2D,region:Region,time:number,cameraX:number,quality:number,reduced:boolean){
 const look=region.look;if(look.mode==='none')return;const t=reduced?0:time;
 c.save();c.globalCompositeOperation=look.mode;c.globalAlpha=look.gradeAlpha;c.fillStyle=look.grade;c.fillRect(0,0,864,940);c.restore();
 if(look.veil){c.fillStyle=look.veil;c.fillRect(0,0,864,940)}
 c.save();
 if(region.id==='harbor'){
  // Lightning far over the sea, then the fleet riding the swell behind the quay.
  const k=Math.floor(time/7),f=time-k*7;if(!reduced&&hash(k)>.45&&f<.35){c.globalAlpha=(1-f/.35)*.28;c.fillStyle='#dff3ff';c.fillRect(0,0,864,560);c.globalAlpha=1}
  const sea=c.createLinearGradient(0,612,0,712);sea.addColorStop(0,'#1d4257e6');sea.addColorStop(1,'#0f2a3df2');c.fillStyle=sea;c.fillRect(0,622,864,90);
  c.strokeStyle='#9cc9dd55';c.lineWidth=2;for(let row=0;row<4;row++){c.beginPath();for(let x=-20;x<=884;x+=22)c.lineTo(x,640+row*19+Math.sin(x*.03+t*(1.2+row*.3)+row*2-cameraX*.004)*4);c.stroke()}
  strip(cameraX,.42,620,(i,x)=>longship(c,x,676,.62+hash(i+4)*.2,t,hash(i),hash(i+9)>.62));
  strip(cameraX,.8,540,(i,x)=>{c.fillStyle='#2c2119';c.strokeStyle=INK;c.lineWidth=3;c.fillRect(x,690,14,34);c.strokeRect(x,690,14,34);c.fillRect(x+150,696,14,28);c.strokeRect(x+150,696,14,28);c.fillStyle='#4a382a';c.fillRect(x-14,704,196,10);c.strokeRect(x-14,704,196,10)});
 }else if(region.id==='forest'){
  strip(cameraX,.3,150,(i,x)=>pine(c,x,700,210+hash(i)*110,'#0f2a2c','#17403a'));
  strip(cameraX,.5,210,(i,x)=>pine(c,x,712,250+hash(i+3)*120,'#143830','#226149'));
  if(!reduced){c.globalCompositeOperation='lighter';for(let n=0;n<Math.round(9*quality);n++){const x=((n*113-cameraX*.5+Math.sin(t*.6+n)*26)%900+900)%900,y=520+hash(n)*170+Math.sin(t*.9+n*2)*12,r=20+hash(n+2)*14,g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,n%3?'#8dffb055':'#c59bff66');g.addColorStop(1,'#8dffb000');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2)}c.globalCompositeOperation='source-over'}
  strip(cameraX,.86,470,(i,x)=>{const kind=hash(i+1);if(kind<.4)scenery(c,'rune',x,716,118);else if(kind<.75)scenery(c,'tree',x,718,150);else scenery(c,'mushrooms',x,716,84)});
 }else if(region.id==='peaks'){
  // The approved fortress painting is the landscape. Never cover it with
  // temporary flat-shaded canvas polygons or construction-line overlays.
  // Unique painted/parallax mountain assets can be added as a separate art pass.
 }else if(region.id==='limes'){
  const sun=c.createRadialGradient(650,250,10,650,250,420);sun.addColorStop(0,'#ffe0a055');sun.addColorStop(1,'#ffe0a000');c.fillStyle=sun;c.fillRect(0,0,864,700);
  strip(cameraX,.5,560,(i,x)=>palisade(c,x,714,330,62,hash(i)>.35),420);
  strip(cameraX,.78,330,(i,x)=>vexillum(c,x,716,120+hash(i)*36,t,hash(i+2)));
 }else if(region.id==='ember'){
  const sky=c.createLinearGradient(0,0,0,640);sky.addColorStop(0,'#3b0a0acc');sky.addColorStop(.6,'#a6341a55');sky.addColorStop(1,'#ff8a3a22');c.fillStyle=sky;c.fillRect(0,0,864,640);
  // Atmospheric heat glow remains behind combat, but temporary geometric
  // cliffs are deliberately removed until authored volcanic scenery exists.
  strip(cameraX,.2,900,(i,x)=>{const pulse=.5+.5*Math.sin(t*1.4+i);const g=c.createRadialGradient(x+20,290,0,x+20,290,120);g.addColorStop(0,`rgba(255,150,60,${.35+pulse*.25})`);g.addColorStop(1,'#ff6a2000');c.fillStyle=g;c.fillRect(x-100,170,240,240)},520);
  // Lava seams breathing under the road.
  c.globalCompositeOperation='lighter';strip(cameraX,1,230,(i,x)=>{const pulse=.45+.3*Math.sin(t*2+i*1.7);c.strokeStyle=`rgba(255,${120+Math.round(pulse*80)},50,${pulse})`;c.lineWidth=4;c.beginPath();c.moveTo(x,742+hash(i)*60);c.lineTo(x+34,752+hash(i+1)*50);c.lineTo(x+70,738+hash(i+2)*64);c.lineTo(x+118,756+hash(i+3)*40);c.stroke()},140);c.globalCompositeOperation='source-over';
 }
 c.restore();
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
