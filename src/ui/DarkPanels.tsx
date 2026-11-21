import {CompactFilter} from './CompactFilter';
import {GameTile,GameTiles} from './CompactGame';
import {useRepeatAction} from './useRepeatAction';
/**
 * Windows of the five dark systems: Dark Realm, Dark Energy gear, gems, relics and companions.
 * Rendered inside the shared DialogShell. Every button calls a real transaction from dark/actions.
 */
import {useLayoutEffect,useRef,useState} from 'react';
import {useGame} from '../core/store';
import type {Player,Slot} from '../core/types';
import {art,slotNames,characters} from '../data/catalog';
import {stats} from '../core/formulas';
import {materials,matCount} from '../saga/gear';
import {Icon,gearIcon} from './Icon';
import {CardDialog} from './SagaUI';
import {CompanionGrowth} from './SagaPanels';
import {resources,resCount,duskCount,type ResId,bonusLines,statNames,statText,
 darkSlots,darkRarity,darkColors,darkState,darkValue,darkEffectOf,darkName,darkScore,darkUpgradeCost,darkMaxUpgrade,darkSalvageValue,darkBonus,darkEffectTotals,darkEffects,darkEffectIds,darkResonance,DARK_STORAGE,type DarkItem,
 gemTypes,gemSlots,gemState,parseGem,gemLabel,gemText,gemBonus,gemSynthGold,socketOpen,socketRules,GEM_MAX,GEM_SHOP_PRICE,
 relics,relicIds,relicLevel,relicRarity,relicColors,relicUnlockCost,relicUpgradeCost,relicCollection,RELIC_MAX,type RelicId,
 squadBonus,companions,companionIds,companionRarity,companionColors,squadState,followerProgress,followerId,FOLLOWER_MAX_LEVEL,companionPower,legacyPet,starCost,STAR_MAX,AWAKEN,followerStarCap,talentDefs,talentPoints,TALENT_MAX,powerParts} from '../dark/rules';
import {blessings,blessingIds,realmRun,realmLast,realmSelected,roomReward,floorName,lordFloor,floorBoss,roomTitles,REALM_COST,ROOMS,type BlessingId,type RealmLast,type RealmTotals} from '../dark/realm';
import {collectRealmReward,realmSelect,realmStart,realmResume,realmAbandon,darkEquip,darkUnequip,darkUpgrade,darkSalvage,darkSalvageMany,darkBulkList,
 gemInsert,gemRemove,gemSynth,gemSynthAll,gemBuy,relicUnlock,relicUpgrade,petLevel,petLevelCost,petStar,petAwaken,petTalent,petTalentReset,petActivate,petClearReserve,totalFollowerTalent} from '../dark/actions';
import {followerEconomy as followerRules,balanceOf} from '../saga/soloEconomy';
import {followerMarket,freeRefresh,refreshFollowers,buyFollower,exchangeSeal,exchangeFollowerShards,redeemFollowerShards,offerOdds,exchangeAwakeningShards,nextAwakening,advanceAwakening,protectFollower,followerMerge,mergeFollower} from '../dark/followerMarket';
import './dark.css';
const fmt=(v:number)=>v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e4?`${(v/1000).toFixed(1)}K`:Math.round(v).toLocaleString('ru');
const nameOf=(id:string)=>characters.find(c=>c.id===id)?.name.split(',')[0]??id;
function Btn({children,onClick,disabled=false,kind=''}:{children:React.ReactNode;onClick:()=>void;disabled?:boolean;kind?:string}){return <button className={`action ${kind}`} onClick={onClick} disabled={disabled}>{children}</button>}
/** Shared wallet of the dark systems. */
export function DarkWallet({p,show=['ess','shard','seal'],from}:{p:Player;show?:ResId[];from?:string}){
 const open=useGame(s=>s.open);
 const guide=(id:string,name:string)=>from&&<button className="resource-source" type="button" aria-label={`Где получить · ${name}`} title="Где получить" onClick={()=>open(`source:${id}:${from}`)}>?</button>;
 return <div className="dark-wallet">{show.map(id=><span key={id} style={{'--tone':resources[id].color} as React.CSSProperties} title={resources[id].source}><Icon name={resources[id].icon}/><b>{fmt(resCount(p,id))}</b><small>{resources[id].short}</small>{guide(id,resources[id].name)}</span>)}<span style={{'--tone':materials.dusk.color} as React.CSSProperties}><Icon name="dusk-stone"/><b>{fmt(duskCount(p))}</b><small>Камни Сумрака</small>{guide('dusk','Камни Сумрака')}</span></div>;
}
const rewardRows=(t:RealmTotals)=>[[t.ess,'Тёмная эссенция'],[t.gold,'Золото'],[t.xp,'Опыт'],[t.shard,'Осколки реликвий'],[t.dusk,'Камни Сумрака'],[t.seal,'Печати призыва'],[t.gems,'Самоцветы']].filter(r=>(r[0] as number)>0) as [number,string][];

