import {useCallback,useEffect,useRef,useState} from 'react';
import type {Player} from '../core/types';
import {useGame} from '../core/store';
import {heroArt} from '../data/catalog';
import {drawActor,warmRun} from '../game/animation';
import {CombatVfx} from '../game/CombatVfx';
import {heroLook} from '../game/heroLook';
import {sceneImage} from '../game/sceneImages';
import {nameOf} from '../saga/encounters';
import {bossState,bossAttack,bossClaim,bossAdminStart,bossAdminEnd,BossError,errorText,applyLetter,letterApplied,toReward,type BossState,type BossReward,type BossLetter} from '../worldBoss/client';
import {rewardText} from '../saga/rewards';
import {GameTabs} from './CompactGame';
import {Icon} from './Icon';
import {MiniReward} from './MiniReward';
import './worldBoss.css';
import {art} from '../data/catalog';

const BOSSES=['minotaur_echo','fire_abyss_lord','spider_queen','fungal_king','capybara_bruiser','senior_driller','moss_eater'];
const num=(n:number)=>Math.round(n).toLocaleString('ru');
const clock=(ms:number)=>{if(ms<=0)return '0:00';const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor(s/60)%60,ss=s%60;return (h?h+':'+String(m).padStart(2,'0'):String(m))+':'+String(ss).padStart(2,'0')};
const reward=(r:BossReward)=>toReward(r);
type Tab='fight'|'top'|'history'|'rewards'|'admin';

