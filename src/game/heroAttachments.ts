import {frameGeometry} from './actorGeometry';

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

export interface ActorAttachments {wings:HTMLImageElement;reducedMotion?:boolean}

export function wingAttachment(id:string,frame:number,height:number,fallback=false){
 const sockets=backSockets[id];if(!sockets)return null;
 const g=frameGeometry(id,frame,0,0,height,false,fallback);
 const socket=fallback?[g.width/g.scale*.44,g.height/g.scale*.52,0] as const:sockets[frame];
 return {x:g.x+socket[0]*g.scale,y:g.y+socket[1]*g.scale,angle:socket[2],span:height*1.05};
}

/** Both halves hinge at the same point behind the torso. Flapping can never
 * move that joint. Draw inside the actor's translation, mirror and fade. */
export function drawAttachedWings(ctx:CanvasRenderingContext2D,id:string,frame:number,height:number,time:number,attachments:ActorAttachments|undefined,fallback=false){
 const img=attachments?.wings;if(!img?.complete||!img.naturalWidth)return;
 const socket=wingAttachment(id,frame,height,fallback);if(!socket)return;
 const half=img.naturalWidth/2,rootY=img.naturalHeight*(124/220);
 const scale=socket.span/img.naturalWidth;
 const flap=attachments?.reducedMotion?0:Math.sin(time*5)*.09;
 ctx.save();ctx.translate(socket.x,socket.y);ctx.rotate(socket.angle);
 for(const sign of [1,-1]){
  ctx.save();ctx.rotate(sign*flap);
  // The far wing is foreshortened; the broad near wing extends behind the back.
  ctx.scale(scale*(sign===1?.62:1),scale);
  ctx.drawImage(img,sign<0?0:half,0,half,img.naturalHeight,sign<0?-half:0,-rootY,half,img.naturalHeight);
  ctx.restore();
 }
 ctx.restore();
}