// ───────────────────────── Dark Realm ─────────────────────────
export function RealmPanel({p}:{p:Player}){
 const g=useGame(),run=realmRun(p),last=realmLast(p),floor=realmSelected(p),[bless,setBless]=useState<BlessingId>('fury'),[info,setInfo]=useState(false);
 const max=p.darkFloor,first=floor===max,hasRun=!!run;
 const floorList=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const list=floorList.current,selected=list?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
  if(list&&selected)list.scrollTop=selected.offsetTop+(selected.offsetHeight-list.clientHeight)/2;
 },[max,hasRun]);
 if(run)return <div className="realm">
  <div className="workspace-toolbar"><span className="realm-resource"><Icon name="rune"/> {fmt(p.chaosite)} Хаосита</span><button onClick={()=>setInfo(true)}>Награды и правила</button></div>
  <div className="realm-banner live"><small>ПОХОД ИДЁТ</small><strong>Этаж {run.f} · {floorName(run.f)}</strong><span>{roomTitles[run.r-1]} · {run.stage.startsWith('CHOICE')?'Выбор портала':`${run.killed}/${run.total}`}</span><em style={{color:blessings[run.b].color}}>{blessings[run.b].name}: {blessings[run.b].text}</em></div>
  <div className="local-scroll"><h3>Уже добыто</h3><RewardList t={run.acc}/></div>
  <div className="workspace-actions"><Btn onClick={()=>realmResume()}>Продолжить поход</Btn>
  <Btn kind="secondary" onClick={()=>realmAbandon()}>Покинуть поход · добытое сохранится</Btn></div>
  {info&&<CardDialog title="Текущий поход" onClose={()=>setInfo(false)}><RewardList t={run.acc}/><p>Вход оплачен при старте. Закрытие игры не прерывает поход: вы вернётесь в тот же бой.</p></CardDialog>}
 </div>;
 return <div className="realm">
  <div className="workspace-toolbar"><span className="realm-resource"><Icon name="rune"/> {fmt(p.chaosite)} Хаосита</span><button onClick={()=>setInfo(true)}>Награды и правила</button></div>
  {last&&!last.ack&&(last.win
   ?<RealmVictory key={last.resultId} last={last} onClose={()=>g.open(null)}/>
   :<CardDialog title="Поражение" onClose={()=>g.open(null)}><div className="realm-result lose"><small>ПОРАЖЕНИЕ</small><strong>Этаж {last.f} · пройдено комнат: {last.rooms} из {ROOMS}</strong>
    <RewardList t={last}/>
    <p>Герой пал, но всё добытое в пройденных комнатах сохранено. Усильте Тёмную энергию, вставьте камни или развивайте спутников — и возвращайтесь.</p>
    <div className="realm-result-actions"><Btn onClick={()=>{realmSelect(last.f);collectRealmReward()}}>Забрать и к этажам</Btn></div>
   </div></CardDialog>)}
  <div className="realm-entry">
   <div className={`realm-banner realm-portal ${lordFloor(floor)?'lord':''}`}><div className="portal-light" aria-hidden="true"/><div className="portal-caption"><small>{first?'НОВЫЙ ЭТАЖ':'ПРОЙДЕН · ПОВТОР'}{lordFloor(floor)?' · ЭТАЖ ВЛАДЫКИ':''}</small><strong>Этаж {floor} · {floorName(floor)}</strong></div></div>
   <div ref={floorList} className="realm-floor-list" role="group" aria-label="Этажи Царства тьмы" tabIndex={0}>
    {Array.from({length:Math.max(5,max+2)},(_,i)=>{
     const number=i+1;
     return <button key={number} disabled={number>max} aria-pressed={number===floor} onClick={()=>realmSelect(number)}>
      <Icon name={number>max?'shield':lordFloor(number)?'portal':'rune'}/>
      <span>Этаж {number}</span><small>{number>max?'Закрыт':number<max?'Пройден':'Новый'}</small>
     </button>;
    })}
   </div>
  </div>
  <h3 className="bless-title">Благословение похода</h3>
  <div className="bless-grid">{blessingIds.map(id=><button key={id} className={bless===id?'selected':''} aria-pressed={bless===id} title={blessings[id].text} style={{'--tone':blessings[id].color} as React.CSSProperties} onClick={()=>setBless(id)}><Icon name={blessings[id].icon}/><strong>{blessings[id].name}</strong></button>)}</div>
  <p className="bless-explainer" role="status">{blessings[bless].text}</p>
  <div className="workspace-actions"><Btn disabled={p.chaosite<REALM_COST} onClick={()=>realmStart(floor,bless)}>Вызов · {REALM_COST} Хаосита{p.chaosite<REALM_COST?` (есть ${p.chaosite})`:''}</Btn></div>
  {info&&<CardDialog title="Награды и правила" onClose={()=>setInfo(false)}>  <h3>Награда этажа{first?' · первое прохождение':''}</h3>
  <div className="realm-rewards">{[1,2,3,4,5,6].map(room=>{const r=roomReward(floor,room,first);return <div key={room}><b>{roomTitles[room-1]}</b><span>{r.ess} эссенции · {fmt(r.gold)} золота{r.shard?` · ${r.shard} оск.`:''}{r.items?` · тёмный предмет${r.items>1?' ×'+r.items:''}`:''}{r.gemChance?` · камень ${Math.round(r.gemChance*100)}%`:''}{r.dusk?` · ${r.dusk} Камень Сумрака`:''}{r.sealChance?` · печать ${Math.round(r.sealChance*100)}%`:''}{r.gems?` · ${r.gems} самоцв.`:''}</span></div>})}</div>
  <p className="hint">7 врагов, четыре выбора порталов и владыка этажа. Поражение завершает поход, но добыча пройденных участков доступна в итоге. Пройденные этажи можно повторять сколько угодно — ради эссенции, предметов и камней.</p></CardDialog>}
 </div>;
}
function RewardList({t}:{t:RealmTotals}){return <div className="reward-list">{rewardRows(t).map(([n,label])=><span key={label}><b>+{fmt(n)}</b>{label}</span>)}{t.loot.map((name,i)=><span key={i} className="loot"><b>★</b>{name}</span>)}{!rewardRows(t).length&&!t.loot.length&&<span>Награды не получены</span>}</div>}

type RealmLootTile={key:string;label:string;quantity:number;icon:string;tone:string;gem?:string};
const realmCurrencies:Record<Exclude<keyof RealmTotals,'loot'>,{label:string;icon:string;tone:string}>={
 ess:{label:resources.ess.name,icon:resources.ess.icon,tone:resources.ess.color},
 gold:{label:'Золото',icon:'coins',tone:'#eabe62'},
 xp:{label:'Опыт',icon:'book',tone:'#8bc9f7'},
 shard:{label:resources.shard.name,icon:resources.shard.icon,tone:resources.shard.color},
 dusk:{label:materials.dusk.name,icon:'dusk-stone',tone:materials.dusk.color},
 seal:{label:resources.seal.name,icon:resources.seal.icon,tone:resources.seal.color},
 gems:{label:'Самоцветы',icon:'gem',tone:'#8cebed'}
};
function RealmVictory({last,onClose}:{last:RealmLast;onClose:()=>void}){
 const [selected,setSelected]=useState<string>();
 const tiles:RealmLootTile[]=Object.entries(realmCurrencies).flatMap(([key,entry])=>{
  const quantity=last[key as keyof typeof realmCurrencies];
  return quantity>0?[{key,quantity,...entry}]:[];
 });
 const remaining=[...last.loot],stones=new Map<string,RealmLootTile>();
 const consumeLabel=(label:string)=>{const index=remaining.indexOf(label);if(index>=0)remaining.splice(index,1)};
 // Pending drops supply the same item and gem data that the reward transaction reads.
 for(const [index,room] of (Array.isArray(last.pending)?last.pending:[]).entries()){
  for(const [slot,item] of (Array.isArray(room?.items)?room.items:[]).entries()){
   const def=darkSlots[item?.s];
   if(!def)continue;
   const label=darkName(item);
   consumeLabel(label);
   tiles.push({key:`item:${index}:${slot}`,label,quantity:1,icon:def.icon,tone:darkColors[item.r]??darkColors[0]});
  }
  const gem=parseGem(room?.gem);
  if(!gem)continue;
  const code=`${gem.type}:${gem.level}`,label=gemLabel(code),existing=stones.get(code);
  consumeLabel(label);
  if(existing)existing.quantity++;
  else stones.set(code,{key:`gem:${code}`,label,quantity:1,icon:'gem',tone:gemTypes[gem.type].color,gem:code});
 }
 tiles.push(...stones.values());
 // Older results and achievement receipts may contain only a display name.
 remaining.forEach((label,i)=>tiles.push({key:`receipt:${i}`,label,quantity:1,icon:'medal',tone:'#c5a7f5'}));
 const detail=tiles.find(tile=>tile.key===selected);
 return <CardDialog title="Победа" onClose={onClose} className="realm-victory-dialog" actions={<Btn onClick={collectRealmReward}>Забрать</Btn>}>
  <div className="realm-victory-crest"><img src={art(floorBoss(last.f))} alt=""/><span>Владыка · {nameOf(floorBoss(last.f))}</span></div>
  <h4 className="realm-victory-title">Этаж {last.f} пройден{last.first?' впервые':''}</h4>
  {tiles.length>0?<ul className="realm-loot-grid" aria-label="Награды похода">{tiles.map(tile=><li key={tile.key}>
   <button type="button" className="realm-loot-tile" style={{'--loot-tone':tile.tone} as React.CSSProperties}
    aria-label={`${tile.label} · ${tile.quantity.toLocaleString('ru')}`} aria-pressed={selected===tile.key}
    onClick={()=>setSelected(selected===tile.key?undefined:tile.key)}>
    <span className="realm-loot-art" aria-hidden="true">{tile.gem?<GemDot code={tile.gem} size={29}/>:<Icon name={tile.icon}/>}</span>
    <b className="realm-loot-count">{tile.quantity.toLocaleString('ru')}</b>
   </button>
  </li>)}</ul>:<p className="realm-loot-empty">Награды не получены</p>}
  <p className="realm-loot-detail" role="status">{detail?.label}</p>
 </CardDialog>;
}

