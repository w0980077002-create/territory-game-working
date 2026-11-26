import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {Player} from '../core/types';
import {heroArt} from '../data/catalog';
import {consumables,consumableStacks,type ConsumableId} from '../arena/potion';
import {beltSlotOpen,playerBelt,setBeltSlot,type BeltSlot} from '../arena/belt';
import {useGame} from '../core/store';
import {arenaElixirs,zones,type ArenaElixir,type ArenaFighter,type ArenaMessage,type ArenaZone} from '../arena/protocol';
import {drawActor,warmRun} from '../game/animation';
import {CombatVfx} from '../game/CombatVfx';
import {heroLook} from '../game/heroLook';
import {sceneImage} from '../game/sceneImages';
import {Icon} from './Icon';

/**
 * One reusable Arena battle screen for Duel 1×1, Squad 3×3, Chaos 20×20 and future clan tournaments.
 * Layout follows the TERRITORY ArenaRoom/BattleScene (defense · fighters · attack, compact plates, Auto/Reset/Strike,
 * folded elixirs and gear, one feed with an «All / Chat only» filter), made more compact in VVR materials.
 * Presentation only: callers pass server state and send the existing server commands.
 */
export type SceneFighter=Pick<ArenaFighter,'name'|'hero'|'level'|'hp'|'maxHp'|'online'>;
export type ZoneControls={attack:ArenaZone;blocks:ArenaZone[];onAttack:(zone:ArenaZone)=>void;onBlock:(zone:ArenaZone)=>void;locked:boolean};
export type BeltControls={belt:Record<ArenaElixir,number>;loadout?:(ArenaElixir|null)[];readyAt:Partial<Record<ArenaElixir,number>>;disabled:boolean;fullHealth:boolean;onItem:(item:ArenaElixir)=>void};
export type Feed={log:ArenaMessage[];chat:ArenaMessage[];chatDeadline:number|null;pending:boolean;send:(text:string)=>Promise<boolean>};

const zoneIds=Object.keys(zones) as ArenaZone[];
const elixirIds=Object.keys(arenaElixirs) as ArenaElixir[];
/** One place to swap in the dedicated elixir artwork when the shop package arrives. */
export const elixirArt:Record<ArenaElixir,string>={
 potion:consumables.potion.icon,heal_small:'potion',heal_large:'stat-health',attack:'stat-attack',defense:'stat-defense',crit:'stat-crit',time:'rune-haste',adrenaline:'passive-battle-thirst',
};
const secondsLeft=(until:number,now:number)=>Math.max(0,Math.ceil((until-now)/1000));
const clock=(s:number)=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');

function Plate({fighter,label,ally}:{fighter:SceneFighter;label:string;ally:boolean}){
 const pct=Math.max(0,Math.min(100,fighter.hp/fighter.maxHp*100));
 return <div className={'vvr-plate'+(ally?' ally':' foe')+(pct<30?' low':'')}>
  <strong>{fighter.name}</strong>
  <small>{label} · ур. {fighter.level}</small>
  <i role="progressbar" aria-label={'Здоровье · '+label} aria-valuemin={0} aria-valuemax={fighter.maxHp} aria-valuenow={fighter.hp}><b style={{width:pct+'%'}}/>
   <span className="vvr-plate-hp">{fighter.hp}/{fighter.maxHp} HP{!fighter.online&&' · без связи'}</span></i>
 </div>;
}

type Float={text:string;x:number;y:number;t:number;color:string;size:number};
type Anim={swing:[number,number];hurt:[number,number];dodge:[number,number];block:[number,number];glow:[number,number];death:[number,number]};
const LINE=/^(.+?) → (.+?): (.*)$/;
const X=[.3,.7];
const pop=(list:Float[],side:0|1,text:string,color:string,size=16)=>list.push({text,x:X[side],y:.32,t:0,color,size});

/** Living fighters on a transparent canvas over the painted arena: the same actor animation and combat accents
 * as the PvE battle and the world boss (idle breathing, strike, hurt, dodge, block, heal, victory and fall). */
