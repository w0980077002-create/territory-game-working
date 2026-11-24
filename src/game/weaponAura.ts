/** Cosmetic weapon light: a glow traced from the weapon's own pixels in each animation frame,
 * plus stateless flames/sparks for high rarities. No combat state is read or written here. */
export type AuraKind='glow'|'sparks'|'fire'|'holy'|'dusk';
export interface WeaponAura {kind:AuraKind;color:string;quality:number;clock:number;reduced?:boolean}

/** Rarity index (see catalog.rarityNames) → effect. Lower rarities stay plain so rare gear reads as rare. */
export function auraForRarity(rarity:number):AuraKind|undefined{
 if(rarity>=8)return 'dusk';
 if(rarity===7)return 'holy';
 if(rarity>=5)return 'fire';
 if(rarity===4)return 'sparks';
 if(rarity===3)return 'glow';
 return undefined;
}

interface Mask {glow:HTMLCanvasElement|null;points:Array<[number,number]>;top:Array<[number,number]>}
const masks=new Map<string,Mask>();

/** Which pixels belong to the weapon: the steel blade, the green staff orb or the gilded bow. */
function weaponPixel(cls:string,r:number,g:number,b:number,nx:number,ny:number){
 if(cls.startsWith('whitebeard_mage'))return g>140&&g>r*1.25&&g>b*1.15;
 // Gilded bow: saturated gold/amber, unlike the warm but bluish-pink skin.
 if(cls.startsWith('strongman_boulder'))return ny<.9&&r>150&&g>85&&b<g*.45&&r>g*1.12&&r<g*1.9;
 // Blade: cool, bright, slightly blue steel; helmet feathers are warmer white.
 const light=(r+g+b)/3;
 return light>105&&b>r*1.04&&b>=g*.98&&b-r<90;
}

function buildMask(img:HTMLImageElement,id:string,sx:number,sy:number,sw:number,sh:number,color:string):Mask{
 const empty={glow:null,points:[],top:[]};
 if(typeof document==='undefined')return empty;
 const w=Math.max(1,Math.ceil(sw)),h=Math.max(1,Math.ceil(sh));
 const src=document.createElement('canvas');src.width=w;src.height=h;
 const c=src.getContext('2d',{willReadFrequently:true});if(!c)return empty;
 c.drawImage(img,sx,sy,sw,sh,0,0,w,h);
 let data:ImageData;try{data=c.getImageData(0,0,w,h)}catch{return empty}
 const px=data.data,points:Array<[number,number]>=[];
 const hit=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const n=(y*w+x)*4;if(px[n+3]>=110&&weaponPixel(id,px[n],px[n+1],px[n+2],x/w,y/h))hit[y*w+x]=1}
 // Keep only the weapon itself: the largest connected pieces (helmet trims and buckles are small islands).
 const label=new Int32Array(w*h),sizes=[0],cx=[0],cy=[0],stack:number[]=[];
 for(let i=0;i<hit.length;i++){if(!hit[i]||label[i])continue;const id2=sizes.length;let size=0;label[i]=id2;stack.push(i);
  let sumX=0,sumY=0;
  while(stack.length){const j=stack.pop()!;size++;const x=j%w,y=(j-x)/w;sumX+=x;sumY+=y;
   for(const q of [x>0?j-1:-1,x<w-1?j+1:-1,y>0?j-w:-1,y<h-1?j+w:-1])if(q>=0&&hit[q]&&!label[q]){label[q]=id2;stack.push(q)}}
  sizes.push(size);cx.push(sumX/size/w);cy.push(sumY/size/h)}
 // The warrior's steel helmet sits top-centre; his blade never rests there.
 const helmet=(k:number)=>id.startsWith('winged_helmet_warrior')&&cy[k]<.32&&cx[k]>.28&&cx[k]<.72;
 const largest=Math.max(0,...sizes.filter((_,k)=>!helmet(k))),keep=sizes.map((v,k)=>!helmet(k)&&v>=Math.max(12,largest*.3));
 const out=c.createImageData(w,h),o=out.data;
 const tint=parseInt(color.slice(1),16),tr=tint>>16,tg=(tint>>8)&255,tb=tint&255;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x;if(!label[i]||!keep[label[i]])continue;const n=i*4;
  o[n]=tr;o[n+1]=tg;o[n+2]=tb;o[n+3]=255;
  if((x*7+y*13)%11===0)points.push([x,y]);
 }
 if(points.length<6)return empty;
 // Keep a bounded, evenly spread sample for emitters; the highest points feed rising flames.
 const step=Math.max(1,Math.floor(points.length/48));
 const sample=points.filter((_,i)=>i%step===0).slice(0,48);
 const top=[...sample].sort((a,b)=>a[1]-b[1]).slice(0,Math.min(18,sample.length));
 c.putImageData(out,0,0);
 // Soft halo: small blurred copy (cheap to draw every frame, blurred once here).
 const pad=10,glow=document.createElement('canvas');glow.width=w+pad*2;glow.height=h+pad*2;
 const gc=glow.getContext('2d');
 if(gc){gc.filter='blur(6px)';gc.drawImage(src,pad,pad);gc.drawImage(src,pad,pad);gc.filter='none';gc.globalAlpha=.28;gc.drawImage(src,pad,pad)}
 return {glow:gc?glow:null,points:sample,top};
}