// ───────────────────────── Dark Energy ─────────────────────────
function DarkCard({item,against,preview=false}:{item:DarkItem;against?:DarkItem|null;preview?:boolean}){
 const def=darkSlots[item.s],e=darkEffectOf(item),diff=against?darkValue(item)-darkValue(against):0;
 return <div className="dark-card" style={{'--rarity':darkColors[item.r]} as React.CSSProperties}><Icon name={def.icon}/><div><strong>{darkName(item)}</strong><small>{darkSlots[item.s].name} · Этаж {item.l} · усиление +{item.u}/{darkMaxUpgrade(item.r)}</small><b><span className="dark-section-label">Основной атрибут</span>{statNames[def.stat]} {statText(def.stat,darkValue(item))}{against&&diff!==0&&<i className={diff>0?'up':'down'}> {diff>0?'▲':'▼'} {statText(def.stat,Math.abs(diff)).slice(1)}</i>}</b>{preview&&item.u<darkMaxUpgrade(item.r)&&<span className="dark-upgrade-preview">{statText(def.stat,darkValue(item))} → <i className="positive">{statText(def.stat,darkValue({...item,u:item.u+1}))}</i> при усилении</span>}{e&&<em><span className="dark-section-label">Эффект Тёмной энергии</span>{e.def.name}: {e.def.text(e.value)}</em>}</div></div>;
}
export function DarkGearPanel({p}:{p:Player}){
 const confirmTap=useRepeatAction();
 const state=darkState(p),[slot,setSlot]=useState<number|null>(null),[picked,setPicked]=useState<string|null>(null),[confirm,setConfirm]=useState<string|null>(null),[bulk,setBulk]=useState(1),[filterSlot,setFilterSlot]=useState<number|null>(null),[detail,setDetail]=useState(false),[utility,setUtility]=useState<'bulk'|'power'|null>(null),[compare,setCompare]=useState('new'),[bulkQuote,setBulkQuote]=useState<string|null>(null);
 const equipped=slot!==null?state.eq[slot]:null,list=state.inv.filter(i=>filterSlot===null||i.s===filterSlot).sort((a,b)=>darkScore(b)-darkScore(a)),item=state.inv.find(i=>i.id===picked),count=state.eq.filter(Boolean).length,bonus=darkBonus(p),effects=darkEffectTotals(p),heroId={berserker:'winged_helmet_warrior',ranger:'strongman_boulder',runologist:'whitebeard_mage'}[p.heroClass];
 const salvageList=darkBulkList(p,bulk,filterSlot),salvageQuote=salvageList.map(item=>item.id).sort().join(',');
 const upgradePreview=(i:DarkItem)=><div className="bonus-card"><span>{statNames[darkSlots[i.s].stat]}: {statText(darkSlots[i.s].stat,darkValue(i))}{i.u<darkMaxUpgrade(i.r)&&<> → <b className="positive">{statText(darkSlots[i.s].stat,darkValue({...i,u:i.u+1}))}</b> после усиления</>}</span></div>;
 const upgradeRow=(i:DarkItem)=>{const c=darkUpgradeCost(i),maxed=i.u>=darkMaxUpgrade(i.r);return <Btn disabled={maxed||resCount(p,'ess')<c.ess||p.gold<c.gold||duskCount(p)<c.dusk} onClick={()=>darkUpgrade(i.id)}>{maxed?'Предел усиления':`Усилить до +${i.u+1} · ${c.ess} эссенции · ${fmt(c.gold)} золота${c.dusk?' · 1 Камень Сумрака':''}`}</Btn>};
 const salvage=(i:DarkItem)=>{if((i.r>=3||i.u>0||darkEffectOf(i))&&confirm!==i.id){setConfirm(i.id);return}if(darkSalvage(i.id)){setPicked(null);setConfirm(null);setDetail(false)}};
 return <div className="darkgear">
  <DarkWallet p={p} show={['ess']} from="darkgear"/>
  <div className="dark-ring altar-scene" aria-label="12 слотов Тёмной энергии"><div className="dark-core"><img src={art(heroId)} alt=""/></div>
   {darkSlots.map((def,s)=>{const it=state.eq[s],pos=[[27,10],[50,8],[73,10],[12,30],[88,30],[8,52],[92,52],[12,75],[88,75],[28,91],[50,93],[72,91]][s];return <button key={s} className={`dark-slot ${slot===s?'selected':''} ${it?'':'empty'}`} style={{left:`${pos[0]}%`,top:`${pos[1]}%`,'--rarity':it?darkColors[it.r]:'#4b4763'} as React.CSSProperties} aria-label={`${def.name}${it?` · ${darkRarity[it.r]} +${it.u}`:' · пусто'}`} aria-pressed={slot===s} onClick={()=>{setSlot(s);setPicked(null);setConfirm(null);setDetail(true);setCompare('new')}}><Icon name={def.icon}/>{it&&<small>+{it.u}</small>}{!it&&state.inv.some(i=>i.s===s)&&<i>!</i>}</button>})}
  </div>
  <div className="altar-divider" aria-hidden="true"><span>ᚠ</span><i/><b>ТЁМНАЯ ЭНЕРГИЯ</b><i/><span>ᚦ</span></div>
  {detail&&(item||slot!==null)&&<CardDialog className={item?'parchment-comparison':undefined} title={item?'Сравнение экипировки':darkSlots[slot!].name} onClose={()=>{setDetail(false);setConfirm(null)}} actions={item?<>
   <Btn onClick={()=>{if(darkEquip(item.id)){setDetail(false);setPicked(null)}}}>Надеть</Btn>{upgradeRow(item)}
   {confirm===item.id&&<p className="dark-confirm" role="alert">Разобрать «{darkName(item)}»? Предмет исчезнет · +{darkSalvageValue(item)} эссенции.</p>}
   <div className="dark-actions"><Btn kind="secondary" onClick={()=>salvage(item)}>{confirm===item.id?'Подтвердить разбор':`Разобрать +${darkSalvageValue(item)}`}</Btn></div>
  </>:equipped?<>{upgradeRow(equipped)}<div className="dark-actions"><Btn kind="secondary" onClick={()=>{if(darkUnequip(slot!))setDetail(false)}}>Снять на склад</Btn></div></>:undefined}>
   <DarkWallet p={p} show={['ess']}/><p className="hint">Доступно золота: {fmt(p.gold)}</p>
   {item?<><div className="compare-tabs tabs">{[['new','Новое'],['worn','Надето']].map(([id,label])=><button key={id} aria-pressed={compare===id} className={compare===id?'selected':''} onClick={()=>setCompare(id)}>{label}</button>)}</div><div className="dark-compare" data-compare={compare}><div className="compare-worn"><h4>Надето</h4>{state.eq[item.s]?<DarkCard item={state.eq[item.s]!}/>:<p className="compare-empty">Слот свободен</p>}</div><div className="compare-new"><h4>Новое</h4><DarkCard item={item} against={state.eq[item.s]} preview/></div></div></>:equipped?<DarkCard item={equipped}/>:<p>Слот пуст. Выберите предмет на складе.</p>}{!item&&equipped&&upgradePreview(equipped)}
  </CardDialog>}
  <div className="workspace-toolbar dark-store-head"><button onClick={()=>setUtility('bulk')}>Разобрать</button><b>Склад {state.inv.length}/{DARK_STORAGE}</b><CompactFilter label="Фильтр склада" value={String(filterSlot??'all')} options={[{value:'all',label:'Все',icon:'chest'},...darkSlots.map((def,i)=>({value:String(i),label:def.name,icon:def.icon}))]} onChange={value=>setFilterSlot(value==='all'?null:Number(value))}/></div>
  <div className="local-scroll storage-scroll" aria-label="Предметы на складе" tabIndex={0}>
  {list.length?<div className="dark-grid">{list.map(i=><button key={i.id} className={picked===i.id?'selected':''} style={{'--rarity':darkColors[i.r]} as React.CSSProperties} aria-label={darkName(i)} onClick={()=>{setPicked(i.id);setConfirm(null);setDetail(true);setCompare('new')}}><Icon name={darkSlots[i.s].icon}/><small>{i.u?`+${i.u}`:`эт.${i.l}`}</small>{darkEffectOf(i)&&<em>✦</em>}</button>)}</div>:<p className="hint">{state.inv.length?'Для этого слота на складе ничего нет.':'Склад пуст. Победите владыку этажа в Царстве тьмы, чтобы получить первый тёмный предмет.'}</p>}
  </div><div className="workspace-actions"><button className="action secondary" onClick={()=>setUtility('power')}>Бонусы комплекта · {count}/12</button></div>
  {utility==='bulk'&&<CardDialog className="game-detail" title="Разбор предметов" onClose={()=>{setUtility(null);setBulkQuote(null)}}><div className="dark-bulk"><span>Разобрать до редкости</span><div className="tabs">{[0,1,2].map(r=><button key={r} className={bulk===r?'selected':''} onClick={()=>{setBulk(r);setBulkQuote(null)}} style={{color:darkColors[r]}}>{darkRarity[r]}</button>)}</div>
   <Btn kind="secondary" disabled={!salvageList.length} onClick={()=>confirmTap(()=>{if(bulkQuote!==salvageQuote){setBulkQuote(salvageQuote);return true}const saved=darkSalvageMany(bulk,filterSlot);if(saved)setBulkQuote(null);return saved})}>{bulkQuote===salvageQuote?'Подтвердить · ':''}Разобрать {salvageList.length} шт. · +{salvageList.reduce((sum,item)=>sum+darkSalvageValue(item),0)} эссенции</Btn>
   {bulkQuote!==null&&<Btn kind="secondary" onClick={()=>setBulkQuote(null)}>Отмена</Btn>}<small>Усиленные вещи и вещи с эффектом сохраняются.</small>
  </div></CardDialog>}
  {utility==='power'&&<CardDialog title="Сила Тёмной энергии" onClose={()=>setUtility(null)}>
  <div className="bonus-card">{bonusLines(bonus).length?bonusLines(bonus).map(line=><span key={line}>{line}</span>):<span>Наденьте тёмные предметы, чтобы получить бонусы.</span>}</div>
  <div className="bonus-card effects">{darkEffectIds.filter(id=>effects[id]>0).map(id=><span key={id}><b>{darkEffects[id].name}</b> {darkEffects[id].text(effects[id])}</span>)}<span className={darkResonance(count)?'on':''}><b>Резонанс Тьмы</b> 4 / 8 / 12 предметов: +3% / +6% / +10% к здоровью, атаке и защите · сейчас {count}/12{darkResonance(count)?` (+${Math.round(darkResonance(count)*100)}%)`:''}</span></div>
  <p className="hint">Тёмная энергия — отдельный комплект: он не занимает 12 основных слотов и крылья героя, а усиливает их.</p></CardDialog>}
 </div>;
}

