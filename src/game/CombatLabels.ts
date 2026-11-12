import {clips,intersects,type Rect} from './actorGeometry';
export interface CombatLabel {key:string;text:string;x:number;y:number;size:number;color:string;alpha:number;priority:number}
export interface PlacedLabel extends CombatLabel {rect:Rect;lines:string[]}
/** Fit full-size labels into free scene space; busy frames omit lower-priority duplicates. */
export function layoutLabels(labels:CombatLabel[],obstacles:Rect[],measure:(text:string,size:number)=>number,previous=new Map<string,Rect>()){
 const occupied=[...obstacles],placed:PlacedLabel[]=[],texts=new Set<string>();
 for(const f of [...labels].sort((a,b)=>b.priority-a.priority)){
  if(texts.has(f.text)&&f.priority<3)continue;
  const lines:string[]=[];let line='';for(const word of f.text.split(' ')){const next=line?line+' '+word:word;if(line&&measure(next,f.size)>230){lines.push(line);line=word}else line=next}if(line)lines.push(line);
  const w=Math.max(32,...lines.map(s=>measure(s,f.size)))+12,h=lines.length*f.size*1.12+10;
  const candidates:number[][]=[],old=previous.get(f.key);if(old)candidates.push([(old[0]+old[2])/2,(old[1]+old[3])/2]);candidates.push([f.x,f.y]);
  const grid:number[][]=[];for(let y=452+h/2;y<=834-h/2;y+=20)for(let x=132+w/2;x<=850-w/2;x+=24)grid.push([x,y]);grid.sort((a,b)=>Math.hypot(a[0]-f.x,a[1]-f.y)-Math.hypot(b[0]-f.x,b[1]-f.y));candidates.push(...grid);
  for(const [x,y] of candidates){const r:Rect=[x-w/2,y-h/2,x+w/2,y+h/2];if(r[0]<130||r[2]>852||r[1]<448||r[3]>838||occupied.some(o=>intersects(r,o,5)))continue;placed.push({...f,x,y,rect:r,lines});occupied.push(r);texts.add(f.text);break}
 }
 return placed;
}

const maskCache=new Map<string,Rect[]>();
export function feedbackBands(id:string,dead=false){const key=id+(dead?':dead':'');let bands=maskCache.get(key);if(!bands){const frames=dead?clips[id].frames:clips[id].frames.slice(0,7),source=frames.flatMap(f=>f.bands);bands=[];for(let y=-1.6;y<.08;y+=.04){const row=source.filter(b=>b[1]<y+.04&&b[3]>y);if(row.length)bands.push([Math.min(...row.map(b=>b[0])),y,Math.max(...row.map(b=>b[2])),y+.04])}maskCache.set(key,bands)}return bands}