function ArenaLive({you,opponent,log,beltLeft,outcome,look}:{you:SceneFighter;opponent:SceneFighter;log:ArenaMessage[];beltLeft:number;outcome?:'win'|'loss'|'draw';look?:Player}){
 const canvas=useRef<HTMLCanvasElement>(null),vfx=useRef(new CombatVfx()),floats=useRef<Float[]>([]);
 const anim=useRef<Anim>({swing:[0,0],hurt:[0,0],dodge:[0,0],block:[0,0],glow:[0,0],death:[0,0]});
 const seen=useRef(log.at(-1)?.id??0),hp=useRef([you.hp,opponent.hp]),belt=useRef(beltLeft);
 const props=useRef({you,opponent,outcome,look});props.current={you,opponent,outcome,look};
 const reduced=!!look?.reducedMotion;
 useEffect(()=>{warmRun(heroArt[you.hero]);warmRun(heroArt[opponent.hero])},[you.hero,opponent.hero]);
 // Combat events from the server log («A → B: …»): who struck whom, block, dodge, crit, damage.
 useEffect(()=>{
  for(const line of log){
   if(line.id<=seen.current)continue;seen.current=line.id;
   const m=LINE.exec(line.text);if(!m)continue;
   const who=m[1]===props.current.you.name?0:m[1]===props.current.opponent.name?1:-1;if(who<0)continue;
   const from=who as 0|1,to=(1-from) as 0|1,a=anim.current,what=m[3];
   a.swing[from]=.7;
   if(what.startsWith('уклонение')){a.dodge[to]=.55;pop(floats.current,to,'Уклон','#e7f3ff',14)}
   else if(what.startsWith('блок')){a.block[to]=.6;pop(floats.current,to,'Блок','#9fd8ff',14)}
   else{const dmg=/−(\d+)/.exec(what)?.[1],crit=what.includes('критический');a.hurt[to]=.35;
    vfx.current.hit(X[to]*320,70,crit,crit?'#ffd86b':'#ffe3b0',from===0);if(dmg)pop(floats.current,to,'−'+dmg,crit?'#ffd23f':'#ff7b6b',crit?20:16)}
  }
 },[log]);
 // Healing and elixirs: a green figure and a warm glow on the hero.
 useEffect(()=>{
  const now=[you.hp,opponent.hp];
  now.forEach((v,i)=>{const gain=v-hp.current[i];if(gain>0&&hp.current[i]>0){pop(floats.current,i as 0|1,'+'+gain,'#7cf29a');anim.current.glow[i]=.9}});
  hp.current=now;
 },[you.hp,opponent.hp]);
 useEffect(()=>{if(beltLeft<belt.current){anim.current.glow[0]=1;pop(floats.current,0,'Эликсир','#ffe08a',13)}belt.current=beltLeft},[beltLeft]);
 useEffect(()=>{
  const c=canvas.current?.getContext('2d');if(!c)return;
  let raf=0,last=performance.now(),t=0;
  const wings=sceneImage('ui-wings');
  const frame=(now:number)=>{
   const dt=Math.min(.05,(now-last)/1000);last=now;t+=dt;
   const el=canvas.current!,w=320,h=150,ratio=Math.min(2,window.devicePixelRatio||1);
   if(el.width!==w*ratio){el.width=w*ratio;el.height=h*ratio}
   c.setTransform(ratio,0,0,ratio,0,0);c.clearRect(0,0,w,h);
   const a=anim.current,{you,opponent,outcome,look}=props.current;
   for(const k of ['swing','hurt','dodge','block','glow'] as const)a[k]=[Math.max(0,a[k][0]-dt),Math.max(0,a[k][1]-dt)];
   const fallen=[you.hp<=0||outcome==='loss',opponent.hp<=0||outcome==='win'];
   a.death=[fallen[0]?Math.min(1,a.death[0]+dt):0,fallen[1]?Math.min(1,a.death[1]+dt):0];
   const time=reduced?0:t;
   [you,opponent].forEach((f,i)=>{
    const side=i as 0|1,x=X[side]*w+(reduced?0:(side?1:-1)*-Math.sin(a.dodge[side]/.55*Math.PI)*16),y=h-4;
    if(a.glow[side]>0){const g=c.createRadialGradient(x,y-50,4,x,y-50,60);g.addColorStop(0,`rgba(255,224,138,${.45*a.glow[side]})`);g.addColorStop(1,'rgba(255,224,138,0)');c.fillStyle=g;c.fillRect(x-60,y-110,120,110)}
    const won=outcome==='win'&&side===0||outcome==='loss'&&side===1;
    drawActor(c,heroArt[f.hero],x,y,118,time,false,a.swing[side],a.hurt[side],a.death[side]*.9,0,won,false,side===1,
     side===0&&look?heroLook(look,wings,t,1,reduced):undefined);
    if(a.block[side]>0){c.save();c.globalAlpha=Math.min(1,a.block[side]*2);c.strokeStyle='#9fd8ff';c.lineWidth=3;c.beginPath();c.arc(x+(side?-26:26),y-62,22,-1.2,1.2,side===1);c.stroke();c.restore()}
   });
   vfx.current.step(dt);vfx.current.draw(c,1,reduced);
   for(const f of floats.current){f.t+=dt;const k=f.t/1.1;c.save();c.globalAlpha=Math.max(0,1-k);c.font=`900 ${f.size}px system-ui`;c.textAlign='center';
    c.lineWidth=4;c.strokeStyle='#1a120c';c.fillStyle=f.color;const fy=f.y*h-k*28;c.strokeText(f.text,f.x*w,fy);c.fillText(f.text,f.x*w,fy);c.restore()}
   floats.current=floats.current.filter(f=>f.t<1.1);
   raf=requestAnimationFrame(frame);
  };
  raf=requestAnimationFrame(frame);
  return ()=>cancelAnimationFrame(raf);
 },[reduced]);
 return <canvas ref={canvas} className="vvr-live" aria-hidden="true"/>;
}

