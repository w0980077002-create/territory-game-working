import {useEffect,useLayoutEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Item,Player} from '../core/types';
import {useGame} from '../core/store';
import {xpNeeded} from '../core/formulas';
import {art,heroArt,classNames,rarityColors,rarityNames,slotNames} from '../data/catalog';
import {Icon,gearIcon} from './Icon';
import {sound,unlockAudio} from '../game/Sound';
import {RewardNotice} from './RewardArt';

/** Shorter than a deliberate second tap, longer than a double tap. */
export const TAP_GUARD_MS=350;

export type Material='chest'|'forge'|'rune'|'sea'|'roman'|'moon'|'gold';
const themes:Record<string,Material>={equipment:'chest',inventory:'chest',item:'chest',mail:'chest',loot:'gold',wings:'moon',skills:'rune',talents:'rune',forge:'forge',workshops:'forge',blessing:'gold',relic:'rune',realm:'rune',darkgear:'moon',gems:'chest',arena:'roman',battle:'roman',controls:'roman',autobattle:'roman',hero:'moon',honor:'gold',companions:'moon',shop:'chest',rewards:'gold',events:'gold',carnival:'gold',collection:'moon'};
const panelIcons:Record<string,string>={
 'gear:wings':'wings',season:'banner',lair:'lair-keeper',adventure:'map',arena:'arena',carnival:'event',collection:'book',equipment:'armor',events:'banner',
 friends:'handshake',honor:'crown',invite:'handshake',inventory:'chest',loot:'horn',mail:'mail',port:'ship',
 quests:'scroll',rewards:'gift',shop:'market',skills:'skill',wings:'wings',
};
const materialIcons:Record<Material,string>={chest:'chest',forge:'hammer',rune:'rune',sea:'ship',roman:'shield',moon:'wings',gold:'gift'};

function Atmosphere({kind}:{kind:Material}){
 return <div className={`ambient ambient-${kind}`} aria-hidden="true">{Array.from({length:5},(_,i)=><i key={i} style={{'--n':i} as React.CSSProperties}/>)}</div>;
}
export function panelMaterial(panel:string):Material{return panel==='gear:wings'?'moon':panel.startsWith('gear:')?'forge':themes[panel]??'sea'}
function panelIcon(panel:string,kind:Material){return panelIcons[panel]??materialIcons[kind]}

