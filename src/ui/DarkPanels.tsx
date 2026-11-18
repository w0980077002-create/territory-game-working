/**
 * Windows of the five dark systems: Dark Realm, Dark Energy gear, gems, relics and companions.
 * Rendered inside the shared DialogShell. Every button calls a real transaction from dark/actions.
 */
import {useRef,useState} from 'react';
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
 squadBonus,companions,companionIds,companionRarity,companionColors,squadState,companionPower,legacyPet,starCost,STAR_MAX,AWAKEN,talentDefs,talentPoints,talentSpent,TALENT_MAX,summonTable,SUMMON,powerParts} from '../dark/rules';
import {blessings,blessingIds,realmRun,realmLast,realmSelected,roomReward,floorName,lordFloor,floorBoss,roomTitles,REALM_COST,ROOMS,type BlessingId,type RealmTotals} from '../dark/realm';
import {collectRealmReward,realmSelect,realmStart,realmResume,realmAbandon,darkEquip,darkUnequip,darkUpgrade,darkLock,darkSalvage,darkSalvageMany,darkBulkList,
 gemInsert,gemRemove,gemSynth,gemSynthAll,gemBuy,relicUnlock,relicUpgrade,summon,petLevel,petLevelCost,petStar,petAwaken,petTalent,petTalentReset,petActivate,type SummonResult} from '../dark/actions';
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
 const first=floor===p.darkFloor,max=p.darkFloor,from=Math.max(1,Math.min(floor-2,max-4)),strip=Array.from({length:Math.min(5,max)},(_,i)=>from+i).filter(f=>f<=max);
 if(run)return <div className="realm">
  <div className="workspace-toolbar"><span className="realm-resource"><Icon name="rune"/> {fmt(p.chaosite)} Хаосита</span><button onClick={()=>setInfo(true)}>Награды и правила</button></div>
  <div className="realm-banner live"><small>ПОХОД ИДЁТ</small><strong>Этаж {run.f} · {floorName(run.f)}</strong><span>{roomTitles[run.r-1]} · {run.stage.startsWith('CHOICE')?'Выбор портала':`${run.killed}/${run.total}`}</span><em style={{color:blessings[run.b].color}}>{blessings[run.b].name}: {blessings[run.b].text}</em></div>
  <RoomTrack floor={run.f} at={run.r}/>
  <div className="local-scroll"><h3>Уже добыто</h3><RewardList t={run.acc}/></div>
  <div className="workspace-actions"><Btn onClick={()=>realmResume()}>Продолжить поход</Btn>
  <Btn kind="secondary" onClick={()=>realmAbandon()}>Покинуть поход · добытое сохранится</Btn></div>
  {info&&<CardDialog title="Текущий поход" onClose={()=>setInfo(false)}><RewardList t={run.acc}/><p>Вход оплачен при старте. Закрытие игры не прерывает поход: вы вернётесь в тот же бой.</p></CardDialog>}
 </div>;
 return <div className="realm">
  <div className="workspace-toolbar"><span className="realm-resource"><Icon name="rune"/> {fmt(p.chaosite)} Хаосита</span><button onClick={()=>setInfo(true)}>Награды и правила</button></div>
  {last&&!last.ack&&<CardDialog title={last.win?'Победа':'Поражение'} onClose={()=>g.open(null)}><div className={`realm-result ${last.win?'win':'lose'}`}><small>{last.win?'ПОБЕДА':'ПОРАЖЕНИЕ'}</small><strong>{last.win?`Этаж ${last.f} пройден${last.first?' впервые':''}!`:`Этаж ${last.f} · пройдено комнат: ${last.rooms} из ${ROOMS}`}</strong>
   <RewardList t={last}/>
   {!last.win&&<p>Герой пал, но всё добытое в пройденных комнатах сохранено. Усильте Тёмную энергию, вставьте камни или развивайте спутников — и возвращайтесь.</p>}
   <div className="realm-result-actions">{last.win?<Btn onClick={()=>{collectRealmReward()}}>Забрать</Btn>:<Btn onClick={()=>{realmSelect(last.f);collectRealmReward()}}>Забрать и к этажам</Btn>}</div></div></CardDialog>}
  <div className="realm-entry">
   <div className={`realm-banner realm-portal ${lordFloor(floor)?'lord':''}`}><div className="portal-light" aria-hidden="true"/><div className="portal-caption"><small>{first?'НОВЫЙ ЭТАЖ':'ПРОЙДЕН · ПОВТОР'}{lordFloor(floor)?' · ЭТАЖ ВЛАДЫКИ':''}</small><strong>Этаж {floor} · {floorName(floor)}</strong></div></div>
   <div className="floor-route"><button className="floor-prev" aria-label="Предыдущий этаж" disabled={floor<=1} onClick={()=>realmSelect(floor-1)}>‹</button><div className="floor-strip" aria-label="Доступные этажи">{strip.map(f=><button key={f} data-near={Math.abs(f-floor)<=1||max<=2?'true':'false'} className={`${f===floor?'selected':''} ${f<max?'cleared':''} ${lordFloor(f)?'lord':''}`} aria-pressed={f===floor} onClick={()=>realmSelect(f)}><span>Этаж {f}</span><small>{f<max?'Пройден ✓':'Новый'}</small></button>)}</div><button className="floor-next" aria-label="Следующий этаж" disabled={floor>=max} onClick={()=>realmSelect(floor+1)}>›</button></div>
  </div>
  <RoomTrack floor={floor} at={0}/>
  <h3 className="bless-title">Благословение похода</h3>
  <div className="bless-grid">{blessingIds.map(id=><button key={id} className={bless===id?'selected':''} aria-pressed={bless===id} title={blessings[id].text} style={{'--tone':blessings[id].color} as React.CSSProperties} onClick={()=>setBless(id)}><Icon name={blessings[id].icon}/><strong>{blessings[id].name}</strong><small>{blessings[id].text}</small></button>)}</div>
  <p className="bless-explainer" role="status">{blessings[bless].text}</p>
  <div className="workspace-actions"><Btn disabled={p.chaosite<REALM_COST} onClick={()=>realmStart(floor,bless)}>Вызов · {REALM_COST} Хаосита{p.chaosite<REALM_COST?` (есть ${p.chaosite})`:''}</Btn></div>
  {info&&<CardDialog title="Награды и правила" onClose={()=>setInfo(false)}>  <h3>Награда этажа{first?' · первое прохождение':''}</h3>
  <div className="realm-rewards">{[1,2,3,4,5,6].map(room=>{const r=roomReward(floor,room,first);return <div key={room}><b>{roomTitles[room-1]}</b><span>{r.ess} эссенции · {fmt(r.gold)} золота{r.shard?` · ${r.shard} оск.`:''}{r.items?` · тёмный предмет${r.items>1?' ×'+r.items:''}`:''}{r.gemChance?` · камень ${Math.round(r.gemChance*100)}%`:''}{r.dusk?` · ${r.dusk} Камень Сумрака`:''}{r.sealChance?` · печать ${Math.round(r.sealChance*100)}%`:''}{r.gems?` · ${r.gems} самоцв.`:''}</span></div>})}</div>
  <p className="hint">7 врагов, четыре выбора порталов и владыка этажа. Поражение завершает поход, но добыча пройденных участков доступна в итоге. Пройденные этажи можно повторять сколько угодно — ради эссенции, предметов и камней.</p></CardDialog>}
 </div>;
}
function RoomTrack({floor,at}:{floor:number;at:number}){
 const ids=[undefined,undefined,undefined,undefined,undefined,floorBoss(floor)];
 return <div className="room-track">{roomTitles.map((title,i)=><div key={title} className={at>i+1?'done':at===i+1?'now':''}><span className="room-art">{ids[i]?<img src={art(ids[i]!)} alt=""/>:<Icon name="axes"/>}</span><b>{i+1}. {title}</b><small>{ids[i]?nameOf(ids[i]!):'Отряд тьмы'}</small></div>)}</div>;
}
function RewardList({t}:{t:RealmTotals}){return <div className="reward-list">{rewardRows(t).map(([n,label])=><span key={label}><b>+{fmt(n)}</b>{label}</span>)}{t.loot.map((name,i)=><span key={i} className="loot"><b>★</b>{name}</span>)}{!rewardRows(t).length&&!t.loot.length&&<span>Награды не получены</span>}</div>}