// ───────────────────────── Gems ─────────────────────────
function GemDot({code,size=30}:{code:string|null;size?:number}){const g=parseGem(code);return <span className={`gem-dot ${g?'':'none'}`} style={{'--gem':g?gemTypes[g.type].color:'#39404a',width:size,height:size} as React.CSSProperties}>{g?.level}</span>}
export function GemsPanel({p}:{p:Player}){
 const confirmTap=useRepeatAction();
 const state=gemState(p),[slot,setSlot]=useState<Slot>('weapon'),[socket,setSocket]=useState(0);
 const [detail,setDetail]=useState<'socket'|'buy'|'synth'|'sources'|'bonus'|null>(null);
 const [gem,setGem]=useState<string|null>(null),[confirm,setConfirm]=useState(false);
 const buyGemPending=useRef(false);
 const bag=Object.entries(state.bag).map(([code,n])=>({...parseGem(code)!,n})).sort((a,b)=>b.level-a.level||a.type.localeCompare(b.type));
 const row=state.sock[slot],current=row[socket],chosen=bag.find(g=>g.code===gem);
 const same=chosen&&row.some((code,i)=>i!==socket&&parseGem(code)?.type===chosen.type);
 const close=()=>{setGem(null);setDetail(null);setConfirm(false)};
 const show=(next:typeof detail)=>{close();setDetail(next)};
 return <div className="gems">
  <div className="gem-slots" aria-label="Категория экипировки">{gemSlots.map(s=><button key={s} className={slot===s?'selected':''} aria-pressed={slot===s} aria-label={slotNames[s]} onClick={()=>{setSlot(s);setSocket(0);close()}}><Icon name={gearIcon(s)}/><span>{state.sock[s].map((c,i)=><GemDot key={i} code={c} size={9}/>)}</span></button>)}</div>
  <div className="workspace-toolbar"><b>{slotNames[slot]}</b>{!p.equipment[slot]&&<small>Слот свободен</small>}</div>
  <div className="sockets">{[0,1,2].map(i=>{const unlocked=socketOpen(p,i),code=row[i];return <button key={i} className={`socket ${socket===i?'selected':''} ${unlocked?'':'locked'}`} aria-pressed={socket===i} onClick={()=>{setSocket(i);show('socket')}}><GemDot code={unlocked?code:null} size={38}/><small>{!unlocked?'Закрыто':code?gemLabel(code):'Пусто'}</small></button>})}</div>
  <div className="workspace-toolbar"><b>Запас · {bag.reduce((sum,g)=>sum+g.n,0)}</b><button onClick={()=>show('synth')}>Синтезировать всё</button></div>
  {bag.length?<div className="gem-catalog">{bag.map(g=><button type="button" className="game-tile" key={g.code} aria-label={gemLabel(g.code)+' · '+g.n} onClick={()=>{close();setGem(g.code)}}><GemDot code={g.code} size={33}/><small>×{g.n}</small></button>)}</div>:<p>Запас пуст.</p>}
  <div className="game-actions"><Btn kind="secondary" onClick={()=>show('bonus')}>Бонусы камней</Btn><Btn kind="secondary" onClick={()=>show('sources')}>Где добыть</Btn><Btn kind="secondary" onClick={()=>{buyGemPending.current=true;show('buy')}}>Купить · {GEM_SHOP_PRICE}</Btn></div>
  {chosen&&<CardDialog className="game-detail" title={gemLabel(chosen.code)} onClose={close}>
   <div className="game-metrics"><GemDot code={chosen.code}/><b>×{chosen.n}</b><span>{gemText(chosen.code)}</span></div>
   <p>{slotNames[slot]} · гнездо {socket+1}{current?' · сейчас '+gemLabel(current):''}</p>
   {same&&<p>Такой цвет уже есть в другом гнезде.</p>}
   {!socketOpen(p,socket)&&<p>{socketRules[socket].text}</p>}
   {current&&current!==chosen.code&&<small>При замене прежний камень вернётся в запас.</small>}
   <div className="game-actions"><Btn disabled={!socketOpen(p,socket)||!!same||current===chosen.code} onClick={()=>{if(gemInsert(slot,socket,chosen.code))close()}}>Вставить</Btn>
    <Btn kind="secondary" disabled={chosen.n<3||chosen.level>=GEM_MAX||p.gold<gemSynthGold(chosen.level)} onClick={()=>confirmTap(()=>{if(!confirm){setConfirm(true);return true}const saved=gemSynth(chosen.code);if(saved)close();return saved})}>{chosen.level>=GEM_MAX?'Максимум':(confirm?'Подтвердить · ':'3 → 1 · ')+gemSynthGold(chosen.level)+' зол.'}</Btn>
   </div>
   {chosen.level<GEM_MAX&&(chosen.n<3||p.gold<gemSynthGold(chosen.level))&&<small>Синтез · {chosen.n}/3 камней · {p.gold}/{gemSynthGold(chosen.level)} золота</small>}
  </CardDialog>}
  {detail==='socket'&&<CardDialog className="game-detail" title={slotNames[slot]+' · гнездо '+(socket+1)} onClose={close}>
   {socketOpen(p,socket)?current?<><p>{gemLabel(current)} · {gemText(current)}</p><Btn kind="secondary" onClick={()=>{if(!confirm){setConfirm(true);return}if(gemRemove(slot,socket))close()}}>{confirm?'Подтвердить снятие':'Снять в запас'}</Btn></>:<p>Выберите камень из запаса для этого гнезда.</p>:<p>{socketRules[socket].text}</p>}
  </CardDialog>}
  {detail==='synth'&&<CardDialog className="game-detail" title="Синтез камней" onClose={close} actions={<Btn onClick={()=>{if(gemSynthAll())close()}}>Подтвердить синтез</Btn>}><p>Три одинаковых камня и золото дают один камень следующего уровня, до {GEM_MAX}. Вставленные камни сохранятся.</p></CardDialog>}
  {detail==='bonus'&&<CardDialog className="game-detail" title="Бонусы камней" onClose={close}><p>{bonusLines(gemBonus(p)).join(' · ')||'Вставьте камень в открытое гнездо надетого предмета.'}</p><p>В каждом предмете до трёх камней разных цветов. Камни привязаны к слоту.</p></CardDialog>}
  {detail==='sources'&&<CardDialog className="game-detail" title="Где добыть камни" onClose={close}><p>Царство тьмы · страж 30%, владыка 60%, первая победа 100%. С 10 и 20 этажа уровень камней выше.</p><p>Логово · 35% за победу.</p></CardDialog>}
  {detail==='buy'&&<CardDialog className="game-detail" title="Купить камень" onClose={close} actions={<Btn disabled={p.gems<GEM_SHOP_PRICE} onClick={()=>{if(!buyGemPending.current)return;buyGemPending.current=false;if(gemBuy())close();else buyGemPending.current=true}}>Подтвердить · {GEM_SHOP_PRICE} самоцветов</Btn>}><p>Случайный камень первого уровня. Запас самоцветов · {p.gems}.</p></CardDialog>}
 </div>;
}