export function DialogShell({panel,title,children,footer,rarity,onBack,backLabel,scrollMemory,dismissible=true}:{panel:string;title:string;children:React.ReactNode;footer:React.ReactNode;rarity?:number;onBack?:()=>void;backLabel?:string;scrollMemory?:Map<string,number>;dismissible?:boolean}){
 const toast=useGame(s=>s.toast),toastReward=useGame(s=>s.toastReward),storageError=useGame(s=>s.storageError),close=useGame(s=>s.open),reduced=useGame(s=>s.p.reducedMotion);
 const localScroll=useRef(new Map<string,number>()),openedAt=useRef(0);
 const scrollPositions=scrollMemory??localScroll.current;
 const kind=panelMaterial(panel),ref=useRef<HTMLElement>(null),body=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const previous=document.activeElement as HTMLElement|null,background=document.querySelector<HTMLElement>('.viewport');
  if(background)background.inert=true;
  return()=>{if(background)background.inert=false;previous?.focus({preventScroll:true})};
 },[]);
 useLayoutEffect(()=>{openedAt.current=performance.now();ref.current?.focus({preventScroll:true});if(body.current)body.current.scrollTop=scrollPositions.get(panel)??0},[panel,scrollPositions]);
 const realmBack=panel==='realm'?onBack:undefined;
 const dismiss=()=>{if(realmBack)realmBack();else close(panel==='carnival'?'events':null)};
 const keyDown=(e:React.KeyboardEvent)=>{
  if((e.target as HTMLElement).closest('dialog'))return;
  if(dismissible&&e.key==='Escape'&&!document.querySelector(':popover-open')){e.stopPropagation();dismiss()}
  if(e.key!=='Tab')return;
  const controls=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select,input:not(:disabled):not([hidden]),textarea,a[href],summary,[tabindex="0"]')??[]).filter(el=>el.getClientRects().length);
  const first=controls[0],last=controls.at(-1),active=document.activeElement;
  if(!first){e.preventDefault();ref.current?.focus();return}
  if(e.shiftKey&&(active===first||active===ref.current||!ref.current?.contains(active))){e.preventDefault();last?.focus()}
  else if(!e.shiftKey&&(active===last||active===ref.current||!ref.current?.contains(active))){e.preventDefault();first.focus()}
 };
 const harborBack=['shipyard','forge','blessing','talents','darkgear','gems','relic','companions'].includes(panel);
 const workspace=['realm','darkgear','companions','relic','port'].includes(panel);
 return createPortal(<div className="modal-shade saga-shade" data-motion={reduced?'reduced':undefined} onClickCapture={e=>{
  // A second tap on the objective can land on «Продолжить поход» in the new portal.
  if(panel==='realm'&&e.detail>1&&performance.now()-openedAt.current<TAP_GUARD_MS){
   e.preventDefault();e.stopPropagation();
  }
 }} onClick={e=>{if(dismissible&&e.target===e.currentTarget)dismiss()}} onKeyDown={keyDown}>
  <section ref={ref} tabIndex={-1} className={`saga-modal material-${kind}`} data-panel={panel} data-layout={workspace?'workspace':undefined} role="dialog" aria-modal="true" aria-label={title} style={rarity===undefined?undefined:{'--rarity':rarityColors[rarity]} as React.CSSProperties}>
   <header className="modal-header">{(onBack||harborBack)?<button className={backLabel==='← Назад'?'harbor-back text-back':'harbor-back'} aria-label={backLabel??'‹ В гавань'} title={backLabel??'В гавань'} onClick={onBack??(()=>close('port'))}>{backLabel==='← Назад'?backLabel:'‹'}</button>:<div className="header-seal"><Icon name={panelIcon(panel,kind)}/></div>}<div><small>VIKING VS ROME <span>·</span> LOOTBORN SAGA</small><h2>{title}</h2></div>{dismissible&&!realmBack&&<button className="close" onClick={dismiss} aria-label="Закрыть">×</button>}</header>
   <div className="dialog-status">{storageError&&<div className="dialog-error" role="alert">Не удалось сохранить. Освободите место в браузере.</div>}{toast&&<div className="dialog-notice" role="status"><RewardNotice message={toast} reward={toastReward}/></div>}</div>
   <div className="modal-body" ref={body} key={panel} onScroll={event=>scrollPositions.set(panel,event.currentTarget.scrollTop)}><div className="panel-content">{children}</div></div>
   {!workspace&&footer}<i className="frame-corner corner-a" aria-hidden="true"/><i className="frame-corner corner-b" aria-hidden="true"/>
  </section>
 </div>,document.body);
}

export function HeroPortrait({p,compact=false}:{p:Player;compact?:boolean}){return <div className={`saga-portrait ${compact?'compact':''}`}><div className="portrait-halo"/>{p.wingVisible&&p.equipment.wings&&<Icon name="wings" className="portrait-wings"/>}<img className="portrait-hero" src={art(heroArt[p.heroClass])} alt={classNames[p.heroClass]}/><span>{classNames[p.heroClass]} <b>· ур.{p.level}</b></span></div>}

/** Presentation is marked before playback; this never grants loot or mutates a save. */
function firstReveal(item:Item,encounter:string){try{const key='lootborn-ui-reveals';const ids=JSON.parse(sessionStorage.getItem(key)??'[]') as string[];const id=encounter+':'+item.id;if(ids.includes(id))return false;sessionStorage.setItem(key,JSON.stringify([...ids.slice(-79),id]));return true}catch{return false}}
export function TrophyReveal({item,encounter}:{item:Item;encounter:string}){const [play,setPlay]=useState(false);const p=useGame(s=>s.p),shown=useRef(false);useEffect(()=>{if(shown.current)return;shown.current=true;if(!firstReveal(item,encounter))return;setPlay(true);if(p.sound){unlockAudio(true);sound(item.rarity>=5?'rare':'loot',true)}},[item,encounter,p.sound]);return <div className={`trophy-reveal reveal-tier-${item.rarity} ${play?'reveal-first':''}`} style={{'--rarity':rarityColors[item.rarity],'--reveal-time':item.rarity>=5?'800ms':item.rarity>=3?'480ms':'240ms'} as React.CSSProperties}><div className="reveal-crown" aria-hidden="true"/><div className="reveal-orbit" aria-hidden="true"/><Atmosphere kind="gold"/><small>{item.rarity>=5?'СОКРОВИЩЕ САГИ':'ТРОФЕЙ ПОБЕДЫ'} · {rarityNames[item.rarity]}</small><Icon name={gearIcon(item.slot)}/><h3>{item.name}</h3><span>{slotNames[item.slot]} · {item.origin??'Добыча после боя'}</span><div className="reveal-stats">{item.percent?<>HP +{item.percent.hp}% · Атака +{item.percent.attack}% · Защита +{item.percent.defense}%</>:<>Атака +{item.attack} · HP +{item.hp} · Защита +{item.defense}</>}</div></div>}


