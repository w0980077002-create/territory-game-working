/** World space is independent of CSS size, battle balance and the fixed HUD. */
export interface WorldActor {worldX:number;worldY:number;speed?:number;stride?:number}
export interface JourneyState extends WorldActor {
 version:1;cameraX:number;velocity:number;distance:number;encounterIndex:number;targetX:number;
 goose:WorldActor;dog:WorldActor;
}
export const SITE_SPACING=1400;
export const FIRST_SITE=1050;
export const FOLLOW_X=375;
export const districts=['Драконьи ворота','Торговый посад','Мост над ущельем','Рунная роща','Цитадель Бездны'] as const;
export const siteX=(index:number)=>FIRST_SITE+Math.max(0,index)*SITE_SPACING;
export function newJourney(stage=1,wave=1,arrived=false):JourneyState{
 const index=Math.max(0,(stage-1)*5+wave-1),targetX=siteX(index),worldX=arrived?targetX:Math.max(FOLLOW_X,targetX-675),cameraX=Math.max(0,worldX-FOLLOW_X);
 return {version:1,worldX,worldY:805,cameraX,velocity:0,distance:0,encounterIndex:index,targetX,goose:{worldX:cameraX+213,worldY:588,speed:0},dog:{worldX:cameraX+205,worldY:801,speed:0}};
}
export function validJourney(value:unknown):value is JourneyState{
 if(!value||typeof value!=='object')return false;const j=value as JourneyState;
 const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<1e12;
 return j.version===1&&[j.worldX,j.worldY,j.cameraX,j.velocity,j.distance,j.encounterIndex,j.targetX,j.goose?.worldX,j.goose?.worldY,j.dog?.worldX,j.dog?.worldY].every(finite)&&Number.isInteger(j.encounterIndex)&&j.encounterIndex>=0&&j.cameraX>=0&&j.worldX>=0&&j.targetX>=j.worldX&&j.velocity>=0&&j.velocity<=220&&[j.goose,j.dog].every(a=>[a.speed,a.stride].every(v=>v===undefined||finite(v)&&v>=0));
}
export function nextSite(j:JourneyState){j.encounterIndex++;j.targetX=siteX(j.encounterIndex);j.velocity=0;}
const toward=(value:number,target:number,amount:number)=>value<target?Math.min(target,value+amount):Math.max(target,value-amount);
/** Semi-implicit acceleration and stopping distance give continuous starts and braking. */
export function stepJourney(j:JourneyState,dt:number){
 if(!(dt>0)||!Number.isFinite(dt))return j.worldX===j.targetX&&Math.abs(j.cameraX-(j.targetX-FOLLOW_X))<.05;
 const remaining=Math.max(0,j.targetX-j.worldX),desired=Math.min(205,Math.sqrt(2*260*remaining));
 j.velocity=toward(j.velocity,desired,260*dt);
 const dx=Math.min(remaining,j.velocity*dt);j.worldX+=dx;j.distance+=dx;
 if(remaining<.08||dx>=remaining){j.worldX=j.targetX;j.velocity=0;}
 const maxCamera=Math.max(0,j.targetX+1100-864),targetCamera=Math.min(maxCamera,Math.max(0,j.worldX-FOLLOW_X));
 // Exact exponential smoothing is frame-rate independent and never overshoots the hero.
 j.cameraX+= (targetCamera-j.cameraX)*(1-Math.exp(-7*dt));
 if(Math.abs(targetCamera-j.cameraX)<.025)j.cameraX=targetCamera;
 follow(j.goose,Math.max(j.cameraX+213,j.worldX-174),588,dt,j.velocity);
 follow(j.dog,Math.max(j.cameraX+205,j.worldX-190),801,dt,j.velocity);
 return j.worldX===j.targetX&&Math.abs(j.cameraX-(j.targetX-FOLLOW_X))<.05&&Math.abs(j.goose.worldX-(j.cameraX+213))<1&&Math.abs(j.dog.worldX-(j.cameraX+205))<1;
}
function follow(actor:WorldActor,x:number,y:number,dt:number,speed:number){
 const dx=(x-actor.worldX)*(1-Math.exp(-10*dt));const move=Math.max(-(speed+90)*dt,Math.min((speed+90)*dt,dx));actor.worldX+=move;actor.speed=Math.abs(move)/dt;actor.stride=(actor.stride??0)+Math.abs(move);actor.worldY=y;
}
export const projectX=(worldX:number,cameraX:number)=>worldX-cameraX;