// ───────────────────────── Relics ─────────────────────────
function RelicArtwork({id}:{id:RelicId}){return <span className={`relic-object relic-art-${id}`}><Icon name={relics[id].icon}/></span>}
export function RelicsPanel({p}:{p:Player}){
 const [picked,setPicked]=useState<RelicId>('heart'),[detail,setDetail]=useState(false),c=relicCollection(p),def=relics[picked],lv=relicLevel(p,picked),need=def.need(p),open=relicUnlockCost(picked),up=relicUpgradeCost(picked,lv),heart=picked==='heart',maxed=!heart&&lv>=RELIC_MAX;
 return <div className="relics">
  <DarkWallet p={p} show={['shard']} from="relic"/>
  <div className="relic-progress"><b>Коллекция: {c.owned}/{c.total} · сумма уровней {c.levels}</b><i><span style={{width:`${(5-c.next)/5*100}%`}}/></i><small>Бонус коллекции: +{Math.round(c.bonus*100)}% к здоровью, атаке и защите · до следующего +1% осталось уровней: {c.next}</small></div>
  <div className="local-scroll"><div className="relic-grid">{relicIds.map(id=>{const l=relicLevel(p,id),r=relics[id],base=id==='heart',ready=!l&&!base&&r.need(p).ok;return <button key={id} className={`${picked===id?'selected':''} ${l||base?'':'locked'}`} style={{'--rarity':relicColors[r.rarity]} as React.CSSProperties} aria-pressed={picked===id} onClick={()=>{setPicked(id);setDetail(true)}}><RelicArtwork id={id}/><strong>{r.name}</strong><small>{l||base?`Уровень ${l}`:ready?'Можно открыть':'Закрыта'}</small>{ready&&<i>!</i>}</button>})}</div>
  </div>{detail&&<CardDialog title={def.name} onClose={()=>setDetail(false)} actions={heart?<Btn disabled={p.gold<300*(p.relic+1)} onClick={()=>relicUpgrade('heart')}>Развить · {fmt(300*(p.relic+1))} золота</Btn>
    :lv===0?<><p className={`relic-need ${need.ok?'ok':''}`}>{need.ok?'✓':'✗'} {need.text}</p><Btn disabled={!need.ok||resCount(p,'shard')<open.shard||p.gold<open.gold} onClick={()=>relicUnlock(picked)}>Открыть · {open.shard} осколков · {fmt(open.gold)} золота</Btn></>
    :maxed?<p className="relic-need ok">✓ Реликвия на высшем уровне</p>
    :<Btn disabled={resCount(p,'shard')<up.shard||p.gold<up.gold||matCount(p,up.material)<up.mats} onClick={()=>relicUpgrade(picked)}>Усилить · {up.shard} осколков · {fmt(up.gold)} золота{up.mats?` · ${up.mats} × ${materials[up.material].name} (есть ${matCount(p,up.material)})`:''}</Btn>}><p className="hint">Доступно: {fmt(p.gold)} золота · {resCount(p,'shard')} осколков</p><div className="relic-detail" style={{'--rarity':relicColors[def.rarity]} as React.CSSProperties}><small>{relicRarity[def.rarity]} реликвия{lv?` · уровень ${lv}${heart?'':'/'+RELIC_MAX}`:''}</small><div className="relic-feature"><RelicArtwork id={picked}/><div><h3>{def.name}</h3><p>{def.lore}</p></div></div>{heart&&<p>Атака героя · {fmt(stats(p).attack)} → {fmt(stats({...p,relic:p.relic+1}).attack)}.</p>}<p className="relic-level-line">{lv>0?`Уровень ${lv}${maxed?' · максимум':` → ${lv+1}`}`:'Открытие реликвии'}</p>
   <div className="relic-effect"><span><small>{lv?'Сейчас':'На 1 уровне'}</small>{def.ability(Math.max(1,lv),p)}{def.passive&&!heart?` · ${statNames[def.passive[0]]} ${statText(def.passive[0],def.passive[1]*Math.max(1,lv))}`:''}</span>{lv>0&&!maxed&&<span className="next"><small>После усиления</small>{def.ability(lv+1,p)}{def.passive&&!heart?` · ${statNames[def.passive[0]]} ${statText(def.passive[0],def.passive[1]*(lv+1))}`:''}</span>}</div>

  </div>
  </CardDialog>}<p className="hint">Осколки реликвий дают владыки и стражи Царства тьмы и каждая победа в Логове мини-босса. Каждая способность действует в бою сразу после открытия.</p>
 </div>;
}

