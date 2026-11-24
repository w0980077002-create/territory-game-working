/** Darkness of the Realm: an oppressive vault, watching eyes, shadow wisps and an edge vignette.
 * Cosmetic only; the centre lane where the party and foes stand stays clear and readable. */
type C=CanvasRenderingContext2D;
const noise=(n:number)=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)};

/** Behind the actors, after the chamber art: heavy vault shadow, eyes in the dark, rising wisps. */
export function paintRealmGloom(c:C,clock:number,delta:number,floor:number,eye:string,quality:number,reduced:boolean){
 c.save();
 // The vault presses down: a deep violet shadow over the ceiling that fades before the lane.
 const vault=c.createLinearGradient(0,0,0,560);vault.addColorStop(0,'#1a0b2e');vault.addColorStop(.55,'#2a174288');vault.addColorStop(1,'#2a174200');
 c.globalCompositeOperation='multiply';c.globalAlpha=.85;c.fillStyle=vault;c.fillRect(0,0,864,560);
 c.globalCompositeOperation='source-over';
 // Watching eyes in the darkest corners; they blink and sometimes close for a while.
 const pairs=quality<.6?2:3;
 for(let i=0;i<pairs;i++){
  const seed=floor*13+i*7,x=((noise(seed)*.9+.05)*864+delta*(.18+i*.04)+864)%864,y=110+noise(seed+1)*220;
  if(x>250&&x<620&&y>280)continue;
  const cycle=reduced?1:(clock*.35+noise(seed+2)*5)%5,open=cycle<3.6?1:0,blink=reduced?1:Math.abs(Math.sin(clock*1.3+i))>.08?1:.15;
  const a=open*blink*(.55+.25*Math.sin(clock*2+i));if(a<=.02)continue;
  const s=4+noise(seed+3)*3;
  c.globalAlpha=a;c.fillStyle=eye;c.shadowColor=eye;c.shadowBlur=quality>.6?10:0;
  for(const dx of [-s*1.6,s*1.6]){c.beginPath();c.ellipse(x+dx,y,s,s*.45*blink,dx<0?.25:-.25,0,Math.PI*2);c.fill()}
  c.shadowBlur=0;
 }
 // Shadow wisps curl up from the lane's dark edges.
 if(!reduced){
  const n=Math.round(6*quality)+2;
  for(let i=0;i<n;i++){
   const life=(clock*.09+noise(i+floor))%1,side=i%2?1:-1,base=side<0?60+noise(i+4)*150:864-60-noise(i+4)*150;
   const x=base+Math.sin(life*5+i)*26*side+delta*.3%40,y=760-life*360,r=26+life*46;
   const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'#12061fcc');g.addColorStop(1,'#12061f00');
   c.globalAlpha=Math.sin(life*Math.PI)*.55;c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
  }
 }
 c.restore();
}

/** In front: an edge vignette that never reaches the central lane. */
export function paintRealmVignette(c:C){
 c.save();
 const g=c.createRadialGradient(432,640,260,432,600,700);g.addColorStop(0,'#05020c00');g.addColorStop(.7,'#05020c55');g.addColorStop(1,'#05020cd0');
 c.fillStyle=g;c.fillRect(0,0,864,940);c.restore();
}
