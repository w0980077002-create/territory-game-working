import {forgeLevel,forgeMasteryBonus} from '../core/forge';
import {GameTabs} from './CompactGame';
import {LairPanel} from './LairPanel';
import {lairRules,lairReviveCost} from '../saga/lair';
import {DetailedStats,HeroTracks,WingGrowth} from './SoloProgress';
import {SoloEvents} from './SoloEvents';
import {RuneWorkshop} from './RuneWorkshop';
import {useShallow} from 'zustand/react/shallow';
import {lazy,Suspense,useMemo} from 'react';
import {GiftHorn} from './GiftHorn';
import {hornRefillDue} from '../core/store';
import {CompactFilter} from './CompactFilter';
import {Backpack,type BackpackTab,type BackpackView} from './Backpack';
import {DialogShell,HeroPortrait,TrophyReveal,ForgeEcho,LevelUpFeedback,TAP_GUARD_MS} from './SagaUI';
import {AutobattleDialog} from './AutobattleDialog';
import {InventoryGrid} from './InventoryGrid';
import {ItemDetails,EffectComparison,SharpenedComparison,UpgradePlan,BuildGuide,HuntGoals,StatDelta,QuickSwap} from './GearDetails';
import {useEffect,useRef,useState} from 'react';
import {useGame,compareItem,bestUpgrade,bestUpgrades,refill,backupCloud,acknowledgeCloud,finishInitialCloudRead,restoreInitialCloudProfile,isKnownCloud,parseSave,SAVE_KEY,hornPurchase,isolatedProfile,unreadableSave,requiresSalvageConfirmation,salvageRestriction,salvageYield,campaignBossReward,guaranteedBossTrophy} from '../core/store';
import {SHIP_RULES,starterShipyard,previewShips,shipCollection,shipRate,shipCapacity,shipBuyCost,shipUpgradeCost} from '../core/shipyard';
import {TreasureShop} from './TreasureShop';
import {HarborScene} from './HarborScene';
import {CollectionStatus,MineCollection,useCollectionClock} from './CollectionStatus';
import {ClassPicker} from './ClassPicker';
import {HonorPanel} from './HonorPanel';
import {MailPanel} from './MailPanel';
import {SaveTools} from './SaveTools';
import {ReferralPanel} from './ReferralPanel';
import {AdminGate} from './NetworkAdmin';
import {TonWallet} from './TonWallet';
import {unreadMail} from '../saga/mail';
import {canClaimHonor,honorRank} from '../saga/honor';
import './windowContent.css';
import {stats,xpNeeded,stageLabel} from '../core/formulas';
import {glacierUpgradeCost} from '../core/progression';
import {setupTelegram,readCloud} from '../core/telegram';
import {observeTelegramViewport} from '../core/telegramViewport';
import {LEGACY_SAVE_KEY,telegramProfile,carnivalNow,mailAcceptanceProfile} from '../core/profile';
import type {Slot,Item,Player} from '../core/types';
import {slots,slotNames,rarityNames,rarityColors,classNames,heroArt,art,skillData} from '../data/catalog';
import balance from '../../config/test-balance.v1.json';
import {battle,mountBattle} from '../game/Battle';
import {Icon,gearIcon} from './Icon';
import {inventoryItems,type LootFilter} from '../core/loot';
import {WorldHud,Chronicle,useRoadStatus,toggleSound} from './WorldHud';
import {StoryFinale} from './StoryFinale';
import {hasFlag} from '../saga/save';
import {legendTitle,regionTitle,regions,STAGES_PER_REGION} from '../saga/regions';
import {SetSummary,SpecChooser,BuildSlots,ForgeBench,Recipes,GearGuide,QuestBoard,type QuestTab} from './SagaPanels';
import {ensureQuests,questBadge,questRefreshDue} from '../saga/quests';
import {activityReady} from '../saga/activity';
import {collectionReady} from '../saga/collections';
import {CollectionHub} from './CollectionHub';
import {WorldBossPanel} from './WorldBossPanel';
import {worldBossEnabled} from '../worldBoss/client';
import {backTarget,goBack} from './navStack';
import {communityEnabled} from '../community/client';
import {lang,setLang} from '../i18n';
import {BlessingOdds} from './BlessingOdds';
import {AdventureRules} from './AdventureRules';
import {resCount,resources,duskCount,type ResId} from '../dark/rules';
import {materials,matCount,materialIds,blessingEffects,blessingCanImprove} from '../saga/gear';
import {shopQuote} from '../saga/shop';
import {dailyGift,seasonBadge} from '../saga/events';
import {carnivalRefreshDue} from '../saga/carnival';
import {CarnivalPanel} from './carnival/CarnivalPanel';
import {DailyRewards,SeasonRewards} from './EventRewards';
import {chapterRewardFor,rewardText} from '../saga/rewards';
import {RewardArt,RewardNotice} from './RewardArt';
import {PORTALS,portalColors} from '../dark/portals';
import {realmRun,realmLast,floorName,portalConfig} from '../dark/realm';
import {RealmPanel,DarkGearPanel,GemsPanel,RelicsPanel,SquadPanel,DarkHub,PowerSources} from './DarkPanels';
const OnlineArena=lazy(()=>import('./OnlineArena').then(module=>({default:module.OnlineArena})));
const Community=communityEnabled?lazy(()=>import('./CommunityPanel').then(module=>({default:module.CommunityPanel}))):null;
const currencyNames:Record<string,string>={gold:'Золото',gems:'Самоцветы',chaosite:'Хаосит',tokens:'Жетоны Арены',horn:'Заряды Рога Трофеев',ess:'Тёмная эссенция',shard:'Осколки реликвий',seal:'Печати призыва',dusk:'Камни Сумрака'};
const sourceTitle=(kind:string)=>`Где получить · ${currencyNames[kind]??materials[kind]?.name??kind}`;
const campaignGoal=(stage:number)=>{
 const title=legendTitle(stage);
 return title?`${title} · ${stageLabel(stage)}`:undefined;
};
const modeNames:Record<string,string>={campaign:'Глава',farm:'Фарм',dungeon:'Логово',darkness:'Тьма',arena:'Арена'};
const fmt=(v:number)=>v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e4?`${(v/1000).toFixed(1)}K`:Math.round(v).toLocaleString('ru');
function Action({children,onClick,disabled=false,kind=''}:{children:React.ReactNode;onClick:()=>void;disabled?:boolean;kind?:string}){return <button className={`action ${kind}`} onClick={onClick} disabled={disabled}>{children}</button>}
function Row({icon,title,detail,children}:{icon:string;title:string;detail?:string;children?:React.ReactNode}){return <div className="row"><Icon name={icon}/><div className="row-content"><strong>{title}</strong>{detail&&<small>{detail}</small>}</div>{children}</div>}
function Gear({slot,item,better,onClick}:{slot:Slot;item?:Item;better?:boolean;onClick:()=>void}){return <button className={`gear gear-${slot} ${!item?'empty':''}${better?' has-better':''}`} style={{'--rarity':item?rarityColors[item.rarity]:'#7a92a1'} as React.CSSProperties} onClick={onClick} aria-label={`${slotNames[slot]}${item?` уровень ${item.level}, усиление ${item.upgrade}`:' · не надето'}${better?' · в рюкзаке есть сильнее':''}`}><span className="gear-face" aria-hidden="true"><Icon name={gearIcon(slot,item)}/>{better&&<i className="gear-better" aria-hidden="true">▲</i>}<span>{item?<><i>ур.</i>{item.level}{item.upgrade?<> <b>+{item.upgrade}</b></>:null}</>:slot==='wings'?'Получить крылья':'Пусто'}</span></span></button>}
function Side({icon,label,panel,style,badge=false}:{icon:string;label:string;panel:string;style:React.CSSProperties;badge?:boolean}){const open=useGame(s=>s.open);return <button className={`side${style.right!==undefined?' side-right':''}${icon==='menu'?' side-menu':''}`} style={style} aria-label={label||titles[panel]||panel} onClick={()=>open(panel)}><span className="side-medal">{icon==='menu'?<img className="icon illustrated forge-menu-art" src={new URL('../../public/art/interface/forge-menu.svg',import.meta.url).href} alt="" aria-hidden="true" draggable={false}/>:<Icon name={icon}/>} {badge&&<i>!</i>}</span><span>{label}</span></button>}
function screenScale(shell?: HTMLElement | null) {
 const css=shell?getComputedStyle(shell):undefined;
 const width=(shell?.clientWidth??window.innerWidth)-(parseFloat(css?.paddingLeft??'0')||0)-(parseFloat(css?.paddingRight??'0')||0);
 const height=(shell?.clientHeight??window.innerHeight)-(parseFloat(css?.paddingTop??'0')||0)-(parseFloat(css?.paddingBottom??'0')||0);
 return Math.min(width/864,height/1536);
}
/** Worn gear and socketed gems: when these change, the tapped button is replaced in place (Вставить → Извлечь). Upgrades keep it. */
const swapKey=(p:Player)=>slots.map(slot=>p.equipment[slot]?.id??'').join()+JSON.stringify((p.saga?.box?.gems as {sock?:unknown}|undefined)?.sock??null);
/** Large backpacks and storage stay importable; this only rejects unreasonable files. */
/** «+» next to a currency: real places to earn it, each button performs that action. */
function ResourceSources({kind,returnTo}:{kind:string;returnTo?:string}){const g=useGame(),p=g.p;const today=p.daily!==new Date().toISOString().slice(0,10);
 const mine=<Row icon="rune" title="Северная шахта" detail="Золото и Хаосит · накопление ограничено"><MineCollection compact/></Row>;
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
 const {gold}=salvageYield(item);
 const restriction=salvageRestriction(p,item);
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
  {restriction&&<p className="item-confirm">{restriction}</p>}
  <div className="item-decisions">
   <Action onClick={()=>{useGame.getState().equip(item.id);if(isTrophy)onRewardResolved()}}>Надеть</Action>
   <Action kind="secondary" onClick={keep}>{p.pendingLoot?.some(i=>i.id===item.id)?'На хранение':'В рюкзак'}</Action>
   <Action kind="secondary" disabled={!!restriction} onClick={salvage}>{confirming?'Подтвердить распыление':`Распылить +${gold}`}</Action>
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
 const g=useGame(useShallow(({p,battle,panel,auto,speed,open,equipBest,select,configure,toast,toastReward,recoveryRequired,storageError})=>
  ({p,battle,panel,auto,speed,open,equipBest,select,configure,toast,toastReward,recoveryRequired,storageError})));
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
     if(current===null&&localStorage.getItem(LEGACY_SAVE_KEY))useGame.getState().notice('Прежнее сохранение доступно в разделе «Сохранение и восстановление»');
     return;
    }
    const remote=parseSave(result.raw,true);
    if(current!==null||useGame.getState().recoveryRequired){
     if(remote&&current===result.raw)acknowledgeCloud(result.raw);
     else if(remote&&!useGame.getState().recoveryRequired&&!isKnownCloud(result.raw))useGame.getState().notice('Копия Telegram отличается · откройте её в разделе «Сохранение и восстановление»');
     return;
    }
    if(!remote){
     localStorage.setItem(SAVE_KEY+':unreadable-cloud',result.raw);
     useGame.setState({recoveryRequired:true});
     battle?.pause();
     return;
    }
    restoreInitialCloudProfile(result.raw,remote);
   }catch{useGame.getState().notice('Не удалось восстановить копию Telegram · попробуйте через меню')}
   finally{finishInitialCloudRead()}
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
   if(hornRefillDue(g.p,now)||questRefreshDue(g.p,now)||carnivalRefreshDue(g.p,carnivalNow(now)))g.mutate(p=>{refill(p,now);ensureQuests(p,now)});
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
  // Save an active paid Lair before the profile's pagehide handler releases its lock.
  const saveLairOnExit = () => {if(battle?.mode==='dungeon'&&battle.entryPaid&&!battle.rewarded)battle.pause()};
  window.addEventListener('pagehide',saveLairOnExit,true);
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
   window.removeEventListener('pagehide',saveLairOnExit,true);
  };
 },[]);
 const b=g.battle,inRealm=b.mode==='darkness',run=inRealm?realmRun(p):undefined;
 const choosing=!!run?.stage.startsWith('CHOICE');
 const realmResult=inRealm&&!run?realmLast(p):undefined;
 const realmProgress=run?`${Math.min(b.realmKilled??run.killed,run.total)}/${run.total}`:null;
 const realmGoal=run
  ? choosing?'Выберите портал':run.stage==='FINAL_BOSS'?'Одолейте владыку':`${realmProgress} врагов`
  : realmResult&&!realmResult.ack?(realmResult.win?'Заберите награду':'Посмотрите итог'):'Выберите этаж';
 const realmLocation=run?.stage==='FINAL_BOSS'?'Святилище владыки':portalConfig.biomes[run?.selected?.biome??-1]??'Преддверие';
 // A brand-new hero who has not fought yet: say plainly how to start and point at the axes.
 const firstStart=p.stage===1&&p.wave<=1&&p.kills===0&&!b.running&&b.phase!=='defeat';
 const trophy=p.rewardOffer&&!p.rewardOffer.resolved?[...p.inventory,...(p.pendingLoot??[])].find(i=>i.id===p.rewardOffer!.itemId):undefined;const chooseGear=(slot:Slot)=>{if(slot==='wings'&&!p.equipment.wings){g.open('wings');return}g.open(`gear:${slot}`)};
 const shipsReady=useMemo(()=>{const now=Date.now();return previewShips(p.shipyard??starterShipyard(now),now).stored>=1},[p]);
 const honorReady=canClaimHonor(p,honorRank(p)+1);
 const mailUnread=useMemo(()=>unreadMail(p,carnivalNow()),[p]);
 const fallen=!g.panel&&!trophy&&b.phase==='defeat'&&!b.running&&(b.mode==='campaign'||b.mode==='dungeon');
 return <main ref={viewport} className="viewport" data-motion={p.reducedMotion?'reduced':undefined} onClickCapture={ghostTap}><div className="game" data-realm={inRealm||undefined} data-pve={!inRealm&&b.mode==='campaign'||undefined} style={{'--game-scale':scale,width:864,height:1536,transform:`scale(${scale})`} as React.CSSProperties}><canvas ref={canvas} className="battle-canvas" width="864" height="940" aria-label="Живая боевая сцена"/>
 {run&&<><div className="realm-progress" role="status">{choosing?'Выберите портал':run.stage==='FINAL_BOSS'?'Владыка этажа':`${realmProgress} врагов${run.selected?` · ${run.selected.stars}★`:''}`}</div>
 {b.phase==='waiting'&&run.pair?.map((portal,i)=><button key={portal.id} className="realm-world-hit" style={{'--portal-tone':portalColors[portal.biome],left:PORTALS.firstX-PORTALS.width/2+i*PORTALS.spacing,top:PORTALS.top,width:PORTALS.width,height:PORTALS.height} as React.CSSProperties} aria-label={`${portal.label} · ${portal.stars} звезды · ${portal.count} врагов · ${portalConfig.biomes[portal.biome]}`} onClick={()=>battle?.choosePortal(portal.id)}>
  <span className="gate-stars" aria-hidden="true">{'★'.repeat(portal.stars)}</span><span className="gate-plaque" aria-hidden="true"><b>{portalConfig.biomes[portal.biome]}</b><small>{portal.count} врагов</small></span>
 </button>)}</>}
 <header className="hud"><button className="avatar" onClick={()=>g.open('hero')} aria-label="Герой"><img src={art(heroArt[p.heroClass])}/><span>Lv.{p.level}</span></button><button className="power" onClick={()=>g.open('hero')} aria-label={`Сила героя: ${fmt(s.cp)}`}><span className="power-face" aria-hidden="true"><span>♨</span>{fmt(s.cp)}</span></button><div className="currencies">{[{key:'gold',icon:'coins',value:p.gold},{key:'gems',icon:'gem',value:p.gems},{key:'chaosite',icon:'rune',value:p.chaosite}].map(c=><button key={c.key} className={`currency ${c.key}`} onClick={()=>g.open(`source:${c.key}`)} aria-label={`${currencyNames[c.key]}: ${c.value} · где получить`}><span className="currency-face" aria-hidden="true"><Icon name={c.icon}/><b>{fmt(c.value)}</b><span>+</span></span></button>)}</div><div className="name">Викинг <small>Северный страж</small><span>VIKING VS ROME</span></div></header>
 <section className="stage"><div className="stage-path">{(b.mode==='darkness'?[1,2,3,4,5,6]:[1,2,3,4,5]).map(w=><span key={w} className={`${(b.mode==='darkness'?run?.r??1:p.wave)>=w?'done':''} ${w===(b.mode==='darkness'?6:5)?'boss-node':''}`}>{w===(b.mode==='darkness'?6:5)?'☠':'◆'}</span>)}</div><button className="enter" onClick={inRealm?()=>g.open('realm'):()=>battle?.challenge()}><Icon name="portal"/><span>{inRealm?'Поход':'Войти'}</span></button>{inRealm?<h1><em>Царство тьмы</em>{run&&<><br/><strong>Этаж {run.f} · {floorName(run.f)}</strong></>}</h1>:<h1>{!campaignGoal(p.stage)&&<>[Глава {Math.floor((p.stage-1)/10)+1}] </>}<em>{regionTitle(p.stage)}</em><br/><strong>{stageLabel(p.stage)}</strong></h1>}{b.boss&&b.phase==='fight'&&!(b.intro!>0)&&<div className="boss-timer"> ФАЗА {b.bossPhase} · {Math.ceil(b.timer)} сек</div>}</section>
 {fallen&&<section className="defeat-ribbon" aria-label="Поражение · способы усилиться"><small>ПОРАЖЕНИЕ · {b.mode==='dungeon'?'Логово мини-босса':stageLabel(p.stage)+' · волна '+p.wave+'/5'}</small><strong>{b.mode==='dungeon'?'Текущая попытка сохранена':'Этап и добыча сохранены'}</strong><span>{b.mode==='dungeon'?'Можно возродиться в текущей попытке или выбрать новую.':'Усильте героя и нажмите топоры, чтобы повторить бой'}</span>
 {b.mode==='dungeon'&&p.encounter?.mode==='dungeon'&&p.encounter.phase==='defeat'&&(()=>{
  const attempt=p.encounter,used=attempt.lairRevives??0,cost=lairReviveCost(attempt.stage);
  return <div><button disabled={used>=lairRules.revives||attempt.timer<=0||p.gold<cost} onClick={()=>g.open('lair-revive')}>Возродиться · {lairRules.revives-used}/{lairRules.revives} · {cost} золота</button><button onClick={()=>g.open('lair')}>Открыть Логово</button></div>;
 })()}<div>{upgradeSlots.size>0?<button onClick={()=>g.equipBest()}>Надеть лучшее</button>:<button onClick={()=>g.open('equipment')}>Снаряжение</button>}<button onClick={()=>g.open('forge')}>Кузница</button><button onClick={()=>g.open('skills')}>Навыки</button></div></section>}
 {trophy&&!g.panel?<button className="trophy-ribbon" style={{'--rarity':rarityColors[trophy.rarity]} as React.CSSProperties} onClick={()=>g.select(trophy.id)} aria-label="Трофей босса · открыть добычу"><Icon name={gearIcon(trophy.slot,trophy)}/><span><small>БОСС ПОВЕРЖЕН · {rarityNames[trophy.rarity]}</small><strong>{trophy.name}</strong><b className={compareItem(trophy,p)>0?'positive':'negative'}>{compareItem(trophy,p)>0?'+':''}{compareItem(trophy,p)} CP · посмотреть и выбрать →</b></span></button>:!g.panel&&!g.toast&&b.phase!=='victory'&&b.encounterTitle&&(b.intro!>0||b.phase==='walk'&&(b.travelRemaining??100)<32)&&<div className={`encounter-ribbon ${b.boss?'boss-arrival':''}`}><small>{(b.encounterRole??(b.boss?'ЦИТАДЕЛЬ':'ВСТРЕЧА')).toUpperCase()}{b.mode==='campaign'&&!b.boss?' · '+p.wave+'/4':''}</small><strong>{b.encounterTitle}</strong><span>{b.encounterHint}</span></div>}
 {b.counterReady&&b.running&&!g.panel&&<div className="counter-cue">Удар сейчас — сорвите атаку!</div>}
 <Side icon="scroll" label="Задания" panel="quests" style={{left:0,top:132}} badge={p.bosses>p.mission||questBadge(p)||activityReady(p)}/><Side icon="banner" label="События" panel="events" style={{left:0,top:227}} badge={seasonBadge(p)}/><Side icon="companion" label="Спутники" panel="companions" style={{left:0,top:321}}/><Side icon="gift" label="Награды" panel="rewards" style={{left:0,top:418}} badge={p.daily!==dailyGift().day}/><Side icon="handshake" label="Приглашение" panel="invite" style={{left:0,top:514}}/><Side icon="book" label="Коллекция" panel="collection" style={{left:0,top:615}} badge={collectionReady(p)}/><Side icon="ship" label="Верфь" panel="shipyard" style={{left:0,top:717}} badge={shipsReady}/>
 <Side icon="menu" label="" panel="menu" style={{right:0}}/>
 <button type="button" className="hud-mail" onClick={()=>g.open('mail')} aria-label="Почта" aria-haspopup="dialog" aria-description={mailUnread?`Непрочитанных писем: ${mailUnread}`:undefined}><Icon name="mail"/><span aria-hidden="true">Почта</span>{mailUnread>0&&<i aria-hidden="true">{mailUnread>9?'9+':mailUnread}</i>}</button><Side icon="arena" label="Арена" panel="arena" style={{right:3,top:741}}/>
 <button className={`battle-status ${b.running?'is-running':''}`} onClick={()=>trophy?(g.select(trophy.id)):g.open('controls')}>{trophy?'Трофей босса ждёт выбора':inRealm?(b.phase==='victory'?'Итог похода':b.phase==='defeat'?'Поход завершён':b.running?realmLocation:'Поход на паузе'):!b.running?(b.pendingMode?`${modeNames[b.pendingMode]} · топоры: старт${b.entryCost?' · '+b.entryCost+' Хаосита':''}`:b.phase==='defeat'?(b.mode==='dungeon'?'Поражение · топоры: Логово':'Герой погиб · нажмите топоры'):firstStart?'Нажмите топоры внизу — начать бой':'Пауза · топоры: продолжить'):b.phase==='walk'?`Путь · ${b.district??'Ледяные вершины'}${road}`:b.phase==='victory'?'Добыча получена':b.phase==='defeat'?'Возвращение в бой…':`${b.mode==='campaign'?'Волна '+p.wave+'/5':b.mode==='darkness'&&b.encounterRole?b.encounterRole:modeNames[b.mode]??'Испытание'}${b.hazard?' · '+b.hazard:''}${b.curse?' · метки '+b.curse+'/3':''}${road}`}</button>
 <section className="combat-controls">{b.running&&b.phase==='fight'&&<button type="button" className="orb battle-cry" onClick={()=>battle?.skill(1)} aria-label="Клич Одина" disabled={b.cooldowns[1]>0}><Icon name="skill-odin-call"/><b aria-hidden="true">{b.cooldowns[1]>0?Math.ceil(b.cooldowns[1]):'Клич'}</b></button>}<button className="orb red" onClick={()=>battle?.heal()} aria-label={`Зелье здоровья · ${b.potionCost??balance.combat_test_settings.potion_gold_cost} золота`}><Icon name="orb-health" className="orb-art"/>{(b.potionCd??0)>0?<span>{Math.ceil(b.potionCd!)} с</span>:<small className="potion-cost"><Icon name="coins"/>{fmt(b.potionCost??balance.combat_test_settings.potion_gold_cost)}</small>}</button><button className="hp-panel" onClick={()=>g.open('hero')}><span className="level-diamond">{p.level}</span><span className="hp-track"><span className="hud-xp" aria-hidden="true" style={{width:`${Math.min(100,p.xp/xpNeeded(p.level)*100)}%`}}/><i style={{width:`${Math.max(0,b.hp/b.maxHp*100)}%`}}/><b>{fmt(b.hp)}/{fmt(b.maxHp)}</b></span></button><button className="chart" onClick={()=>g.open('battle')} aria-label="Статистика боя"><Icon name="chart"/></button><button className={`orb blue ${b.counterReady?'counter-ready':''}`} onClick={()=>battle?.skill(0)} aria-label="Сокрушительный удар"><Icon name="orb-energy" className="orb-art"/>{b.cooldowns[0]>0&&<span>{Math.ceil(b.cooldowns[0])}</span>}</button></section>
 <section className="equipment" aria-label="12 основных предметов и отдельные крылья">{slots.map(slot=><Gear key={slot} slot={slot} item={p.equipment[slot]} better={upgradeSlots.has(slot)} onClick={()=>chooseGear(slot)}/>)}</section>
 <section className="quick-controls"><button className="mission" onClick={()=>g.open(inRealm?'realm':'quests')}><Icon name="rune"/><div><b>{inRealm?`Цель похода · этаж ${run?.f??realmResult?.f??p.darkFloor}`:(campaignGoal(p.stage)??`Пройти Основную Главу ${stageLabel(p.stage)}`)}</b><span>{inRealm?realmGoal:p.bosses>p.mission?'Получить награду!':`Волна ${p.wave}/5`}</span></div>{!inRealm&&<small>15</small>}</button><div className="quick-buttons"><button className="quick-speed" onClick={()=>g.configure({speed:g.speed===1?2:1})} aria-label="Скорость боя">x{g.speed}</button><button className={`quick-auto ${g.auto?'active':''}`} onClick={()=>g.open('autobattle')} aria-label="Открыть настройки автобоя" aria-haspopup="dialog"><Icon name="refresh"/></button><button className="quick-honor" onClick={()=>g.open('honor')} aria-label="Почётные звания" aria-description={honorReady?'Доступно повышение':undefined} aria-haspopup="dialog"><Icon name="crown"/>{honorReady&&<i className="honor-ready" aria-hidden="true"/>}</button><button className="quick-thor" onClick={()=>battle?.skill(2)} aria-label="Молот Тора"><Icon name="quick-thor"/>{b.cooldowns[2]>0&&<span>{Math.ceil(b.cooldowns[2])}</span>}</button></div></section>
 <nav className="bottom"><button onClick={()=>g.open('port')}><img className="icon illustrated adventure-map-art" src={new URL('../../public/art/interface/adventure-map.svg',import.meta.url).href} alt="" aria-hidden="true" draggable={false}/><span>Карта</span></button><button onClick={()=>g.open('skills')}><Icon name="book"/><span>Навыки</span></button><button className={firstStart?"central first-start":"central"} onClick={()=>battle?.toggle()} aria-label={b.running?"Остановить бой":"Начать или продолжить бой"} aria-pressed={b.running}><img className="forged-axes-art" src={new URL('../../public/art/interface/forged-axes.svg',import.meta.url).href} alt="" aria-hidden="true" draggable={false}/></button><button onClick={()=>g.open('adventure')}><Icon name="scroll"/><span>Приключения</span></button><button onClick={()=>g.open('shop')}><Icon name="market"/><span>Магазин</span></button></nav><button className="horn-counter" onClick={()=>g.open('loot')}><Icon name="horn"/>{p.horn}<small>Рог Трофеев</small></button>
 <LevelUpFeedback/><WorldHud hideRoad={inRealm}/>{g.recoveryRequired&&!g.panel&&<DialogShell panel="recovery" title="Восстановление прогресса" dismissible={false} footer={<footer className="modal-footer"><span>Исходное сохранение защищено</span></footer>}><p>Исходный файл сохранён на устройстве. Автосохранение и бой остановлены, чтобы не заменить ваш прогресс.</p><Action onClick={()=>g.open('save-tools')}>Открыть импорт и резервную копию</Action><Action kind="secondary" onClick={()=>{const url=URL.createObjectURL(new Blob([unreadableSave()],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='lootborn-recovery.json';a.click();URL.revokeObjectURL(url)}}>Скачать исходное сохранение</Action></DialogShell>}{g.toast&&!g.panel&&<div className="toast" role="status"><RewardNotice message={g.toast} reward={g.toastReward}/></div>}{g.storageError&&<div className="storage-error" role="alert">Не удалось сохранить. Освободите место в браузере.</div>}{hasFlag(p,'story:done')&&!hasFlag(p,'story:finale-seen')&&!g.panel&&!trophy&&!g.recoveryRequired&&!inRealm&&<StoryFinale/>}{g.panel==='autobattle'?<AutobattleDialog/>:g.panel&&<Panel questTab={questTab} setQuestTab={setQuestTab}/>}</div></main>
}
const titles:Record<string,string>={equipment:'Экипировка',controls:'Управление боем',hero:'Северный страж',skills:'Навыки и руны',inventory:'Рюкзак',loot:'Рог Трофеев',wings:'Крылья',quests:'Путь героя','hero-path':'Трактат и фонды',rewards:'Ежедневная награда',events:'События',season:'Северный сезон',carnival:'Великий карнавал',friends:'Друзья',invite:'Приглашение',collection:'Коллекция',worldboss:'Мировой босс',shop:'Лавка сокровищ',port:'Северная гавань',workshops:'Мастерские',shipyard:'Верфь драккаров',adventure:'Приключения',arena:'Арена',lair:'Логово мини-босса','lair-revive':'Возрождение в Логове',battle:'Боевая сводка',auction:lang==='en'?'Auction':'Аукцион',guild:lang==='en'?'Guilds':'Гильдии',rankings:lang==='en'?'Rankings':'Рейтинги',menu:'Меню',forge:'Кузница',blessing:'Благословение',companions:'Спутники',talents:'Таланты',relic:'Реликвии',realm:'Царство тьмы',darkgear:'Тёмная энергия',gems:'Драгоценные камни',item:'Новая добыча','source:gold':'Где получить золото','source:gems':'Где получить самоцветы','source:chaosite':'Где получить Хаосит'};
function PanelIntro({icon,title,children}: {icon:string;title:string;children:React.ReactNode}){
 return <section className="panel-intro"><Icon name={icon}/><div><h3>{title}</h3><p>{children}</p></div></section>;
}
function ArenaPanel(){
 const {battle:duel,p}=useGame();
 const onArena=duel.mode==='arena',won=onArena&&duel.phase==='victory',lost=onArena&&duel.phase==='defeat';
 const solo=<>
  <PanelIntro icon="arena" title={won?'Победа на Арене':lost?'Поражение на Арене':'Одиночный поединок'}>
   {won?'Получено: 100 золота, 10 жетонов Арены, 30 опыта.':lost?'Усильте героя или попробуйте снова.':'Соперником управляет игра. Победа приносит 100 золота, 10 жетонов Арены и 30 опыта.'}
  </PanelIntro>
  <p className="hint">Каждая третья победа приносит печать призыва.</p>
  <Row icon="crown" title={`Побед на арене: ${p.arenaWins}`} detail={onArena&&!won&&!lost?`${duel.enemyName} · ${fmt(duel.enemyHp)}/${fmt(duel.enemyMax)} HP · ${Math.ceil(duel.timer)} сек`:'60 секунд на поединок'}/>
  <Action onClick={()=>battle?.startMode('arena')}>{won||lost?'Повторить поединок':onArena?'Продолжить поединок':'Начать поединок'}</Action>
  {onArena&&<Action kind="secondary" onClick={()=>battle?.startMode('campaign')}>Вернуться к главе</Action>}
 </>;
 return <>
  <Suspense fallback={null}><OnlineArena player={p}/></Suspense>
  {onArena&&<details className="saga-disclosure"><summary>Предыдущий одиночный поединок</summary>{solo}</details>}
 </>;
}
function FirstRegionTip({p,onOpen}:{p:Player;onOpen:()=>void}){
 const key=SAVE_KEY+':first-region-tip';
 const [dismissed,setDismissed]=useState(()=>{
  try{return sessionStorage.getItem(key)==='dismissed'}catch{return false}
 });
 const cost=glacierUpgradeCost(p.relic);
 if(dismissed||p.stage!==STAGES_PER_REGION+1||p.bosses<STAGES_PER_REGION||p.relic!==0||p.gold<cost)return null;
 const increase=stats({...p,relic:p.relic+1}).attack-stats(p).attack;
 if(increase<=0)return null;
 return <div className="effect-comparison">
  <strong>Перед следующим регионом</strong>
  <p>Развить Сердце ледника за {cost} золота · +{increase} к атаке. Золото дают победы в кампании и Северная шахта в гавани.</p>
  <div className="game-actions">
   <Action onClick={onOpen}>Открыть реликвии</Action>
   <Action kind="secondary" onClick={()=>{
    setDismissed(true);
    try{sessionStorage.setItem(key,'dismissed')}catch{/* The current visit can still dismiss it. */}
   }}>Пропустить</Action>
  </div>
 </div>;
}
function Panel({questTab,setQuestTab}:{questTab:QuestTab;setQuestTab:(tab:QuestTab)=>void}){const g=useGame(),p=g.p,panel=g.panel!,s=stats(p);const currentLegend=campaignGoal(p.stage);const chapterReward=<div className="chapter-claim"><span><Icon name="scroll"/> {p.bosses>p.mission?'Награда · '+(campaignGoal(p.mission+1)??stageLabel(p.mission+1)):'Следующий босс · '+(currentLegend??stageLabel(p.stage))}{p.bosses>p.mission&&<RewardArt reward={chapterRewardFor(p.mission)}/>}</span><Action disabled={p.bosses<=p.mission} onClick={()=>g.claim('mission',p.mission)}>Получить награду</Action></div>;const shipClock=useCollectionClock(panel==='port'||panel==='shipyard');
 const {fleet,amount:claimable,waitMs:shipWait,progress:shipProgress}=shipCollection(p.shipyard??starterShipyard(shipClock),shipClock);
 const shipLimit=(p.redDiamonds??0)+claimable>1_000_000_000;
 const buildCost=shipBuyCost(fleet.ships.length);const [selectedShipId,setSelectedShipId]=useState('drakkar-1');const currentShip=fleet.ships.find(s=>s.id===selectedShipId)??fleet.ships[0];const [forgeTab,setForgeTab]=useState('forge');const [harborHelp,setHarborHelp]=useState(false);const [classOpen,setClassOpen]=useState(false);const [backpackTab,setBackpackTab]=useState<BackpackTab>('pack');const [filter,setFilter]=useState<LootFilter>('all');const [order,setOrder]=useState('power');const [confirmHero,setConfirmHero]=useState(false);const newHero=()=>{battle?.pause();g.persist();if(useGame.getState().storageError){g.notice('Сначала сохраните текущего героя · проверьте место в браузере');return}const id='hero-'+Date.now().toString(36);const url=new URL(location.href);url.search='';url.searchParams.set('hero',id);location.assign(url.href)};const openHero=(id:string)=>{battle?.pause();g.persist();if(useGame.getState().storageError){g.notice('Не удалось сохранить героя · используйте экспорт');return}const url=new URL(location.href);url.search='';url.searchParams.set('hero',id);location.assign(url.href)};const mainHero=()=>{battle?.pause();g.persist();if(useGame.getState().storageError){g.notice('Не удалось сохранить героя · используйте экспорт');return}const url=new URL(location.href);url.search='';if(mailAcceptanceProfile)url.searchParams.set('hero','');location.assign(url.href)};const purchase=hornPurchase(p);const slot=panel==='wings'?'wings':panel.startsWith('gear:')?panel.split(':')[1] as Slot:undefined;const item=[...p.inventory,...(p.pendingLoot??[])].find(i=>i.id===g.selected);const old=slot?p.equipment[slot]:item?p.equipment[item.slot]:undefined;const isTrophy=!!item&&p.rewardOffer?.itemId===item.id&&!p.rewardOffer.resolved;const finish=()=>{if(useGame.getState().p.rewardOffer?.resolved){g.open(null);battle?.continueAfterLoot()}};
 const scrollMemory=useRef(new Map<string,number>()).current;
 const [packView,setPackView]=useState<BackpackView>({filter:'all',order:'newest'});
 const gearBack=panel==='item'&&g.back?g.leaveItem:slot?()=>g.open('equipment'):undefined;
 const freeSpace=()=>{
  setBackpackTab('pack');
  setPackView({filter:'all',order:'newest'});
  scrollMemory.delete('inventory');
  g.open('inventory');
 };
 const [journal,setJournal]=useState<'tasks'|'path'|'achievements'>('tasks');
 const [questDestination,setQuestDestination]=useState<string|null>(null);
 const [realmFromHarbor,setRealmFromHarbor]=useState(false);
 const returnToHarbor=panel==='realm'&&realmFromHarbor;
 const sourceBack=panel.startsWith('source:')?panel.split(':')[2]:undefined;
 const returnToQuest=panel===questDestination;
 const goFromQuest=(route:string)=>{
  if(route==='campaign'){battle?.startMode(route);return}
  const destination=route==='dungeon'?'lair':route;
  setQuestDestination(destination);g.open(destination);
 };
 useEffect(()=>{setConfirmHero(false)},[g.selected,panel]);
 if(panel==='inventory')return <Backpack tab={backpackTab} setTab={setBackpackTab} view={packView} setView={setPackView} scrollMemory={scrollMemory}/>;
 if(panel==='honor')return <HonorPanel p={p} onClose={()=>g.open(null)}/>;
 if(panel==='mail')return <MailPanel p={p}/>;
 if(panel==='save-tools')return <SaveTools/>;
 return <DialogShell panel={panel} scrollMemory={scrollMemory} onBack={gearBack??(panel==='workshops'?()=>g.open('forge'):returnToHarbor?()=>{setRealmFromHarbor(false);g.open('port')}:(panel==='carnival'||panel==='season')?()=>g.open('events'):sourceBack?()=>g.open(sourceBack):returnToQuest?()=>{setQuestDestination(null);g.open('quests')}:panel==='lair'?()=>g.open('adventure'):panel==='hero-path'?()=>g.open('quests'):backTarget(panel)?goBack:undefined)} backLabel={gearBack?'← Назад':panel==='workshops'?'В кузницу':returnToHarbor?'‹ В гавань':(panel==='carnival'||panel==='season')?'К событиям':sourceBack?'Назад':returnToQuest?'К заданию':panel==='lair'?'К приключениям':panel==='hero-path'?'К заданиям':backTarget(panel)?'‹ Назад':undefined} title={slot?slotNames[slot]:titles[panel]??(panel.startsWith('source:')?sourceTitle(panel.split(':')[1]):panel)} rarity={item?.rarity} footer={panel==='menu'||panel==='arena'?null:<footer className={`modal-footer ${panel==='item'&&item?'item-footer':''}`}>{panel==='item'&&item&&<ItemDecisions key={item.id} item={item} p={p} isTrophy={isTrophy} onRewardResolved={finish}/>}<div className="footer-wallet"><span><Icon name="coins"/>{fmt(p.gold)}</span><span><Icon name="gem"/>{fmt(p.gems)}</span><button onClick={()=>g.open(null)}><Icon name="axes"/>К бою</button></div></footer>}><ForgeEcho/>
 {panel==='controls'&&<><p>Нажмите топоры для запуска путешествия. По умолчанию герой сам идёт после победы и ждёт топоры после смерти. Скорость, навыки и условия остановки настраиваются через кнопку автобоя. Меню временно ставит активный бой на паузу.</p><Action onClick={()=>{battle?.toggle();g.open(null)}}>{g.battle.running?'Остановить':'Продолжить'} бой</Action><Action onClick={()=>g.configure({auto:!g.auto})}>Auto навыков: {g.auto?'ВКЛ':'ВЫКЛ'}</Action><Action onClick={()=>g.configure({speed:g.speed===1?2:1})}>Скорость: x{g.speed}</Action><Action onClick={()=>g.open('autobattle')}>Настройки автобоя</Action>{skillData.map((skill,i)=><Action key={skill.name} disabled={!g.battle.running||g.battle.cooldowns[i]>0} onClick={()=>battle?.skill(i)}>{skill.name} {g.battle.cooldowns[i]>0?Math.ceil(g.battle.cooldowns[i])+' сек':''}</Action>)}</>}
 {panel==='equipment'&&<><HeroPortrait p={p} compact/>{(()=>{const plan=bestUpgrades(p);return plan.length?<><Action onClick={()=>g.equipBest()}>Надеть лучшее · {plan.length} {plan.length===1?'вещь':plan.length<5?'вещи':'вещей'}</Action><p className="hint">Берёт из рюкзака самые сильные вещи. Старые возвращаются в рюкзак; именные трофеи не заменяются.</p></>:<p className="hint">Сила героя {fmt(s.cp)} · в рюкзаке нет вещей сильнее надетых.</p>})()}<div className="equipment-ledger">{slots.map(slot=>{const worn=p.equipment[slot],better=bestUpgrade(p,slot);return <Row key={slot} icon={gearIcon(slot,worn)} title={slotNames[slot]} detail={worn?`${rarityNames[worn.rarity]} · ур.${worn.level} · +${worn.upgrade}${better?` · ↑ в рюкзаке +${better.gain} силы`:''}`:better?`Не надето · ↑ в рюкзаке +${better.gain} силы`:'Не надето'}><Action kind={better?'':'secondary'} onClick={()=>g.open(slot==='wings'&&!p.equipment.wings&&!better?'wings':`gear:${slot}`)}>{better?'Заменить':'Открыть'}</Action></Row>})}</div></>}
 {panel==='hero'&&(()=>{const goal=xpNeeded(p.level),points=p.level-1-p.talents.reduce((a,b)=>a+b,0);return <>
  <section className="hero-sheet" aria-label="Герой">
   <HeroPortrait p={p} compact/>
   <div className="hero-id"><h3>{classNames[p.heroClass]}</h3><b className="gold-text">Сила {fmt(s.cp)}</b><span>Уровень {p.level}</span><span className="hero-xp" role="progressbar" aria-label={`Опыт до уровня ${p.level+1}`} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(goal,p.xp)}><i style={{width:`${Math.min(100,p.xp/goal*100)}%`}}/></span><small>{fmt(p.xp)} / {fmt(goal)} XP</small></div>
  </section>
  <button type="button" className="class-toggle" aria-expanded={classOpen} aria-controls="class-picker" onClick={()=>setClassOpen(v=>!v)}><Icon name="helmet"/><span><strong>{classOpen?'Скрыть выбор':'Сменить персонажа'}</strong></span><b aria-hidden="true">{classOpen?'▴':'▾'}</b></button>
  {classOpen&&<ClassPicker p={p}/>}
  <div className="hero-stats">{[['stat-health','Здоровье',fmt(s.hp)],['stat-attack','Атака',fmt(s.attack)],['stat-defense','Защита',fmt(s.defense)]].map(([icon,label,value])=><div key={label}><Icon name={icon}/><small>{label}</small><strong>{value}</strong></div>)}</div>
  <DetailedStats p={p}/>
  <SpecChooser p={p}/>
  <details className="saga-disclosure"><summary><Icon name="armor"/><span>Комплекты</span></summary><SetSummary p={p}/></details>
  <details className="saga-disclosure"><summary><Icon name="rune"/><span>Источники силы</span></summary><PowerSources p={p}/><DarkHub p={p}/></details>
  <details className="saga-disclosure"><summary><Icon name="scroll"/><span>Рекомендации для класса</span></summary><BuildGuide p={p}/></details>
  <details className="saga-disclosure"><summary><Icon name="book"/><span>Сохранённые сборки</span></summary><BuildSlots p={p}/></details>
  <div className="hero-links"><Action kind={points>0?'':'secondary'} onClick={()=>g.open('talents')}>{points>0?`Таланты · ${points} очк.`:'Таланты'}</Action><Action kind="secondary" onClick={()=>g.open('inventory')}>Рюкзак · {p.inventory.length}/80</Action></div>
 </>})()}
 {panel==='battle'&&<><Row icon="axes" title={`${stageLabel(p.stage)} · волна ${p.wave}/5`} detail={g.battle.enemyName}/><div className="stat-grid"><div><small>Победы</small><strong>{p.kills}</strong></div><div><small>Боссы</small><strong>{p.bosses}</strong></div><div><small>Урон / удар</small><strong>{s.attack}</strong></div><div><small>Режим</small><strong>{modeNames[g.battle.mode]??'Бой'}</strong></div></div>{g.battle.mode==='campaign'&&p.wave===5&&<details className="saga-disclosure"><summary><Icon name="chest"/><span>Награда за победу</span></summary><RewardArt reward={campaignBossReward(p)} names/><p>{guaranteedBossTrophy(p)??'Снаряжение определяется при победе'}</p></details>}<p>Герой атакует автоматически. Auto управляет тремя навыками. Красная сфера лечит за {g.battle.potionCost??balance.combat_test_settings.potion_gold_cost} золота (цена растёт с этапом, перезарядка {balance.combat_test_settings.potion_cooldown_seconds} сек), голубая активирует удар.</p><Action onClick={()=>{battle?.challenge();g.open(null)}}>Продолжить основную главу</Action><Action onClick={()=>g.open('loot')}>Открыть Рог Трофеев · {p.horn} зарядов</Action></>}
 {slot&&(()=>{const gear=<><QuickSwap slot={slot} p={p}/>{slot&&old&&<><ItemDetails item={old}/><UpgradePlan key={old.id+':'+old.upgrade} item={old} p={p}/><ForgeBench slot={slot} p={p}/><details className="saga-disclosure"><summary>Снять в рюкзак</summary><Action kind="secondary" onClick={()=>g.unequip(slot)}>Подтвердить снятие</Action></details></>}<h3 className="slot-pack-title">Из рюкзака · {p.inventory.length}/80{p.pendingLoot?.length?<button type="button" onClick={()=>g.open('inventory')}>Хранение · {p.pendingLoot.length} →</button>:null}</h3><div className="tabs"><button className={filter==='all'?'selected':''} onClick={()=>setFilter('all')}>Все</button><button className={filter==='better'?'selected':''} onClick={()=>setFilter('better')}>Улучшения</button><button className={filter==='rare'?'selected':''} onClick={()=>setFilter('rare')}>Редкие</button><button className={filter==='unique'?'selected':''} onClick={()=>setFilter('unique')}>Именные</button></div><div className="inventory-order"><span>Сортировка</span><CompactFilter label="Сортировка" value={order} onChange={setOrder} options={[{value:"power",label:"Польза для героя"},{value:"rarity",label:"Редкость"},{value:"newest",label:"Сначала новые"}]}/></div><InventoryGrid p={p} filter={filter} slot={slot} order={order} onSelect={g.select} onBulkSalvage={g.bulkSalvage}/>{p.inventory.length>0&&inventoryItems(p,filter,slot,order).length===0&&<p className="hint">Нет предметов под выбранным фильтром.</p>}{p.inventory.filter(i=>!slot||i.slot===slot).length===0&&<p className="hint">Новые предметы можно добыть в бою и из Рога Трофеев.</p>}<Action onClick={()=>g.hornLoot()}>Рог Трофеев · {p.horn} зарядов</Action></>;return slot==='wings'?<WingGrowth p={p} gear={gear}/>:gear})()}
 {panel==='item'&&item&&<>{isTrophy&&<><TrophyReveal key={item.id} item={item} encounter={p.rewardOffer!.encounterId}/>{p.rewardOffer?.bossReward&&<RewardNotice message="За победу" reward={p.rewardOffer.bossReward}/>}
 {p.rewardOffer?.hammerGold&&<p className="hint">Руна Молота · +{p.rewardOffer.hammerGold.toLocaleString('ru')} золота за победу</p>}<p className={`trophy-value ${compareItem(item,p)>=0?'positive':'negative'}`}>{compareItem(item,p)>=0?'+':''}{compareItem(item,p)} CP <small>к силе героя при экипировке</small></p></>}<SharpenedComparison item={item} old={old} p={p}/><StatDelta item={item} old={old} p={p}/><EffectComparison item={item} p={p}/><div className="comparison"><div><h3>Новая вещь</h3><ItemDetails item={item}/></div><div><h3>Надето</h3>{old?<ItemDetails item={old}/>:<p>Слот свободен</p>}</div></div></>}
 {panel==='loot'&&<><PanelIntro icon="horn" title={'Рог Трофеев · '+p.horn+'/'+balance.horn_test_settings.maximum_charges}>Один предмет за заряд. Заряд восстанавливается за {balance.horn_test_settings.recharge_one_charge_every_seconds/60} мин.</PanelIntro><Action disabled={p.horn<balance.horn_test_settings.chest_charge_cost} onClick={()=>g.hornLoot()}>Протрубить · {balance.horn_test_settings.chest_charge_cost} заряд.</Action><GiftHorn/><Action kind="secondary" onClick={()=>g.buy('horn',shopQuote({price:purchase.cost,reward:{horn:purchase.count}}))} disabled={purchase.count===0||p.gems<purchase.cost}>{purchase.count?`+${purchase.count} зарядов · ${purchase.cost} самоцветов`:'Рог заполнен'}</Action><Action kind="secondary" onClick={()=>g.open('source:horn:loot')}>Где получить заряды</Action><Action kind="secondary" onClick={()=>g.open('inventory')}>Рюкзак · {p.inventory.length}/80</Action><Action kind="secondary" onClick={()=>g.open('blessing')}>Улучшить качество добычи</Action></>}
 {panel==='skills'&&<RuneWorkshop p={p}/>}
 {panel==='companions'&&<SquadPanel p={p}/>}
 {panel==='realm'&&<RealmPanel p={p}/>}
 {panel==='darkgear'&&<DarkGearPanel p={p}/>}
 {panel==='gems'&&<><GemsPanel p={p}/></>}
 {panel==='talents'&&<><p>Свободно очков: <strong>{p.level-1-p.talents.reduce((a,b)=>a+b,0)}</strong>. Один уровень героя даёт одно очко.</p>{['Ярость','Стойкость','Удача'].map((name,i)=><Row key={name} icon={['stat-attack','stat-defense','talent-luck'][i]} title={`${name} · ${p.talents[i]}`} detail={['+4% атаки и +0,5% крита','+5% HP, +3% защиты, +0,3% уклонения','+5% золота с врагов'][i]+(i<2?` · +${stats({...p,talents:p.talents.map((t,n)=>t+Number(i===n))}).cp-s.cp} силы`:'')}><Action disabled={p.talents.reduce((a,b)=>a+b,0)>=p.level-1} onClick={()=>g.train('talent',i)}>+</Action></Row>)}<Action disabled={p.gold<100||p.talents.every(v=>v===0)} onClick={()=>g.mutate(p=>{p.gold-=100;p.talents=[0,0,0]})}>Сбросить · 100 золота</Action></>}
 {panel==='forge'&&<><div className="tabs">{[['forge','Кузница'],['recipes','Создание'],['gear','Экипировка']].map(([id,label])=><button key={id} className={forgeTab===id?'selected':''} aria-pressed={forgeTab===id} onClick={()=>setForgeTab(id)}>{label}</button>)}</div><Action kind="secondary" onClick={()=>g.open('workshops')}>Мастерские</Action>{forgeTab==='forge'&&<><div className="game-metrics"><span className="game-metric"><Icon name="hammer"/>Ур. {p.forge}</span><span className="game-metric"><Icon name="armor"/>Добыча +{forgeLevel(p)-p.level} ур.</span></div><small>Мастерство кузницы: +{(forgeMasteryBonus(p)*100).toFixed(1)}% к характеристикам новой добычи и ковки.</small><details className="saga-disclosure"><summary>Как работает кузница</summary><p>Уровень новой экипировки не выше уровня героя +5. Дальнейшее развитие кузницы повышает качество новых вещей (до +25% характеристик), а не их уровень. Ранее полученные вещи и их усиления остаются в сохранении.</p></details><Action disabled={p.gold<100*p.forge} onClick={()=>g.train('forge')}>Развить кузницу · {100*p.forge} золота</Action></>}{forgeTab==='recipes'&&<Recipes p={p} onFreeSpace={freeSpace}/>} {forgeTab==='gear'&&<><h3>Усиление, перековка и гравировка</h3>{slots.filter(slot=>p.equipment[slot]).map(slot=><Row key={slot} icon={gearIcon(slot,p.equipment[slot])} title={slotNames[slot]} detail={`Усиление +${p.equipment[slot]!.upgrade}`}><Action onClick={()=>g.open(`gear:${slot}`)}>Усилить</Action></Row>)}</>}</>}
 {panel==='blessing'&&(()=>{
  const current=blessingEffects(p.blessing),next=blessingEffects(p.blessing+1),improves=blessingCanImprove(p.blessing);
  const percent=(value:number)=>(value*100).toLocaleString('ru',{maximumFractionDigits:1})+'%';
  const change=(key:keyof typeof current)=>percent(current[key])+(next[key]>current[key]?' → '+percent(next[key]):'');
  return <><div className="game-metrics"><span className="game-metric"><Icon name="crown"/>Ур. {p.blessing}</span><span>Редкость · {change('rarity')}</span></div>
   <BlessingOdds level={p.blessing} canImprove={improves}/>
   <details className="saga-disclosure"><summary><Icon name="chest"/><span>Шансы добычи и ковки</span></summary>
    <div className="bonus-card"><span>+1 к редкости добычи · {change('rarity')}</span>
     <span>+1 к редкости обычной ковки · {change('craft')}</span>
     <span>Комплект в обычном бою · {change('regular')}</span><span>Комплект у босса · {change('boss')}</span><span>Комплект из Рога · {change('horn')}</span>
    </div>
   </details>
   <Action disabled={!improves||p.gold<150*p.blessing} onClick={()=>g.train('blessing')}>{improves?`Получить благословение · ${150*p.blessing} золота`:'Максимум бонусов'}</Action>
  </>;
 })()}
 {panel==='hero-path'&&<HeroTracks p={p}/>}
 {panel==='quests'&&<>
  <GameTabs label="Журнал героя" value={journal} items={[['tasks','Задания'],['path','Путь героя'],['achievements','Достижения']]} onChange={setJournal}/>
  {journal==='tasks'&&<>
   {currentLegend&&<PanelIntro icon="map" title={currentLegend}>Шесть регионов открываются снова, с более сильными врагами. Продолжайте поход: проходите волны, побеждайте боссов и забирайте награды за этапы.</PanelIntro>}
   {chapterReward}
   <FirstRegionTip p={p} onOpen={()=>goFromQuest('relic')}/>
   <QuestBoard p={p} tab={questTab} setTab={setQuestTab} onGo={goFromQuest}/>
   <details className="saga-disclosure"><summary><Icon name="map"/><span>Цели охоты и источники добычи</span></summary><HuntGoals p={p}/></details>
   <details className="saga-disclosure"><summary><Icon name="chest"/><span>Именные трофеи саги</span></summary><GearGuide p={p}/></details>
   <div className="game-actions"><Action onClick={()=>{battle?.challenge();g.open(null)}}>В бой · {currentLegend??stageLabel(p.stage)}</Action><Action kind="secondary" onClick={()=>g.open('loot')}>Рог · {p.horn}</Action></div>
  </>}
  {journal==='path'&&<HeroTracks p={p} onGo={goFromQuest}/>}
  {journal==='achievements'&&<><QuestBoard p={p} tab="mastery" setTab={setQuestTab} onGo={goFromQuest}/><details className="saga-disclosure"><summary><Icon name="book"/><span>Летопись</span></summary><Chronicle/></details></>}
 </>}
 {panel==='rewards'&&<DailyRewards p={p}/>}
 {panel==='events'&&<SoloEvents p={p}/>}
 {panel==='season'&&<SeasonRewards p={p}/>}
 {panel==='carnival'&&<CarnivalPanel/>}
 {(panel==='friends'||panel==='invite')&&<><PanelIntro icon="handshake" title="Боевое братство">Отправьте ссылку другу, чтобы он открыл игру в Telegram.</PanelIntro><ReferralPanel mode={panel}/></>}
 {panel==='collection'&&<CollectionHub p={p}/>}
 {panel==='worldboss'&&<WorldBossPanel p={p}/>}
 {panel==='workshops'&&<Recipes p={p} onFreeSpace={freeSpace} workshop/>}
 {panel==='port'&&<div className={harborHelp?'harbor-workspace guide-open':'harbor-workspace'}>
  <div className="harbor-map">
  <HarborScene view="port" ships={fleet.ships} badges={claimable>0?{shipyard:'+'+claimable}:undefined} onNavigate={destination=>{setRealmFromHarbor(destination==='realm');g.open(destination)}}/>
  <button type="button" className="harbor-help" aria-expanded={harborHelp} aria-label="Что такое Верфь, Тёмная энергия и Камни" onClick={()=>setHarborHelp(v=>!v)}>{harborHelp?'×':'?'}</button>
  <ul className="harbor-guide" id="harbor-guide">
   <li><button type="button" onClick={()=>g.open('shipyard')}><Icon name="red-diamond"/><span><b>Верфь{claimable>0?` · +${claimable}`:''}</b><small>Красные алмазы · {SHIP_RULES.sealPrice} → 1 печать</small></span></button></li>
   <li><button type="button" onClick={()=>g.open('darkgear')}><Icon name="essence"/><span><b>Тёмная энергия</b><small>Свои 12 слотов · из Царства тьмы</small></span></button></li>
   <li><button type="button" onClick={()=>g.open('gems')}><Icon name="gem"/><span><b>Камни</b><small>В гнёзда 12 основных слотов</small></span></button></li>
  </ul>
  </div>
  <div className="workspace-actions"><MineCollection/></div>
 </div>}
 {panel==='shipyard'&&<>
  <HarborScene view="shipyard" ships={fleet.ships} selectedShipId={currentShip.id} onChooseShip={setSelectedShipId}/>
  <div className="harbor-economy"><strong className="content-with-icon"><Icon name="red-diamond"/>{fmt(p.redDiamonds??0)} красных алмазов</strong><span>Добыча: {shipRate(fleet)}/час · запас: {shipCapacity(fleet)}</span></div>
  <details className="saga-disclosure"><summary>На кораблях · {(Math.floor(fleet.stored*100)/100).toFixed(2)}</summary><p>Драккары добывают алмазы и вне игры. Запас рассчитан на 12 часов.</p></details>
  {shipLimit?<p className="hint">Достигнут лимит алмазов. Обменяйте часть запаса у корабельщика.</p>:<CollectionStatus title="Следующий алмаз" waitMs={shipWait} progress={shipProgress} readyText={`К сбору · ${claimable} красных алмазов`}/>}
  <Action disabled={claimable<=0||shipLimit} onClick={()=>g.shipAction('claim')}>{claimable>0?'Забрать '+claimable+' красных алмазов':'Добыча продолжается'}</Action>
  <Row icon="red-diamond" title="Обмен у корабельщика" detail={`${SHIP_RULES.sealPrice} красных алмазов → 1 печать призыва для спутников`}>
    <Action disabled={(p.redDiamonds??0)<SHIP_RULES.sealPrice} onClick={()=>g.shipAction('trade')}>{(p.redDiamonds??0)<SHIP_RULES.sealPrice?`Нужно ${SHIP_RULES.sealPrice} алмазов`:`Обменять · ${SHIP_RULES.sealPrice} алмазов`}</Action>
  </Row>
  <Row icon="ship" title={'Драккар '+currentShip.id.split('-')[1]+' · ур. '+currentShip.level} detail={'Приносит '+currentShip.level+' алмазов/час'}>
    <Action disabled={shipUpgradeCost(currentShip.level)===null||p.gold<(shipUpgradeCost(currentShip.level)??Infinity)} onClick={()=>g.shipAction('upgrade',currentShip.id)}>{shipUpgradeCost(currentShip.level)===null?'Макс. уровень':'Улучшить · '+shipUpgradeCost(currentShip.level)+' зол.'}</Action>
  </Row>
  <Action disabled={buildCost===null||p.gold<(buildCost??Infinity)} onClick={()=>g.shipAction('buy')}>{buildCost===null?'Все три корабля построены':'Построить драккар · '+buildCost+' золота'}</Action>
 </>}
 {panel==='relic'&&<RelicsPanel p={p}/>}
 {panel==='lair'&&<LairPanel p={p}/>}
 {panel==='lair-revive'&&p.encounter?.mode==='dungeon'&&(()=>{
  const attempt=p.encounter,used=attempt.lairRevives??0,cost=lairReviveCost(attempt.stage);
  return <><p>Верните 50% здоровья. Страж и оставшееся время сохранятся. Возрождений {lairRules.revives-used}/{lairRules.revives}.</p>
   <Action disabled={p.gold<cost||attempt.timer<=0||used>=lairRules.revives} onClick={()=>battle?.reviveLair(attempt.id,used)}>Подтвердить · {cost} золота</Action>
   <Action kind="secondary" onClick={()=>g.open(null)}>Отмена</Action></>;
 })()}
 {panel==='adventure'&&<><div className="adventure-destinations">{[['campaign','map','Основная глава',`Этап ${stageLabel(p.stage)}`],['dungeon','lair-keeper','Логово мини-босса',`${balance.combat_test_settings.mode_entry_chaosite} Хаосита`],['darkness','portal','Царство тьмы',`Этаж ${p.darkFloor}`],['farm','coins','Бесконечный фарм','Золото и опыт'],...(worldBossEnabled()?[['worldboss','crown','Мировой босс','Битва всех героев']]:[])].map(([mode,icon,name,detail])=><button key={mode} className={'adventure-route route-'+mode} onClick={()=>mode==='darkness'?g.open('realm'):mode==='dungeon'?g.open('lair'):mode==='worldboss'?g.open('worldboss'):battle?.startMode(mode)}><Icon name={icon}/><strong>{name}</strong><small>{detail}</small></button>)}
  <button className="adventure-route" onClick={()=>g.open('arena')}><Icon name="arena"/><strong>Арена</strong><small>1×1 · 3×3 · 20×20</small></button>
  {Community&&<button className="adventure-route" onClick={()=>g.open('guild')}><Icon name="handshake"/><strong>{titles.guild}</strong><small>{lang==='en'?'Guild quests':'Командные задания'}</small></button>}
 </div><AdventureRules stage={p.stage}/><h3>Сила героя</h3><DarkHub p={p}/></>}
 {panel==='arena'&&<ArenaPanel/>}
 {Community&&(panel==='auction'||panel==='guild'||panel==='rankings')&&
  <Suspense fallback={null}><Community key={panel} section={panel==='rankings'?'ranking':panel}/></Suspense>}
 {panel.startsWith('source:')&&<ResourceSources kind={panel.split(':')[1]} returnTo={panel.split(':')[2]}/>}
 {panel==='shop'&&<>
  {Community&&<Action kind="secondary" onClick={()=>g.open('auction')}>{titles.auction}</Action>}
  <TreasureShop p={p} onFreeSpace={freeSpace} source={kind=><ResourceSources kind={kind} returnTo="shop"/>} sources={sourceTitle}/>
 </>}
 {panel==='menu'&&<>
  <section className="menu-settings" aria-label="Настройки">
   <Action kind="secondary" onClick={toggleSound}>Звук: {p.sound?'ВКЛ':'ВЫКЛ'}</Action>
   <Action kind="secondary" onClick={()=>g.mutate(p=>{p.volume=((p.volume??2)%3+1) as 1|2|3})}>Громкость: {['тихо','средне','громко'][(p.volume??2)-1]}</Action>
   <Action kind="secondary" onClick={()=>setLang(lang==='en'?'ru':'en')}>{lang==='en'?'Language: English':'Язык: Русский'}</Action>
   <Action kind="secondary" onClick={()=>g.mutate(p=>{p.reducedMotion=!(p.reducedMotion??window.matchMedia('(prefers-reduced-motion: reduce)').matches)})}>Уменьшение движения: {(p.reducedMotion??window.matchMedia('(prefers-reduced-motion: reduce)').matches)?'ВКЛ':'ВЫКЛ'}</Action>
  </section>
  <nav className="menu-links" aria-label="Разделы меню">
   {Community&&(['auction','guild','rankings'] as const).map((entry,i)=>
    <button key={entry} type="button" onClick={()=>g.open(entry)}>
     <Icon name={(['market','handshake','crown'] as const)[i]}/><span>{titles[entry]}</span><b aria-hidden="true">›</b>
    </button>)}
   <button type="button" onClick={()=>g.open('controls')}><Icon name="shield"/><span>Управление боем</span><b aria-hidden="true">›</b></button>
   <button type="button" onClick={()=>g.open('equipment')}><Icon name="armor"/><span>Экипировка</span><b aria-hidden="true">›</b></button>
   <button type="button" onClick={()=>g.open('save-tools')}><Icon name="chest"/><span>Сохранение и восстановление</span><b aria-hidden="true">›</b></button>
  </nav>
  {Community&&<TonWallet/>}
  {Community&&<AdminGate/>}
  {isolatedProfile&&<Action kind="secondary" onClick={mainHero}>Вернуться к основному герою</Action>}
  <details className="saga-disclosure menu-heroes" open={confirmHero||undefined}>
   <summary>Другие герои на этом устройстве</summary>
   <SavedHeroes onOpen={openHero}/>
   <p className="hint">Новый герой начинает с первого похода в отдельном слоте; текущий прогресс не меняется.</p>
   <Action onClick={()=>setConfirmHero(true)}>Новый герой · первый поход</Action>
   {confirmHero&&<div className="import-preview new-hero-confirm" ref={revealOnMount}>
    <h3>Начать нового героя?</h3>
    <p>Текущий герой не удаляется: уровень {p.level} · этап {stageLabel(p.stage)} · предметов {p.inventory.length}. Новый герой хранится отдельно на этом устройстве.</p>
    <p>Вернуться можно в любой момент: Меню → «Вернуться к основному герою»{isolatedProfile?' → «Другие герои на этом устройстве»':''}.</p>
    <Action onClick={newHero}>Начать нового героя</Action>
    <Action kind="secondary" onClick={()=>setConfirmHero(false)}>Отмена</Action>
   </div>}
  </details>
 </>}
 </DialogShell>
}
