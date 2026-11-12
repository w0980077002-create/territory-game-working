import formations from '../data/enemy-formations.json';
import {clips,enemyLunge,transformBand,intersects} from './actorGeometry';
import type {Fighter} from '../core/types';
export interface Placement {x:number;y:number;height:number;flip:boolean}
const layouts=formations as Record<string,{actors:Placement[];boss:boolean}>;
const legacyCache=new Map<string,{actors:Placement[];boss:boolean}>();
function legacyFormation(units:Fighter[]){
 const key=units.map(u=>u.id).join('|');const cached=legacyCache.get(key);if(cached)return cached;
 // Older saves can contain 3–5 fighters. Keep their HP/timers/identity intact.
 const roots=units.length===3?[[540,832],[500,724],[740,724]]:[[450,832],[650,832],[400,724],[550,724],[700,724]];
 const hud:[number,number,number,number][]=[[0,110,120,826],[748,110,864,516],[737,731,864,866],[0,846,864,1536]];
 for(let height=110;height>=12;height-=2){
  const actors=units.map((u,i)=>({x:roots[i][0],y:roots[i][1],height,flip:u.id==='winged_helmet_warrior'||u.id==='strongman_boulder'||u.id==='whitebeard_mage'}));
  const boxes=actors.map((v,i)=>{let b=clips[units[i].id].envelope;if(v.flip)b=[-b[2],b[1],-b[0],b[3]];return [transformBand(b,v.x,v.y,height,-28,18)]});
  if(boxes.some(bs=>bs.some(b=>b[0]<12||b[2]>852||b[3]>840||hud.some(h=>intersects(b,h,6)))))continue;
  if(boxes.some((bs,i)=>boxes.slice(0,i).some(as=>bs.some(b=>as.some(a=>intersects(a,b,4))))))continue;
  const result={actors,boss:false};legacyCache.set(key,result);return result;
 }
 // Valid shipped actors always find a formation; malformed unknown saves are rejected upstream.
 return {actors:units.map((_,i)=>({x:roots[i][0],y:roots[i][1],height:12,flip:false})),boss:false};
}
/** Stable visual formation, independent of simulation positions, HP and surviving count. */
export function enemyPlacement(units:Fighter[],index:number,walking=false){
 const u=units[index],formation=layouts[units.map(a=>a.id).join('|')]??(units.length>2?legacyFormation(units):layouts[u.id]);
 const slot=formation.actors[formation.actors.length===1?0:index];
 const approach=walking?Math.min(18,Math.max(0,u.x-(585+u.role*98))*.2):0;
 const x=slot.x+approach+enemyLunge(u.attack,/mage|spearman|spider|fungal|fire/.test(u.id));
 const top=slot.y+clips[u.id].envelope[1]*slot.height;
 return {...slot,x,barX:slot.x,barY:top-18,bodyY:slot.y-slot.height*.5};
}

const travelBands=new Map<string,import('./actorGeometry').Rect[]>();
/** Arriving guards use a rear lane above Arena, then step onto their battle marks. */
export function healthAnchorX(x:number,barY:number,boss:boolean){const half=boss?92:46;return Math.min(x,barY<522?748-half-6:852-half)}
export function travelActorSafe(id:string,x:number,y:number,height:number,flip:boolean,boss:boolean,walking=true){
 const key=id+(walking?':walk':':idle');let bands=travelBands.get(key);if(!bands){const c=clips[id];bands=[...c.frames.slice(0,walking?3:1).flatMap(f=>f.bands),...c.fallback.bands];travelBands.set(key,bands)}
 const hud:import('./actorGeometry').Rect[]=[[0,110,120,826],[748,110,864,516],[737,731,864,866],[0,846,864,1536]];
 for(let b of bands){if(flip)b=[-b[2],b[1],-b[0],b[3]];const r=transformBand(b,x,y,height);if(r[0]<12||r[2]>852||r[3]>840||hud.some(h=>intersects(r,h,6)))return false;}
 const top=y+clips[id].envelope[1]*height,half=boss?92:46,barX=healthAnchorX(x,top-18,boss),bar:import('./actorGeometry').Rect=[barX-half,top-20,barX+half,top-8];
 return !hud.some(h=>intersects(bar,h,6));
}
