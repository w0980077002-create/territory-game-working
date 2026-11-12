import registry from '../data/animation-frames.json';
export type Rect = [number,number,number,number];
export interface RegisteredFrame {rect:Rect;pivot:[number,number];bounds:Rect;bands:Rect[];source:Rect}
export interface AnimationClip {atlas:string;referenceHeight:number;legacyCellHeight:number;frames:RegisteredFrame[];fallback:{width:number;height:number;pivot:[number,number];referenceHeight:number;bounds:Rect;bands:Rect[]};envelope:Rect}
export const clips=registry as unknown as Record<string,AnimationClip>;
export interface Pose {walking?:boolean;attack?:number;hurt?:number;death?:number;windup?:number;victory?:boolean;time?:number}
export function poseFrame(p:Pose){if((p.death??0)>0)return 7;if(p.victory)return 3;if((p.hurt??0)>0)return 6;if((p.attack??0)>0)return p.attack!>.46?3:p.attack!>.22?4:5;if((p.windup??0)>0)return 3;if(p.walking)return 1+Math.floor((p.time??0)*8)%2;return 0}
export function legacyBodyHeight(id:string,cellHeight:number){const c=clips[id];return c?cellHeight*c.referenceHeight/c.legacyCellHeight:cellHeight}
export function frameGeometry(id:string,frame:number,x:number,y:number,height:number,flip=false,fallback=false){const c=clips[id];if(!c)throw Error(`Unregistered actor ${id}`);const f=c.frames[frame];const ref=fallback?c.fallback.referenceHeight:c.referenceHeight;const pivot=fallback?c.fallback.pivot:f.pivot;const width=fallback?c.fallback.width:f.rect[2],h=fallback?c.fallback.height:f.rect[3],scale=height/ref;return {x:x+(flip?pivot[0]-width:-pivot[0])*scale,y:y-pivot[1]*scale,width:width*scale,height:h*scale,scale,pivot,source:f.rect,bounds:[x+(flip?pivot[0]-width:-pivot[0])*scale,y-pivot[1]*scale,x+(flip?pivot[0]:width-pivot[0])*scale,y+(h-pivot[1])*scale] as Rect}}
export function localBands(id:string,flip=false):Rect[]{const c=clips[id];return [...c.frames.flatMap(f=>f.bands),...c.fallback.bands].map(b=>flip?[-b[2],b[1],-b[0],b[3]] as Rect:b)}
export function transformBand(b:Rect,x:number,y:number,height:number,left=0,right=0):Rect{return [x+b[0]*height+left,y+b[1]*height,x+b[2]*height+right,y+b[3]*height]}
export const intersects=(a:Rect,b:Rect,pad=0)=>a[0]<b[2]+pad&&a[2]>b[0]-pad&&a[1]<b[3]+pad&&a[3]>b[1]-pad;
export function enemyLunge(attack:number,ranged:boolean){return ranged?0:-28*Math.sin(Math.PI*Math.min(1,Math.max(0,attack/.7)))}
