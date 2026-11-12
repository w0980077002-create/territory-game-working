import {art,heroArt,rarityColors} from '../data/catalog';
import {useGame} from '../core/store';
import {clips,frameGeometry,legacyBodyHeight,poseFrame} from './actorGeometry';
const atlases=new Map<string,HTMLImageElement>();
const dolls=new Map<string,HTMLCanvasElement>();
function dressedFrame(img:HTMLImageElement,id:string,frame:number,sx:number,sy:number,sw:number,sh:number){const p=useGame.getState().p;if(id!==heroArt[p.heroClass]||typeof document==='undefined')return null;const parts=['weapon','helmet','armor','shield'] as const;const signature=parts.map(k=>{const i=p.equipment[k];return i?i.id+':'+i.upgrade:'none'}).join('/');const key=id+frame+signature;const cached=dolls.get(key);if(cached)return cached;const tile=document.createElement('canvas');tile.width=Math.ceil(sw);tile.height=Math.ceil(sh);const c=tile.getContext('2d')!;c.drawImage(img,sx,sy,sw,sh,0,0,tile.width,tile.height);const data=c.getImageData(0,0,tile.width,tile.height),px=data.data;for(let y=0;y<tile.height;y++)for(let x=0;x<tile.width;x++){const n=(y*tile.width+x)*4;if(px[n+3]<80)continue;const nx=x/tile.width,ny=y/tile.height,r=px[n],g=px[n+1],b=px[n+2];const skin=r>150&&g>65&&g<175&&b<110&&r>g*1.23;let part:typeof parts[number]|undefined;if(nx>.58&&ny<.72&&b>r*.9&&b>g*.92)part='weapon';else if(nx>.25&&nx<.68&&ny<.29&&!skin)part='helmet';else if(nx>.34&&nx<.66&&ny>.37&&ny<.63&&!skin)part='armor';else if(p.heroClass==='berserker'&&nx>.1&&nx<.4&&ny>.3&&ny<.7)part='shield';const item=part?p.equipment[part]:undefined;if(!item)continue;const hex=rarityColors[item.rarity].slice(1);const color=[parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)];const light=(r+g+b)/765;const mix=item.rarity>=3?.46:.23;for(let k=0;k<3;k++)px[n+k]=Math.min(255,px[n+k]*(1-mix)+color[k]*light*mix+Math.min(10,item.upgrade));}c.putImageData(data,0,0);if(dolls.size>=96)dolls.delete(dolls.keys().next().value!);dolls.set(key,tile);return tile}

function atlas(name:string){let i=atlases.get(name);if(!i){i=new Image();i.src=art(name);atlases.set(name,i)}return i}
/** Every pose has an integer source rectangle and its own anatomical ground pivot. */
export function drawActor(ctx:CanvasRenderingContext2D,id:string,x:number,y:number,size:number,time:number,walking:boolean,attack:number,hurt:number,death:number,windup=0,victory=false,registeredHeight=false,flip=false){
 const clip=clips[id];if(!clip)return false;
 const frame=poseFrame({time,walking,attack,hurt,death,windup,victory}),img=atlas(clip.atlas);
 const height=registeredHeight?size:legacyBodyHeight(id,size);
 if(!img.complete||!img.naturalWidth)return false;
 const g=frameGeometry(id,frame,0,0,height),[sx,sy,sw,sh]=g.source;
 ctx.save();ctx.translate(x,y);if(flip)ctx.scale(-1,1);
 if(death>0)ctx.globalAlpha=Math.max(0,1-(death-.5)*1.8);
 const doll=dressedFrame(img,id,frame,sx,sy,sw,sh);
 if(doll)ctx.drawImage(doll,g.x,g.y,g.width,g.height);
 else ctx.drawImage(img,sx,sy,sw,sh,g.x,g.y,g.width,g.height);
 ctx.restore();return true;
}
export function drawFallback(ctx:CanvasRenderingContext2D,img:HTMLImageElement,id:string,x:number,y:number,size:number,registeredHeight=false,flip=false){
 if(!clips[id]||!img.complete||!img.naturalWidth)return;
 const g=frameGeometry(id,0,0,0,registeredHeight?size:legacyBodyHeight(id,size),false,true);
 ctx.save();ctx.translate(x,y);if(flip)ctx.scale(-1,1);ctx.drawImage(img,g.x,g.y,g.width,g.height);ctx.restore();
}