// ───────────────────────── Dark Energy ─────────────────────────
function DarkCard({item,against,preview=false}:{item:DarkItem;against?:DarkItem|null;preview?:boolean}){
 const def=darkSlots[item.s],e=darkEffectOf(item),diff=against?darkValue(item)-darkValue(against):0;
 return <div className="dark-card" style={{'--rarity':darkColors[item.r]} as React.CSSProperties}><Icon name={def.icon}/><div><strong>{darkName(item)}{item.k?' 🔒':''}</strong><small>{darkSlots[item.s].name} · Этаж {item.l} · усиление +{item.u}/{darkMaxUpgrade(item.r)}</small><b><span className="dark-section-label">Основной атрибут</span>{statNames[def.stat]} {statText(def.stat,darkValue(item))}{against&&diff!==0&&<i className={diff>0?'up':'down'}> {diff>0?'▲':'▼'} {statText(def.stat,Math.abs(diff)).slice(1)}</i>}</b>{preview&&item.u<darkMaxUpgrade(item.r)&&<span className="dark-upgrade-preview">{statText(def.stat,darkValue(item))} → <i className="positive">{statText(def.stat,darkValue({...item,u:item.u+1}))}</i> при усилении</span>}{e&&<em><span className="dark-section-label">Эффект Тёмной энергии</span>{e.def.name}: {e.def.text(e.value)}</em>}</div></div>;
}
export function DarkGearPanel({p}:{p:Player}){
 const state=darkState(p),[slot,setSlot]=useState<number|null>(null),[picked,setPicked]=useState<string|null>(null),[confirm,setConfirm]=useState<string|null>(null),[bulk,setBulk]=useState(1),[filterSlot,setFilterSlot]=useState<number|null>(null),[detail,setDetail]=useState(false),[utility,setUtility]=useState<'bulk'|'power'|null>(null),[compare,setCompare]=useState('new');
 const equipped=slot!==null?state.eq[slot]:null,list=state.inv.filter(i=>filterSlot===null||i.s===filterSlot).sort((a,b)=>darkScore(b)-darkScore(a)),item=state.inv.find(i=>i.id===picked),count=state.eq.filter(Boolean).length,bonus=darkBonus(p),effects=darkEffectTotals(p),heroId={berserker:'winged_helmet_warrior',ranger:'strongman_boulder',runologist:'whitebeard_mage'}[p.heroClass];
 const upgradePreview=(i:DarkItem)=><div className="bonus-card"><span>{statNames[darkSlots[i.s].stat]}: {statText(darkSlots[i.s].stat,darkValue(i))}{i.u<darkMaxUpgrade(i.r)&&<> → <b className="positive">{statText(darkSlots[i.s].stat,darkValue({...i,u:i.u+1}))}</b> после усиления</>}</span></div>;
 const upgradeRow=(i:DarkItem)=>{const c=darkUpgradeCost(i),maxed=i.u>=darkMaxUpgrade(i.r);return <Btn disabled={maxed||resCount(p,'ess')<c.ess||p.gold<c.gold||duskCount(p)<c.dusk} onClick={()=>darkUpgrade(i.id)}>{maxed?'Предел усиления':`Усилить до +${i.u+1} · ${c.ess} эссенции · ${fmt(c.gold)} золота${c.dusk?' · 1 Камень Сумрака':''}`}</Btn>};
 const salvage=(i:DarkItem)=>{if((i.r>=3||i.u>0)&&confirm!==i.id){setConfirm(i.id);return}if(darkSalvage(i.id)){setPicked(null);setConfirm(null);setDetail(false)}};
 return <div className="darkgear">
  <DarkWallet p={p} show={['ess']} from="darkgear"/>
  <div className="dark-ring altar-scene" aria-label="12 слотов Тёмной энергии"><div className="dark-core"><img src={art(heroId)} alt=""/></div>
   {darkSlots.map((def,s)=>{const it=state.eq[s],pos=[[27,10],[50,8],[73,10],[12,30],[88,30],[8,52],[92,52],[12,75],[88,75],[28,91],[50,93],[72,91]][s];return <button key={s} className={`dark-slot ${slot===s?'selected':''} ${it?'':'empty'}`} style={{left:`${pos[0]}%`,top:`${pos[1]}%`,'--rarity':it?darkColors[it.r]:'#4b4763'} as React.CSSProperties} aria-label={`${def.name}${it?` · ${darkRarity[it.r]} +${it.u}`:' · пусто'}`} aria-pressed={slot===s} onClick={()=>{setSlot(s);setPicked(null);setConfirm(null);setDetail(true);setCompare('new')}}><Icon name={def.icon}/>{it&&<small>+{it.u}</small>}{!it&&state.inv.some(i=>i.s===s)&&<i>!</i>}</button>})}
  </div>
  <div className="altar-divider" aria-hidden="true"><span>ᚠ</span><i/><b>ТЁМНАЯ ЭНЕРГИЯ</b><i/><span>ᚦ</span></div>
  {detail&&(item||slot!==null)&&<CardDialog className={item?'parchment-comparison':undefined} title={item?'Сравнение экипировки':darkSlots[slot!].name} onClose={()=>{setDetail(false);setConfirm(null)}} actions={item?<>
   <Btn onClick={()=>{if(darkEquip(item.id)){setDetail(false);setPicked(null)}}}>Надеть</Btn>{upgradeRow(item)}
   {confirm===item.id&&<p className="dark-confirm" role="alert">Разобрать «{darkName(item)}»? Предмет исчезнет · +{darkSalvageValue(item)} эссенции.</p>}
   <div className="dark-actions"><Btn kind="secondary" disabled={!!item.k} onClick={()=>salvage(item)}>{item.k?'🔒 Защищён':confirm===item.id?'Подтвердить разбор':`Разобрать +${darkSalvageValue(item)}`}</Btn><Btn kind="secondary" onClick={()=>{darkLock(item.id);setConfirm(null)}}>{item.k?'Снять замок':'Защитить'}</Btn></div>
  </>:equipped?<>{upgradeRow(equipped)}<div className="dark-actions"><Btn kind="secondary" onClick={()=>{if(darkUnequip(slot!))setDetail(false)}}>Снять на склад</Btn><Btn kind="secondary" onClick={()=>darkLock(equipped.id)}>{equipped.k?'Снять замок':'Защитить'}</Btn></div></>:undefined}>
   <DarkWallet p={p} show={['ess']}/><p className="hint">Доступно золота: {fmt(p.gold)}</p>
   {item?<><div className="compare-tabs tabs">{[['new','Новое'],['worn','Надето']].map(([id,label])=><button key={id} aria-pressed={compare===id} className={compare===id?'selected':''} onClick={()=>setCompare(id)}>{label}</button>)}</div><div className="dark-compare" data-compare={compare}><div className="compare-worn"><h4>Надето</h4>{state.eq[item.s]?<DarkCard item={state.eq[item.s]!}/>:<p className="compare-empty">Слот свободен</p>}</div><div className="compare-new"><h4>Новое</h4><DarkCard item={item} against={state.eq[item.s]} preview/></div></div></>:equipped?<DarkCard item={equipped}/>:<p>Слот пуст. Выберите предмет на складе.</p>}{!item&&equipped&&upgradePreview(equipped)}
  </CardDialog>}
  <div className="workspace-toolbar dark-store-head"><button onClick={()=>setUtility('bulk')}>Разобрать</button><b>Склад {state.inv.length}/{DARK_STORAGE}</b><select aria-label="Фильтр склада" value={filterSlot??'all'} onChange={e=>setFilterSlot(e.target.value==='all'?null:Number(e.target.value))}><option value="all">Все</option>{darkSlots.map((d,i)=><option key={i} value={i}>{d.name}</option>)}</select></div>
  <div className="local-scroll storage-scroll" aria-label="Предметы на складе" tabIndex={0}>
  {list.length?<div className="dark-grid">{list.map(i=><button key={i.id} className={picked===i.id?'selected':''} style={{'--rarity':darkColors[i.r]} as React.CSSProperties} aria-label={darkName(i)} onClick={()=>{setPicked(i.id);setConfirm(null);setDetail(true);setCompare('new')}}><Icon name={darkSlots[i.s].icon}/><small>{i.u?`+${i.u}`:`эт.${i.l}`}</small>{i.k&&<i>🔒</i>}{darkEffectOf(i)&&<em>✦</em>}</button>)}</div>:<p className="hint">{state.inv.length?'Для этого слота на складе ничего нет.':'Склад пуст. Победите владыку этажа в Царстве тьмы, чтобы получить первый тёмный предмет.'}</p>}
  </div><div className="workspace-actions"><button className="action secondary" onClick={()=>setUtility('power')}>Бонусы комплекта · {count}/12</button></div>
  {utility==='bulk'&&<CardDialog title="Разбор предметов" onClose={()=>setUtility(null)}><div className="dark-bulk"><span>Разобрать лишнее до редкости</span><div className="tabs">{[0,1,2].map(r=><button key={r} className={bulk===r?'selected':''} onClick={()=>setBulk(r)} style={{color:darkColors[r]}}>{darkRarity[r]}</button>)}</div><Btn kind="secondary" disabled={!darkBulkList(p,bulk).length} onClick={()=>darkSalvageMany(bulk)}>Разобрать {darkBulkList(p,bulk).length} шт. · +{darkBulkList(p,bulk).reduce((a,i)=>a+darkSalvageValue(i),0)} эссенции</Btn><small>Защищённые и усиленные предметы не затрагиваются.</small></div></CardDialog>}
  {utility==='power'&&<CardDialog title="Сила Тёмной энергии" onClose={()=>setUtility(null)}>
  <div className="bonus-card">{bonusLines(bonus).length?bonusLines(bonus).map(line=><span key={line}>{line}</span>):<span>Наденьте тёмные предметы, чтобы получить бонусы.</span>}</div>
  <div className="bonus-card effects">{darkEffectIds.filter(id=>effects[id]>0).map(id=><span key={id}><b>{darkEffects[id].name}</b> {darkEffects[id].text(effects[id])}</span>)}<span className={darkResonance(count)?'on':''}><b>Резонанс Тьмы</b> 4 / 8 / 12 предметов: +3% / +6% / +10% к здоровью, атаке и защите · сейчас {count}/12{darkResonance(count)?` (+${Math.round(darkResonance(count)*100)}%)`:''}</span></div>
  <p className="hint">Тёмная энергия — отдельный комплект: он не занимает 12 основных слотов и крылья героя, а усиливает их.</p></CardDialog>}
 </div>;
}

