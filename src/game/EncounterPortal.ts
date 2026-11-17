/** In-world enemy gateway: projected at the real encounter location, never an extra UI button.
 * The actual encounter and enemies are owned by Battle; this draws only their arrival marker.
 * Reduced-motion callers pass time=0; alpha fades after the encounter starts.
 */
export type PortalKind='north'|'realm'|'boss';
type C=CanvasRenderingContext2D;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
export function drawEncounterPortal(c:C,x:number,groundY:number,time:number,kind:PortalKind,alpha=1){
 if(x< -180||x>1050||alpha<=0)return;
 const boss=kind==='boss',scale=boss?1.2:1,glow=kind==='north'?'#74eaff':kind==='realm'?'#a67aff':'#ffbc63';
 const inner=kind==='north'?'#147ba9':kind==='realm'?'#5920b9':'#a43a7a';
 c.save();c.globalAlpha*=clamp(alpha);c.translate(x,groundY);c.scale(scale,scale);
 const floor=c.createRadialGradient(0,-2,6,0,-2,130);floor.addColorStop(0,glow+'80');floor.addColorStop(1,glow+'00');
 c.fillStyle=floor;c.beginPath();c.ellipse(0,0,133,24,0,0,Math.PI*2);c.fill();
 // Carved stone threshold. Neither the frame nor the magic surface extends below the feet.
 c.beginPath();c.moveTo(-72,-4);c.lineTo(-72,-138);c.bezierCurveTo(-72,-218,-38,-241,0,-245);
 c.bezierCurveTo(38,-241,72,-218,72,-138);c.lineTo(72,-4);c.closePath();
 const edge=c.createLinearGradient(-100,-215,100,-10);edge.addColorStop(0,'#293d52');edge.addColorStop(.43,'#8093a1');edge.addColorStop(.74,'#2b3048');edge.addColorStop(1,'#151a2b');
 c.fillStyle=edge;c.fill();c.strokeStyle='#b79a66';c.lineWidth=6;c.stroke();
 // Portal interior, clipped to its arched opening.
 c.save();c.beginPath();c.moveTo(-54,-7);c.lineTo(-54,-139);c.bezierCurveTo(-54,-189,-31,-224,0,-226);
 c.bezierCurveTo(31,-224,54,-189,54,-139);c.lineTo(54,-7);c.closePath();c.clip();
 const mag=c.createRadialGradient(0,-125,7,0,-126,116);mag.addColorStop(0,'#e0f9ff');mag.addColorStop(.14,glow);mag.addColorStop(.5,inner);mag.addColorStop(1,'#080b27');
 c.fillStyle=mag;c.fillRect(-65,-235,130,245);
 c.save();c.translate(0,-122);c.rotate(time*.45);
 for(let i=0;i<5;i++){c.beginPath();c.ellipse(0,0,14+i*13,31+i*13,i*.55,0,Math.PI*1.55);c.strokeStyle=i%2?'#e7d6ff90':glow+'b5';c.lineWidth=i===0?5:2.5;c.stroke();}
 c.restore();
 for(let i=0;i<11;i++){const px=Math.sin(i*11.3+time*(i%3+1))*(13+i*3.5),py=-14-((i*61+time*(15+i%5))%215);
 c.fillStyle=i%2?glow:'#efdbff';c.globalAlpha=.3+(i%3)*.2;c.beginPath();c.arc(px,py,1.8+i%3,0,Math.PI*2);c.fill()}c.restore();
 // Twelve engraved rune-stones, integrated into the frame rather than floating above the road.
 c.save();c.strokeStyle='#d8b97a';c.fillStyle='#e7c989';c.lineWidth=2;
 for(let i=0;i<12;i++){const a=Math.PI+(i/11)*Math.PI,px=Math.cos(a)*67,py=-135+Math.sin(a)*95;
 c.save();c.translate(px,py);c.rotate(a+Math.PI/2);c.beginPath();c.moveTo(-5,-3);c.lineTo(0,-9);c.lineTo(5,-3);c.lineTo(0,4);c.closePath();c.stroke();c.restore();}
 c.restore();
 // Stones are attached to the ground on both sides, not hovering over actors.
 for(const side of [-1,1]){c.fillStyle='#3c485a';c.strokeStyle='#b19869';c.lineWidth=2;c.beginPath();c.moveTo(side*62,-35);c.lineTo(side*88,-41);c.lineTo(side*102,-8);c.lineTo(side*58,1);c.closePath();c.fill();c.stroke();}
 c.restore();
}
