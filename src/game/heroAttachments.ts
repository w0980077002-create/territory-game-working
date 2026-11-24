import {frameGeometry} from './actorGeometry';
import type {WeaponAura} from './weaponAura';

type Socket = readonly [number,number,number];
/** Upper-back sockets in each cropped source frame, including airborne strides.
 * The angle follows the torso, rather than the ground or the helmet. */
export const backSockets:Record<string,readonly Socket[]>={
 winged_helmet_warrior:[[62,94,0],[60,93,.04],[65,94,-.04],[83,116,.22],[77,96,.15],[89,92,.28],[90,94,-.18],[102,57,1.2]],
 whitebeard_mage:[[81,80,-.05],[82,83,.08],[78,78,-.03],[76,84,-.12],[77,78,.06],[75,59,.38],[78,77,-.2],[110,42,1.45]],
 strongman_boulder:[[75,91,-.05],[73,90,.03],[73,93,-.04],[77,94,.04],[75,96,.08],[77,96,.15],[92,95,-.2],[113,105,1.05]],
 'winged_helmet_warrior:run':[[76,126,.14],[79,126,.1],[76,125,.16],[81,117,.18],[77,126,.12],[74,127,.14],[78,126,.1],[82,126,.08]],
 'whitebeard_mage:run':[[125,106,.1],[128,107,.1],[129,105,.12],[122,100,.16],[125,110,.08],[125,108,.1],[125,104,.14],[128,99,.16]],
 'strongman_boulder:run':[[77,102,.1],[80,104,.08],[77,102,.12],[82,98,.14],[85,104,.08],[80,106,.08],[80,100,.12],[87,94,.16]],
};

/** What the body is doing right now; drives the wing rhythm only (purely cosmetic). */
export interface WingMotion {clock:number;walking?:boolean;attack?:number;hurt?:number;death?:number;victory?:boolean}
export type WingArt=HTMLImageElement|HTMLCanvasElement;
const artSize=(a:WingArt)=>'naturalWidth' in a?(a.complete?[a.naturalWidth,a.naturalHeight]:[0,0]):[a.width,a.height];
export interface ActorAttachments {wings?:WingArt;reducedMotion?:boolean;motion?:WingMotion;weapon?:WeaponAura}

export function wingAttachment(id:string,frame:number,height:number,fallback=false){
 const sockets=backSockets[id];if(!sockets)return null;
 const g=frameGeometry(id,frame,0,0,height,false,fallback);
 const socket=fallback?[g.width/g.scale*.44,g.height/g.scale*.52,0] as const:sockets[frame];
 return {x:g.x+socket[0]*g.scale,y:g.y+socket[1]*g.scale,angle:socket[2],span:height*1.05};
}

/** Wing pose in radians: shoulder sweep, extra lag of the outer feathers and depth squash.
 * Idle breathes slowly, travel beats faster, a strike gives one strong downbeat,
 * a hit folds the wings in, victory spreads them wide and a fall lets them droop. */
export function wingPose(motion:WingMotion|undefined,time:number,reduced=false){
 if(reduced)return {shoulder:0,tip:0,squash:1};
 const m=motion??{clock:time};
 const t=m.clock;
 if((m.death??0)>0){const d=Math.min(1,(m.death??0)*2);return {shoulder:-.32*d,tip:-.18*d,squash:1}}
 let rate=1.7,amp=.075;
 if(m.walking){rate=3.4;amp=.15}
 if(m.victory){rate=4.2;amp=.2}
 const phase=t*rate*Math.PI*2;
 let shoulder=Math.sin(phase)*amp;
 // Outer feathers trail the shoulder, so they keep bending after the arm stops.
 let tip=Math.sin(phase-.9)*amp*.8;
 const attack=m.attack??0;
 if(attack>0){const k=Math.sin(Math.PI*Math.min(1,attack/.7));shoulder+=-.34*k;tip+=.22*k}
 const hurt=m.hurt??0;
 if(hurt>0){const k=Math.min(1,hurt*3);shoulder=shoulder*(1-k)+.22*k;tip=tip*(1-k)+.16*k}
 if(m.victory)shoulder-=.12;
 // Down-stroke (negative shoulder) flattens the membrane a little toward the viewer.
 const squash=1-Math.max(0,-shoulder)*.22;
 return {shoulder,tip,squash};
}

/** Source split: the inner membrane hinges at the back; the outer feathers hinge at the wing elbow. */
const SPLIT=.42,ELBOW_Y=58/220;

/** Both halves hinge at the same point behind the torso. Flapping can never
 * move that joint. Draw inside the actor's translation, mirror and fade. */
export function drawAttachedWings(ctx:CanvasRenderingContext2D,id:string,frame:number,height:number,time:number,attachments:ActorAttachments|undefined,fallback=false){
 const img=attachments?.wings;if(!attachments||!img)return;const [iw,ih]=artSize(img);if(!iw)return;
 const socket=wingAttachment(id,frame,height,fallback);if(!socket)return;
 const half=iw/2,rootY=ih*(124/220);
 const scale=socket.span/iw;
 const pose=wingPose(attachments.motion,time,!!attachments.reducedMotion);
 const inner=Math.round(half*SPLIT),overlap=3,outer=half-inner+overlap;
 const elbowY=ih*ELBOW_Y-rootY;
 ctx.save();ctx.translate(socket.x,socket.y);ctx.rotate(socket.angle);
 for(const sign of [1,-1]){
  ctx.save();
  // The far wing lags a hair behind the near one, as two real wings never mirror perfectly.
  const lag=sign===1?.88:1;
  ctx.rotate(sign*pose.shoulder*lag);
  // The far wing is foreshortened; the broad near wing extends behind the back.
  ctx.scale(scale*(sign===1?.62:1),scale*pose.squash);
  // Inner membrane: its root column stays exactly on the back socket.
  const innerSx=sign<0?half-inner:half;
  ctx.drawImage(img,innerSx,0,inner,ih,sign<0?-inner:0,-rootY,inner,ih);
  // Outer feathers: rotate around the elbow for a soft, lagging wave.
  ctx.translate(sign*(inner-overlap),elbowY);ctx.rotate(sign*pose.tip*lag);ctx.translate(0,-elbowY);
  const outerSx=sign<0?0:half+inner-overlap;
  ctx.drawImage(img,outerSx,0,outer,ih,sign<0?-outer:0,-rootY,outer,ih);
  ctx.restore();
 }
 ctx.restore();
}
