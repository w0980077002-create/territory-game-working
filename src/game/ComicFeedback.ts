import {intersects,type Rect} from './actorGeometry';
export const comicWords=['БАМ!','ХРЯСЬ!','БДЫЩ!','ОЙ!'] as const;
export interface ComicPacket {word:string;x:number;y:number;life:number;tilt:number;color:string;width:number;height:number}
const palette=['#ffca48','#9de9ff','#ff9557','#f9cfef'];
const clamp=(n:number,l:number,h:number)=>Math.max(l,Math.min(h,n));
/** Screen-space impact graphic. Its visual clock is real time, gated by battle pause. */
export class ComicFeedback {
 active:ComicPacket|null=null;shakeLife=0;private deck:string[]=[];private previous='';
 reset(){this.active=null;this.shakeLife=0;this.deck=[];this.previous=''}
 step(realDt:number){if(this.active){this.active.life-=realDt;if(this.active.life<=1e-8)this.active=null}this.shakeLife=Math.max(0,this.shakeLife-realDt)}
 emit(x:number,y:number,obstacles:Rect[],preferred?:string,random= Math.random){
  if(this.active)return false;
  const candidates=[[x-135,y-105],[x+100,y-105],[x-180,y-90],[x+30,y-155],[x-70,y-180],[550,505],[450,505],[350,505],[650,505],[430,540],[620,552]];
  for(let cy=503;cy<=779;cy+=32)for(let cx=232;cx<=744;cx+=32)candidates.push([cx,cy]);
  let position:number[]|undefined;
  for(const [cx,cy] of candidates){const px=clamp(cx,232,744),py=clamp(cy,503,780),box:Rect=[px-106,py-56,px+106,py+56];if(box[0]<126||box[2]>852||box[3]>840||obstacles.some(o=>intersects(box,o,6)))continue;position=[px,py];break}
  if(!position)return false;
  if(!this.deck.length)this.deck=[...comicWords].sort(()=>random()-.5);
  let index=preferred?this.deck.indexOf(preferred):-1;if(index<0||this.deck[index]===this.previous)index=this.deck.findIndex(w=>w!==this.previous);if(index<0)index=0;
  const word=this.deck.splice(index,1)[0];this.previous=word;const p=comicWords.indexOf(word as typeof comicWords[number]);
  this.active={word,x:position[0],y:position[1],life:.4,tilt:(random()-.5)*.16,color:palette[p],width:178,height:76};this.shakeLife=.12;return true;
 }
 offset(reduced:boolean,quality:number):[number,number]{if(reduced||quality<.6||this.shakeLife<=0)return [0,0];const t=.12-this.shakeLife,a=864*.008*(this.shakeLife/.12)*.5;return [Math.sin(t*170)*a,Math.cos(t*143)*a*.65]}
 draw(c:CanvasRenderingContext2D,reduced:boolean,quality:number){const f=this.active;if(!f)return;const elapsed=.4-f.life,enter=Math.min(1,elapsed/.07),scale=reduced?1:enter<1?.82+.3*Math.sin(enter*Math.PI/2):1+.05*Math.exp(-(elapsed-.07)*25),alpha=Math.min(1,f.life/.10);
  c.save();c.translate(f.x,f.y);c.rotate(f.tilt);c.scale(scale,scale);c.globalAlpha=alpha;
  c.beginPath();for(let n=0;n<24;n++){const a=n*Math.PI/12,r=n%2?.76:1,x=Math.cos(a)*f.width*.5*r,y=Math.sin(a)*f.height*.5*r;if(n)c.lineTo(x,y);else c.moveTo(x,y)}c.closePath();c.lineJoin='round';c.lineWidth=9;c.strokeStyle='#15243b';c.stroke();c.fillStyle=f.color;c.fill();c.lineWidth=2;c.strokeStyle='#fff5bd';c.stroke();
  c.save();c.clip();c.fillStyle='#47294c28';const gap=quality<.6?17:12;for(let x=-80;x<85;x+=gap)for(let y=-30;y<35;y+=gap){c.beginPath();c.arc(x,y,1.6,0,Math.PI*2);c.fill()}c.restore();
  c.font='italic 900 48px "Roboto Condensed", "Arial Black", sans-serif';c.textAlign='center';c.textBaseline='middle';c.lineWidth=8;c.strokeStyle='#172139';c.strokeText(f.word,0,1,145);c.fillStyle='#fffbed';c.fillText(f.word,0,1,145);c.restore();
 }
}