/** The shared battle scene: existing actor animations, hero look and combat accents, no second engine. */
function BossScene({p,boss,hpFrac,hit,defeated,killer}:{p:Player;boss:string;hpFrac:number;hit:{n:number;damage:number;critical:boolean;killing?:boolean}|null;defeated:boolean;killer?:string}){
 const canvas=useRef<HTMLCanvasElement>(null),vfx=useRef(new CombatVfx()),texts=useRef<{t:number;text:string;crit:boolean}[]>([]),swing=useRef(0),hurt=useRef(0);
 const lastHit=useRef(0),player=useRef(p);player.current=p;
 useEffect(()=>{warmRun(boss);warmRun(heroArt[p.heroClass])},[boss,p.heroClass]);
 useEffect(()=>{
  if(!hit||hit.n===lastHit.current)return;lastHit.current=hit.n;
  swing.current=.7;hurt.current=.35;
  vfx.current.hit(300,150,hit.critical,'#fff4ce',true);
  if(hit.killing)vfx.current.watchBoss('kill-'+hit.n,true,false,false,300,236);
  texts.current.push({t:0,text:(hit.critical?'✦ ':'')+num(hit.damage),crit:hit.critical});
 },[hit]);
 useEffect(()=>{
  const c=canvas.current?.getContext('2d');if(!c)return;
  const sky=sceneImage('world-mountains');let raf=0,last=performance.now(),clockT=0;
  const reduced=!!player.current.reducedMotion;
  const frame=(now:number)=>{
   const dt=Math.min(.05,(now-last)/1000);last=now;clockT+=dt;
   swing.current=Math.max(0,swing.current-dt);hurt.current=Math.max(0,hurt.current-dt);vfx.current.step(dt);
   const ratio=Math.min(2,window.devicePixelRatio||1),w=432,h=250;
   if(canvas.current!.width!==w*ratio){canvas.current!.width=w*ratio;canvas.current!.height=h*ratio}
   c.setTransform(ratio,0,0,ratio,0,0);
   const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#2a1d3f');g.addColorStop(.6,'#6b3b4a');g.addColorStop(1,'#1b1420');
   c.fillStyle=g;c.fillRect(0,0,w,h);
   if(sky.complete&&sky.naturalWidth){c.globalAlpha=.55;c.drawImage(sky,0,0,sky.naturalWidth,sky.naturalHeight*.7,0,0,w,h*.75);c.globalAlpha=1}
   const ground=c.createLinearGradient(0,h*.72,0,h);ground.addColorStop(0,'#3b2a2a');ground.addColorStop(1,'#140d10');c.fillStyle=ground;c.fillRect(0,h*.72,w,h*.28);
   // Boss menace: a slow pulsing aura that grows as it weakens.
   if(!defeated){const a=c.createRadialGradient(300,170,10,300,170,150);a.addColorStop(0,`rgba(255,120,60,${.18+(1-hpFrac)*.2+(reduced?0:.05*Math.sin(clockT*2))})`);a.addColorStop(1,'rgba(255,120,60,0)');c.fillStyle=a;c.fillRect(150,40,300,210)}
   const t=reduced?0:clockT;
   drawActor(c,heroArt[player.current.heroClass],120,232,118,t,false,swing.current,0,0,0,defeated,false,false,heroLook(player.current,sceneImage('ui-wings'),clockT,1,reduced));
   // A defeated boss stays on the field, upright but dimmed, so the finished event never shows an empty scene.
   if(defeated){c.save();c.filter='grayscale(.65) brightness(.62)'}
   drawActor(c,boss,305,236,190,t,false,0,defeated?.3:hurt.current,0,0,false,true,true);
   if(defeated)c.restore();
   vfx.current.draw(c,1,reduced);
   for(const x of texts.current){x.t+=dt;const k=x.t/1.1;c.save();c.globalAlpha=Math.max(0,1-k);c.font=`900 ${x.crit?30:24}px system-ui`;c.textAlign='center';c.lineWidth=5;c.strokeStyle='#26354c';c.fillStyle=x.crit?'#ffd86b':'#fff4ce';c.strokeText(x.text,300,110-k*40);c.fillText(x.text,300,110-k*40);c.restore()}
   texts.current=texts.current.filter(x=>x.t<1.1);
   raf=requestAnimationFrame(frame);
  };
  raf=requestAnimationFrame(frame);
  // Android WebView may drop a 2D context under memory pressure: force a full redraw once it is back.
  const el=canvas.current!,restored=()=>{el.width=0};
  el.addEventListener('contextrestored',restored);
  return ()=>{cancelAnimationFrame(raf);el.removeEventListener('contextrestored',restored)};
 },[boss,hpFrac,defeated]);
 // The painted stage behind the canvas keeps the sky and the boss visible even if the canvas is blank.
 return <div className={'wb-stage'+(defeated?' is-defeated':'')} style={{'--wb-sky':`url(${art('world-mountains')})`,'--wb-boss':`url(${art('bosses/'+boss)})`} as React.CSSProperties}>
  <canvas ref={canvas} className="wb-scene" aria-hidden="true"/>
  {defeated&&<div className="wb-defeat" role="status"><Icon name="crown"/><b>Босс повержен</b>{killer&&<small>Последний удар · {killer}</small>}</div>}
 </div>;
}

