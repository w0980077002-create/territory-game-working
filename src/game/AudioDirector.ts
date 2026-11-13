/**
 * AudioDirector — fully procedural Web Audio (no samples, no third-party recordings, nothing to license).
 * One AudioContext, created only after a user gesture and only if sound is enabled.
 * Layers: wind bed, generative mood music (city / tense / boss), snow footsteps, one-shot effects.
 * Pause fades the world layers; mute fades the master and suspends the context.
 */
export type Sfx='hit'|'skill'|'win'|'death'|'block'|'critical'|'honk'|'bark'|'growl'|'boss'|'coin'|'loot'|'rare'|'rune'|'flutter'|'dig'|'alarm'|'potion'|'feat'|'thunder'|'whoosh'|'forge';
export type Mood='city'|'tense'|'boss';
export interface AudioFrame {enabled:boolean;running:boolean;hidden:boolean;volume:number;mood:Mood;wind:number;walked:number;quality:number}
const scales:Record<Mood,number[]>={city:[293.66,349.23,392,440,523.25,587.33,698.46],tense:[146.83,164.81,174.61,220,233.08,293.66],boss:[73.42,87.31,98,110,116.54]};
const drones:Record<Mood,[number,number]>={city:[146.83,220],tense:[73.42,110],boss:[65.41,98]};
export class AudioDirector {
 ctx?:AudioContext;contexts=0;private master?:GainNode;private world?:GainNode;private fx?:GainNode;private windGain?:GainNode;private windFilter?:BiquadFilterNode;private droneGain?:GainNode;private droneOsc:OscillatorNode[]=[];
 private noise?:AudioBuffer;private voices=0;private last=new Map<string,number>();private nextBeat=0;private beat=0;private stride=0;private mood:Mood='city';private wanted=false;
 /** Call from a user gesture. Safe to call repeatedly: there is only ever one context. */
 unlock(enabled:boolean){
  this.wanted=enabled;if(!enabled&&!this.ctx)return;
  try{
   if(!this.ctx){
    const Ctor=globalThis.AudioContext??(globalThis as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!Ctor)return;
    const c=this.ctx=new Ctor();this.contexts++;
    const limiter=c.createDynamicsCompressor();limiter.threshold.value=-14;limiter.ratio.value=8;limiter.connect(c.destination);
    this.master=c.createGain();this.master.gain.value=0;this.master.connect(limiter);
    this.world=c.createGain();this.world.gain.value=0;this.world.connect(this.master);this.fx=c.createGain();this.fx.gain.value=1;this.fx.connect(this.master);
    this.noise=c.createBuffer(1,c.sampleRate*2,c.sampleRate);const data=this.noise.getChannelData(0);let brown=0;for(let n=0;n<data.length;n++){const white=Math.random()*2-1;brown=(brown+.04*white)/1.04;data[n]=white*.35+brown*2.2}
    const wind=c.createBufferSource();wind.buffer=this.noise;wind.loop=true;this.windFilter=c.createBiquadFilter();this.windFilter.type='bandpass';this.windFilter.frequency.value=420;this.windFilter.Q.value=.7;this.windGain=c.createGain();this.windGain.gain.value=0;wind.connect(this.windFilter);this.windFilter.connect(this.windGain);this.windGain.connect(this.world);wind.start();
    const soft=c.createBiquadFilter();soft.type='lowpass';soft.frequency.value=520;this.droneGain=c.createGain();this.droneGain.gain.value=0;soft.connect(this.droneGain);this.droneGain.connect(this.world);
    for(const [n,hz] of drones.city.entries()){const o=c.createOscillator();o.type=n?'sine':'triangle';o.frequency.value=hz;o.detune.value=n?6:-5;o.connect(soft);o.start();this.droneOsc.push(o)}
   }
   if(enabled)void this.ctx.resume();
  }catch{ /* audio stays optional */ }
 }
 private ready(){return !!this.ctx&&this.wanted&&this.ctx.state==='running'}
 /** Once per animation frame: mixes layers to the game state. Cheap when nothing changes. */
 frame(s:AudioFrame){
  const c=this.ctx;if(!c||!this.master||!this.world)return;this.wanted=s.enabled;
  const on=s.enabled&&!s.hidden,now=c.currentTime;
  if(!on){this.master.gain.setTargetAtTime(0,now,.05);if(c.state==='running'&&this.master.gain.value<.004)void c.suspend();return}
  if(c.state==='suspended')void c.resume();if(c.state!=='running')return;
  this.master.gain.setTargetAtTime([0,.45,.75,1][Math.max(1,Math.min(3,s.volume))],now,.08);
  this.world.gain.setTargetAtTime(s.running?1:0,now,s.running?.25:.09);
  this.windGain!.gain.setTargetAtTime(.035+s.wind*.11,now,.3);this.windFilter!.frequency.setTargetAtTime(330+s.wind*900,now,.4);
  if(s.mood!==this.mood){this.mood=s.mood;for(const [n,o] of this.droneOsc.entries())o.frequency.setTargetAtTime(drones[s.mood][n],now,.6);if(s.mood==='boss')this.play('boss')}
  this.droneGain!.gain.setTargetAtTime(s.mood==='city'?.05:.085,now,.5);
  if(!s.running){this.nextBeat=0;return}
  // Snow under boots: one soft two-part crunch per stride.
  this.stride+=s.walked;if(this.stride>58){this.stride=0;this.burst(.07,'bandpass',1500+Math.random()*500,.9,.05,this.world);this.burst(.05,'bandpass',900,.8,.03,this.world,.06)}
  // Generative music: a few notes are scheduled just ahead of the clock, so pausing stops the score.
  if(this.nextBeat<now)this.nextBeat=now+.05;
  while(this.nextBeat<now+.25){const t=this.nextBeat,b=this.beat++,scale=scales[this.mood];
   if(this.mood==='city'){if(b%2===0||Math.random()<.25)this.bell(scale[(b*5+Math.floor(Math.random()*3))%scale.length],t,.05,1.4);this.nextBeat+=.8}
   else if(this.mood==='tense'){if(b%4===0)this.drum(t,.1,70);if(b%3===0)this.bell(scale[(b*2)%scale.length],t,.045,1.8);this.nextBeat+=.6}
   else{const step=b%8;if([0,3,4,6].includes(step))this.drum(t,step===0?.2:.12,step===0?58:74);if(step===0||step===5)this.brass(scale[Math.floor(b/8)%scale.length],t,.42,.06);this.nextBeat+=.34}
  }
 }
 private voice(dur:number){if(this.voices>=(14))return false;this.voices++;setTimeout(()=>{this.voices--},dur*1000+60);return true}
 private tone(hz:number,to:number,dur:number,type:OscillatorType,gain:number,delay=0,out=this.fx){const c=this.ctx!;if(!out||!this.voice(dur+delay))return;const t=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(hz,t);if(to!==hz)o.frequency.exponentialRampToValueAtTime(Math.max(20,to),t+dur);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g);g.connect(out);o.start(t);o.stop(t+dur+.03)}
 private burst(dur:number,type:BiquadFilterType,hz:number,q:number,gain:number,out=this.fx,delay=0,sweep=0){const c=this.ctx!;if(!out||!this.noise||!this.voice(dur+delay))return;const t=c.currentTime+delay,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;f.type=type;f.frequency.setValueAtTime(hz,t);if(sweep)f.frequency.exponentialRampToValueAtTime(sweep,t+dur);f.Q.value=q;g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);s.connect(f);f.connect(g);g.connect(out);s.start(t,Math.random()*1.5,dur+.05)}
 private at(time:number){return Math.max(0,time-this.ctx!.currentTime)}
 private bell(hz:number,time:number,gain:number,dur:number){this.tone(hz,hz,dur,'sine',gain,this.at(time),this.world);this.tone(hz*2.01,hz*2.01,dur*.5,'sine',gain*.35,this.at(time),this.world)}
 private drum(time:number,gain:number,hz:number){this.tone(hz*1.9,hz*.55,.3,'sine',gain,this.at(time),this.world);this.burst(.06,'lowpass',500,.5,gain*.5,this.world,this.at(time))}
 private brass(hz:number,time:number,dur:number,gain:number){for(const m of [1,1.5,2])this.tone(hz*m,hz*m,dur,'sawtooth',gain/m,this.at(time),this.world)}
 private steel(gain:number){for(const [n,hz] of [1240,1870,2630,3410].entries())this.tone(hz*(1+Math.random()*.03),hz*.985,.2-n*.03,'sine',gain/(n+1));this.burst(.03,'highpass',3000,.5,gain*1.2)}
 /** One-shot effects. Rate-limited per kind and capped in polyphony so fights never turn into noise. */
 play(kind:Sfx){
  if(!this.ready())return;const now=this.ctx!.currentTime,gap=kind==='hit'?.07:.12;if(now-(this.last.get(kind)??-1)<gap)return;this.last.set(kind,now);
  switch(kind){
   case 'forge':this.tone(145,44,.22,'triangle',.12);this.burst(.07,'lowpass',1200,.7,.1);this.steel(.05);break;
   case 'hit':this.burst(.05,'highpass',2200,.6,.09);this.tone(190,70,.09,'square',.035);this.steel(.018);break;
   case 'critical':this.burst(.07,'highpass',1800,.6,.12);this.tone(240,48,.2,'triangle',.09);this.steel(.04);break;
   case 'block':this.steel(.06);this.tone(320,210,.08,'square',.03);break;
   case 'skill':this.burst(.32,'bandpass',420,1.4,.07,this.fx,0,2600);this.tone(660,990,.3,'sine',.04);this.tone(990,1320,.34,'sine',.025,.05);break;
   case 'thunder':this.burst(.5,'lowpass',2400,.4,.14,this.fx,0,120);this.tone(110,38,.45,'sine',.11);break;
   case 'whoosh':this.burst(.22,'bandpass',700,1.2,.06,this.fx,0,2200);break;
   case 'win':for(const [n,hz] of [587.33,739.99,880,1174.66].entries())this.tone(hz,hz,.34,'triangle',.05,n*.09);break;
   case 'death':this.tone(150,42,.32,'sawtooth',.05);this.burst(.12,'lowpass',600,.5,.08);break;
   case 'honk':this.tone(430,330,.1,'sawtooth',.06);this.tone(520,370,.14,'sawtooth',.065,.11);this.tone(860,660,.1,'square',.012);break;
   case 'bark':for(const d of [0,.16]){this.tone(340,150,.08,'square',.06,d);this.burst(.06,'lowpass',1100,.7,.07,this.fx,d)}break;
   case 'growl':this.tone(92,74,.5,'sawtooth',.05);this.tone(97,70,.5,'square',.02);break;
   case 'boss':for(const hz of [55,82.41,110])this.tone(hz,hz*1.01,1.1,'sawtooth',.06);this.tone(120,36,.6,'sine',.16);this.burst(.5,'lowpass',300,.5,.1,this.fx,0,1400);break;
   case 'coin':this.tone(1568,1568,.07,'sine',.05);this.tone(2093,2093,.16,'sine',.05,.07);break;
   case 'loot':for(const [n,hz] of [880,1108.73,1318.51].entries())this.tone(hz,hz,.22,'triangle',.05,n*.07);break;
   case 'rare':for(const [n,hz] of [659.25,880,1108.73,1318.51,1760].entries())this.tone(hz,hz,.4,'triangle',.05,n*.08);this.burst(.5,'highpass',5000,.4,.02,this.fx,.3);break;
   case 'rune':for(const [n,hz] of [523.25,784,1046.5].entries()){this.tone(hz,hz*1.003,1.3,'sine',.05/(n+1),n*.05)}this.burst(.6,'bandpass',900,3,.03,this.fx,0,3200);break;
   case 'flutter':for(let n=0;n<5;n++)this.burst(.04,'bandpass',1300+n*120,1.2,.05-n*.007,this.fx,n*.045);break;
   case 'dig':for(let n=0;n<3;n++)this.burst(.08,'bandpass',1000+Math.random()*600,.9,.07,this.fx,n*.16);break;
   case 'alarm':this.tone(146.83,146.83,.6,'triangle',.07);this.tone(207.65,207.65,.6,'triangle',.06);this.burst(.2,'bandpass',500,2,.04);break;
   case 'potion':this.tone(520,1040,.25,'sine',.05);this.tone(780,1560,.25,'sine',.03,.08);break;
   case 'feat':for(const [n,hz] of [783.99,987.77,1174.66,1567.98].entries())this.tone(hz,hz,.3,'triangle',.045,n*.06);break;
  }
 }
}
export const audio=new AudioDirector();
