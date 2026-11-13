import textures from '../data/boss-textures.json';
import {frameGeometry, type Pose} from './actorGeometry';

export const bossTextures = textures as Record<string, {width:number;height:number}>;

/** Animate original artwork at its native aspect ratio. Rotations are fitted
 * inside the registered pose, so a cast/knockback cannot cross the HUD. All
 * samples come directly from the high-resolution texture, never a small cell
 * or an intermediate raster canvas. */
export function bossPose(id:string,height:number,p:Pose){
 const texture=bossTextures[id];if(!texture)return null;
 const dead=(p.death??0)>=.12;
 const box=frameGeometry(id,dead?7:0,0,0,height);
 const time=p.time??0,attack=p.attack??0,hurt=p.hurt??0,windup=p.windup??0;
 let angle=0,bob=0;
 if(dead)angle=-Math.PI/2;
 else if(hurt>0)angle=.065*Math.min(1,hurt/.12);
 else if(attack>0)angle=-.1*Math.sin(Math.PI*Math.min(1,attack/.7));
 else if(windup>0)angle=.035*Math.sin(time*7);
 else if(p.walking){angle=Math.sin(time*8)*.035;bob=(1-Math.cos(time*16))*height*.008;}
 else {angle=Math.sin(time*1.9)*.008;bob=(1-Math.cos(time*1.9))*height*.002;}
 const ca=Math.abs(Math.cos(angle)),sa=Math.abs(Math.sin(angle));
 const rotatedWidth=texture.width*ca+texture.height*sa;
 const rotatedHeight=texture.height*ca+texture.width*sa;
 // Leave space for breathing/steps without stretching either image axis.
 const scale=Math.min(box.width*.96/rotatedWidth,(box.height*.96-bob)/rotatedHeight);
 const width=texture.width*scale,h=texture.height*scale;
 return {x:box.x+box.width/2,y:box.y+box.height-bob-(h*ca+width*sa)/2,width,height:h,angle,box};
}

export function drawBoss(ctx:CanvasRenderingContext2D,img:HTMLImageElement,id:string,height:number,p:Pose){
 const pose=bossPose(id,height,p);if(!pose)return;
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 ctx.translate(pose.x,pose.y);ctx.rotate(pose.angle);
 ctx.drawImage(img,-pose.width/2,-pose.height/2,pose.width,pose.height);
}
