/** Short-lived, purely cosmetic combat accents: slashes, critical flares, skill shapes and boss
 * entrance/defeat. Nothing here touches damage, timers or saves; everything is bounded and
 * scales down with the battle's adaptive quality and reduced motion. */
type Kind='slash'|'crit'|'hurt'|'cry'|'bolt'|'whirl'|'bossIn'|'bossOut';
interface Fx {kind:Kind;x:number;y:number;t:number;life:number;color:string;size:number;seed:number;x2?:number;y2?:number}

/** Low-end Android heuristic (Telegram WebView): fewer cores or little memory → lighter effects from the start. */
export function deviceQualityCap(){
 if(typeof navigator==='undefined')return 1;
 const nav=navigator as Navigator&{deviceMemory?:number};
 const cores=nav.hardwareConcurrency??8,memory=nav.deviceMemory??8;
 if(cores<=4||memory<=2)return .7;
 if(cores<=6||memory<=4)return .85;
 return 1;
}

const rnd=(seed:number,n:number)=>{const s=Math.sin(seed*91.7+n*47.3)*43758.5453;return s-Math.floor(s)};

export class CombatVfx {
 list:Fx[]=[];
 private introId='';
 private outId='';
 private push(f:Omit<Fx,'t'|'seed'>){this.list.push({...f,t:0,seed:Math.random()*1000});if(this.list.length>24)this.list.shift()}
 reset(){this.list=[]}
 /** A melee or projectile blow lands. Critical hits add a star flare; ordinary hits stay small. */
 hit(x:number,y:number,crit:boolean,color:string,fromHero:boolean){
  if(fromHero)this.push({kind:'slash',x,y,life:crit?.32:.22,color:crit?'#fff6d8':color,size:crit?86:58});
  if(crit)this.push({kind:'crit',x,y,life:.38,color:'#ffe38a',size:110});
 }
 hurt(x:number,y:number){this.push({kind:'hurt',x,y,life:.3,color:'#ff6a5a',size:120})}
 skill(index:number,x:number,y:number){
  if(index===0)this.push({kind:'whirl',x:x+40,y:y-95,life:.45,color:'#cdf6ff',size:130});
  if(index===1)this.push({kind:'cry',x,y,life:.85,color:'#ffd86b',size:190});
 }
 bolt(x:number,top:number,ground:number){this.push({kind:'bolt',x,y:top,x2:x,y2:ground,life:.32,color:'#bff8ff',size:1})}
 /** Called every frame; starts the entrance once per boss encounter and the defeat once. */
 watchBoss(id:string,boss:boolean,fighting:boolean,alive:boolean,x:number,y:number){
  if(!boss)return;
  if(fighting&&alive&&this.introId!==id){this.introId=id;this.push({kind:'bossIn',x,y,life:1.3,color:'#ffb36a',size:240})}
  if(!alive&&this.introId===id&&this.outId!==id){this.outId=id;this.push({kind:'bossOut',x,y:y-90,life:1.6,color:'#ffe39a',size:300})}
 }
 step(dt:number){for(const f of this.list)f.t+=dt;this.list=this.list.filter(f=>f.t<f.life)}
 draw(c:CanvasRenderingContext2D,quality:number,reduced:boolean){
  for(const f of this.list){
   const k=f.t/f.life,fade=1-k;
   c.save();
   switch(f.kind){
    case 'slash':{
     // A crescent cut across the contact point.
     const r=f.size*(.7+.3*k),a0=-2.3+k*.5;
     c.globalAlpha=fade*.9;c.strokeStyle=f.color;c.lineCap='round';
     c.lineWidth=9*fade+1;c.beginPath();c.arc(f.x-r*.35,f.y+r*.25,r,a0,a0+1.25);c.stroke();
     c.lineWidth=2.5;c.strokeStyle='#ffffff';c.stroke();
     break;
    }
    case 'crit':{
     if(reduced){c.globalAlpha=fade*.6;c.fillStyle=f.color;c.beginPath();c.arc(f.x,f.y,22,0,Math.PI*2);c.fill();break}
     const r=f.size*(.35+.65*Math.min(1,k*3));
     c.globalCompositeOperation='lighter';
     const g=c.createRadialGradient(f.x,f.y,0,f.x,f.y,r*.6);g.addColorStop(0,'#ffffffcc');g.addColorStop(.35,f.color+'88');g.addColorStop(1,f.color+'00');
     c.globalAlpha=fade;c.fillStyle=g;c.beginPath();c.arc(f.x,f.y,r*.6,0,Math.PI*2);c.fill();
     // Four-point star, slowly turning.
     c.translate(f.x,f.y);c.rotate(f.seed+k*.8);c.fillStyle='#fffbe8';
     for(let i=0;i<4;i++){c.rotate(Math.PI/2);c.beginPath();c.moveTo(0,-r);c.lineTo(5,-6);c.lineTo(-5,-6);c.closePath();c.fill()}
     break;
    }
    case 'hurt':{
     const g=c.createRadialGradient(f.x,f.y,10,f.x,f.y,f.size);g.addColorStop(0,'#ff6a5a00');g.addColorStop(.7,'#ff4a3a33');g.addColorStop(1,'#ff4a3a00');
     c.globalAlpha=fade;c.fillStyle=g;c.fillRect(f.x-f.size,f.y-f.size,f.size*2,f.size*2);
     break;
    }
    case 'cry':{
     // Odin's call: a golden ground shockwave and a soft column of light.
     c.globalAlpha=fade*.8;c.strokeStyle=f.color;c.lineWidth=6*fade+1;
     c.save();c.translate(f.x,f.y-4);c.scale(1,.22);c.beginPath();c.arc(0,0,f.size*(.2+.8*k),0,Math.PI*2);c.stroke();
     if(quality>.6){c.lineWidth=3;c.beginPath();c.arc(0,0,f.size*(.1+.6*k),0,Math.PI*2);c.stroke()}c.restore();
     if(!reduced){const w=70*(1-k*.5),g=c.createLinearGradient(0,f.y-330,0,f.y);g.addColorStop(0,'#ffe29400');g.addColorStop(1,'#ffe29466');
      c.globalAlpha=fade*.9;c.fillStyle=g;c.fillRect(f.x-w/2,f.y-330,w,330)}
     break;
    }
    case 'whirl':{
     c.globalAlpha=fade;c.strokeStyle=f.color;c.lineCap='round';c.translate(f.x,f.y);c.scale(1,.55);
     for(let i=0;i<(quality>.6?3:2);i++){c.lineWidth=(10-i*3)*fade+1;c.beginPath();const a=-1.6+k*5+i*.5;c.arc(0,0,f.size*(.6+i*.18),a,a+1.9);c.stroke()}
     break;
    }
    case 'bolt':{
     // Jagged bolt from the sky with a bright core; flickers out quickly.
     if(Math.floor(f.t*40)%3===2&&!reduced)break;
     const steps=9,y2=f.y2??f.y+300;c.lineJoin='round';
     const path=()=>{c.beginPath();c.moveTo(f.x+(rnd(f.seed,0)-.5)*30,f.y);for(let i=1;i<=steps;i++)c.lineTo(f.x+(i===steps?0:(rnd(f.seed,i)-.5)*46),f.y+(y2-f.y)*i/steps);};
     c.globalAlpha=fade*.55;c.strokeStyle=f.color;c.lineWidth=12;path();c.stroke();
     c.globalAlpha=fade;c.strokeStyle='#ffffff';c.lineWidth=3.5;path();c.stroke();
     c.globalAlpha=fade*.5;c.fillStyle=f.color;c.save();c.translate(f.x,y2);c.scale(1,.25);c.beginPath();c.arc(0,0,60,0,Math.PI*2);c.fill();c.restore();
     break;
    }
    case 'bossIn':{
     // Dust ring and a darkening pulse announce the boss without covering the fighters.
     const ring=f.size*(.25+.75*Math.min(1,k*1.4));
     c.save();c.translate(f.x,f.y);c.scale(1,.2);
     c.globalAlpha=fade*.85;c.strokeStyle=f.color;c.lineWidth=8*fade+2;c.beginPath();c.arc(0,0,ring,0,Math.PI*2);c.stroke();
     c.globalAlpha=fade*.35;c.fillStyle='#2a1a12';c.beginPath();c.arc(0,0,ring*.9,0,Math.PI*2);c.fill();c.restore();
     const dust=Math.round(14*quality);c.fillStyle='#d9c6a8';
     for(let i=0;i<dust;i++){const a=rnd(f.seed,i)*Math.PI*2,d=ring*(.7+rnd(f.seed,i+40)*.4);
      c.globalAlpha=fade*.5;c.beginPath();c.arc(f.x+Math.cos(a)*d,f.y+Math.sin(a)*d*.2-30*k*rnd(f.seed,i+80),6+10*k,0,Math.PI*2);c.fill()}
     if(!reduced&&k<.5){c.globalAlpha=(.5-k)*.5;const g=c.createRadialGradient(432,470,180,432,470,620);g.addColorStop(0,'#00000000');g.addColorStop(1,'#1a0d08');c.fillStyle=g;c.fillRect(0,0,864,940)}
     break;
    }
    case 'bossOut':{
     // Victory burst: turning light rays and drifting gold motes.
     c.translate(f.x,f.y);
     if(!reduced){c.globalCompositeOperation='lighter';c.rotate(f.t*.6);
      const rays=quality>.6?12:8,r=f.size*(.4+.6*Math.min(1,k*2));
      for(let i=0;i<rays;i++){c.rotate(Math.PI*2/rays);c.globalAlpha=fade*.28;c.fillStyle=f.color;c.beginPath();c.moveTo(0,0);c.lineTo(-14,-r);c.lineTo(14,-r);c.closePath();c.fill()}}
     c.globalCompositeOperation='source-over';
     const g=c.createRadialGradient(0,0,0,0,0,110);g.addColorStop(0,'#fffbe0dd');g.addColorStop(1,'#ffd86b00');
     c.globalAlpha=fade*Math.min(1,(1-k)*2);c.fillStyle=g;c.beginPath();c.arc(0,0,110,0,Math.PI*2);c.fill();
     const motes=Math.round(18*quality);c.fillStyle='#ffd86b';
     for(let i=0;i<motes;i++){const a=rnd(f.seed,i)*Math.PI*2,d=40+k*170*rnd(f.seed,i+30);c.globalAlpha=fade;c.beginPath();c.arc(Math.cos(a)*d,Math.sin(a)*d+k*60,2.5+rnd(f.seed,i+60)*3,0,Math.PI*2);c.fill()}
     break;
    }
   }
   c.restore();
  }
 }
}