// ───────────────────────── Companions ─────────────────────────
export function SquadPanel({p}:{p:Player}){
 const repeat=useRepeatAction();
 const s=squadState(p);
 const [picked,setPicked]=useState(s.formation[0]);
 const [donor,setDonor]=useState(''),[mergeTalent,setMergeTalent]=useState<number|null>(null),[confirm,setConfirm]=useState('');
 const [detail,setDetail]=useState(false),[summoning,setSummoning]=useState(false),[tab,setTab]=useState('level');
 const [focus,setFocus]=useState<number|null>(null),[mergeOpen,setMergeOpen]=useState(false);
 const instance=s.instances[picked];
 const species=instance?.species??(Object.hasOwn(companions,picked)?picked:s.act[0]);
 const def=companions[species],pet=instance?followerProgress(instance,s.shards[species]):s.own[species];
 const own=!!instance,position=s.formation.indexOf(picked),power=companionPower(species,{...pet,lv:Math.max(1,pet.lv)});
 const spent=instance?totalFollowerTalent(instance):0,points=Math.max(0,talentPoints(pet)-spent),legacy=picked===followerId(species)?legacyPet(species):-1;
 const attack=stats(p).attack,labels=['Главный','Сопровождение I','Сопровождение II'];
 const inspect=(id:string)=>{setPicked(id);setDetail(true);setTab('level');setConfirm('');setDonor('');setMergeTalent(null);setFocus(null);setMergeOpen(false)};
 const roster=companionIds.flatMap(species=>{
  const entries=Object.entries(s.instances).filter(([,pet])=>pet.species===species);
  return entries.length?entries.map(([id],i)=>({id,species,copy:entries.length>1?i+1:0})): [{id:species,species,copy:0}];
 });
 const market=followerMarket(p),souls=balanceOf(p,'soul'),seals=resCount(p,'seal');
 const awake=instance&&nextAwakening(instance),stones=balanceOf(p,'awake'),fragments=balanceOf(p,'awakeShard');
 const candidates=Object.entries(s.instances).filter(([id,member])=>id!==picked&&member.species===species);
 const merge=donor?followerMerge(p,picked,donor,mergeTalent):null;
 const stars=(value:number)=>value?'★ '+value:'без звёзд';
 const describeTalents=(slots:readonly {rank:number}[])=>slots.map((slot,i)=>slot.rank?'Ячейка '+(i+1)+' · ранг '+slot.rank:null).filter(Boolean).join(', ')||'без талантов';
 const shards=pet.sh>0&&<div className="bonus-card">
   <span>Старые осколки · {pet.sh}. Можно потратить на развитие или обменять остаток на {pet.sh*followerRules.shardSouls} Душ.</span>
   {confirm==='shards'?<div className="squad-placement"><Btn onClick={()=>{if(exchangeFollowerShards(species,pet.sh))setConfirm('')}}>Подтвердить обмен</Btn><Btn onClick={()=>setConfirm('')}>Отмена</Btn></div>:<Btn kind="secondary" onClick={()=>setConfirm('shards')}>Обменять осколки</Btn>}
  </div>;
 const rankTalent=(i:number)=>talentDefs[def.role][i]??{name:'Мастерство '+(i+1),text:def.role==='striker'?'+2,5% силы удара за ранг':'+2,5% силы лечения за ранг'};
 const job=(id:string,pw:{power:number;interval:number})=>companions[id].role==='striker'?`Удар ${fmt(attack*pw.power)} каждые ${pw.interval.toFixed(1).replace('.',',')} сек`:`Лечит ${(Math.min(.45,pw.power)*100).toFixed(0)}% здоровья каждые ${pw.interval.toFixed(1).replace('.',',')} сек`;
 return <div className="squad">
  <DarkWallet p={p} show={['seal']} from="companions"/>
  <div className="squad-active squad-stage" role="group" aria-label="Состав дружины">{s.formation.map((id,i)=>{
   const member=id?s.instances[id]:null;
   return id&&member?<button key={i} className={picked===id?'selected':''} onClick={()=>inspect(id)} aria-label={`${labels[i]} · ${companions[member.species].name}`}>
    <img src={art(member.species)} alt=""/><small>{labels[i]}</small><strong>{companions[member.species].name}</strong>
    <span>ур.{member.lv} · {stars(member.st)}</span>
   </button>:<div key={i} className="squad-vacancy"><small>{labels[i]}</small><strong>Свободно</strong><span>Выберите в каталоге</span></div>;
  })}</div>
  <details className="saga-disclosure squad-bonus"><summary>Бонус дружины</summary>{bonusLines(squadBonus(p)).join(' · ')||'Звёзды и таланты ещё не развиты'}<p>Лучший экземпляр вида даёт герою +0,5% здоровья и атаки за звезду.</p></details>
  <div className="workspace-toolbar"><b>Каталог · {s.owned.length}/{companionIds.length}</b><button onClick={()=>setSummoning(true)}>Призыв</button></div>
  <div className="local-scroll"><div className="squad-grid">{roster.map(({id,species,copy})=>{
   const d=companions[species],o=s.instances[id];
   return <button key={id} className={`${picked===id?'selected':''} ${o?'':'locked'}`} style={{'--rarity':companionColors[d.rarity]} as React.CSSProperties} aria-pressed={picked===id} aria-label={copy?`${d.name}, экземпляр ${copy}`:d.name} onClick={()=>inspect(id)}>
    <img src={art(species)} alt=""/><small>{o?`ур.${o.lv}${copy?` · №${copy}`:''}`:`${s.shards[species]}/${d.shards}`}</small>{o&&o.st>0&&<em>{stars(o.st)}</em>}{s.formation.includes(id)&&<i aria-label="в строю">✓</i>}
   </button>;
  })}</div>
  </div>{detail&&<CardDialog className="game-detail" title={def.name} onClose={()=>setDetail(false)} actions={own&&tab==='level'?<>
    {position!==0&&position!==1&&<div className="game-actions">
     <Btn onClick={()=>petActivate(picked)}>{def.role==='striker'?'Назначить главным':'Назначить в сопровождение I'}</Btn>
     {position===2?<Btn kind="secondary" onClick={()=>petClearReserve(picked)}>Освободить сопровождение II</Btn>:<Btn kind="secondary" onClick={()=>petActivate(picked,2)}>В сопровождение II</Btn>}
    </div>}
    {tab==='level'&&(pet.lv>=FOLLOWER_MAX_LEVEL?<p className="hint">Предел повышения · {FOLLOWER_MAX_LEVEL}</p>:<Btn disabled={p.gold<petLevelCost(pet.lv)} onClick={()=>petLevel(picked)}>Повысить уровень · {fmt(petLevelCost(pet.lv))} золота <small>→ {job(species,companionPower(species,{...pet,lv:pet.lv+1}))}</small></Btn>)}
    </>:undefined}><div className="pet-card" style={{'--rarity':companionColors[def.rarity]} as React.CSSProperties}>
   <div className="pet-head compact-pet"><div className={`pet-portrait ${pet.aw?'awake':''}`}><img src={art(species)} alt=""/></div><div><small>{companionRarity[def.rarity]} · {def.role==='striker'?'боец':'хранитель'}</small><br/><b>{own?'Ур. '+pet.lv+' · ':''}{stars(pet.st)}</b></div></div>
   {tab==='level'&&<details className="saga-disclosure"><summary>Эффекты в бою</summary>
    <p><b>{position===2?'Базовое действие':'В бою'}</b> · {job(species,power)}.</p>
    {!(position===2&&['goose_aviator','brown_white_dog'].includes(species))&&<p><b>{def.traitName}</b> · {def.trait}</p>}
    {pet.aw&&<p>Боевой дар · {def.role==='striker'?'Каждая третья атака бьёт всех врагов на 50%.':'Каждое лечение даёт герою +15% урона на 3 секунды.'}</p>}
    <p>{def.lore}</p>
   </details>}
   {!own?<><p>Можно приобрести в призыве или использовать сохранённые осколки этого вида.</p>
    {!!def.shards&&pet.sh>=def.shards&&<Btn onClick={()=>{if(redeemFollowerShards(species,pet.sh))setDetail(false)}}>Призвать за {def.shards} старых осколков</Btn>}{shards}</>:<>
    <div className="growth-tabs tabs">{[['level','Уровень'],['stars','Звёзды'],['talents','Таланты'],['awake','Пробуждение']].map(([id,label])=><button key={id} className={tab===id?'selected':''} aria-pressed={tab===id} onClick={()=>{setTab(id);setConfirm('');setFocus(null)}}>{label}</button>)}</div>
    {tab==='stars'&&instance&&<>
     <div className="game-actions"><small>★ {pet.st}/{followerStarCap(instance.step)}</small>
      {legacy<0&&<Btn kind="secondary" onClick={()=>protectFollower(picked,!instance.locked)}>{instance.locked?'Снять защиту':'Защитить'}</Btn>}
      {!!candidates.length&&<Btn onClick={()=>setMergeOpen(!mergeOpen)}>{mergeOpen?'Назад к звёздам':'Выбрать донора'}</Btn>}
     </div>
     {mergeOpen&&<>
      <CompactFilter label="Материал" value={donor} options={[{value:'',label:'Выберите спутника',icon:'people'},...candidates.map(([id,member])=>({value:id,label:'№'+(roster.find(entry=>entry.id===id)?.copy??1)+' · ур. '+member.lv+' · ★ '+member.st+(s.formation.includes(id)||member.locked?' · защищён':''),icon:'people'}))]} onChange={id=>{setDonor(id);setMergeTalent(null);setConfirm('')}}/>
      {donor&&(!merge?<p>Донор в строю, защищён или превышен предел звёзд.</p>:<>
       <div className="merge-line" aria-label="Принимающий, донор и результат">{[['Принимающий',pet.lv,pet.st],['Донор',merge.donor.lv,merge.donor.st],['Результат',merge.result.lv,merge.result.st]].map(([name,lv,st])=><span key={name}><img src={art(species)} alt=""/><b>{name}</b><small>Ур. {lv} · ★ {st}</small></span>)}</div>
       <CompactFilter label="Перенос таланта" value={String(mergeTalent??'')} options={[{value:'',label:'Только звёзды',icon:'star'},...merge.donor.talents.flatMap((slot,i)=>slot.rank>0?[{value:String(i),label:rankTalent(i).name+' · '+slot.rank,icon:'rune'}]:[])]} onChange={value=>{setMergeTalent(value===''?null:Number(value));setConfirm('')}}/>
       <details className="saga-disclosure" open={confirm===merge.quote||undefined}><summary>Что изменится</summary><p>Донор · {describeTalents(merge.donor.talents)}.</p><p>Результат · ступень {merge.result.step}, предел {merge.cap} звёзд, {describeTalents(merge.result.talents)}{merge.result.aw?', боевой дар':''}.</p><p>Донор расходуется. Его уровень и неперенесённые таланты исчезнут.</p></details>
       {confirm===merge.quote?<div className="game-actions"><Btn onClick={()=>{if(mergeFollower(picked,donor,mergeTalent,merge.quote)){setDonor('');setConfirm('')}}}>Подтвердить расход</Btn><Btn onClick={()=>setConfirm('')}>Отмена</Btn></div>:<Btn onClick={()=>setConfirm(merge.quote)}>Объединить</Btn>}
      </>)}
     </>}
     {pet.sh>0&&<details className="saga-disclosure"><summary>Старые осколки · {pet.sh}</summary>
      {pet.st<STAR_MAX&&<Btn kind="secondary" disabled={pet.sh<starCost[pet.st]} onClick={()=>petStar(picked)}>Звезда {pet.st+1} · осколки {pet.sh}/{starCost[pet.st]}</Btn>}{shards}
     </details>}
    </>}
    {tab==='awake'&&instance&&<>
     <div className="game-metrics"><span className="game-metric"><Icon name="awake"/>{stones} · {instance.step}/8</span></div>
     <GameTiles columns={4}>{followerRules.awakening.map((_,i)=><GameTile key={i} label={String(i+1)} icon={i<instance.step?'crown':'awake'} value={i<instance.step?'✓':i===instance.step?'Далее':'Закрыто'} locked={i>instance.step} active={focus===i} onClick={()=>setFocus(focus===i?null:i)}/>)}</GameTiles>
     {focus!==null&&(()=>{const stage=followerRules.awakening[focus];return <div className="bonus-card">
      <span>Ур. {pet.lv}/{stage.lv} · ★ {pet.st}/{stage.stars} · камни {stones}/{stage.cost}</span>
      <span>{followerStarCap(focus+1)} звёзд · {4+Math.floor((focus+1)/2)} ячеек</span>
      {focus===instance.step&&awake&&<Btn disabled={pet.st<awake.stars||pet.lv<awake.lv||stones<awake.cost} onClick={()=>advanceAwakening(picked,instance.step)}>Открыть ступень {instance.step+1} · {awake.cost} камней</Btn>}
      {focus>instance.step&&<small>Сначала откройте предыдущую ступень.</small>}
     </div>})()}
     <details className="saga-disclosure"><summary>Осколки пробуждения · {fragments}</summary>
      <Btn kind="secondary" disabled={fragments<followerRules.shardExchange} onClick={()=>exchangeAwakeningShards(fragments)}>{followerRules.shardExchange} осколков → 1 камень</Btn>
      {fragments>=followerRules.shardExchange*2&&<Btn kind="secondary" onClick={()=>exchangeAwakeningShards(fragments,Math.floor(fragments/followerRules.shardExchange))}>Обменять на {Math.floor(fragments/followerRules.shardExchange)} камней</Btn>}
     </details>
     <details className="saga-disclosure"><summary>Боевой дар · Камни Сумрака {pet.aw?'✓':''}</summary>
      <p>{def.role==='striker'?'Каждая третья атака задевает всех врагов.':'Лечение усиливает урон героя на три секунды.'} Боевой дар даёт +25% силы спутника.</p>
      {!pet.aw&&<Btn kind="secondary" disabled={pet.lv<AWAKEN.level||pet.st<AWAKEN.stars||duskCount(p)<AWAKEN.dusk||p.gold<AWAKEN.gold} onClick={()=>petAwaken(picked)}>Открыть дар · ур. {AWAKEN.level}, ★ {AWAKEN.stars}, {AWAKEN.dusk} Камней Сумрака, {fmt(AWAKEN.gold)} золота</Btn>}
     </details>
    </>}
    {tab==='talents'&&instance&&<>
     <small>Свободно очков · {points}</small>
     <GameTiles columns={4}>{instance.talents.map((slot,i)=><GameTile key={i} label={i<3?rankTalent(i).name:String(i+1)} icon={['axes','lightning','shield','rune'][Math.min(i,3)]} value={slot.open?slot.rank+'/'+TALENT_MAX:'Закрыто'} locked={!slot.open} active={focus===i} onClick={()=>setFocus(focus===i?null:i)}/>)}</GameTiles>
     {focus!==null&&(()=>{const current=rankTalent(focus),slot=instance.talents[focus];return <div className="bonus-card"><b>{current.name} · {slot.rank}/{TALENT_MAX}</b><span>{current.text}</span>
      {slot.open?<Btn disabled={!points||slot.rank>=TALENT_MAX} onClick={()=>petTalent(picked,focus)}>Изучить {current.name} · 1 очко</Btn>:<span>Откроется на ступени {(focus-3)*2} пробуждения.</span>}</div>})()}
     {spent>0&&<details className="saga-disclosure"><summary>Сброс талантов</summary><p>Ранги будут сняты. Очки от уровня можно распределить заново.</p>{confirm==='reset'?<Btn disabled={p.gold<200} onClick={()=>{if(petTalentReset(picked))setConfirm('')}}>Подтвердить · 200 золота</Btn>:<Btn onClick={()=>setConfirm('reset')}>Сбросить за 200 золота</Btn>}</details>}
    </>}{tab==='level'&&legacy>=0&&<details className="saga-disclosure"><summary>Эволюция и боевая ветвь</summary><CompanionGrowth p={p} pet={legacy as 0|1}/></details>}
   </>}
  </div>
  </CardDialog>}{summoning&&<CardDialog className="game-detail" title="Призыв спутников" onClose={()=>{setSummoning(false);setConfirm('')}}>
   <div className="summon">
    <div className="game-metrics"><span className="game-metric"><Icon name="soul"/>{fmt(souls)} Душ</span><span className="game-metric"><Icon name="summon-seal"/>{fmt(seals)} печ.</span></div>
    {confirm==='seal'?<div className="squad-placement"><Btn onClick={()=>{if(exchangeSeal(seals))setConfirm('')}}>Получить {followerRules.sealSouls} Душ за 1 печать</Btn>{seals>1&&<Btn onClick={()=>{if(exchangeSeal(seals,seals))setConfirm('')}}>Обменять все · {fmt(seals*followerRules.sealSouls)} Душ</Btn>}<Btn onClick={()=>setConfirm('')}>Отмена</Btn></div>:<Btn kind="secondary" disabled={!seals} onClick={()=>setConfirm('seal')}>Обменять печать</Btn>}
    <div className="summon-results">{market.offers.map((offer,i)=>offer?<span key={i} style={{'--rarity':companionColors[companions[offer.species].rarity]} as React.CSSProperties}>
     <img src={art(offer.species)} alt=""/><b>{companions[offer.species].name}</b><small>{companionRarity[companions[offer.species].rarity]}{offer.guarantee?' · гарантия':''}</small>
     <Btn disabled={souls<followerRules.prices[companions[offer.species].rarity]||Object.keys(s.instances).length>=followerRules.maxOwned} onClick={()=>buyFollower(i,market.revision)}>{followerRules.prices[companions[offer.species].rarity]} Душ</Btn>
    </span>:<span key={i}>Куплено</span>)}</div>
    <details className="saga-disclosure"><summary>Гарантии · {market.legendary}/{followerRules.legendary} · {market.mythic}/{followerRules.mythic}</summary><p>Легендарное предложение {market.legendary}/{followerRules.legendary}. Мифическое {market.mythic}/{followerRules.mythic} · ожидает новых видов.</p><p>Бесплатно · {followerRules.freeDaily-market.daily} сегодня, {followerRules.freeWeekly-market.weekly} на неделе.</p></details>
    {confirm==='refresh'?<div className="squad-placement"><Btn onClick={()=>{if(repeat(()=>refreshFollowers(market.revision,true)))setConfirm('')}}>Отказаться от гарантии и обновить</Btn><Btn onClick={()=>setConfirm('')}>Отмена</Btn></div>:<Btn disabled={!!market.offers.length&&!freeRefresh(market)&&souls<followerRules.refresh} onClick={()=>market.offers.some(offer=>offer?.guarantee)?setConfirm('refresh'):repeat(()=>refreshFollowers(market.revision))}>{!market.offers.length?'Открыть предложения':freeRefresh(market)?'Обновить бесплатно':'Обновить за '+followerRules.refresh+' Душ'}</Btn>}
    <details className="saga-disclosure"><summary>Шансы обычных предложений</summary><div className="bonus-card">{followerRules.weights.map((_,i)=><span key={i}><b>Место {i+1}</b> {offerOdds(i).map(({id,chance})=>companions[id].name+' '+(chance*100).toFixed(2)+'%').join(' · ')}</span>)}</div></details>
   </div>
  </CardDialog>}
 </div>;
}