export function WorldBossPanel({p}:{p:Player}){
 const notice=useGame(s=>s.notice),mutate=useGame(s=>s.mutate);
 const [data,setData]=useState<BossState|null>(null),[offset,setOffset]=useState(0),[error,setError]=useState('');
 const [busy,setBusy]=useState(false),[tab,setTab]=useState<Tab>('fight'),[now,setNow]=useState(Date.now());
 const [hit,setHit]=useState<{n:number;damage:number;critical:boolean;killing?:boolean}|null>(null);
 const accept=useCallback((s:BossState)=>{setData(s);setOffset(Date.parse(s.serverNow)-Date.now());setError('')},[]);
 const load=useCallback(()=>bossState().then(accept).catch((e:unknown)=>setError(e instanceof BossError?e.code:'world_boss_unavailable')),[accept]);
 useEffect(()=>{void load();const poll=setInterval(()=>{if(!document.hidden)void load()},5000),tick=setInterval(()=>setNow(Date.now()),500);return ()=>{clearInterval(poll);clearInterval(tick)}},[load]);
 const serverNow=now+offset,e=data?.event??null;
 const readyIn=e?.me.nextHitAt?Date.parse(e.me.nextHitAt)-serverNow:0;
 const hitsLeft=e?e.dailyHits-e.me.hitsToday:0;
 const canHit=!!e?.active&&!busy&&readyIn<=0&&hitsLeft>0;
 const attack=async()=>{
  if(!canHit)return;setBusy(true);
  try{const s=await bossAttack();accept(s);if(s.hit){setHit(h=>({n:(h?.n??0)+1,damage:s.hit!.damage,critical:s.hit!.critical,killing:s.hit!.killing}));if(s.hit.killing)notice('Последний удар за вами! Босс повержен')}if(s.error)notice(errorText[s.error]??s.error)}
  catch(err){const code=err instanceof BossError?err.code:'world_boss_unavailable';notice(errorText[code]??code);void load()}
  finally{setBusy(false)}
 };
 const claim=async(l:BossLetter)=>{
  try{const r=await bossClaim(l.eventId,l.kind);let applied=false;mutate(draft=>{applied=applyLetter(draft,r.eventId,r.kind,r.payload)});
   notice(applied?'Награда: '+rewardText(toReward(r.payload)):'Награда уже получена');void load()}
  catch(err){const code=err instanceof BossError?err.code:'world_boss_unavailable';notice(errorText[code]??code)}
 };
 if(!data)return <section className="world-boss"><p className="wb-status">{error?errorText[error]??error:'Связь с сервером…'}</p>{error&&<button className="action secondary" onClick={()=>void load()}>Повторить</button>}</section>;
 const pending=data.mail.filter(l=>!l.claimed||!letterApplied(p,l.eventId,l.kind));
 const tabs:[Tab,string][]=[['fight','Бой'],['top','Рейтинг'],['history','История'],['rewards','Награды'+(pending.length?' · '+pending.length:'')],...(data.isAdmin?[['admin','Админ'] as [Tab,string]]:[])];
 return <section className="world-boss">
  <GameTabs label="Мировой босс" value={tab} items={tabs} onChange={setTab}/>
  {tab==='fight'&&(e?<>
   <header className="wb-head"><strong>{e.title}</strong><span>{nameOf(e.boss)}</span>
    <em>{e.active?'До конца · '+clock(Date.parse(e.endsAt)-serverNow):Date.parse(e.startsAt)>serverNow?'Начало через '+clock(Date.parse(e.startsAt)-serverNow):e.status==='defeated'?'Повержен':'Время вышло'}</em></header>
   <BossScene p={p} boss={e.boss} hpFrac={e.hp/e.maxHp} hit={hit} defeated={e.status==='defeated'} killer={e.lastHit?(e.lastHit.me?'ваш':e.lastHit.name):undefined}/>
   <div className={'wb-hp'+(e.status==='defeated'?' is-defeated':'')} role="progressbar" aria-label="Здоровье босса" aria-valuemin={0} aria-valuemax={e.maxHp} aria-valuenow={e.hp}>
    <i style={{width:Math.max(0,e.hp/e.maxHp*100)+'%'}}/><span>{e.status==='defeated'?'Повержен · '+num(e.maxHp)+' урона':num(e.hp)+' / '+num(e.maxHp)}</span></div>
   {e.status==='defeated'?<button type="button" className="action wb-attack is-won" onClick={()=>setTab('rewards')}><Icon name="chest"/>{pending.length?'Победа · забрать награды':'Победа · награды получены'}</button>:
   <button type="button" className="action wb-attack" disabled={!canHit} onClick={()=>void attack()}>
    {busy?'Удар…':!e.active?'Событие не идёт':hitsLeft<=0?'Атаки на сегодня закончились':readyIn>0?'Готовность · '+Math.ceil(readyIn/1000)+' с':'Атаковать'}
    {e.active&&readyIn>0&&<i className="wb-cool" style={{width:Math.min(100,readyIn/(e.cooldownSeconds*1000)*100)+'%'}}/>}
   </button>}
   {e.lastHit&&<p className="wb-last"><Icon name="crown"/>Последний удар · <b>{e.lastHit.me?'ваш':e.lastHit.name}</b> · {num(e.lastHit.damage)}</p>}
   <div className="wb-me"><span>Ваш урон<b>{num(e.me.damage)}</b></span><span>Место<b>{e.me.rank??'—'}</b></span><span>Атак за день<b>{e.me.hitsToday}/{e.dailyHits}</b></span><span>Участников<b>{e.participants}</b></span></div>
   <details className="saga-disclosure"><summary><Icon name="chest"/><span>Награды события</span></summary>
    <ul className="wb-rules">
     <li><span>Участие</span><MiniReward reward={reward(e.rewards.participation)}/></li>
     {e.rewards.ranks.map((r,i)=><li key={r.upTo}><span>{i===0||e.rewards.ranks[i-1].upTo+1===r.upTo?'Место '+r.upTo:'Места '+(e.rewards.ranks[i-1]?.upTo+1||1)+'–'+r.upTo}</span><MiniReward reward={reward(r.reward)}/></li>)}
     <li><span>Последний удар</span><MiniReward reward={reward(e.rewards.lastHit)}/></li>
    </ul>
    <p className="hint">Урон считает сервер: {num(e.damageMin)}–{num(e.damageMax)} за удар, иногда критический. Интервал атак {e.cooldownSeconds} с, до {e.dailyHits} атак в сутки. Если время выйдет раньше победы, награды за участие и место составят {Math.round(e.expiredMultiplier*100)}%. Награды приходят в Почту один раз.</p>
   </details>
  </>:<p className="wb-status">Сейчас мировой босс не появился. Загляните позже — о прошлых битвах рассказывает вкладка «История».</p>)}
  {tab==='top'&&(e?<ol className="wb-top">{e.top.map(r=><li key={r.place} className={r.me?'me':''}><b>{r.place}</b><span>{r.name}</span><em>{num(r.damage)}</em></li>)}
   {!e.top.length&&<li className="empty">Пока никто не атаковал</li>}</ol>:<p className="wb-status">Рейтинга пока нет.</p>)}
  {tab==='history'&&(data.history.length?<ul className="wb-history">{data.history.map(h=><li key={h.id}>
   <strong>{h.title}</strong><small>{new Date(h.finishedAt).toLocaleDateString('ru')} · {h.status==='defeated'?'повержен':'время вышло'} · участников {h.participants}</small>
   {h.lastHitName&&<small>Последний удар · {h.lastHitName}</small>}
   <small>{h.top.map((t,i)=>`${i+1}. ${t.name} ${num(t.damage)}`).join(' · ')}</small>
   {h.myDamage>0&&<small className="mine">Ваш урон · {num(h.myDamage)}</small>}
  </li>)}</ul>:<p className="wb-status">Завершённых битв пока нет.</p>)}
  {tab==='rewards'&&<BossLetters p={p} letters={data.mail} onClaim={l=>void claim(l)}/>}
  {tab==='admin'&&data.isAdmin&&<BossAdmin state={data} onState={accept}/>}
 </section>;
}

