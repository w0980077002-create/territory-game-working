import {useShallow} from 'zustand/react/shallow';
import {useMemo} from 'react';
import {hornRefillDue} from '../core/store';
import {CompactFilter} from './CompactFilter';
import {Backpack} from './Backpack';
import {DialogShell,HeroPortrait,TrophyReveal,ForgeEcho,LevelUpFeedback} from './SagaUI';
import {AutobattleDialog} from './AutobattleDialog';
import {InventoryGrid} from './InventoryGrid';
import {sound,unlockAudio} from '../game/Sound';
import {ItemDetails,EffectComparison,UpgradePlan,BuildGuide,HuntGoals,StatDelta,QuickSwap} from './GearDetails';
import {useEffect,useRef,useState} from 'react';
import {useGame,compareItem,bestUpgrade,bestUpgrades,refill,backupCloud,acknowledgeCloud,isKnownCloud,parseSave,SAVE_KEY,hornPurchase,isolatedProfile,exportSave,unreadableSave,requiresSalvageConfirmation} from '../core/store';
import {SHIP_RULES,starterShipyard,previewShips,shipRate,shipCapacity,shipBuyCost,shipUpgradeCost} from '../core/shipyard';
import {TreasureShop} from './TreasureShop';
import {HarborScene} from './HarborScene';
import {ClassPicker} from './ClassPicker';
import './windowContent.css';
import {stats,xpNeeded,stageLabel,itemPower,skillPowerMultiplier,odinCallSeconds,odinCallMaxLevel} from '../core/formulas';
import {setupTelegram,readCloud} from '../core/telegram';
import {observeTelegramViewport} from '../core/telegramViewport';
import {LEGACY_SAVE_KEY,telegramProfile} from '../core/profile';
import type {Slot,Item,Player} from '../core/types';
import {slots,slotNames,rarityNames,rarityColors,classNames,heroArt,art,skillData} from '../data/catalog';
import balance from '../../config/test-balance.v1.json';
import {battle,mountBattle} from '../game/Battle';
import {Icon,gearIcon} from './Icon';
import {inventoryItems,type LootFilter} from '../core/loot';
import {WorldHud,Chronicle,useRoadStatus,toggleSound} from './WorldHud';
import {regionTitle,regions} from '../saga/regions';
import {Album,SetSummary,SpecChooser,BuildSlots,ForgeBench,Recipes,GearGuide,QuestBoard,type QuestTab} from './SagaPanels';
import {ensureQuests,questBadge,questRefreshDue} from '../saga/quests';
import {resCount,resources,duskCount,type ResId} from '../dark/rules';
import {materials,matCount,materialIds,hasPerk} from '../saga/gear';
import {shopQuote} from '../saga/shop';
import {dailyGift,seasonBadge} from '../saga/events';
import {DailyRewards,SeasonRewards} from './EventRewards';
import {rewardText} from '../saga/rewards';
import {PORTALS} from '../dark/portals';
import {realmRun,floorName} from '../dark/realm';
import {RealmPanel,DarkGearPanel,GemsPanel,RelicsPanel,SquadPanel,DarkHub,PowerSources} from './DarkPanels';
const INVITE_URL='https://t.me/VikingRomeGame';
const currencyNames:Record<string,string>={gold:'Золото',gems:'Самоцветы',chaosite:'Хаосит',tokens:'Жетоны Арены',horn:'Заряды Рога Трофеев',ess:'Тёмная эссенция',shard:'Осколки реликвий',seal:'Печати призыва',dusk:'Камни Сумрака'};
const sourceTitle=(kind:string)=>`Где получить · ${currencyNames[kind]??materials[kind]?.name??kind}`;
const modeNames:Record<string,string>={campaign:'Глава',farm:'Фарм',dungeon:'Логово',darkness:'Тьма',arena:'Арена'};
const fmt=(v:number)=>v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e4?`${(v/1000).toFixed(1)}K`:Math.round(v).toLocaleString('ru');
function Action({children,onClick,disabled=false,kind=''}:{children:React.ReactNode;onClick:()=>void;disabled?:boolean;kind?:string}){return <button className={`action ${kind}`} onClick={onClick} disabled={disabled}>{children}</button>}
function Row({icon,title,detail,children}:{icon:string;title:string;detail?:string;children?:React.ReactNode}){return <div className="row"><Icon name={icon}/><div className="row-content"><strong>{title}</strong>{detail&&<small>{detail}</small>}</div>{children}</div>}
function Gear({slot,item,better,onClick}:{slot:Slot;item?:Item;better?:boolean;onClick:()=>void}){return <button className={`gear gear-${slot} ${!item?'empty':''}${better?' has-better':''}`} style={{'--rarity':item?rarityColors[item.rarity]:'#7a92a1'} as React.CSSProperties} onClick={onClick} aria-label={`${slotNames[slot]}${item?` уровень ${item.level}, усиление ${item.upgrade}`:' · не надето'}${better?' · в рюкзаке есть сильнее':''}`}><Icon name={gearIcon(slot)}/>{better&&<i className="gear-better" aria-hidden="true">▲</i>}<span>{item?`ур.${item.level}${item.upgrade?` +${item.upgrade}`:''}`:slot==='wings'?'Получить крылья':'Пусто'}</span></button>}
function Side({icon,label,panel,style,badge=false}:{icon:string;label:string;panel:string;style:React.CSSProperties;badge?:boolean}){const open=useGame(s=>s.open);return <button className={`side${style.right!==undefined?' side-right':''}${icon==='menu'?' side-menu':''}`} style={style} aria-label={label||titles[panel]||panel} onClick={()=>open(panel)}><span className="side-medal">{icon==='menu'?<img className="icon illustrated forge-menu-art" src={new URL('../../public/art/interface/forge-menu.svg',import.meta.url).href} alt="" aria-hidden="true" draggable={false}/>:<Icon name={icon}/>} {badge&&<i>!</i>}</span><span>{label}</span></button>}
function screenScale(shell?: HTMLElement | null) {
 const css=shell?getComputedStyle(shell):undefined;
 const width=(shell?.clientWidth??window.innerWidth)-(parseFloat(css?.paddingLeft??'0')||0)-(parseFloat(css?.paddingRight??'0')||0);
 const height=(shell?.clientHeight??window.innerHeight)-(parseFloat(css?.paddingTop??'0')||0)-(parseFloat(css?.paddingBottom??'0')||0);
 return Math.min(width/864,height/1536);
}
/** Shorter than a deliberate second tap, longer than a double tap. */
const TAP_GUARD_MS=350;
/** Worn gear and socketed gems: when these change, the tapped button is replaced in place (Вставить → Извлечь). Upgrades keep it. */
const swapKey=(p:Player)=>slots.map(slot=>p.equipment[slot]?.id??'').join()+JSON.stringify((p.saga?.box?.gems as {sock?:unknown}|undefined)?.sock??null);
/** Large backpacks and storage stay importable; this only rejects unreasonable files. */
const MAX_SAVE_TEXT=4_000_000;
/** «+» next to a currency: real places to earn it, each button performs that action. */
function ResourceSources({kind,returnTo}:{kind:string;returnTo?:string}){const g=useGame(),p=g.p;const mineReady=(Date.now()-p.mineAt)/1000>=balance.resource_test_settings.mine_collect_cooldown_seconds;const today=p.daily!==new Date().toISOString().slice(0,10);
 const mine=<Row icon="rune" title="Северная шахта" detail={`2 золота/сек · 1 Хаосит/мин · копится до ${balance.resource_test_settings.offline_accrual_limit_hours} ч`}><Action disabled={!mineReady} onClick={()=>g.claim('mine')}>{mineReady?'Собрать':'Копится'}</Action></Row>;
 const daily=<Row icon="gift" title="Ежедневный подарок" detail={rewardText(dailyGift().base)}><Action kind={today?'':'secondary'} onClick={()=>g.open('rewards')}>{today?'Забрать':'Открыть'}</Action></Row>;
 const quests=<Row icon="scroll" title="Задания" detail="Ежедневные, недельные и сюжетные цели"><Action kind="secondary" onClick={()=>g.open('quests')}>Перейти</Action></Row>;
 const shop=<Row icon="chest" title="Лавка сокровищ" detail="Припасы за золото, самоцветы и жетоны Арены"><Action kind="secondary" onClick={()=>g.open('shop')}>Перейти</Action></Row>;
 const title=currencyNames[kind]??materials[kind]?.name??kind;
 const value=kind==='gold'||kind==='gems'||kind==='chaosite'||kind==='tokens'||kind==='horn'?p[kind]:kind==='dusk'?duskCount(p):Object.hasOwn(resources,kind)?resCount(p,kind as ResId):matCount(p,kind);
 const go=(panel:string,text='Перейти')=><Action kind="secondary" onClick={()=>g.open(panel)}>{text}</Action>;
 return <><div className="test-banner">Сейчас: {fmt(value)} · {title}</div>
  {kind==='gold'&&<>{mine}<Row icon="coins" title="Бесконечный фарм" detail="Золото и опыт за каждую победу"><Action kind="secondary" onClick={()=>battle?.startMode('farm')}>Выбрать</Action></Row><Row icon="axes" title="Бои основной главы" detail="Золото за каждую встречу и босса"/>{daily}{quests}{returnTo!=='shop'&&shop}</>}
  {kind==='gems'&&<>{daily}<Row icon="crown" title="Награда главы" detail={`Победа над боссом главы · 15 самоцветов${p.bosses>p.mission?' · готово':''}`}><Action kind={p.bosses>p.mission?'':'secondary'} onClick={()=>g.open('quests')}>{p.bosses>p.mission?'Получить':'Перейти'}</Action></Row>{quests}<Row icon="event" title="Северный сезон" detail="Награды за первых боссов"><Action kind="secondary" onClick={()=>g.open('events')}>Перейти</Action></Row>{returnTo!=='shop'&&shop}</>}
  {kind==='chaosite'&&<>{mine}{quests}<Row icon="ship" title="Северная гавань" detail="Шахта и мастерские"><Action kind="secondary" onClick={()=>g.open('port')}>Перейти</Action></Row><p className="hint">Хаосит тратится на вход в Логово мини-босса и Царство тьмы.</p></>}
  {kind==='tokens'&&<><Row icon="arena" title="Победы на Арене" detail="Поединки с противниками под управлением игры">{go('arena')}</Row>{quests}<p className="hint">Жетоны Арены тратятся на припасы в Лавке сокровищ.</p></>}
  {kind==='horn'&&<><Row icon="horn" title="Восстановление со временем" detail={`1 заряд за ${balance.horn_test_settings.recharge_one_charge_every_seconds/60} мин · до ${balance.horn_test_settings.maximum_charges}`}/>{daily}{quests}{shop}</>}
  {(Object.hasOwn(resources,kind)||kind==='dusk')&&<><Row icon="portal" title="Царство тьмы" detail={kind==='dusk'?'Победа над владыкой этажа.':resources[kind as ResId].source}>{go('realm')}</Row>{kind==='seal'&&<><Row icon="arena" title="Победить на Арене">{go('arena')}</Row><Row icon="ship" title="Верфь драккаров" detail={`Обмен ${SHIP_RULES.sealPrice} красных алмазов → 1 печать`}>{go('shipyard')}</Row></>}{kind!=='dusk'&&shop}</>}
  {materials[kind]&&kind!=='dusk'&&<><Row icon="axes" title={regions[materialIds.indexOf(kind)]?.name??'Основная глава'} detail="Материал за победы в регионе. В кузнице также доступен обмен 3 → 1."/>{quests}{shop}</>}
 </>}