// ───────────────────────── Gems ─────────────────────────
function GemDot({code,size=30}:{code:string|null;size?:number}){const g=parseGem(code);return <span className={`gem-dot ${g?'':'none'}`} style={{'--gem':g?gemTypes[g.type].color:'#39404a',width:size,height:size} as React.CSSProperties}>{g?.level}</span>}
export function GemsPanel({p}:{p:Player}){
 const [buyGem,setBuyGem]=useState(false),buyGemPending=useRef(false),state=gemState(p),[slot,setSlot]=useState<Slot>('weapon'),[socket,setSocket]=useState(0),bag=Object.entries(state.bag).map(([code,n])=>({...parseGem(code)!,n})).sort((a,b)=>b.level-a.level||a.type.localeCompare(b.type)),row=state.sock[slot],worn=p.equipment[slot],bonus=gemBonus(p),current=row[socket];
 return <div className="gems">
  <div className="gem-slots" aria-label="Категория экипировки">{gemSlots.map(s=><button key={s} className={`${slot===s?'selected':''} ${p.equipment[s]?'':'bare'}`} aria-pressed={slot===s} aria-label={slotNames[s]} onClick={()=>{setSlot(s);setSocket(0)}}><Icon name={gearIcon(s)}/><span>{state.sock[s].map((c,i)=><GemDot key={i} code={c} size={9}/>)}</span></button>)}</div>
  <div className="gem-stage"><h3>{slotNames[slot]}{worn?` · ${worn.name}`:''}</h3>{!worn&&<p className="hint">В этом слоте нет предмета: вставленные камни сохранятся и заработают, когда вы наденете вещь.</p>}
   <div className="sockets">{[0,1,2].map(i=>{const open=socketOpen(p,i),code=row[i];return <button key={i} className={`socket ${socket===i?'selected':''} ${open?'':'locked'}`} aria-pressed={socket===i} onClick={()=>setSocket(i)}><GemDot code={open?code:null} size={54}/><b>{!open?'Закрыто':code?gemLabel(code):'Пустое гнездо'}</b><small>{!open?socketRules[i].text:code?gemText(code):'Выберите камень ниже'}</small></button>})}</div>
   {current&&socketOpen(p,socket)&&<Btn kind="secondary" onClick={()=>gemRemove(slot,socket)}>Снять «{gemLabel(current)}» в запас</Btn>}</div>
  <div className="dark-store-head"><h3>Запас камней</h3><button onClick={()=>gemSynthAll()}>Синтезировать всё</button></div>
  {bag.length?<div className="gem-bag">{bag.map(g=>{const same=row.some((c,i)=>i!==socket&&parseGem(c)?.type===g.type),can=socketOpen(p,socket)&&!same&&row[socket]!==g.code;return <div key={g.code} className="gem-row"><GemDot code={g.code} size={38}/><div><strong>{gemLabel(g.code)} <i>×{g.n}</i></strong><small>{gemText(g.code)}</small></div><button className="action" disabled={!can} onClick={()=>gemInsert(slot,socket,g.code)}>{same?'Цвет занят':'Вставить'}</button><button className="action secondary" disabled={g.n<3||g.level>=GEM_MAX||p.gold<gemSynthGold(g.level)} onClick={()=>gemSynth(g.code)}>{g.level>=GEM_MAX?'Макс.':`3→1 · ${gemSynthGold(g.level)}`}</button></div>})}</div>:<p className="hint">Камней пока нет. Их дают стражи и владыки Царства тьмы и победы в Логове мини-босса.</p>}
  <h3>Бонусы всех камней</h3>
  <div className="bonus-card">{bonusLines(bonus).length?bonusLines(bonus).map(line=><span key={line}>{line}</span>):<span>Вставьте камень в открытое гнездо надетого предмета.</span>}</div>
  <h3>Где добыть</h3>
  <div className="bonus-card"><span><b>Царство тьмы</b> страж врат — 30%, владыка этажа — 60% (первое прохождение — 100%); с 10 и 20 этажа камни сразу выше уровнем</span><span><b>Логово мини-босса</b> 35% за победу</span><span><b>Синтез</b> три одинаковых камня и золото превращаются в один камень следующего уровня (до {GEM_MAX})</span></div>
  <Btn kind="secondary" disabled={p.gems<GEM_SHOP_PRICE} onClick={()=>{buyGemPending.current=true;setBuyGem(true)}}>Купить случайный камень 1 ур. · {GEM_SHOP_PRICE} самоцветов</Btn>
  {buyGem&&<CardDialog title="Подтвердить покупку камня" onClose={()=>setBuyGem(false)} actions={<Btn onClick={()=>{if(!buyGemPending.current)return;buyGemPending.current=false;gemBuy();setBuyGem(false)}}>Подтвердить · {GEM_SHOP_PRICE} самоцветов</Btn>}><p>Один случайный камень 1 уровня для гнезда экипировки.</p></CardDialog>}
  <p className="hint">В одном предмете — до трёх камней разных цветов. Камни привязаны к слоту, поэтому смена вещи их не теряет.</p>
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
    :<Btn disabled={resCount(p,'shard')<up.shard||p.gold<up.gold||matCount(p,up.material)<up.mats} onClick={()=>relicUpgrade(picked)}>Усилить · {up.shard} осколков · {fmt(up.gold)} золота{up.mats?` · ${up.mats} × ${materials[up.material].name} (есть ${matCount(p,up.material)})`:''}</Btn>}><p className="hint">Доступно: {fmt(p.gold)} золота · {resCount(p,'shard')} осколков</p><div className="relic-detail" style={{'--rarity':relicColors[def.rarity]} as React.CSSProperties}><small>{relicRarity[def.rarity]} реликвия{lv?` · уровень ${lv}${heart?'':'/'+RELIC_MAX}`:''}</small><div className="relic-feature"><RelicArtwork id={picked}/><div><h3>{def.name}</h3><p>{def.lore}</p></div></div><p className="relic-level-line">{lv>0?`Уровень ${lv}${maxed?' · максимум':` → ${lv+1}`}`:'Открытие реликвии'}</p>
   <div className="relic-effect"><span><small>{lv?'Сейчас':'На 1 уровне'}</small>{def.ability(Math.max(1,lv))}{def.passive&&!heart?` · ${statNames[def.passive[0]]} ${statText(def.passive[0],def.passive[1]*Math.max(1,lv))}`:''}</span>{lv>0&&!maxed&&<span className="next"><small>После усиления</small>{def.ability(lv+1)}{def.passive&&!heart?` · ${statNames[def.passive[0]]} ${statText(def.passive[0],def.passive[1]*(lv+1))}`:''}</span>}</div>

  </div>
  </CardDialog>}<p className="hint">Осколки реликвий дают владыки и стражи Царства тьмы и каждая победа в Логове мини-босса. Каждая способность действует в бою сразу после открытия.</p>
 </div>;
}