const kindName={participation:'Участие',rank:'Место',last_hit:'Последний удар'} as const;
export function BossLetters({p,letters,onClaim}:{p:Player;letters:BossLetter[];onClaim:(l:BossLetter)=>void}){
 if(!letters.length)return <p className="wb-status">Наград пока нет. После окончания битвы они придут сюда и в Почту.</p>;
 return <ul className="wb-letters">{letters.map(l=>{const done=l.claimed&&letterApplied(p,l.eventId,l.kind);return <li key={l.eventId+l.kind}>
  <span><strong>{l.title}</strong><small>{kindName[l.kind]}{l.place?' · '+l.place:''}</small></span>
  <MiniReward reward={toReward(l.payload)}/>
  {done?<em>✓ Получено</em>:<button type="button" className="action" onClick={()=>onClaim(l)}>Забрать</button>}
 </li>})}</ul>;
}

function BossAdmin({state,onState}:{state:BossState;onState:(s:BossState)=>void}){
 const notice=useGame(s=>s.notice),e=state.event?.status==='open'?state.event:null;
 const [form,setForm]=useState({title:'Ётун Хримтурс',boss:'minotaur_echo',hp:5000000,minutes:1440,cooldown:8,daily:40,min:900,max:1400});
 const set=(k:keyof typeof form,v:string)=>setForm(f=>({...f,[k]:k==='title'||k==='boss'?v:Number(v)}));
 const run=async(task:()=>Promise<BossState>)=>{try{onState(await task());notice('Готово')}catch(err){const code=err instanceof BossError?err.code:'world_boss_unavailable';notice(errorText[code]??code)}};
 return <div className="wb-admin">
  {e?<><p>Идёт · {e.title} · {num(e.hp)}/{num(e.maxHp)} HP · участников {e.participants}</p>
   <button className="action secondary" onClick={()=>void run(()=>bossAdminEnd(e.id))}>Завершить досрочно</button></>
  :<form onSubmit={ev=>{ev.preventDefault();void run(()=>bossAdminStart({title:form.title,boss:form.boss,minutes:form.minutes,maxHp:form.hp,config:{cooldownSeconds:form.cooldown,dailyHits:form.daily,damageMin:form.min,damageMax:form.max}}))}}>
   <label>Название<input value={form.title} maxLength={60} onChange={ev=>set('title',ev.target.value)}/></label>
   <label>Босс<select value={form.boss} onChange={ev=>set('boss',ev.target.value)}>{BOSSES.map(b=><option key={b} value={b}>{nameOf(b)}</option>)}</select></label>
   <label>Здоровье<input type="number" min={1000} value={form.hp} onChange={ev=>set('hp',ev.target.value)}/></label>
   <label>Длительность, мин<input type="number" min={5} max={20160} value={form.minutes} onChange={ev=>set('minutes',ev.target.value)}/></label>
   <label>Интервал атак, с<input type="number" min={1} value={form.cooldown} onChange={ev=>set('cooldown',ev.target.value)}/></label>
   <label>Атак в сутки<input type="number" min={1} value={form.daily} onChange={ev=>set('daily',ev.target.value)}/></label>
   <label>Урон от<input type="number" min={1} value={form.min} onChange={ev=>set('min',ev.target.value)}/></label>
   <label>Урон до<input type="number" min={1} value={form.max} onChange={ev=>set('max',ev.target.value)}/></label>
   <button className="action" type="submit">Запустить босса</button>
   <p className="hint">Награды — по умолчанию сервера (золото, Хаосит, жетоны Арены). Изменение наград — параметр config события.</p>
  </form>}
 </div>;
}