function Messages({feed,now}:{feed:Feed;now:number}){
 const [only,setOnly]=useState(false),[draft,setDraft]=useState('');
 const box=useRef<HTMLDivElement>(null),stick=useRef(true);
 const lines=(only?feed.chat:[...feed.log,...feed.chat].sort((a,b)=>a.at-b.at||a.id-b.id));
 const last=lines.at(-1);
 useEffect(()=>{const node=box.current;if(node&&stick.current)node.scrollTop=node.scrollHeight},[only,last?.id,last?.at]);
 const remain=feed.chatDeadline===null?null:secondsLeft(feed.chatDeadline,now);
 return <div className="vvr-feed">
  <div className="vvr-feed-tabs" role="group" aria-label="Фильтр сообщений">
   <button type="button" aria-pressed={!only} onClick={()=>{stick.current=true;setOnly(false)}}>Всё</button>
   <button type="button" aria-pressed={only} onClick={()=>{stick.current=true;setOnly(true)}}>Только чат</button>
   {remain!==null&&<small>До закрытия чата · {clock(remain)}</small>}
  </div>
  <div className="vvr-feed-box" ref={box} aria-label={only?'Сообщения комнаты':'События боя и чат'} onScroll={e=>{const n=e.currentTarget;stick.current=n.scrollHeight-n.clientHeight-n.scrollTop<30}}>
   {lines.length===0&&<small>Пока тихо</small>}
   {lines.map(m=><p key={(m.author?'c':'l')+m.id} className={m.author?'chat':'log'}>{m.author&&<strong>{m.author}: </strong>}{m.text}</p>)}
  </div>
  <form onSubmit={async event=>{event.preventDefault();const text=draft.trim();if(text&&await feed.send(text))setDraft(current=>current===draft?'':current)}}>
   <input aria-label="Сообщение" placeholder="Написать…" maxLength={200} value={draft} disabled={remain===0} onChange={e=>setDraft(e.target.value)}/>
   <button type="submit" disabled={feed.pending||remain===0||!draft.trim()}>Отправить</button>
  </form>
 </div>;
}

/** Battle belt: always 7 square slots in the player's order. Filled slots show the picture, count and cooldown;
 * empty slots stay visible. Fights without a fixed belt (legacy staging) fall back to the non-empty kinds. */