function maskFor(img:HTMLImageElement,id:string,frame:number,sx:number,sy:number,sw:number,sh:number,color:string){
 const key=img.src+'|'+id+'|'+frame+'|'+color;
 let m=masks.get(key);
 if(!m){m=buildMask(img,id,sx,sy,sw,sh,color);if(masks.size>=72)masks.delete(masks.keys().next().value!);masks.set(key,m)}
 return m;
}

const hash=(n:number)=>{const s=Math.sin(n*127.1)*43758.5453;return s-Math.floor(s)};
const FIRE=['#fff2b0','#ffc24a','#ff7a22','#d8381a'],HOLY=['#ffffff','#fff3b1','#ffd86b','#f5b84a'],DUSK=['#e7c8ff','#a15dff','#5a2a9a','#261340'];

/** Paint inside the actor's local transform (same space as the frame drawImage). */
export function drawWeaponAura(ctx:CanvasRenderingContext2D,img:HTMLImageElement,id:string,frame:number,source:readonly [number,number,number,number],dest:{x:number;y:number;width:number;height:number},aura:WeaponAura){
 const [sx,sy,sw,sh]=source;
 const m=maskFor(img,id,frame,sx,sy,sw,sh,aura.color);if(!m.glow)return;
 const k=dest.width/Math.max(1,Math.ceil(sw)),t=aura.clock;
 const pulse=aura.reduced?.75:.62+.22*Math.sin(t*3.1)+.08*Math.sin(t*7.3);
 ctx.save();
 ctx.globalCompositeOperation='lighter';
 ctx.globalAlpha*=Math.min(1,pulse*(aura.kind==='glow'?.55:.62));
 ctx.drawImage(m.glow,dest.x-10*k,dest.y-10*k,m.glow.width*k,m.glow.height*k);
 if(aura.reduced||aura.quality<.5||aura.kind==='glow'){ctx.restore();return}
 const base=ctx.globalAlpha/Math.max(.01,pulse*.62);
 const at=(p:[number,number])=>[dest.x+p[0]*k,dest.y+p[1]*k] as const;
 if(aura.kind==='sparks'){
  const n=Math.round(7*aura.quality);
  for(let i=0;i<n;i++){
   const p=m.points[Math.floor(hash(i+1)*m.points.length)],life=(t*.9+hash(i+9))%1,[x,y]=at(p);
   const a=Math.sin(life*Math.PI);ctx.globalAlpha=base*a*.9;ctx.fillStyle=i%2?'#ffffff':aura.color;
   const r=1.2+2.2*a,dx=(hash(i+3)-.5)*18*life,dy=-14*life;
   ctx.beginPath();ctx.moveTo(x+dx,y+dy-r*2);ctx.lineTo(x+dx+r*.6,y+dy);ctx.lineTo(x+dx,y+dy+r*2);ctx.lineTo(x+dx-r*.6,y+dy);ctx.closePath();ctx.fill();
  }
  ctx.restore();return;
 }
 const palette=aura.kind==='holy'?HOLY:aura.kind==='dusk'?DUSK:FIRE;
 ctx.globalCompositeOperation='source-over';
 const n=Math.round((aura.kind==='dusk'?7:11)*aura.quality),src=m.top.length?m.top:m.points;
 for(let i=0;i<n;i++){
  const p=src[Math.floor(hash(i*3+2)*src.length)],speed=aura.kind==='dusk'?.55:1.25+hash(i)*.6;
  const life=(t*speed+hash(i+5))%1,[x,y]=at(p);
  const rise=(aura.kind==='dusk'?26:34)*life*k*1.4,sway=Math.sin(t*5+i)*4*life;
  const r=(aura.kind==='dusk'?7:5.5)*(1-life*.7)*Math.min(1.4,k*1.6+.4);
  ctx.globalAlpha=base*(1-life)*(aura.kind==='dusk'?.45:.85);
  ctx.fillStyle=palette[Math.min(3,Math.floor(life*4))];
  // A teardrop tongue: wide base, pointed tip leaning with the sway.
  ctx.beginPath();
  ctx.moveTo(x+sway-r,y-rise);
  ctx.quadraticCurveTo(x+sway,y-rise-r*2.6,x+sway*1.6,y-rise-r*3.2);
  ctx.quadraticCurveTo(x+sway,y-rise-r*1.2,x+sway+r,y-rise);
  ctx.arc(x+sway,y-rise,r,0,Math.PI);
  ctx.fill();
 }
 ctx.restore();
}