/** World boss letters inside the existing Mail window: claimed on the server once, applied to the save once. */
export function WorldBossMail({p,onLetters}:{p:Player;onLetters?:(count:number)=>void}){
 const notice=useGame(s=>s.notice),mutate=useGame(s=>s.mutate);
 const [letters,setLetters]=useState<BossLetter[]|null>(null);
 const load=useCallback(()=>bossState().then(s=>{setLetters(s.mail);onLetters?.(s.mail.length)}).catch(()=>setLetters(null)),[onLetters]);
 useEffect(()=>{void load()},[load]);
 if(!letters?.length)return null;
 const claim=async(l:BossLetter)=>{
  try{const r=await bossClaim(l.eventId,l.kind);let applied=false;mutate(draft=>{applied=applyLetter(draft,r.eventId,r.kind,r.payload)});
   notice(applied?'Награда: '+rewardText(toReward(r.payload)):'Награда уже получена');void load()}
  catch(err){const code=err instanceof BossError?err.code:'world_boss_unavailable';notice(errorText[code]??code)}
 };
 return <section className="world-boss wb-mail" aria-label="Награды мирового босса"><h3><Icon name="crown"/>Мировой босс</h3><BossLetters p={p} letters={letters} onClaim={l=>void claim(l)}/></section>;
}