function ItemDecisions({item,p,isTrophy,onRewardResolved}:{item:Item;p:Player;isTrophy:boolean;onRewardResolved:()=>void}){
 const [confirming,setConfirming]=useState(false);
 const armedAt=useRef(0);
 const gold=Math.round(itemPower(item)/3);
 const salvage=()=>{
  const g=useGame.getState();
  if(confirming){
   if(performance.now()-armedAt.current<TAP_GUARD_MS)return;
   g.salvage(item.id,true);
  }else if(requiresSalvageConfirmation(g.p,item)){
   armedAt.current=performance.now();
   setConfirming(true);
   return;
  }else{
   g.salvage(item.id);
  }
  if(isTrophy)onRewardResolved();
 };
 const keep=()=>{
  const g=useGame.getState();
  if(isTrophy){g.keepReward();onRewardResolved()}
  else if(g.back)g.leaveItem();
  else g.open('inventory');
 };
 return <>
  {confirming&&<div className="item-confirm" role="alert">
   <strong>Распылить «{item.name}»?</strong>
   <span>Предмет исчезнет · +{gold} золота и опыт</span>
   <button type="button" onClick={()=>setConfirming(false)}>Отмена</button>
  </div>}
  <div className="item-decisions">
   <Action onClick={()=>{useGame.getState().equip(item.id);if(isTrophy)onRewardResolved()}}>Надеть</Action>
   <Action kind="secondary" onClick={keep}>{p.pendingLoot?.some(i=>i.id===item.id)?'На хранение':'В рюкзак'}</Action>
   <Action kind="secondary" onClick={salvage}>{confirming?'Подтвердить распыление':`Распылить +${gold}`}</Action>
  </div>
 </>;
}
/** Extra heroes made with «Новый герой» stay in their own local save; list them so none is lost behind a URL. */
function SavedHeroes({onOpen}:{onOpen:(id:string)=>void}){const current=new URLSearchParams(location.search).get('hero');const heroes:{id:string;p:Player}[]=[];try{for(let i=0;i<localStorage.length;i++){const m=/^lootborn-codex-v1:test:(hero-[a-z0-9]{1,26})$/.exec(localStorage.key(i)??'');if(!m||m[1]===current)continue;const saved=parseSave(localStorage.getItem(m[0]));if(saved)heroes.push({id:m[1],p:saved})}}catch{return null}
 if(!heroes.length)return null;heroes.sort((a,b)=>b.p.savedAt-a.p.savedAt);
 return <><h3>Мои герои</h3>{heroes.map(h=><Row key={h.id} icon="people" title={`${classNames[h.p.heroClass]} · ур.${h.p.level}`} detail={`Этап ${stageLabel(h.p.stage)} · сохранён ${new Date(h.p.savedAt).toLocaleDateString('ru')}`}><Action kind="secondary" onClick={()=>onOpen(h.id)}>Открыть</Action></Row>)}</>}