export function ArenaBelt({belt,loadout,readyAt,now,disabled,fullHealth,onItem}:BeltControls&{now:number}){
 const slots:(ArenaElixir|null)[]=loadout&&loadout.length?loadout:elixirIds.filter(id=>belt[id]>0);
 return <div className="vvr-arena-belt" role="group" aria-label="Пояс эликсиров">{slots.map((id,index)=>{
  if(!id)return <span key={'empty-'+index} className="vvr-belt-empty" aria-label={'Слот '+(index+1)+' · пусто'}/>;
  const cooldown=secondsLeft(readyAt[id]??0,now),count=belt[id]??0;
  const label=arenaElixirs[id].label+(' · '+count)+(cooldown?' · '+cooldown+' с':'');
  return <button type="button" key={id} title={label+'. '+arenaElixirs[id].detail} aria-label={label}
   disabled={disabled||!count||cooldown>0||(fullHealth&&(id==='heal_small'||id==='heal_large'||id==='potion'))}
   onClick={()=>onItem(id)}><Icon name={elixirArt[id]}/><small>{cooldown?cooldown+' с':count}</small>
   {cooldown>0&&<i className="vvr-belt-cd" aria-hidden="true"/>}</button>;
 })}</div>;
}
function BeltPanel({controls,now}:{controls:BeltControls;now:number}){
 const kinds=(controls.loadout?.filter((id):id is ArenaElixir=>!!id)??elixirIds.filter(id=>controls.belt[id]>0));
 return <details className="vvr-dock-panel">
  <summary><span>Эликсиры и зелья</span><span className="vvr-dock-mini" aria-hidden="true">{kinds.slice(0,4).map(id=><Icon key={id} name={elixirArt[id]}/>)}</span></summary>
  <ArenaBelt {...controls} now={now}/>
  {kinds.length>0?<details className="vvr-belt-help"><summary>Описание расходников</summary>
   <ul>{kinds.map(id=><li key={id}><Icon name={elixirArt[id]}/><span><strong>{arenaElixirs[id].label}</strong><small>{arenaElixirs[id].detail}</small></span></li>)}</ul>
  </details>:<small>Пояс пуст: соберите его на экране Арены до начала боя</small>}
 </details>;
}

/** Belt set-up before a fight: 7 slots; tap a slot to put, swap or remove a consumable. Locked during a fight. */
export function BeltEditor({player,locked}:{player:Player;locked:boolean}){
 const mutate=useGame(s=>s.mutate),open=useGame(s=>s.open);
 const [picking,setPicking]=useState<number|null>(null);
 const belt=playerBelt(player),stock=consumableStacks(player);
 const count=(id:ConsumableId)=>stock.find(item=>item.id===id)?.count??0;
 const choices=(Object.keys(consumables) as ConsumableId[]);
 const put=(index:number,item:BeltSlot)=>{mutate(p=>!(p.localArena&&!p.localArena.match.game.result)&&setBeltSlot(p,index,item));setPicking(null)};
 return <section className="vvr-belt-editor" aria-label="Боевой пояс">
  <header><strong>Боевой пояс</strong><small>{locked?'Комплектация закреплена на время боя':'Нажмите на слот, чтобы выбрать расходник'}</small></header>
  <div className="vvr-arena-belt" role="group" aria-label="Слоты пояса">{belt.map((id,index)=>{
   const open=beltSlotOpen(index,player.arenaWins);
   return <button type="button" key={index} className={(id?'filled':'empty')+(picking===index?' picking':'')} disabled={locked||!open}
    aria-label={'Слот '+(index+1)+' · '+(!open?'закрыт':id?consumables[id].name+' · '+count(id):'пусто')} aria-pressed={picking===index}
    onClick={()=>setPicking(picking===index?null:index)}>
    {id?<><Icon name={consumables[id].icon}/><small>{count(id)}</small></>:<span aria-hidden="true">{open?'+':'🔒'}</span>}
   </button>;})}
  </div>
  {picking!==null&&!locked&&<div className="vvr-belt-pick" role="listbox" aria-label={'Расходник для слота '+(picking+1)}>
   {choices.map(id=><button type="button" key={id} role="option" aria-selected={belt[picking]===id} onClick={()=>put(picking,id)}>
    <Icon name={consumables[id].icon}/><span><strong>{consumables[id].name}</strong><small>В запасе: {count(id)}</small></span></button>)}
   {belt[picking]&&<button type="button" className="vvr-belt-remove" onClick={()=>put(picking,null)}>Убрать из слота</button>}
   <button type="button" className="vvr-belt-shop" onClick={()=>open('shop')}>Зелья в Лавке</button>
  </div>}
 </section>;
}

export function ArenaResult({outcome,reason,extra,onLeave,leaveLabel='Вернуться на Арену'}:{
 outcome:'win'|'loss'|'draw';reason:string;extra?:string;onLeave?:()=>void;leaveLabel?:string;
}){
 const title={win:'Победа',loss:'Поражение',draw:'Ничья'}[outcome];
 return <div className={'vvr-result '+outcome} role="status">
  <strong>{title}</strong><span>{reason}{extra&&<> · <b>{extra}</b></>}</span>
  {onLeave&&<button type="button" onClick={onLeave}>{leaveLabel}</button>}
 </div>;
}