/** One table of every dark bonus of the hero — real numbers from the same aggregator the fight uses. */
export function PowerSources({p}:{p:Player}){
 const parts=powerParts(p).filter(([,b])=>bonusLines(b).length);
 return <div className="bonus-card sources">{parts.length?parts.map(([name,b])=><span key={name}><b>{name}</b> {bonusLines(b).join(' · ')}</span>):<span>Тёмная энергия, камни, реликвии и спутники пока не дают бонусов.</span>}</div>;
}
/** Entry tiles to the five systems. */
export function DarkHub({p}:{p:Player}){
 const open=useGame(s=>s.open),s=squadState(p),d=darkState(p),run=realmRun(p);
 const tiles=[['realm','portal','Царство тьмы',run?`Поход идёт · этаж ${run.f}`:`Этаж ${p.darkFloor}`],['darkgear','essence','Тёмная энергия',`${d.eq.filter(Boolean).length}/12 · склад ${d.inv.length}`],['gems','gem','Камни',`${Object.values(gemState(p).sock).flat().filter(Boolean).length} вставлено`],['relic','amulet','Реликвии',`${relicCollection(p).owned}/${relicIds.length} открыто`],['companions','companion','Спутники',`${s.owned.length}/${companionIds.length} в дружине`]] as const;
 return <div className="dark-hub">{tiles.map(([id,icon,name,detail])=><button key={id} onClick={()=>open(id)}><Icon name={icon}/><strong>{name}</strong><small>{detail}</small></button>)}</div>;
}