// ───────────────────────── Companions ─────────────────────────
export function SquadPanel({p}:{p:Player}){
 const s=squadState(p),[picked,setPicked]=useState(s.act[0]),[results,setResults]=useState<SummonResult[]|null>(null),[detail,setDetail]=useState(false),[summoning,setSummoning]=useState(false),[tab,setTab]=useState('level'),def=companions[picked],pet=s.own[picked],own=pet.lv>0,active=s.act.includes(picked),power=companionPower(picked,{...pet,lv:Math.max(1,pet.lv)}),points=talentPoints(pet)-talentSpent(pet),legacy=legacyPet(picked),attack=stats(p).attack;
 const call=(times:1|10,pay:'seal'|'gems')=>{const r=summon(times,pay);if(r)setResults(r)};
 const job=(id:string,pw:{power:number;interval:number})=>companions[id].role==='striker'?`Удар ${fmt(attack*pw.power)} каждые ${pw.interval.toFixed(1).replace('.',',')} сек`:`Лечит ${(Math.min(.45,pw.power)*100).toFixed(0)}% здоровья каждые ${pw.interval.toFixed(1).replace('.',',')} сек`;
 return <div className="squad">
  <DarkWallet p={p} show={['seal']} from="companions"/>
  <div className="squad-active squad-stage">{s.act.map((id,i)=><button key={id} className={picked===id?'selected':''} onClick={()=>{setPicked(id);setDetail(true);setTab('level')}} style={{'--rarity':companionColors[companions[id].rarity]} as React.CSSProperties}><img src={art(id)} alt=""/><small>{i===0?'БОЕЦ':'ХРАНИТЕЛЬ'}</small><strong>{companions[id].name}</strong><span>ур.{s.own[id].lv} · {'★'.repeat(s.own[id].st)||'без звёзд'}{s.own[id].aw?' · пробуждён':''}</span></button>)}</div>
  <div className="squad-bonus">Бонус дружины: {bonusLines(squadBonus(p)).join(' · ')||'звёзды и таланты ещё не развиты'}</div>
  <div className="workspace-toolbar"><b>Каталог · {s.owned.length}/{companionIds.length}</b><button onClick={()=>setSummoning(true)}>Призыв</button></div>
  <div className="local-scroll"><div className="squad-grid">{companionIds.map(id=>{const d=companions[id],o=s.own[id];return <button key={id} className={`${picked===id?'selected':''} ${o.lv?'':'locked'}`} style={{'--rarity':companionColors[d.rarity]} as React.CSSProperties} aria-pressed={picked===id} aria-label={d.name} onClick={()=>{setPicked(id);setDetail(true);setTab('level')}}><img src={art(id)} alt=""/><small>{o.lv?`ур.${o.lv}`:`${o.sh}/${d.shards}`}</small>{o.st>0&&<em>{'★'.repeat(o.st)}</em>}{s.act.includes(id)&&<i aria-label="в строю">✓</i>}</button>})}</div>
  </div>{detail&&<CardDialog title={def.name} onClose={()=>setDetail(false)} actions={own?<>{!active&&<Btn onClick={()=>petActivate(picked)}>В строй · заменить {def.role==='striker'?'бойца':'хранителя'}</Btn>}{tab==='level'&&<Btn disabled={p.gold<petLevelCost(pet.lv)} onClick={()=>petLevel(picked)}>Повысить уровень · {fmt(petLevelCost(pet.lv))} золота <small>→ {job(picked,companionPower(picked,{...pet,lv:pet.lv+1}))}</small></Btn>}
    {tab==='stars'&&<Btn kind="secondary" disabled={pet.st>=STAR_MAX||pet.sh<starCost[pet.st]} onClick={()=>petStar(picked)}>{pet.st>=STAR_MAX?'Все 5 звёзд получены':`Звезда ${pet.st+1} · осколки ${pet.sh}/${starCost[pet.st]} · ${job(picked,companionPower(picked,{...pet,st:pet.st+1}))}`}</Btn>}{tab==='awake'&&(!pet.aw?<><div className="awaken-list"><b>Пробуждение</b><span className={pet.st>=AWAKEN.stars?'ok':''}>Звёзды {pet.st}/{AWAKEN.stars}</span><span className={pet.lv>=AWAKEN.level?'ok':''}>Уровень {pet.lv}/{AWAKEN.level}</span><span className={duskCount(p)>=AWAKEN.dusk?'ok':''}>Камни Сумрака {duskCount(p)}/{AWAKEN.dusk}</span><span className={p.gold>=AWAKEN.gold?'ok':''}>Золото {fmt(AWAKEN.gold)}</span></div><Btn kind="secondary" disabled={pet.st<AWAKEN.stars||pet.lv<AWAKEN.level||duskCount(p)<AWAKEN.dusk||p.gold<AWAKEN.gold} onClick={()=>petAwaken(picked)}>Пробудить · {job(picked,companionPower(picked,{...pet,aw:true}))}</Btn></>:<p>✓ Спутник пробуждён · +25% силы</p>)}</>:undefined}><div className="pet-card" style={{'--rarity':companionColors[def.rarity]} as React.CSSProperties}>
   <div className="pet-head"><div className={`pet-portrait ${pet.aw?'awake':''}`}><img src={art(picked)} alt={def.name}/></div><div><small>{companionRarity[def.rarity]} · {def.role==='striker'?'боец':'хранитель'}</small><h3>{def.name}{own?` · ур.${pet.lv}`:''}</h3><b className="stars">{'★'.repeat(pet.st)}{'☆'.repeat(STAR_MAX-pet.st)}</b><p>{def.lore}</p></div></div>
   <div className="bonus-card"><span><b>{def.traitName}</b> {def.trait}</span><span><b>В бою</b> {job(picked,power)}</span>{pet.aw&&<span className="on"><b>Пробуждение</b> {def.role==='striker'?'Каждая третья атака бьёт всех врагов на 50%.':'Каждое лечение даёт герою +15% урона на 3 секунды.'}</span>}</div>
   {!own?<><div className="relic-progress"><b>Осколки: {pet.sh}/{def.shards}</b><i><span style={{width:`${Math.min(100,pet.sh/def.shards*100)}%`}}/></i><small>Спутник присоединится, когда наберётся {def.shards} осколков из Призыва.</small></div></>:<>
    <div className="growth-tabs tabs">{[['level','Уровень'],['stars','Звёзды'],['talents','Таланты'],['awake','Пробуждение']].map(([id,label])=><button key={id} className={tab===id?'selected':''} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</div>
    {tab==='talents'&&<><h3>Таланты · свободно очков: {points}</h3>
    {talentDefs[def.role].map((t,i)=><div className="talent-row" key={t.name}><div><strong>{t.name} · {pet.t[i]}/{TALENT_MAX}</strong><small>{t.text}</small></div><button className="action" aria-label={`Изучить ${t.name}`} disabled={points<=0||pet.t[i]>=TALENT_MAX} onClick={()=>petTalent(picked,i)}>+</button></div>)}
    <p className="hint">Одно очко таланта за каждые 5 уровней спутника.{talentSpent(pet)>0&&<> <button className="link" onClick={()=>petTalentReset(picked)}>Сбросить за 200 золота</button></>}</p>
    </>}{tab==='level'&&legacy>=0&&<details className="saga-disclosure"><summary>Эволюция и боевая ветвь</summary><CompanionGrowth p={p} pet={legacy as 0|1}/></details>}
   </>}
  </div>
  </CardDialog>}{summoning&&<CardDialog title="Призыв спутников" onClose={()=>setSummoning(false)} actions={<div className="summon-actions"><Btn disabled={resCount(p,'seal')<SUMMON.seal} onClick={()=>call(1,'seal')}>Призыв · 1 печать</Btn><Btn disabled={resCount(p,'seal')<SUMMON.seal*10} onClick={()=>call(10,'seal')}>×10 · 10 печатей</Btn><Btn kind="secondary" disabled={p.gems<SUMMON.gems} onClick={()=>call(1,'gems')}>Призыв · {SUMMON.gems} самоцветов</Btn><Btn kind="secondary" disabled={p.gems<SUMMON.gems*10} onClick={()=>call(10,'gems')}>×10 · {SUMMON.gems*10} самоцветов</Btn></div>}>
  <div className="summon"><p>Призыв приносит осколки спутников: новые соратники присоединяются к дружине, а лишние осколки превращаются в звёзды.</p>

   {results&&<div className="summon-results" role="status">{results.map((r,i)=><span key={i} className={r.unlocked?'new':''} style={{'--rarity':companionColors[companions[r.id].rarity],animationDelay:`${i*60}ms`} as React.CSSProperties}><img src={art(r.id)} alt=""/><b>{r.unlocked?'Новый спутник!':`+${r.shards} оск.`}</b><small>{companions[r.id].name}</small></span>)}</div>}
   <details className="saga-disclosure"><summary>Шансы призыва</summary><div className="bonus-card">{summonTable.map(r=><span key={r.id}><b>{companions[r.id].name}</b> {Math.round(r.chance*100)}% · {r.shards} осколков</span>)}</div></details></div>
  </CardDialog>}<p className="hint squad-passive">Звёзды и пробуждение каждого спутника усиливают героя, даже когда спутник не в строю: +0,5% здоровья и атаки за звезду.</p>
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