/** TERRITORY FighterList: a folded HP strip per side; open it to see every fighter and pick a target. */
export function FighterList({title,ally,fighters,meId,targetId,onTarget}:{
 title:string;ally:boolean;fighters:{id:string;name:string;hp:number;maxHp:number;kills:number}[];meId?:string;targetId?:string;onTarget?:(id:string)=>void;
}){
 const alive=fighters.filter(f=>f.hp>0).length;
 return <details className={'vvr-dock-panel vvr-fighters '+(ally?'ally':'foe')}>
  <summary><span>{title}</span><span className="vvr-fighters-strip" aria-hidden="true">{fighters.slice(0,20).map(f=><i key={f.id}><b style={{width:Math.max(0,f.hp/f.maxHp*100)+'%'}}/></i>)}</span><em>{alive}/{fighters.length}</em></summary>
  <ul>{fighters.map(f=>{const dead=f.hp<=0,me=f.id===meId,pick=!!onTarget&&!dead;
   return <li key={f.id} className={(f.id===targetId?'target ':'')+(dead?'dead ':'')+(me?'me':'')}>
    {pick?<button type="button" aria-pressed={f.id===targetId} aria-label={'Цель · '+f.name} onClick={()=>onTarget!(f.id)}>{f.name}</button>:<span>{f.name}{me&&' (вы)'}</span>}
    <i><b style={{width:Math.max(0,f.hp/f.maxHp*100)+'%'}}/></i><small>{f.hp}/{f.maxHp}</small>{f.kills>0&&<small>⚔ {f.kills}</small>}
   </li>})}</ul>
 </details>;
}

/** The whole battle screen. `actions` are the compact Auto / Reset / Strike buttons; `dock` holds mode-specific folds. */
export function ArenaBattleView({mode,round,timer,you,opponent,zoneControls,status,result,outcome,actions,belt,dock,feed,now,look}:{
 mode:string;round?:number;timer:number|null;you:SceneFighter;opponent:SceneFighter;zoneControls:ZoneControls|null;status?:string;
 result?:ReactNode;outcome?:'win'|'loss'|'draw';actions?:ReactNode;belt:BeltControls|null;dock?:ReactNode;feed:Feed;now:number;look?:Player;
}){
 const z=zoneControls,live=!result;
 const beltLeft=belt?elixirIds.reduce((sum,id)=>sum+belt.belt[id],0):0;
 return <div className={'vvr-battle'+(live?' live':'')}>
  <div className="vvr-battle-stage vvr-fight">
   <div className="vvr-fight-top">
    <Plate fighter={you} label="Вы" ally/>
    <div className="vvr-fight-clock"><span>{mode}</span>{timer!==null&&<b className={timer<=10?'urgent':''}>{round?'Раунд '+round+' · ':''}{timer} с</b>}</div>
    <Plate fighter={opponent} label="Соперник" ally={false}/>
   </div>
   <div className="vvr-fight-field">
    <ArenaLive you={you} opponent={opponent} log={feed.log} beltLeft={beltLeft} outcome={outcome} look={look}/>
    {z&&<div className="vvr-zone-col def" role="group" aria-label="Защита · 2 зоны">
     <small>Защита {z.blocks.length}/2</small>
     {zoneIds.map(id=><button key={id} type="button" disabled={z.locked} aria-pressed={z.blocks.includes(id)} onClick={()=>z.onBlock(id)}>{zones[id].label}</button>)}
    </div>}
    {z&&<div className="vvr-zone-col atk" role="group" aria-label="Удар · 1 зона">
     <small>Удар</small>
     {zoneIds.map(id=><button key={id} type="button" disabled={z.locked} aria-pressed={z.attack===id} onClick={()=>z.onAttack(id)}>{zones[id].label}</button>)}
    </div>}
    {status&&live&&<span className="vvr-fight-status" role="status">{status}</span>}
    {result&&<div className="vvr-fight-result">{result}</div>}
   </div>
   {actions&&<div className="vvr-fight-actions">{actions}</div>}
  </div>
  {belt&&<div className="vvr-dock"><BeltPanel controls={belt} now={now}/></div>}
  <Messages feed={feed} now={now}/>{dock&&<div className="vvr-dock">{dock}</div>}
 </div>;
}