/** Every effect follows a committed state change, including duplicate-click rejection. */
export function forgeFeedback(before:Item){const current=useGame.getState().p.equipment[before.slot];if(current?.id!==before.id||current.upgrade!==before.upgrade+1)return;const p=useGame.getState().p;unlockAudio(p.sound);sound('forge',p.sound);window.dispatchEvent(new CustomEvent('saga-forged',{detail:{id:current.id,upgrade:current.upgrade}}))}
export function ForgeEcho(){const [strike,setStrike]=useState<{id:string;upgrade:number;key:number}|null>(null);useEffect(()=>{let timer:ReturnType<typeof setTimeout>;const receive=(event:Event)=>{const detail=(event as CustomEvent).detail;setStrike({...detail,key:Date.now()});clearTimeout(timer);timer=setTimeout(()=>setStrike(null),1100)};window.addEventListener('saga-forged',receive);return()=>{clearTimeout(timer);window.removeEventListener('saga-forged',receive)}},[]);return strike?<div className="forge-echo" key={strike.key} role="status"><span>Закалено <b>+{strike.upgrade}</b></span>{[0,1,2,3].map(i=><i key={i} style={{'--n':i} as React.CSSProperties}/>)}</div>:null}

export function ExperienceMeter({p}:{p:Player}){const goal=xpNeeded(p.level);return <div className="experience-meter"><div><strong>До уровня {p.level+1}</strong><span>{p.xp} / {goal} XP</span></div><progress max={goal} value={Math.min(goal,p.xp)} aria-label={`Опыт до уровня ${p.level+1}`}/><small>Ещё {Math.max(0,goal-p.xp)} опыта · сражайтесь и разбирайте добычу</small></div>}

export function LevelUpFeedback(){
 const level=useGame(s=>s.p.level),reduced=useGame(s=>s.p.reducedMotion),previous=useRef(level),[award,setAward]=useState<{level:number;points:number}|null>(null);
 useEffect(()=>{if(level>previous.current)setAward({level,points:level-previous.current});previous.current=level},[level]);
 useEffect(()=>{if(award===null)return;const timer=setTimeout(()=>setAward(null),2200);return()=>clearTimeout(timer)},[award]);
 // A slim ribbon inside the game frame, above the fighters: noticeable, never covering the battle or open windows.
 return award===null?null:<div className="level-award" data-motion={reduced?'reduced':undefined} role="status" key={award.level}><span aria-hidden="true">✦</span><div><small>ЛЕГЕНДА РАСТЁТ</small><strong>Уровень {award.level}</strong><p>+{award.points} к талантам</p></div><span aria-hidden="true">✦</span></div>;
}

/** Native top layer keeps the catalog mounted while its input is locked. */
export function CardDialog({title,onClose,children,actions,className=''}:{title:string;onClose:()=>void;children:React.ReactNode;actions?:React.ReactNode;className?:string}){
 const openingToastId=useRef(useGame.getState().toastId);
 const ref=useRef<HTMLDialogElement>(null),id=useId(),toast=useGame(s=>s.toast),toastReward=useGame(s=>s.toastReward),storageError=useGame(s=>s.storageError);
 useLayoutEffect(()=>{
  const previous=document.activeElement as HTMLElement|null,dialog=ref.current!;
  useGame.getState().dismissNotice(openingToastId.current);
  dialog.showModal();
  return()=>{dialog.close();previous?.focus({preventScroll:true})};
 },[]);
 return <dialog ref={ref} className={`context-card ${className}`} aria-labelledby={id} onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose()}}}>
  <header className="context-header"><h3 id={id}>{title}</h3><button autoFocus className="context-close" aria-label="Закрыть карточку" onClick={onClose}>×</button></header>
  <div className="context-body">{children}</div>
  <div className="context-status" role={storageError?'alert':'status'}>{storageError?'Не удалось сохранить. Освободите место в браузере.':toast&&<RewardNotice message={toast} reward={toastReward}/>}</div>
  {actions&&<footer className="context-actions">{actions}</footer>}
 </dialog>;
}