/** Stable ref: brings a just-opened confirmation into view once, not on every re-render. */
const revealOnMount=(el:HTMLElement|null)=>{el?.scrollIntoView({block:'nearest'})};
export default function App(){
 const g=useGame(useShallow(({p,battle,panel,auto,speed,open,equipBest,select,configure,toast,recoveryRequired,storageError})=>
  ({p,battle,panel,auto,speed,open,equipBest,select,configure,toast,recoveryRequired,storageError})));
 const p=g.p,s=useMemo(()=>stats(p),[p]),upgradeSlots=useMemo(()=>new Set(bestUpgrades(p).map(upgrade=>upgrade.slot)),[p]),road=useRoadStatus();
 const canvas=useRef<HTMLCanvasElement>(null),viewport=useRef<HTMLElement>(null),[scale,setScale]=useState(screenScale);
 useEffect(()=>battle?.invalidateViewport(),[scale]);
 const [questTab,setQuestTab]=useState<QuestTab>('day');
 // A window that just opened or closed, or a committed equip/socket change that swapped the button
 // under the finger (Вставить → Извлечь, «Надеть лучшее» → «Снаряжение»), must not catch the second half of a double tap.
 const switchedAt=useRef(0);useEffect(()=>useGame.subscribe((next,prev)=>{if(next.panel!==prev.panel||next.selected!==prev.selected||(next.p!==prev.p&&swapKey(next.p)!==swapKey(prev.p)))switchedAt.current=performance.now()}),[]);
 const ghostTap=(e:React.MouseEvent)=>{if(e.detail>1&&performance.now()-switchedAt.current<TAP_GUARD_MS){e.preventDefault();e.stopPropagation()}};
 useEffect(()=>{
  setupTelegram();
  let active=true,cloudReady=!telegramProfile;
  if(telegramProfile)void readCloud().then(result=>{
   if(!active)return;
   cloudReady=true;
   try{
    const current=localStorage.getItem(SAVE_KEY);
    if(result.status!=='found'){
     if(current===null&&localStorage.getItem(LEGACY_SAVE_KEY))useGame.getState().notice('Прежнее сохранение доступно в меню');
     return;
    }
    const remote=parseSave(result.raw,true);
    if(current!==null||useGame.getState().recoveryRequired){
     if(remote&&current===result.raw)acknowledgeCloud(result.raw);
     else if(remote&&!useGame.getState().recoveryRequired&&!isKnownCloud(result.raw))useGame.getState().notice('Копия Telegram отличается · откройте её в меню');
     return;
    }
    if(!remote){
     localStorage.setItem(SAVE_KEY+':unreadable-cloud',result.raw);
     useGame.setState({recoveryRequired:true});
     battle?.pause();
     return;
    }
    localStorage.setItem(SAVE_KEY,result.raw);
    acknowledgeCloud(result.raw);
    useGame.setState({p:remote,auto:remote.preferences?.auto??true,speed:remote.preferences?.speed??1,stopOnDeath:remote.preferences?.stopOnDeath??true,continueOnVictory:remote.preferences?.continueOnVictory??true,autoSalvageWeaker:remote.preferences?.autoSalvageWeaker??false});
    battle?.restorePlayer();
   }catch{useGame.getState().notice('Не удалось восстановить копию Telegram · попробуйте через меню')}
  });
  const stopViewport=observeTelegramViewport(()=>{const next=screenScale(viewport.current);if(next>0)setScale(next)});
  const stop=canvas.current?mountBattle(canvas.current):()=>{};
  let idleId:number|undefined;
  let backupRunning=false;
  const backup = async () => {
   if(!active||!cloudReady||backupRunning)return;
   backupRunning=true;
   try { await backupCloud(); } finally { backupRunning=false; }
  };
  const maintain = () => {
   idleId=undefined;
   if(!active||!cloudReady||document.hidden)return;
   const g=useGame.getState(),now=Date.now();
   if(hornRefillDue(g.p,now)||questRefreshDue(g.p,now))g.mutate(p=>{refill(p,now);ensureQuests(p,now)});
   if(telegramProfile)void backup();
  };
  const timer=setInterval(()=>{
   if(idleId!==undefined||document.hidden)return;
   if(window.requestIdleCallback)idleId=window.requestIdleCallback(maintain,{timeout:1000});
   else idleId=window.setTimeout(maintain,0);
  },15000);
  let resumeWhenVisible=false;
  const checkpoint = () => {
   if(battle)battle.pause();
   else if(cloudReady)useGame.getState().persist();
   void backup();
  };
  const visibility = () => {
   if(document.hidden){
    resumeWhenVisible=!!battle?.running&&battle.mode!=='darkness';
    checkpoint();
   }else if(resumeWhenVisible){
    resumeWhenVisible=false;
    if(battle?.mode!=='darkness')battle?.resume();
   }
  };
  const leave = () => {resumeWhenVisible=false;checkpoint()};
  document.addEventListener('visibilitychange',visibility);
  window.addEventListener('pagehide',leave);
  return()=>{
   active=false;
   stop();
   clearInterval(timer);
   if(idleId!==undefined){
    if(window.cancelIdleCallback)window.cancelIdleCallback(idleId);
    else window.clearTimeout(idleId);
   }
   stopViewport();
   document.removeEventListener('visibilitychange',visibility);
   window.removeEventListener('pagehide',leave);
  };
 },[]);
 const b=g.battle,run=realmRun(p);const trophy=p.rewardOffer&&!p.rewardOffer.resolved?[...p.inventory,...(p.pendingLoot??[])].find(i=>i.id===p.rewardOffer!.itemId):undefined;const chooseGear=(slot:Slot)=>{if(slot==='wings'&&!p.equipment.wings){g.open('wings');return}g.open(`gear:${slot}`)};
 const shipsReady=useMemo(()=>{const now=Date.now();return previewShips(p.shipyard??starterShipyard(now),now).stored>=1},[p]);
 const fallen=!g.panel&&!trophy&&b.phase==='defeat'&&!b.running&&b.mode==='campaign';
 return <main ref={viewport} className="viewport" data-motion={p.reducedMotion?'reduced':undefined} onClickCapture={ghostTap}><div className="game" style={{'--game-scale':scale,width:864,height:1536,transform:`scale(${scale})`} as React.CSSProperties}><canvas ref={canvas} className="battle-canvas" width="864" height="940" aria-label="Живая боевая сцена"/>
 {b.mode==='darkness'&&run&&<><div className="realm-progress" role="status">{run.stage.startsWith('CHOICE')?'Выберите портал':run.stage==='FINAL_BOSS'?'Владыка этажа':`${b.realmKilled??run.killed}/${run.total} врагов`}{run.selected?` · ${run.selected.stars}★`:''}</div>{b.phase==='waiting'&&run.pair?.map((portal,i)=><button key={portal.id} className="realm-world-hit" style={{left:PORTALS.firstX-PORTALS.width/2+i*PORTALS.spacing,top:PORTALS.top,width:PORTALS.width,height:PORTALS.height}} aria-label={`${portal.label} · ${portal.stars} звезды`} onClick={()=>battle?.choosePortal(portal.id)}/>)}</>}
 <header className="hud"><button className="avatar" onClick={()=>g.open('hero')} aria-label="Герой"><img src={art(heroArt[p.heroClass])}/><span>Lv.{p.level}</span></button><button className="power" onClick={()=>g.open('hero')}><span>♨</span>{fmt(s.cp)}</button><div className="currencies">{[{key:'gold',icon:'coins',value:p.gold},{key:'gems',icon:'gem',value:p.gems},{key:'chaosite',icon:'rune',value:p.chaosite}].map(c=><button key={c.key} className={`currency ${c.key}`} onClick={()=>g.open(`source:${c.key}`)} aria-label={`${currencyNames[c.key]}: ${c.value} · где получить`}><Icon name={c.icon}/><b>{fmt(c.value)}</b><span>+</span></button>)}</div><div className="name">Викинг <small>Северный страж</small><span>VIKING VS ROME</span></div></header>
 <section className="stage"><div className="stage-path">{(b.mode==='darkness'?[1,2,3,4,5,6]:[1,2,3,4,5]).map(w=><span key={w} className={`${(b.mode==='darkness'?run?.r??1:p.wave)>=w?'done':''} ${w===(b.mode==='darkness'?6:5)?'boss-node':''}`}>{w===(b.mode==='darkness'?6:5)?'☠':'◆'}</span>)}</div><button className="enter" onClick={()=>battle?.challenge()}><Icon name="portal"/><span>Войти</span></button>{b.mode==='darkness'&&realmRun(p)?<h1>[Царство тьмы] <em>{floorName(realmRun(p)!.f)}</em><br/><strong>Этаж {realmRun(p)!.f} · {realmRun(p)!.r}/6</strong></h1>:<h1>[Глава {Math.floor((p.stage-1)/10)+1}] <em>{regionTitle(p.stage)}</em><br/><strong>{stageLabel(p.stage)}</strong></h1>}{b.boss&&b.phase==='fight'&&!(b.intro!>0)&&<div className="boss-timer"> ФАЗА {b.bossPhase} · {Math.ceil(b.timer)} сек</div>}</section>
 {fallen&&<section className="defeat-ribbon" aria-label="Поражение · способы усилиться"><small>ПОРАЖЕНИЕ · {stageLabel(p.stage)} · волна {p.wave}/5</small><strong>Этап и добыча сохранены</strong><span>Усильте героя и нажмите топоры, чтобы повторить бой</span><div>{upgradeSlots.size>0?<button onClick={()=>g.equipBest()}>Надеть лучшее</button>:<button onClick={()=>g.open('equipment')}>Снаряжение</button>}<button onClick={()=>g.open('forge')}>Кузница</button><button onClick={()=>g.open('skills')}>Навыки</button></div></section>}
 {trophy&&!g.panel?<button className="trophy-ribbon" style={{'--rarity':rarityColors[trophy.rarity]} as React.CSSProperties} onClick={()=>g.select(trophy.id)} aria-label="Трофей босса · открыть добычу"><Icon name={gearIcon(trophy.slot)}/><span><small>БОСС ПОВЕРЖЕН · {rarityNames[trophy.rarity]}</small><strong>{trophy.name}</strong><b className={compareItem(trophy,p)>0?'positive':'negative'}>{compareItem(trophy,p)>0?'+':''}{compareItem(trophy,p)} CP · посмотреть и выбрать →</b></span></button>:!g.panel&&b.phase!=='victory'&&b.encounterTitle&&(b.intro!>0||b.phase==='walk'&&(b.travelRemaining??100)<32)&&<div className={`encounter-ribbon ${b.boss?'boss-arrival':''}`}><small>{(b.encounterRole??(b.boss?'ЦИТАДЕЛЬ':'ВСТРЕЧА')).toUpperCase()}{b.mode==='campaign'&&!b.boss?' · '+p.wave+'/4':''}</small><strong>{b.encounterTitle}</strong><span>{b.encounterHint}</span></div>}
 {b.counterReady&&b.running&&!g.panel&&<div className="counter-cue">Удар сейчас — сорвите атаку!</div>}
 <Side icon="scroll" label="Задания" panel="quests" style={{left:0,top:132}} badge={p.bosses>p.mission||questBadge(p)}/><Side icon="banner" label="События" panel="events" style={{left:0,top:227}} badge={seasonBadge(p)}/><Side icon="companion" label="Спутники" panel="companions" style={{left:0,top:321}}/><Side icon="gift" label="Награды" panel="rewards" style={{left:0,top:418}} badge={p.daily!==dailyGift().day}/><Side icon="handshake" label="Приглашение" panel="invite" style={{left:0,top:514}}/><Side icon="book" label="Коллекция" panel="collection" style={{left:0,top:615}}/><Side icon="ship" label="Верфь" panel="shipyard" style={{left:0,top:717}} badge={shipsReady}/>
 <Side icon="menu" label="" panel="menu" style={{right:0,top:110}}/><Side icon="arena" label="Арена" panel="arena" style={{right:3,top:741}}/>
 <button className={`battle-status ${b.running?'is-running':''}`} onClick={()=>trophy?(g.select(trophy.id)):g.open('controls')}>{trophy?'Трофей босса ждёт выбора':!b.running?(b.pendingMode?`${modeNames[b.pendingMode]} · топоры: старт${b.entryCost?' · '+b.entryCost+' Хаосита':''}`:b.phase==='defeat'?'Герой погиб · нажмите топоры':'Пауза · топоры: продолжить'):b.phase==='walk'?`Путь · ${b.district??'Ледяные вершины'}${road}`:b.phase==='victory'?'Добыча получена':b.phase==='defeat'?'Возвращение в бой…':`${b.mode==='campaign'?'Волна '+p.wave+'/5':b.mode==='darkness'&&b.encounterRole?b.encounterRole:modeNames[b.mode]??'Испытание'}${b.hazard?' · '+b.hazard:''}${b.curse?' · метки '+b.curse+'/3':''}${road}`}</button>
 <section className="combat-controls"><button className="orb red" onClick={()=>battle?.heal()} aria-label={`Зелье здоровья · ${b.potionCost??balance.combat_test_settings.potion_gold_cost} золота`}><Icon name="heart"/>{(b.potionCd??0)>0?<span>{Math.ceil(b.potionCd!)}</span>:<small className="potion-cost">{fmt(b.potionCost??balance.combat_test_settings.potion_gold_cost)}</small>}</button><button className="hp-panel" onClick={()=>g.open('hero')}><span className="level-diamond">{p.level}</span><span className="hp-track"><span className="hud-xp" aria-hidden="true" style={{width:`${Math.min(100,p.xp/xpNeeded(p.level)*100)}%`}}/><i style={{width:`${Math.max(0,b.hp/b.maxHp*100)}%`}}/><b>{fmt(b.hp)}/{fmt(b.maxHp)}</b></span></button><button className="chart" onClick={()=>g.open('battle')} aria-label="Статистика боя"><Icon name="chart"/></button><button className={`orb blue ${b.counterReady?'counter-ready':''}`} onClick={()=>battle?.skill(0)} aria-label="Сокрушительный удар"><Icon name="lightning"/>{b.cooldowns[0]>0&&<span>{Math.ceil(b.cooldowns[0])}</span>}</button></section>
 <section className="equipment" aria-label="12 основных предметов и отдельные крылья">{slots.map(slot=><Gear key={slot} slot={slot} item={p.equipment[slot]} better={upgradeSlots.has(slot)} onClick={()=>chooseGear(slot)}/>)}</section>
 <section className="quick-controls"><button className="mission" onClick={()=>g.open('quests')}><Icon name="rune"/><div><b>Пройти Основную Главу {stageLabel(p.stage)}</b><span>{p.bosses>p.mission?'Получить награду!':`Волна ${p.wave}/5`}</span></div><small>15</small></button><div className="quick-buttons"><button className="quick-speed" onClick={()=>g.configure({speed:g.speed===1?2:1})} aria-label="Скорость боя">x{g.speed}</button><button className={`quick-auto ${g.auto?'active':''}`} onClick={()=>g.open('autobattle')} aria-label="Открыть настройки автобоя" aria-haspopup="dialog"><Icon name="refresh"/></button><button className="quick-cry" onClick={()=>battle?.skill(1)} aria-label="Боевой клич"><Icon name="crown"/>{b.cooldowns[1]>0&&<span>{Math.ceil(b.cooldowns[1])}</span>}</button><button className="quick-thor" onClick={()=>battle?.skill(2)} aria-label="Молот Тора"><Icon name="lightning"/>{b.cooldowns[2]>0&&<span>{Math.ceil(b.cooldowns[2])}</span>}</button></div></section>
 <nav className="bottom"><button onClick={()=>g.open('port')}><img className="icon illustrated adventure-map-art" src={new URL('../../public/art/interface/adventure-map.svg',import.meta.url).href} alt="" aria-hidden="true" draggable={false}/><span>Карта</span></button><button onClick={()=>g.open('skills')}><Icon name="book"/><span>Навыки</span></button><button className="central" onClick={()=>battle?.toggle()} aria-label={b.running?"Остановить бой":"Начать или продолжить бой"} aria-pressed={b.running}><img className="forged-axes-art" src={new URL('../../public/art/interface/forged-axes.svg',import.meta.url).href} alt="" aria-hidden="true" draggable={false}/></button><button onClick={()=>g.open('adventure')}><Icon name="scroll"/><span>Приключения</span></button><button onClick={()=>g.open('shop')}><Icon name="market"/><span>Магазин</span></button></nav><button className="horn-counter" onClick={()=>g.open('loot')}><Icon name="horn"/>{p.horn}<small>Рог Трофеев</small></button>
 <LevelUpFeedback/><WorldHud/>{g.recoveryRequired&&!g.panel&&<DialogShell panel="recovery" title="Восстановление прогресса" dismissible={false} footer={<footer className="modal-footer"><span>Исходное сохранение защищено</span></footer>}><p>Исходный файл сохранён на устройстве. Автосохранение и бой остановлены, чтобы не заменить ваш прогресс.</p><Action onClick={()=>g.open('menu')}>Открыть импорт и резервную копию</Action><Action kind="secondary" onClick={()=>{const url=URL.createObjectURL(new Blob([unreadableSave()],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='lootborn-recovery.json';a.click();URL.revokeObjectURL(url)}}>Скачать исходное сохранение</Action></DialogShell>}{g.toast&&<div className="toast" role="status">{g.toast}</div>}{g.storageError&&<div className="storage-error" role="alert">Не удалось сохранить. Освободите место в браузере.</div>}{g.panel==='autobattle'?<AutobattleDialog/>:g.panel&&<Panel questTab={questTab} setQuestTab={setQuestTab}/>}</div></main>
}
const titles:Record<string,string>={equipment:'Экипировка',controls:'Управление боем',hero:'Северный страж',skills:'Навыки и руны',inventory:'Рюкзак',loot:'Рог Трофеев',wings:'Крылья',quests:'Путь героя',rewards:'Ежедневная награда',events:'Северный сезон',friends:'Поделиться игрой',invite:'Приглашение',collection:'Альбом персонажей',shop:'Лавка сокровищ',port:'Северная гавань',shipyard:'Верфь драккаров',adventure:'Приключения',arena:'Арена',battle:'Боевая сводка',menu:'Меню',forge:'Кузница',blessing:'Благословение',companions:'Спутники',talents:'Таланты',relic:'Реликвии',realm:'Царство тьмы',darkgear:'Тёмная энергия',gems:'Драгоценные камни',item:'Новая добыча','source:gold':'Где получить золото','source:gems':'Где получить самоцветы','source:chaosite':'Где получить Хаосит'};
function PanelIntro({icon,title,children}: {icon:string;title:string;children:React.ReactNode}){
 return <section className="panel-intro"><Icon name={icon}/><div><h3>{title}</h3><p>{children}</p></div></section>;
}
function ArenaPanel(){
 const {battle:duel,p}=useGame();
 const onArena=duel.mode==='arena',won=onArena&&duel.phase==='victory',lost=onArena&&duel.phase==='defeat';
 return <>
  <PanelIntro icon="arena" title={won?'Победа на Арене':lost?'Поражение на Арене':'Одиночный поединок'}>
   {won?'Получено: 100 золота, 10 жетонов Арены, 30 опыта.':lost?'Усильте героя или попробуйте снова.':'Соперником управляет игра. Победа приносит 100 золота, 10 жетонов Арены и 30 опыта.'}
  </PanelIntro>
  <p className="hint">Каждая третья победа приносит печать призыва.</p>
  <Row icon="crown" title={`Побед на арене: ${p.arenaWins}`} detail={onArena&&!won&&!lost?`${duel.enemyName} · ${fmt(duel.enemyHp)}/${fmt(duel.enemyMax)} HP · ${Math.ceil(duel.timer)} сек`:'60 секунд на поединок'}/>
  <Action onClick={()=>battle?.startMode('arena')}>{won||lost?'Повторить поединок':onArena?'Продолжить поединок':'Начать поединок'}</Action>
  {onArena&&<Action kind="secondary" onClick={()=>battle?.startMode('campaign')}>Вернуться к главе</Action>}
 </>;
}
function Panel({questTab,setQuestTab}:{questTab:QuestTab;setQuestTab:(tab:QuestTab)=>void}){const g=useGame(),p=g.p,panel=g.panel!,s=stats(p);const chapterReward=<><Row icon="scroll" title={`Победить босса ${stageLabel(p.mission+1)}`} detail={`Пройдено боссов: ${p.bosses} · награда 200 золота и 15 самоцветов`}/><Action disabled={p.bosses<=p.mission} onClick={()=>g.claim('mission')}>Получить награду</Action></>;const [shipClock,setShipClock]=useState(Date.now());useEffect(()=>{if(panel!=='shipyard')return;setShipClock(Date.now());const timer=window.setInterval(()=>setShipClock(Date.now()),30000);return()=>window.clearInterval(timer)},[panel]);const fleet=previewShips(p.shipyard??starterShipyard(shipClock),shipClock),buildCost=shipBuyCost(fleet.ships.length),claimable=Math.floor(fleet.stored+1e-9);const [selectedShipId,setSelectedShipId]=useState('drakkar-1');const currentShip=fleet.ships.find(s=>s.id===selectedShipId)??fleet.ships[0];const [forgeTab,setForgeTab]=useState('forge');const [harborHelp,setHarborHelp]=useState(false);const [classOpen,setClassOpen]=useState(false);const [storage,setStorage]=useState(false);const [filter,setFilter]=useState<LootFilter>('all');const [order,setOrder]=useState('power');const [importCandidate,setImportCandidate]=useState<Player|null>(null);const [cloudCandidate,setCloudCandidate]=useState<string|null>(null);const [shareAddress,setShareAddress]=useState('');const [backupText,setBackupText]=useState<string|null>(null),[pasteOpen,setPasteOpen]=useState(false),pasteInput=useRef<HTMLTextAreaElement>(null);const importRequest=useRef(0);const [confirmHero,setConfirmHero]=useState(false);const fileInput=useRef<HTMLInputElement>(null);const newHero=()=>{battle?.pause();g.persist();if(useGame.getState().storageError){g.notice('Сначала сохраните текущего героя · проверьте место в браузере');return}const id='hero-'+Date.now().toString(36);const url=new URL(location.href);url.search='';url.searchParams.set('hero',id);location.assign(url.href)};const openHero=(id:string)=>{battle?.pause();g.persist();if(useGame.getState().storageError){g.notice('Не удалось сохранить героя · используйте экспорт');return}const url=new URL(location.href);url.search='';url.searchParams.set('hero',id);location.assign(url.href)};const mainHero=()=>{battle?.pause();g.persist();if(useGame.getState().storageError){g.notice('Не удалось сохранить героя · используйте экспорт');return}const url=new URL(location.href);url.search='';location.assign(url.href)};const purchase=hornPurchase(p);const slot=panel.startsWith('gear:')?panel.split(':')[1] as Slot:undefined;const item=[...p.inventory,...(p.pendingLoot??[])].find(i=>i.id===g.selected);const old=slot?p.equipment[slot]:item?p.equipment[item.slot]:undefined;const isTrophy=!!item&&p.rewardOffer?.itemId===item.id&&!p.rewardOffer.resolved;const finish=()=>{if(useGame.getState().p.rewardOffer?.resolved){g.open(null);battle?.continueAfterLoot()}};
 const [questDestination,setQuestDestination]=useState<string|null>(null);
 const sourceBack=panel.startsWith('source:')?panel.split(':')[2]:undefined;
 const returnToQuest=panel===questDestination;
 const goFromQuest=(route:string)=>{
  if(route==='campaign'||route==='dungeon'){battle?.startMode(route);return}
  setQuestDestination(route);g.open(route);
 };
 useEffect(()=>{setConfirmHero(false)},[g.selected,panel]);
 const download=()=>{const url=URL.createObjectURL(new Blob([g.recoveryRequired?unreadableSave():exportSave()],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='viking-vs-rome-save.json';a.click();URL.revokeObjectURL(url)};
 const previewCloud=async()=>{
  const request=++importRequest.current;
  setCloudCandidate(null);
  setImportCandidate(null);
  const result=await readCloud();
  if(request!==importRequest.current||useGame.getState().panel!=='menu')return;
  if(result.status!=='found'){g.notice(result.status==='empty'?'В Telegram пока нет резервной копии':'Копия Telegram недоступна · попробуйте ещё раз');return}
  const saved=parseSave(result.raw,true);
  if(!saved){g.notice('Копия Telegram повреждена · можно восстановиться из файла');return}
  setCloudCandidate(result.raw);
  setImportCandidate(saved);
 };
 const previewLegacy=()=>{
  ++importRequest.current;
  setCloudCandidate(null);
  setImportCandidate(null);
  try{
   const saved=parseSave(localStorage.getItem(LEGACY_SAVE_KEY),true);
   if(saved)setImportCandidate(saved);
   else g.notice('На этом устройстве нет прежнего сохранения');
  }catch{g.notice('Хранилище недоступно')}
 };
 /** Manual backup for clients where a file download does nothing (Telegram Android WebView): clipboard, plus a visible text to copy by hand. */
 const copyBackup=async()=>{
  const text=g.recoveryRequired?unreadableSave():exportSave();setBackupText(text);
  try{await navigator.clipboard.writeText(text);g.notice('Резервная копия скопирована · сохраните её в «Избранном» Telegram или в заметках')}
  catch{g.notice('Выделите текст копии ниже и выберите «Копировать»')}
 };
 const checkPasted=()=>{
  const text=pasteInput.current?.value.trim()??'';if(!text){g.notice('Вставьте текст резервной копии');return}
  if(text.length>MAX_SAVE_TEXT){g.notice('Копия слишком большая');return}
  ++importRequest.current;setCloudCandidate(null);const saved=parseSave(text,true);
  if(saved){setImportCandidate(saved);setPasteOpen(false)}else g.notice('Некорректное сохранение');
 };
 const copyInvite=async()=>{
  try{
   await navigator.clipboard.writeText(INVITE_URL);
   setShareAddress('');
   g.notice('Ссылка на игру скопирована');
  }catch{setShareAddress(INVITE_URL)}
 };
 if(panel==='inventory')return <Backpack storage={storage} setStorage={setStorage}/>;
 return <DialogShell panel={panel} onBack={sourceBack?()=>g.open(sourceBack):returnToQuest?()=>{setQuestDestination(null);g.open('quests')}:undefined} backLabel={sourceBack?'Назад':returnToQuest?'К заданию':undefined} title={slot?slotNames[slot]:titles[panel]??(panel.startsWith('source:')?sourceTitle(panel.split(':')[1]):panel)} rarity={item?.rarity} footer={<footer className={`modal-footer ${panel==='item'&&item?'item-footer':''}`}>{panel==='item'&&item&&<ItemDecisions key={item.id} item={item} p={p} isTrophy={isTrophy} onRewardResolved={finish}/>}<div className="footer-wallet"><span><Icon name="coins"/>{fmt(p.gold)}</span><span><Icon name="gem"/>{fmt(p.gems)}</span><button onClick={()=>g.open(null)}>К бою</button></div></footer>}><ForgeEcho/>
 {panel==='controls'&&<><p>Нажмите топоры для запуска путешествия. По умолчанию герой сам идёт после победы и ждёт топоры после смерти. Скорость, навыки и условия остановки настраиваются через кнопку автобоя. Меню временно ставит активный бой на паузу.</p><Action onClick={()=>{battle?.toggle();g.open(null)}}>{g.battle.running?'Остановить':'Продолжить'} бой</Action><Action onClick={()=>g.configure({auto:!g.auto})}>Auto навыков: {g.auto?'ВКЛ':'ВЫКЛ'}</Action><Action onClick={()=>g.configure({speed:g.speed===1?2:1})}>Скорость: x{g.speed}</Action><Action onClick={()=>g.open('autobattle')}>Настройки автобоя</Action>{skillData.map((skill,i)=><Action key={skill.name} disabled={!g.battle.running||g.battle.cooldowns[i]>0} onClick={()=>battle?.skill(i)}>{skill.name} {g.battle.cooldowns[i]>0?Math.ceil(g.battle.cooldowns[i])+' сек':''}</Action>)}</>}
 {panel==='equipment'&&<><HeroPortrait p={p} compact/>{(()=>{const plan=bestUpgrades(p);return plan.length?<><Action onClick={()=>g.equipBest()}>Надеть лучшее · {plan.length} {plan.length===1?'вещь':plan.length<5?'вещи':'вещей'}</Action><p className="hint">Берёт из рюкзака самые сильные вещи. Старые возвращаются в рюкзак; именные трофеи не заменяются.</p></>:<p className="hint">Сила героя {fmt(s.cp)} · в рюкзаке нет вещей сильнее надетых.</p>})()}<div className="equipment-ledger">{slots.map(slot=>{const worn=p.equipment[slot],better=bestUpgrade(p,slot);return <Row key={slot} icon={gearIcon(slot)} title={slotNames[slot]} detail={worn?`${rarityNames[worn.rarity]} · ур.${worn.level} · +${worn.upgrade}${better?` · ↑ в рюкзаке +${better.gain} силы`:''}`:better?`Не надето · ↑ в рюкзаке +${better.gain} силы`:'Не надето'}><Action kind={better?'':'secondary'} onClick={()=>g.open(slot==='wings'&&!p.equipment.wings&&!better?'wings':`gear:${slot}`)}>{better?'Заменить':'Открыть'}</Action></Row>})}</div></>}
 {panel==='hero'&&(()=>{const goal=xpNeeded(p.level),points=p.level-1-p.talents.reduce((a,b)=>a+b,0);return <>
  <section className="hero-sheet" aria-label="Герой">
   <HeroPortrait p={p} compact/>
   <div className="hero-id"><h3>{classNames[p.heroClass]}</h3><b className="gold-text">Сила {fmt(s.cp)}</b><span>Уровень {p.level}</span><span className="hero-xp" role="progressbar" aria-label={`Опыт до уровня ${p.level+1}`} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(goal,p.xp)}><i style={{width:`${Math.min(100,p.xp/goal*100)}%`}}/></span><small>{fmt(p.xp)} / {fmt(goal)} XP · опыт за бои и распыление</small></div>
  </section>
  <button type="button" className="class-toggle" aria-expanded={classOpen} aria-controls="class-picker" onClick={()=>setClassOpen(v=>!v)}><span><small>Персонаж · {classNames[p.heroClass]}</small><strong>{classOpen?'Скрыть выбор':'Сменить персонажа'}</strong></span><b aria-hidden="true">{classOpen?'▴':'▾'}</b></button>
  {classOpen&&<ClassPicker p={p}/>}
  <div className="hero-stats">{[['Здоровье',fmt(s.hp)],['Атака',fmt(s.attack)],['Защита',fmt(s.defense)],['Крит',`${Math.round(s.crit*100)}%`],['Скорость',`${s.aspd}/с`],['Вампиризм',`${Math.round(s.lifesteal*100)}%`],['Крит. урон',`${Math.round(s.critDamage*100)}%`],['Уклонение',`${Math.round(s.dodge*100)}%`],['Снижение урона',`${Math.round(s.reduction*100)}%`]].map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
  <SpecChooser p={p}/>
  <details className="saga-disclosure"><summary>Комплекты</summary><SetSummary p={p}/></details>
  <details className="saga-disclosure"><summary>Тёмная энергия, камни, реликвии, спутники</summary><PowerSources p={p}/><DarkHub p={p}/></details>
  <details className="saga-disclosure"><summary>Рекомендации для класса</summary><BuildGuide p={p}/></details>
  <details className="saga-disclosure"><summary>Сохранённые сборки</summary><BuildSlots p={p}/></details>
  <div className="hero-links"><Action kind={points>0?'':'secondary'} onClick={()=>g.open('talents')}>{points>0?`Таланты · ${points} очк.`:'Таланты'}</Action><Action kind="secondary" onClick={()=>g.open('inventory')}>Рюкзак · {p.inventory.length}/80</Action></div>
 </>})()}
 {panel==='battle'&&<><Row icon="axes" title={`${stageLabel(p.stage)} · волна ${p.wave}/5`} detail={g.battle.enemyName}/><div className="stat-grid"><div><small>Победы</small><strong>{p.kills}</strong></div><div><small>Боссы</small><strong>{p.bosses}</strong></div><div><small>Урон / удар</small><strong>{s.attack}</strong></div><div><small>Режим</small><strong>{modeNames[g.battle.mode]??'Бой'}</strong></div></div><p>Герой атакует автоматически. Auto управляет тремя навыками. Красная сфера лечит за {g.battle.potionCost??balance.combat_test_settings.potion_gold_cost} золота (цена растёт с этапом, перезарядка {balance.combat_test_settings.potion_cooldown_seconds} сек), голубая активирует удар.</p><Action onClick={()=>{battle?.challenge();g.open(null)}}>Продолжить основную главу</Action><Action onClick={()=>g.open('loot')}>Открыть Рог Трофеев · {p.horn} зарядов</Action></>}
 {slot&&<><QuickSwap slot={slot} p={p}/>{slot&&old&&<><ItemDetails item={old}/><UpgradePlan key={old.id+':'+old.upgrade} item={old} p={p}/><ForgeBench slot={slot} p={p}/><Action kind="secondary" onClick={()=>{g.unequip(slot);g.open('equipment')}}>Снять в рюкзак</Action>{slot==='wings'&&<Action onClick={()=>g.mutate(p=>{p.wingVisible=!p.wingVisible})}>{p.wingVisible?'Скрыть крылья':'Показать крылья'} · бонус сохраняется</Action>}</>}<h3 className="slot-pack-title">Из рюкзака · {p.inventory.length}/80{p.pendingLoot?.length?<button type="button" onClick={()=>g.open('inventory')}>Хранение · {p.pendingLoot.length} →</button>:null}</h3><div className="tabs"><button className={filter==='all'?'selected':''} onClick={()=>setFilter('all')}>Все</button><button className={filter==='better'?'selected':''} onClick={()=>setFilter('better')}>Улучшения</button><button className={filter==='rare'?'selected':''} onClick={()=>setFilter('rare')}>Редкие</button><button className={filter==='unique'?'selected':''} onClick={()=>setFilter('unique')}>Именные</button></div><div className="inventory-order"><span>Сортировка</span><CompactFilter label="Сортировка" value={order} onChange={setOrder} options={[{value:"power",label:"Польза для героя"},{value:"rarity",label:"Редкость"},{value:"newest",label:"Сначала новые"}]}/></div><InventoryGrid p={p} filter={filter} slot={slot} order={order} onSelect={g.select} onBulkSalvage={g.bulkSalvage}/>{p.inventory.length>0&&inventoryItems(p,filter,slot,order).length===0&&<p className="hint">Нет предметов под выбранным фильтром.</p>}{p.inventory.filter(i=>!slot||i.slot===slot).length===0&&<p className="hint">Новые предметы можно добыть в бою и из Рога Трофеев.</p>}<Action onClick={()=>g.hornLoot()}>Рог Трофеев · {p.horn} зарядов</Action></>}
 {panel==='item'&&item&&<>{isTrophy&&<><TrophyReveal key={item.id} item={item} encounter={p.rewardOffer!.encounterId}/><p className={`trophy-value ${compareItem(item,p)>=0?'positive':'negative'}`}>{compareItem(item,p)>=0?'+':''}{compareItem(item,p)} CP <small>к силе героя при экипировке</small></p></>}<StatDelta item={item} old={old} p={p}/><div className="comparison"><div><h3>Новая вещь</h3><ItemDetails item={item}/></div><div><h3>Надето</h3>{old?<ItemDetails item={old}/>:<p>Слот свободен</p>}</div></div><EffectComparison item={item} p={p}/></>}
 {panel==='loot'&&<><PanelIntro icon="horn" title={'Рог Трофеев · '+p.horn+'/'+balance.horn_test_settings.maximum_charges}>Один предмет за заряд. Заряд восстанавливается за {balance.horn_test_settings.recharge_one_charge_every_seconds/60} мин.</PanelIntro><Action disabled={p.horn<balance.horn_test_settings.chest_charge_cost} onClick={()=>g.hornLoot()}>Протрубить · {balance.horn_test_settings.chest_charge_cost} заряд.</Action><Action kind="secondary" onClick={()=>g.buy('horn',shopQuote({price:purchase.cost,reward:{horn:purchase.count}}))} disabled={purchase.count===0||p.gems<purchase.cost}>{purchase.count?`+${purchase.count} зарядов · ${purchase.cost} самоцветов`:'Рог заполнен'}</Action><Action kind="secondary" onClick={()=>g.open('source:horn:loot')}>Где получить заряды</Action><Action kind="secondary" onClick={()=>g.open('inventory')}>Рюкзак · {p.inventory.length}/80</Action><Action kind="secondary" onClick={()=>g.open('blessing')}>Улучшить качество добычи</Action></>}
 {panel==='wings'&&<><PanelIntro icon="wings" title="Крылья северного ветра">Отдельный слот. Крылья видны за спиной героя и повышают здоровье, атаку и защиту в процентах.</PanelIntro>{!p.claimed.includes('wings')?<Action onClick={()=>{g.claim('wings');g.open('gear:wings')}}>Получить первые крылья бесплатно</Action>:<Action onClick={()=>g.open('gear:wings')}>Мои крылья</Action>}</>}
 {panel==='skills'&&<>{skillData.map((skill,i)=><div className="skill-card" key={skill.name}><Row icon={i===1?'horn':i===2?'hammer':skill.icon} title={`${skill.name} · ур.${p.skills[i]}`} detail={`${i===1?'+30% к обычным ударам':skill.detail} · перезарядка ${skill.cd} сек`}/><div className="rune-options">{skill.runes.map((r,n)=><button key={r} className={p.runes[i]===n?'selected':''} aria-pressed={p.runes[i]===n} onClick={()=>{if(p.runes[i]===n)return;g.mutate(p=>{p.runes[i]=n});unlockAudio(p.sound);sound('rune',p.sound)}}><span className="rune-sign" aria-hidden="true">{['ᚠ','ᚦ','ᛟ'][n]}</span><Icon name="rune"/>{r}</button>)}</div>{i===1&&p.skills[i]>=odinCallMaxLevel?<p>Длительность: {odinCallSeconds(p.skills[i],hasPerk(p,'echo'))} сек · максимум</p>:<>
  <p>{i===1?`Длительность: ${odinCallSeconds(p.skills[i],hasPerk(p,'echo'))} → ${odinCallSeconds(p.skills[i]+1,hasPerk(p,'echo'))} сек`:`Множитель урона навыка: ×${skillPowerMultiplier(p.skills[i]).toFixed(1)} → ×${skillPowerMultiplier(p.skills[i]+1).toFixed(1)}`}</p>
  <Action disabled={p.gold<120*p.skills[i]} onClick={()=>g.train('skill',i)}>Улучшить · {120*p.skills[i]} золота</Action></>}</div>)}<p className="hint">Одна руна на навык. Выбор меняет эффект в следующей атаке.</p></>}
 {panel==='companions'&&<SquadPanel p={p}/>}
 {panel==='realm'&&<RealmPanel p={p}/>}
 {panel==='darkgear'&&<DarkGearPanel p={p}/>}
 {panel==='gems'&&<><p className="panel-lead">Камни вставляются в гнёзда 12 основных слотов (без крыльев). Выберите слот, затем гнездо и камень из запаса.</p><GemsPanel p={p}/></>}
 {panel==='talents'&&<><p>Свободно очков: <strong>{p.level-1-p.talents.reduce((a,b)=>a+b,0)}</strong>. Один уровень героя даёт одно очко.</p>{['Ярость','Стойкость','Удача'].map((name,i)=><Row key={name} icon={['axes','shield','coins'][i]} title={`${name} · ${p.talents[i]}`} detail={['+4% атаки и +0,5% крита','+5% HP, +3% защиты, +0,3% уклонения','+5% золота с врагов'][i]+(i<2?` · +${stats({...p,talents:p.talents.map((t,n)=>t+Number(i===n))}).cp-s.cp} силы`:'')}><Action disabled={p.talents.reduce((a,b)=>a+b,0)>=p.level-1} onClick={()=>g.train('talent',i)}>+</Action></Row>)}<Action disabled={p.gold<100||p.talents.every(v=>v===0)} onClick={()=>g.mutate(p=>{p.gold-=100;p.talents=[0,0,0]})}>Сбросить · 100 золота</Action></>}
 {panel==='forge'&&<><div className="tabs">{[['forge','Кузница'],['recipes','Создание'],['gear','Экипировка']].map(([id,label])=><button key={id} className={forgeTab===id?'selected':''} aria-pressed={forgeTab===id} onClick={()=>setForgeTab(id)}>{label}</button>)}</div>{forgeTab==='forge'&&<><h3 className="content-with-icon"><Icon name="hammer"/>Кузница · ур.{p.forge}</h3><p>Каждые 3 уровня кузницы повышают уровень новых вещей. Усиление уже надетых предметов находится в их карточках.</p><div className="forge-progression"><span>Кузница {p.forge} → {p.forge+1}</span><small>Уровень новой добычи: +{Math.floor(p.forge/3)} → +{Math.floor((p.forge+1)/3)} · доступно {fmt(p.gold)} золота</small></div><Action disabled={p.gold<100*p.forge} onClick={()=>g.train('forge')}>Развить кузницу · {100*p.forge} золота</Action></>}{forgeTab==='recipes'&&<Recipes p={p}/>} {forgeTab==='gear'&&<><h3>Усиление, перековка и гравировка</h3>{slots.filter(slot=>p.equipment[slot]).map(slot=><Row key={slot} icon={gearIcon(slot)} title={slotNames[slot]} detail={`Усиление +${p.equipment[slot]!.upgrade}`}><Action onClick={()=>g.open(`gear:${slot}`)}>Усилить</Action></Row>)}</>}</>}
 {panel==='blessing'&&<><PanelIntro icon="crown" title={'Благословение · ур.'+p.blessing}>Шанс повысить качество новой добычи на одну ступень · {Math.min(100,p.blessing*1.5).toFixed(1)}%.</PanelIntro><p>После повышения: {Math.min(100,(p.blessing+1)*1.5).toFixed(1)}%.</p><Action disabled={p.gold<150*p.blessing} onClick={()=>g.train('blessing')}>Получить благословение · {150*p.blessing} золота</Action></>}
 {panel==='quests'&&<>{p.bosses>p.mission&&<div className="chapter-reward-ready">{chapterReward}</div>}<QuestBoard p={p} tab={questTab} setTab={setQuestTab} onGo={goFromQuest}/><details className="saga-disclosure"><summary>Цели охоты и источники добычи</summary><HuntGoals p={p}/></details><details className="saga-disclosure"><summary>Именные трофеи саги</summary><GearGuide p={p}/></details>{p.bosses<=p.mission&&chapterReward}<Row icon="axes" title="Продолжить главу" detail={`Текущий этап ${stageLabel(p.stage)}, волна ${p.wave}/5`}/><Action onClick={()=>{battle?.challenge();g.open(null)}}>В бой</Action><Action kind="secondary" onClick={()=>g.open('loot')}>Рог Трофеев · {p.horn}</Action><Chronicle/></>}
 {panel==='rewards'&&<DailyRewards p={p}/>}
 {panel==='events'&&<SeasonRewards p={p}/>}
 {(panel==='friends'||panel==='invite')&&<><PanelIntro icon="handshake" title="В поход с друзьями">Отправьте ссылку другу, чтобы он открыл игру в Telegram.</PanelIntro><Action onClick={copyInvite}>Скопировать ссылку на игру</Action>{shareAddress&&<label>Адрес для копирования <input type="url" readOnly value={shareAddress} onFocus={event=>event.currentTarget.select()}/></label>}</>}
 {panel==='collection'&&<Album p={p}/>}
 {panel==='port'&&<div className={harborHelp?'harbor-workspace guide-open':'harbor-workspace'}>
  <div className="harbor-map">
  <HarborScene view="port" ships={fleet.ships} badges={claimable>0?{shipyard:'+'+claimable}:undefined} onNavigate={destination=>g.open(destination)}/>
  <button type="button" className="harbor-help" aria-expanded={harborHelp} aria-label="Что такое Верфь, Тёмная энергия и Камни" onClick={()=>setHarborHelp(v=>!v)}>{harborHelp?'×':'?'}</button>
  <ul className="harbor-guide" id="harbor-guide">
   <li><button type="button" onClick={()=>g.open('shipyard')}><Icon name="red-diamond"/><span><b>Верфь{claimable>0?` · +${claimable}`:''}</b><small>Красные алмазы · {SHIP_RULES.sealPrice} → 1 печать</small></span></button></li>
   <li><button type="button" onClick={()=>g.open('darkgear')}><Icon name="essence"/><span><b>Тёмная энергия</b><small>Свои 12 слотов · из Царства тьмы</small></span></button></li>
   <li><button type="button" onClick={()=>g.open('gems')}><Icon name="gem"/><span><b>Камни</b><small>В гнёзда 12 основных слотов</small></span></button></li>
  </ul>
  </div>
  <div className="workspace-actions"><p className="mine-summary">Северная шахта · 2 золота/сек · 1 Хаосит/мин · до 12 часов</p><Action onClick={()=>g.claim('mine')}>Собрать добычу шахтёров</Action></div>
 </div>}
 {panel==='shipyard'&&<>
  <HarborScene view="shipyard" ships={fleet.ships} selectedShipId={currentShip.id} onChooseShip={setSelectedShipId}/>
  <div className="harbor-economy"><strong className="content-with-icon"><Icon name="red-diamond"/>{fmt(p.redDiamonds??0)} красных алмазов</strong><span>Добыча: {shipRate(fleet)}/час · запас: {shipCapacity(fleet)}</span></div>
  <p className="hint">Драккары добывают красные алмазы сами, даже когда игра закрыта. Заберите их здесь и обменяйте у корабельщика на печати призыва спутников.</p>
  <Row icon="red-diamond" title={'На кораблях: '+fleet.stored.toFixed(2)} detail="Добыча продолжается в походе. Запас ограничен 12 часами."/>
  <Action disabled={claimable<=0} onClick={()=>g.shipAction('claim')}>{claimable>0?'Забрать '+claimable+' красных алмазов':'Добыча продолжается'}</Action>
  <Row icon="red-diamond" title="Обмен у корабельщика" detail={`${SHIP_RULES.sealPrice} красных алмазов → 1 печать призыва для спутников`}>
    <Action disabled={(p.redDiamonds??0)<SHIP_RULES.sealPrice} onClick={()=>g.shipAction('trade')}>{(p.redDiamonds??0)<SHIP_RULES.sealPrice?`Нужно ${SHIP_RULES.sealPrice} алмазов`:`Обменять · ${SHIP_RULES.sealPrice} алмазов`}</Action>
  </Row>
  <Row icon="ship" title={'Драккар '+currentShip.id.split('-')[1]+' · ур. '+currentShip.level} detail={'Приносит '+currentShip.level+' алмазов/час'}>
    <Action disabled={shipUpgradeCost(currentShip.level)===null||p.gold<(shipUpgradeCost(currentShip.level)??Infinity)} onClick={()=>g.shipAction('upgrade',currentShip.id)}>{shipUpgradeCost(currentShip.level)===null?'Макс. уровень':'Улучшить · '+shipUpgradeCost(currentShip.level)+' зол.'}</Action>
  </Row>
  <Action disabled={buildCost===null||p.gold<(buildCost??Infinity)} onClick={()=>g.shipAction('buy')}>{buildCost===null?'Все три корабля построены':'Построить драккар · '+buildCost+' золота'}</Action>
 </>}
 {panel==='relic'&&<RelicsPanel p={p}/>}
 {panel==='adventure'&&<><div className="adventure-destinations">{[['campaign','map','Основная глава',`Этап ${stageLabel(p.stage)} · четыре волны и босс`],['dungeon','lair-keeper','Логово мини-босса',`${balance.combat_test_settings.mode_entry_chaosite} Хаосита при старте топорами · предмет и опыт`],['darkness','portal','Царство тьмы',`Этаж ${p.darkFloor} · 7 врагов, четыре портала и владыка`],['farm','coins','Бесконечный фарм','Золото и опыт без продвижения']].map(([mode,icon,name,detail])=><button key={mode} className={'adventure-route route-'+mode} onClick={()=>mode==='darkness'?g.open('realm'):battle?.startMode(mode)}><Icon name={icon}/><strong>{name}</strong><small>{detail}</small></button>)}</div><h3>Сила героя</h3><DarkHub p={p}/></>}
 {panel==='arena'&&<ArenaPanel/>}
 {panel.startsWith('source:')&&<ResourceSources kind={panel.split(':')[1]} returnTo={panel.split(':')[2]}/>}
 {panel==='shop'&&<TreasureShop p={p} source={kind=><ResourceSources kind={kind} returnTo="shop"/>} sources={sourceTitle}/>}
 {panel==='menu'&&<>{isolatedProfile&&<Action kind="secondary" onClick={mainHero}>Вернуться к основному герою</Action>}<SavedHeroes onOpen={openHero}/><Action onClick={toggleSound}>Звук: {p.sound?'ВКЛ':'ВЫКЛ'}</Action><Action kind="secondary" onClick={()=>g.mutate(p=>{p.volume=((p.volume??2)%3+1) as 1|2|3})}>Громкость: {['тихо','средне','громко'][(p.volume??2)-1]}</Action><Action onClick={()=>g.mutate(p=>{p.reducedMotion=!(p.reducedMotion??window.matchMedia('(prefers-reduced-motion: reduce)').matches)})}>Уменьшение движения: {(p.reducedMotion??window.matchMedia('(prefers-reduced-motion: reduce)').matches)?'ВКЛ':'ВЫКЛ'}</Action><Action onClick={()=>g.open('controls')}>Управление боем · крупные кнопки</Action><div className="menu-shortcuts"><Action kind="secondary" onClick={()=>g.open('equipment')}>Экипировка</Action><Action kind="secondary" onClick={()=>g.open('hero')}>Герой</Action><Action kind="secondary" onClick={()=>g.open('inventory')}>Рюкзак</Action><Action kind="secondary" onClick={()=>g.open('collection')}>Альбом</Action></div><Action onClick={download}>Экспорт сохранения</Action>{telegramProfile&&<><Action kind="secondary" onClick={previewCloud}>Открыть копию из Telegram</Action><Action kind="secondary" onClick={previewLegacy}>Открыть прежнее сохранение на устройстве</Action></>}<Action kind="secondary" onClick={copyBackup}>Скопировать резервную копию</Action>{backupText!==null&&<label>Резервная копия · {fmt(backupText.length)} знаков<textarea readOnly rows={3} value={backupText} onFocus={event=>event.currentTarget.select()}/></label>}<Action kind="secondary" onClick={()=>fileInput.current?.click()}>Импорт сохранения</Action><Action kind="secondary" onClick={()=>setPasteOpen(open=>!open)}>Вставить резервную копию</Action>{pasteOpen&&<label>Текст резервной копии<textarea ref={pasteInput} rows={3} spellCheck={false} autoComplete="off"/><Action onClick={checkPasted}>Проверить копию</Action></label>}<input ref={fileInput} type="file" accept="application/json" hidden onChange={async e=>{const input=e.currentTarget;const f=input.files?.[0];input.value='';if(!f)return;if(f.size>MAX_SAVE_TEXT){g.notice('Файл слишком большой');return}const request=++importRequest.current;setImportCandidate(null);setCloudCandidate(null);const saved=parseSave(await f.text(),true);if(request!==importRequest.current||useGame.getState().panel!=='menu')return;if(saved){setImportCandidate(saved)}else g.notice('Некорректное сохранение')}}/>{importCandidate&&<div className="import-preview"><h3>Восстановить сохранение?</h3><p>Уровень {importCandidate.level} · этап {stageLabel(importCandidate.stage)} · волна {importCandidate.wave}/5<br/>Предметов: {importCandidate.inventory.length} · золото {fmt(importCandidate.gold)}<br/>Самоцветы {fmt(importCandidate.gems)} · Хаосит {fmt(importCandidate.chaosite)}</p><p>Текущий прогресс сначала сохранится в резервную копию на этом устройстве.</p><Action onClick={()=>{if(g.importSave(importCandidate)){if(cloudCandidate)acknowledgeCloud(cloudCandidate);setCloudCandidate(null);setImportCandidate(null)}}}>Восстановить этот прогресс</Action><Action kind="secondary" onClick={()=>{setCloudCandidate(null);setImportCandidate(null)}}>Отмена</Action></div>}<p className="hint">Прогресс сохраняется автоматически. {isolatedProfile?'Дополнительный герой хранится локально.':telegramProfile?'Прогресс Telegram хранится отдельно. При расхождении копий выберите нужную вручную.':'Прогресс браузера хранится на этом устройстве.'} Для переноса используйте экспорт.</p><Action kind="secondary" onClick={()=>{++importRequest.current;setCloudCandidate(null);try{const saved=parseSave(localStorage.getItem(SAVE_KEY+':before-import'));if(saved)setImportCandidate(saved);else g.notice('Резервной копии пока нет')}catch{g.notice('Хранилище недоступно')}}}>Предыдущая резервная копия</Action><details className="saga-disclosure menu-heroes" open={confirmHero||undefined}><summary>Другие герои на этом устройстве</summary><p className="hint">Новый герой начинает с первого похода в отдельном слоте; текущий прогресс не меняется.</p><Action onClick={()=>setConfirmHero(true)}>Новый герой · первый поход</Action>{confirmHero&&<div className="import-preview new-hero-confirm" ref={revealOnMount}><h3>Начать нового героя?</h3><p>Текущий герой не удаляется: уровень {p.level} · этап {stageLabel(p.stage)} · предметов {p.inventory.length}. Новый герой хранится отдельно на этом устройстве.</p><p>Вернуться можно в любой момент: Меню → «Вернуться к основному герою»{isolatedProfile?' → «Мои герои»':''}.</p><Action onClick={newHero}>Начать нового героя</Action><Action kind="secondary" onClick={()=>setConfirmHero(false)}>Отмена</Action></div>}</details><small>VIKING VS ROME · Северная кузня</small></>}
 </DialogShell>
}
