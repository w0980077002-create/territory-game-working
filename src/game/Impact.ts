import {legacyBodyHeight,poseFrame} from './actorGeometry';
import type {Projectile} from '../core/types';
export interface Point {x:number;y:number}
// Registered weapon tips in the approved atlas, relative to each pose's foot pivot.
const swordTips:[[number,number],[number,number],[number,number],[number,number],[number,number],[number,number],[number,number],[number,number]]=[[.54,-.83],[.50,-.70],[.54,-.83],[.45,-.94],[.88,-.60],[.54,-.09],[.38,-.67],[.48,-.05]];
export function swordTip(x:number,ground:number,attack:number,hurt=0):Point {const h=legacyBodyHeight('winged_helmet_warrior',214),p=swordTips[poseFrame({attack,hurt})],lunge=attack>.2?Math.sin(attack*5)*20:0;return {x:x+lunge+p[0]*h,y:ground+p[1]*h}}
export function swordCanReach(heroX:number,ground:number,target:Point){return Math.hypot(target.x-(heroX+42),target.y-(ground-105))<=154}
export function reactionOffset(remaining:number,strength:number,reduced=false){const t=Math.max(0,Math.min(1,remaining/.30));return reduced?0:Math.sin((1-t)*Math.PI)*Math.min(8,strength)}
export function projectilePoint(b:Projectile,start:Point,end:Point,t=b.t/b.duration):Point {const f=Math.max(0,Math.min(1,t));return {x:start.x+(end.x-start.x)*f,y:start.y+(end.y-start.y)*f-Math.sin(Math.PI*f)*(b.kind==='arrow'?48:b.kind==='sword-wave'?0:16)}}
/** Use one screen-space path for every projectile and its registered contact point. */
export function projectileVisualPath(b:Projectile,start:Point,end:Point){
 const t=Math.max(0,Math.min(1,b.t/b.duration));
 return {head:projectilePoint(b,start,end,t),tail:projectilePoint(b,start,end,Math.max(0,t-.16)),angle:Math.atan2(end.y-start.y,end.x-start.x)};
}
export function drawSwordWave(c:CanvasRenderingContext2D,b:Projectile,start:Point,end:Point,quality:number){
 const t=Math.min(1,b.t/b.duration),head=projectilePoint(b,start,end),tail=projectilePoint(b,start,end,Math.max(0,t-.30));const angle=Math.atan2(end.y-start.y,end.x-start.x),color=b.crit?'#ffe4a0':'#8eefff';
 c.save();const trail=c.createLinearGradient(tail.x,tail.y,head.x,head.y);trail.addColorStop(0,'#88ddff00');trail.addColorStop(.55,b.crit?'#ffc76699':'#68d9ff99');trail.addColorStop(1,color);c.strokeStyle=trail;c.lineWidth=b.crit?15:11;c.lineCap='round';c.beginPath();c.moveTo(tail.x,tail.y);const length=Math.hypot(head.x-tail.x,head.y-tail.y);for(let n=1;n<=7;n++){const f=n/7,j=n===7?0:Math.sin(n*2.8+b.t*31)*(b.crit?5:3);c.lineTo(tail.x+(head.x-tail.x)*f-Math.sin(angle)*j,tail.y+(head.y-tail.y)*f+Math.cos(angle)*j)}c.strokeStyle='#16479499';c.lineWidth=b.crit?21:17;c.stroke();c.strokeStyle=trail;c.lineWidth=b.crit?15:11;c.stroke();
 c.lineWidth=2.5;c.strokeStyle='#f2ffff';c.stroke();c.translate(head.x,head.y);c.rotate(angle);c.shadowColor=color;c.shadowBlur=quality>.6?16:0;
 c.strokeStyle='#24558faa';c.lineWidth=b.crit?12:10;c.beginPath();c.moveTo(-7,-23);c.quadraticCurveTo(24,0,-7,23);c.stroke();c.strokeStyle=color;c.lineWidth=b.crit?8:6;c.stroke();c.strokeStyle='#fff';c.lineWidth=2;c.stroke();c.shadowBlur=0;
 for(let i=0;i<(quality<.6?2:4);i++){const x=-10-i*length*.12,y=Math.sin(b.t*25+i*2)*9;c.fillStyle=i%2?'#fff':color;c.fillRect(x,y,3,3)}c.restore();
}
