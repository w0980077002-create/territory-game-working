/** Painted, prepacked scenery. No gameplay state; all animation uses the simulation clock. */
import frames from '../data/living-art.json';
import {art} from '../data/catalog';
export type ScenerySprite=keyof typeof frames;
let atlas:HTMLImageElement|undefined,fire:HTMLImageElement|undefined,shield:HTMLImageElement|undefined,raven:HTMLImageElement|undefined;
const fireTones=new Map<number,HTMLCanvasElement>();
export function warmWorldArt(){
 if(typeof Image==='undefined'||atlas)return;
 atlas=new Image();atlas.src=art('living/props');
 fire=new Image();fire.src=art('living/blue-fire');
 fire.onload=()=>{for(const [tone,filter] of [[0,'hue-rotate(175deg) saturate(1.6)'],[2,'hue-rotate(65deg)']] as const){
  const sheet=document.createElement('canvas');sheet.width=fire!.naturalWidth;sheet.height=fire!.naturalHeight;
  const c=sheet.getContext('2d');if(!c)continue;c.filter=filter;c.drawImage(fire!,0,0);fireTones.set(tone,sheet);
 }};
 shield=new Image();shield.src=art('ui-shield');
 raven=new Image();raven.src=art('living/ravens');
}
export function scenery(c:CanvasRenderingContext2D,id:ScenerySprite,x:number,y:number,height:number,width?:number){
 warmWorldArt();if(!atlas?.complete||!atlas.naturalWidth)return;
 const [sx,sy,sw,sh]=frames[id],w=width??height*sw/sh;
 c.drawImage(atlas,sx,sy,sw,sh,x-w/2,y-height,w,height);
}
export function contactShadow(c:CanvasRenderingContext2D,x:number,y:number,width:number){
 c.save();c.globalAlpha*=.2;c.fillStyle='#173b61';c.beginPath();c.ellipse(x,y+1,width,4,0,0,Math.PI*2);c.fill();c.restore();
}
export function paintedFire(c:CanvasRenderingContext2D,x:number,y:number,time:number,seed:number,reduced:boolean,tone=1,wind=0){
 warmWorldArt();if(!fire?.complete||!fire.naturalWidth)return;
 // Crossfade adjacent registered frames: the root never jumps; no DOM filters or per-frame allocations.
 const phase=reduced?2:(time*9+seed*8)%8,index=Math.floor(phase),mix=phase-index;
 c.save();c.translate(x,y);c.transform(1,0,wind*.07,1,0,0);
 const sheet=fireTones.get(tone)??fire;
 const inherited=c.globalAlpha;
 for(let n=0;n<2;n++){
  const frame=(index+n)%8,alpha=n?mix:1-mix;
  if(alpha<.01)continue;c.globalAlpha=inherited*alpha;c.drawImage(sheet,(frame%4)*128,Math.floor(frame/4)*160,128,160,-37,-88,74,100);
 }
 c.restore();
}

/** Reuse approved equipment artwork for the buried shield and the Minotaur warning. */
export function fallenShield(c:CanvasRenderingContext2D,x:number,y:number,height:number){
 warmWorldArt();if(!shield?.complete||!shield.naturalWidth)return;
 c.save();c.translate(x,y);c.rotate(-.42);c.drawImage(shield,-height*.42,-height,height*.84,height);c.restore();
}

export function paintedRaven(c:CanvasRenderingContext2D,x:number,y:number,time:number,flying:boolean,left:boolean,reduced:boolean){
 warmWorldArt();if(!raven?.complete||!raven.naturalWidth)return;
 const pose=flying?(reduced?2:[1,2,3,2][Math.floor(time*8)%4]):0,size=flying?47:32;
 c.save();c.translate(x,y);if(left)c.scale(-1,1);
 const body=flying?(pose===1?.64:.45):.92;
 c.drawImage(raven,(pose%2)*128,Math.floor(pose/2)*128,128,128,-size*.5,-size*body,size,size);c.restore();
}
