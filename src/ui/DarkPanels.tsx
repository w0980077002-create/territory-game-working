/**
 * Windows of the five dark systems: Dark Realm, Dark Energy gear, gems, relics and companions.
 * Rendered inside the shared DialogShell. Every button calls a real transaction from dark/actions.
 */
import {useState} from 'react';
import {useGame} from '../core/store';
import type {Player,Slot} from '../core/types';
import {art,slotNames,characters} from '../data/catalog';
import {stats} from '../core/formulas';
import {materials,matCount} from '../saga/gear';
import {Icon,gearIcon} from './Icon';
import {CompanionGrowth} from './SagaPanels';
import {resources,resCount,duskCount,type ResId,bonusLines,statNames,statText,
 darkSlots,darkRarity,darkColors,darkState,darkValue,darkEffectOf,darkName,darkScore,darkUpgradeCost,darkMaxUpgrade,darkSalvageValue,darkBonus,darkEffectTotals,darkEffects,darkEffectIds,darkResonance,DARK_STORAGE,type DarkItem,
 gemTypes,gemSlots,gemState,parseGem,gemLabel,gemText,gemBonus,gemSynthGold,socketOpen,socketRules,GEM_MAX,GEM_SHOP_PRICE,
 relics,relicIds,relicLevel,relicRarity,relicColors,relicUnlockCost,relicUpgradeCost,relicCollection,RELIC_MAX,type RelicId,
 companions,companionIds,companionRarity,companionColors,squadState,companionPower,legacyPet,starCost,STAR_MAX,AWAKEN,talentDefs,talentPoints,talentSpent,TALENT_MAX,summonTable,SUMMON,powerParts} from '../dark/rules';
import {blessings,blessingIds,realmRun,realmLast,realmSelected,roomReward,floorName,lordFloor,floorBoss,floorKeeper,roomTitles,REALM_COST,ROOMS,type BlessingId,type RealmTotals} from '../dark/realm';
import {realmSelect,realmStart,realmResume,realmAbandon,darkEquip,darkUnequip,darkUpgrade,darkLock,darkSalvage,darkSalvageMany,darkBulkList,
 gemInsert,gemRemove,gemSynth,gemSynthAll,gemBuy,relicUnlock,relicUpgrade,summon,petLevel,petLevelCost,petStar,petAwaken,petTalent,petTalentReset,petActivate,type SummonResult} from '../dark/actions';
import './dark.css';
const fmt=(v:number)=>v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e4?`${(v/1000).toFixed(1)}K`:Math.round(v).toLocaleString('ru');
const nameOf=(id:string)=>characters.find(c=>c.id===id)?.name.split(',')[0]??id;
function Btn({children,onClick,disabled=false,kind=''}:{children:React.ReactNode;onClick:()=>void;disabled?:boolean;kind?:string}){return <button className={`action ${kind}`} onClick={onClick} disabled={disabled}>{children}</button>}
/** Shared wallet of the dark systems. */
export function DarkWallet({p,show=['ess','shard','seal']}:{p:Player;show?:ResId[]}){
 return <div className="dark-wallet">{show.map(id=><span key={id} style={{'--tone':resources[id].color} as React.CSSProperties} title={resources[id].source}><Icon name={resources[id].icon}/><b>{fmt(resCount(p,id))}</b><small>{resources[id].short}</small></span>)}<span style={{'--tone':materials.dusk.color} as React.CSSProperties}><Icon name="gem"/><b>{fmt(duskCount(p))}</b><small>Камни Сумрака</small></span></div>;
}
const rewardRows=(t:RealmTotals)=>[[t.ess,'Тёмная эссенция'],[t.gold,'Золото'],[t.xp,'Опыт'],[t.shard,'Осколки реликвий'],[t.dusk,'Камни Сумрака'],[t.seal,'Печати призыва'],[t.gems,'Самоцветы']].filter(r=>(r[0] as number)>0) as [number,string][];

// ───────────────────────── Dark Realm ─────────────────────────
export function RealmPanel({p}:{p:Player}){
 const g=useGame(),run=realmRun(p),last=realmLast(p),floor=realmSelected(p),[bless,setBless]=useState<BlessingId>('fury'),[seen,setSeen]=useState(false);
 const first=floor===p.darkFloor,max=p.darkFloor,from=Math.max(1,Math.min(floor-2,max-4)),strip=Array.from({length:Math.min(5,max)},(_,i)=>from+i).filter(f=>f<=max);
 if(run)return <div className="realm">
  <DarkWallet p={p}/>
  <div className="realm-banner live"><small>ПОХОД ИДЁТ</small><strong>Этаж {run.f} · {floorName(run.f)}</strong><span>Комната {run.r} из {ROOMS} · {roomTitles[run.r-1]}</span><em style={{color:blessings[run.b].color}}>{blessings[run.b].name}: {blessings[run.b].text}</em></div>
  <RoomTrack floor={run.f} at={run.r}/>
  {rewardRows(run.acc).length>0&&<><h3>Уже добыто</h3><RewardList t={run.acc}/></>}
  <Btn onClick={()=>realmResume()}>Продолжить поход</Btn>
  <Btn kind="secondary" onClick={()=>realmAbandon()}>Покинуть поход · добытое сохранится</Btn>
  <p className="hint">Вход оплачен при старте. Закрытие игры не прерывает поход: вы вернётесь в ту же комнату.</p>
 </div>;
 return <div className="realm">
  <DarkWallet p={p}/>
  {last&&!seen&&<div className={`realm-result ${last.win?'win':'lose'}`}><small>{last.win?'ПОБЕДА':'ПОХОД ПРЕРВАН'}</small><strong>{last.win?`Этаж ${last.f} пройден${last.first?' впервые':''}!`:`Этаж ${last.f} · пройдено комнат: ${last.rooms} из ${ROOMS}`}</strong>
   <RewardList t={last}/>
   {!last.win&&<p>Герой пал, но всё добытое в пройденных комнатах сохранено. Усильте Тёмную энергию, вставьте камни или развивайте спутников — и возвращайтесь.</p>}
   <div className="realm-result-actions">{last.win?<Btn onClick={()=>{setSeen(true)}}>{last.first?'К следующему этажу':'Продолжить'}</Btn>:<Btn onClick={()=>{realmSelect(last.f);setSeen(true)}}>Повторить этаж</Btn>}<Btn kind="secondary" onClick={()=>g.open(last.win?'darkgear':'companions')}>{last.win?'Тёмная энергия':'Усилить спутников'}</Btn></div></div>}
  <div className={`realm-banner ${lordFloor(floor)?'lord':''}`}><small>{first?'НОВЫЙ ЭТАЖ':'ПРОЙДЕН · ПОВТОР'}{lordFloor(floor)?' · ЭТАЖ ВЛАДЫКИ':''}</small><strong>Этаж {floor} · {floorName(floor)}</strong><span>Пройдено этажей: {max-1}</span></div>
  <div className="floor-strip"><button aria-label="Предыдущий этаж" disabled={floor<=1} onClick={()=>realmSelect(floor-1)}>‹</button>{strip.map(f=><button key={f} className={`${f===floor?'selected':''} ${f<max?'cleared':''} ${lordFloor(f)?'lord':''}`} aria-pressed={f===floor} onClick={()=>realmSelect(f)}>{f}<small>{f<max?'✓':'новый'}</small></button>)}<button aria-label="Следующий этаж" disabled={floor>=max} onClick={()=>realmSelect(floor+1)}>›</button></div>
  <RoomTrack floor={floor} at={0}/>
  <h3>Награда этажа{first?' · первое прохождение':''}</h3>
  <div className="realm-rewards">{[1,2,3].map(room=>{const r=roomReward(floor,room,first);return <div key={room}><b>{roomTitles[room-1]}</b><span>{r.ess} эссенции · {fmt(r.gold)} золота{r.shard?` · ${r.shard} оск.`:''}{r.items?` · тёмный предмет${r.items>1?' ×'+r.items:''}`:''}{r.gemChance?` · камень ${Math.round(r.gemChance*100)}%`:''}{r.dusk?` · ${r.dusk} Камень Сумрака`:''}{r.sealChance?` · печать ${Math.round(r.sealChance*100)}%`:''}{r.gems?` · ${r.gems} самоцв.`:''}</span></div>})}</div>
  <h3>Благословение похода</h3>
  <div className="bless-grid">{blessingIds.map(id=><button key={id} className={bless===id?'selected':''} aria-pressed={bless===id} style={{'--tone':blessings[id].color} as React.CSSProperties} onClick={()=>setBless(id)}><Icon name={blessings[id].icon}/><strong>{blessings[id].name}</strong><small>{blessings[id].text}</small></button>)}</div>
  <Btn disabled={p.chaosite<REALM_COST} onClick={()=>realmStart(floor,bless)}>Вызов · {REALM_COST} Хаосита{p.chaosite<REALM_COST?` (есть ${p.chaosite})`:''}</Btn>
  <p className="hint">Три комнаты подряд: стража, страж врат и владыка этажа. Поражение завершает поход, но награды пройденных комнат остаются. Пройденные этажи можно повторять сколько угодно — ради эссенции, предметов и камней.</p>
 </div>;
}
function RoomTrack({floor,at}:{floor:number;at:number}){
 const ids=[undefined,floorKeeper(floor),floorBoss(floor)];
 return <div className="room-track">{roomTitles.map((title,i)=><div key={title} className={at>i+1?'done':at===i+1?'now':''}><span className="room-art">{ids[i]?<img src={art(ids[i]!)} alt=""/>:<Icon name="axes"/>}</span><b>{i+1}. {title}</b><small>{ids[i]?nameOf(ids[i]!):'Отряд тьмы'}</small></div>)}</div>;
}
function RewardList({t}:{t:RealmTotals}){return <div className="reward-list">{rewardRows(t).map(([n,label])=><span key={label}><b>+{fmt(n)}</b>{label}</span>)}{t.loot.map((name,i)=><span key={i} className="loot"><b>★</b>{name}</span>)}{!rewardRows(t).length&&!t.loot.length&&<span>Награды не получены</span>}</div>}

// ───────────────────────── Dark Energy ─────────────────────────
function DarkCard({item,against}:{item:DarkItem;against?:DarkItem|null}){
 const def=darkSlots[item.s],e=darkEffectOf(item),diff=against?darkValue(item)-darkValue(against):0;
 return <div className="dark-card" style={{'--rarity':darkColors[item.r]} as React.CSSProperties}><Icon name={def.icon}/><div><strong>{darkName(item)}{item.k?' 🔒':''}</strong><small>Этаж {item.l} · усиление +{item.u}/{darkMaxUpgrade(item.r)}</small><b>{statNames[def.stat]} {statText(def.stat,darkValue(item))}{against&&diff!==0&&<i className={diff>0?'up':'down'}> {diff>0?'▲':'▼'} {statText(def.stat,Math.abs(diff)).slice(1)}</i>}</b>{e&&<em>{e.def.name}: {e.def.text(e.value)}</em>}</div></div>;
}
export function DarkGearPanel({p}:{p:Player}){
 const state=darkState(p),[slot,setSlot]=useState<number|null>(null),[picked,setPicked]=useState<string|null>(null),[confirm,setConfirm]=useState<string|null>(null),[bulk,setBulk]=useState(1),[all,setAll]=useState(false);
 const equipped=slot!==null?state.eq[slot]:null,list=state.inv.filter(i=>slot===null||all||i.s===slot).sort((a,b)=>darkScore(b)-darkScore(a)),item=state.inv.find(i=>i.id===picked),count=state.eq.filter(Boolean).length,bonus=darkBonus(p),effects=darkEffectTotals(p),heroId={berserker:'winged_helmet_warrior',ranger:'strongman_boulder',runologist:'whitebeard_mage'}[p.heroClass];
 const upgradeRow=(i:DarkItem)=>{const c=darkUpgradeCost(i),maxed=i.u>=darkMaxUpgrade(i.r);return <Btn disabled={maxed||resCount(p,'ess')<c.ess||p.gold<c.gold||duskCount(p)<c.dusk} onClick={()=>darkUpgrade(i.id)}>{maxed?'Предел усиления':`Усилить до +${i.u+1} · ${c.ess} эссенции · ${fmt(c.gold)} золота${c.dusk?' · 1 Камень Сумрака':''}`}</Btn>};
 const salvage=(i:DarkItem)=>{if((i.r>=3||i.u>0)&&confirm!==i.id){setConfirm(i.id);return}if(darkSalvage(i.id)){setPicked(null);setConfirm(null)}};
 return <div className="darkgear">
  <DarkWallet p={p} show={['ess']}/>
  <div className="dark-ring" aria-label="12 слотов Тёмной энергии"><div className="dark-core"><img src={art(heroId)} alt=""/><span>{count}/12</span></div>
   {darkSlots.map((def,s)=>{const it=state.eq[s],angle=(s/12)*Math.PI*2-Math.PI/2;return <button key={s} className={`dark-slot ${slot===s?'selected':''} ${it?'':'empty'}`} style={{left:`${50+41*Math.cos(angle)}%`,top:`${50+41*Math.sin(angle)}%`,'--rarity':it?darkColors[it.r]:'#4b4763'} as React.CSSProperties} aria-label={`${def.name}${it?` · ${darkRarity[it.r]} +${it.u}`:' · пусто'}`} aria-pressed={slot===s} onClick={()=>{setSlot(slot===s?null:s);setPicked(null);setConfirm(null)}}><Icon name={def.icon}/>{it&&it.u>0&&<small>+{it.u}</small>}{!it&&state.inv.some(i=>i.s===s)&&<i>!</i>}</button>})}
  </div>
  {slot!==null&&<div className="dark-selected"><h3>{darkSlots[slot].name}</h3>{equipped?<><DarkCard item={equipped}/>{upgradeRow(equipped)}<div className="dark-actions"><Btn kind="secondary" onClick={()=>darkUnequip(slot)}>Снять на склад</Btn><Btn kind="secondary" onClick={()=>darkLock(equipped.id)}>{equipped.k?'Снять замок':'Защитить'}</Btn></div></>:<p className="hint">Слот пуст. Тёмные предметы добываются у владык этажей Царства тьмы.</p>}</div>}
  {item&&<div className="dark-selected picked"><h3>Выбранный предмет</h3><DarkCard item={item} against={state.eq[item.s]}/>{state.eq[item.s]?<><small className="versus">Сейчас надето:</small><DarkCard item={state.eq[item.s]!}/></>:<small className="versus">Слот «{darkSlots[item.s].name}» свободен</small>}
   <Btn onClick={()=>{if(darkEquip(item.id)){setSlot(item.s);setPicked(null)}}}>Надеть</Btn>{upgradeRow(item)}
   {confirm===item.id&&<p className="dark-confirm" role="alert">Разобрать «{darkName(item)}»? Предмет исчезнет · +{darkSalvageValue(item)} эссенции.</p>}
   <div className="dark-actions"><Btn kind="secondary" disabled={!!item.k} onClick={()=>salvage(item)}>{item.k?'🔒 Защищён':confirm===item.id?'Подтвердить разбор':`Разобрать +${darkSalvageValue(item)}`}</Btn><Btn kind="secondary" onClick={()=>{darkLock(item.id);setConfirm(null)}}>{item.k?'Снять замок':'Защитить'}</Btn></div></div>}
  <div className="dark-store-head"><h3>Склад Тьмы · {state.inv.length}/{DARK_STORAGE}</h3>{slot!==null&&<button className={all?'selected':''} onClick={()=>setAll(!all)}>{all?'Все слоты':'Только слот'}</button>}</div>
  {list.length?<div className="dark-grid">{list.map(i=><button key={i.id} className={picked===i.id?'selected':''} style={{'--rarity':darkColors[i.r]} as React.CSSProperties} aria-label={darkName(i)} onClick={()=>{setPicked(picked===i.id?null:i.id);setConfirm(null)}}><Icon name={darkSlots[i.s].icon}/><small>{i.u?`+${i.u}`:`эт.${i.l}`}</small>{i.k&&<i>🔒</i>}{darkEffectOf(i)&&<em>✦</em>}</button>)}</div>:<p className="hint">{state.inv.length?'Для этого слота на складе ничего нет.':'Склад пуст. Победите владыку этажа в Царстве тьмы, чтобы получить первый тёмный предмет.'}</p>}
  {state.inv.length>0&&<div className="dark-bulk"><span>Разобрать лишнее до редкости</span><div className="tabs">{[0,1,2].map(r=><button key={r} className={bulk===r?'selected':''} onClick={()=>setBulk(r)} style={{color:darkColors[r]}}>{darkRarity[r]}</button>)}</div><Btn kind="secondary" disabled={!darkBulkList(p,bulk).length} onClick={()=>darkSalvageMany(bulk)}>Разобрать {darkBulkList(p,bulk).length} шт. · +{darkBulkList(p,bulk).reduce((a,i)=>a+darkSalvageValue(i),0)} эссенции</Btn><small>Защищённые и усиленные предметы не затрагиваются.</small></div>}
  <h3>Сила Тёмной энергии</h3>
  <div className="bonus-card">{bonusLines(bonus).length?bonusLines(bonus).map(line=><span key={line}>{line}</span>):<span>Наденьте тёмные предметы, чтобы получить бонусы.</span>}</div>
  <div className="bonus-card effects">{darkEffectIds.filter(id=>effects[id]>0).map(id=><span key={id}><b>{darkEffects[id].name}</b> {darkEffects[id].text(effects[id])}</span>)}<span className={darkResonance(count)?'on':''}><b>Резонанс Тьмы</b> 4 / 8 / 12 предметов: +3% / +6% / +10% к здоровью, атаке и защите · сейчас {count}/12{darkResonance(count)?` (+${Math.round(darkResonance(count)*100)}%)`:''}</span></div>
  <p className="hint">Тёмная энергия — отдельный комплект: он не занимает 12 основных слотов и крылья героя, а усиливает их.</p>
 </div>;
}

// ───────────────────────── Gems ─────────────────────────
function GemDot({code,size=30}:{code:string|null;size?:number}){const g=parseGem(code);return <span className={`gem-dot ${g?'':'none'}`} style={{'--gem':g?gemTypes[g.type].color:'#39404a',width:size,height:size} as React.CSSProperties}>{g?.level}</span>}
export function GemsPanel({p}:{p:Player}){
 const state=gemState(p),[slot,setSlot]=useState<Slot>('weapon'),[socket,setSocket]=useState(0),bag=Object.entries(state.bag).map(([code,n])=>({...parseGem(code)!,n})).sort((a,b)=>b.level-a.level||a.type.localeCompare(b.type)),row=state.sock[slot],worn=p.equipment[slot],bonus=gemBonus(p),current=row[socket];
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
  <Btn kind="secondary" disabled={p.gems<GEM_SHOP_PRICE} onClick={()=>gemBuy()}>Купить случайный камень 1 ур. · {GEM_SHOP_PRICE} самоцветов</Btn>
  <p className="hint">В одном предмете — до трёх камней разных цветов. Камни привязаны к слоту, поэтому смена вещи их не теряет.</p>
 </div>;
}

// ───────────────────────── Relics ─────────────────────────
export function RelicsPanel({p}:{p:Player}){
 const [picked,setPicked]=useState<RelicId>('heart'),c=relicCollection(p),def=relics[picked],lv=relicLevel(p,picked),need=def.need(p),open=relicUnlockCost(picked),up=relicUpgradeCost(picked,lv),heart=picked==='heart',maxed=!heart&&lv>=RELIC_MAX;
 return <div className="relics">
  <DarkWallet p={p} show={['shard']}/>
  <div className="relic-progress"><b>Коллекция: {c.owned}/{c.total} · сумма уровней {c.levels}</b><i><span style={{width:`${(5-c.next)/5*100}%`}}/></i><small>Бонус коллекции: +{Math.round(c.bonus*100)}% к здоровью, атаке и защите · до следующего +1% осталось уровней: {c.next}</small></div>
  <div className="relic-grid">{relicIds.map(id=>{const l=relicLevel(p,id),r=relics[id],base=id==='heart',ready=!l&&!base&&r.need(p).ok;return <button key={id} className={`${picked===id?'selected':''} ${l||base?'':'locked'}`} style={{'--rarity':relicColors[r.rarity]} as React.CSSProperties} aria-pressed={picked===id} onClick={()=>setPicked(id)}><Icon name={r.icon}/><strong>{r.name}</strong><small>{l||base?`Уровень ${l}`:ready?'Можно открыть':'Закрыта'}</small>{ready&&<i>!</i>}</button>})}</div>
  <div className="relic-detail" style={{'--rarity':relicColors[def.rarity]} as React.CSSProperties}><small>{relicRarity[def.rarity]} реликвия{lv?` · уровень ${lv}${heart?'':'/'+RELIC_MAX}`:''}</small><h3>{def.name}</h3><p>{def.lore}</p>
   <div className="relic-effect"><span><small>{lv?'Сейчас':'На 1 уровне'}</small>{def.ability(Math.max(1,lv))}{def.passive&&!heart?` · ${statNames[def.passive[0]]} ${statText(def.passive[0],def.passive[1]*Math.max(1,lv))}`:''}</span>{lv>0&&!maxed&&<span className="next"><small>После усиления</small>{def.ability(lv+1)}{def.passive&&!heart?` · ${statNames[def.passive[0]]} ${statText(def.passive[0],def.passive[1]*(lv+1))}`:''}</span>}</div>
   {heart?<Btn disabled={p.gold<300*(p.relic+1)} onClick={()=>relicUpgrade('heart')}>Развить · {fmt(300*(p.relic+1))} золота</Btn>
    :lv===0?<><p className={`relic-need ${need.ok?'ok':''}`}>{need.ok?'✓':'✗'} {need.text}</p><Btn disabled={!need.ok||resCount(p,'shard')<open.shard||p.gold<open.gold} onClick={()=>relicUnlock(picked)}>Открыть · {open.shard} осколков · {fmt(open.gold)} золота</Btn></>
    :maxed?<p className="relic-need ok">✓ Реликвия на высшем уровне</p>
    :<Btn disabled={resCount(p,'shard')<up.shard||p.gold<up.gold||matCount(p,up.material)<up.mats} onClick={()=>relicUpgrade(picked)}>Усилить · {up.shard} осколков · {fmt(up.gold)} золота{up.mats?` · ${up.mats} × ${materials[up.material].name} (есть ${matCount(p,up.material)})`:''}</Btn>}
  </div>
  <p className="hint">Осколки реликвий дают владыки и стражи Царства тьмы и каждая победа в Логове мини-босса. Каждая способность действует в бою сразу после открытия.</p>
 </div>;
}

// ───────────────────────── Companions ─────────────────────────
export function SquadPanel({p}:{p:Player}){
 const s=squadState(p),[picked,setPicked]=useState(s.act[0]),[results,setResults]=useState<SummonResult[]|null>(null),def=companions[picked],pet=s.own[picked],own=pet.lv>0,active=s.act.includes(picked),power=companionPower(picked,{...pet,lv:Math.max(1,pet.lv)}),points=talentPoints(pet)-talentSpent(pet),legacy=legacyPet(picked),attack=stats(p).attack;
 const call=(times:1|10,pay:'seal'|'gems')=>{const r=summon(times,pay);if(r)setResults(r)};
 const job=(id:string,pw:{power:number;interval:number})=>companions[id].role==='striker'?`Удар ${fmt(attack*pw.power)} каждые ${pw.interval.toFixed(1).replace('.',',')} сек`:`Лечит ${(Math.min(.45,pw.power)*100).toFixed(0)}% здоровья каждые ${pw.interval.toFixed(1).replace('.',',')} сек`;
 return <div className="squad">
  <DarkWallet p={p} show={['seal']}/>
  <div className="squad-active">{s.act.map((id,i)=><button key={id} className={picked===id?'selected':''} onClick={()=>setPicked(id)} style={{'--rarity':companionColors[companions[id].rarity]} as React.CSSProperties}><img src={art(id)} alt=""/><small>{i===0?'БОЕЦ':'ХРАНИТЕЛЬ'}</small><strong>{companions[id].name}</strong><span>ур.{s.own[id].lv} · {'★'.repeat(s.own[id].st)||'без звёзд'}{s.own[id].aw?' · пробуждён':''}</span></button>)}</div>
  <h3>Каталог спутников · {s.owned.length}/{companionIds.length}</h3>
  <div className="squad-grid">{companionIds.map(id=>{const d=companions[id],o=s.own[id];return <button key={id} className={`${picked===id?'selected':''} ${o.lv?'':'locked'}`} style={{'--rarity':companionColors[d.rarity]} as React.CSSProperties} aria-pressed={picked===id} aria-label={d.name} onClick={()=>setPicked(id)}><img src={art(id)} alt=""/><small>{o.lv?`ур.${o.lv}`:`${o.sh}/${d.shards}`}</small>{o.st>0&&<em>{'★'.repeat(o.st)}</em>}{s.act.includes(id)&&<i>в строю</i>}</button>})}</div>
  <div className="pet-card" style={{'--rarity':companionColors[def.rarity]} as React.CSSProperties}>
   <div className="pet-head"><div className={`pet-portrait ${pet.aw?'awake':''}`}><img src={art(picked)} alt={def.name}/></div><div><small>{companionRarity[def.rarity]} · {def.role==='striker'?'боец':'хранитель'}</small><h3>{def.name}{own?` · ур.${pet.lv}`:''}</h3><b className="stars">{'★'.repeat(pet.st)}{'☆'.repeat(STAR_MAX-pet.st)}</b><p>{def.lore}</p></div></div>
   <div className="bonus-card"><span><b>{def.traitName}</b> {def.trait}</span><span><b>В бою</b> {job(picked,power)}</span>{pet.aw&&<span className="on"><b>Пробуждение</b> {def.role==='striker'?'Каждая третья атака бьёт всех врагов на 50%.':'Каждое лечение даёт герою +15% урона на 3 секунды.'}</span>}</div>
   {!own?<><div className="relic-progress"><b>Осколки: {pet.sh}/{def.shards}</b><i><span style={{width:`${Math.min(100,pet.sh/def.shards*100)}%`}}/></i><small>Спутник присоединится, когда наберётся {def.shards} осколков из Призыва.</small></div></>:<>
    {!active&&<Btn onClick={()=>petActivate(picked)}>В строй · заменить {def.role==='striker'?'бойца':'хранителя'}</Btn>}
    <Btn disabled={p.gold<petLevelCost(pet.lv)} onClick={()=>petLevel(picked)}>Повысить уровень · {fmt(petLevelCost(pet.lv))} золота <small>→ {job(picked,companionPower(picked,{...pet,lv:pet.lv+1}))}</small></Btn>
    <Btn kind="secondary" disabled={pet.st>=STAR_MAX||pet.sh<starCost[pet.st]} onClick={()=>petStar(picked)}>{pet.st>=STAR_MAX?'Все 5 звёзд получены':`Звезда ${pet.st+1} · осколки ${pet.sh}/${starCost[pet.st]} · +10% силы`}</Btn>
    {!pet.aw?<><div className="awaken-list"><b>Пробуждение</b><span className={pet.st>=AWAKEN.stars?'ok':''}>Звёзды {pet.st}/{AWAKEN.stars}</span><span className={pet.lv>=AWAKEN.level?'ok':''}>Уровень {pet.lv}/{AWAKEN.level}</span><span className={duskCount(p)>=AWAKEN.dusk?'ok':''}>Камни Сумрака {duskCount(p)}/{AWAKEN.dusk}</span><span className={p.gold>=AWAKEN.gold?'ok':''}>Золото {fmt(AWAKEN.gold)}</span></div><Btn kind="secondary" disabled={pet.st<AWAKEN.stars||pet.lv<AWAKEN.level||duskCount(p)<AWAKEN.dusk||p.gold<AWAKEN.gold} onClick={()=>petAwaken(picked)}>Пробудить · +25% силы и особая способность</Btn></>:null}
    <h3>Таланты · свободно очков: {points}</h3>
    {talentDefs[def.role].map((t,i)=><div className="talent-row" key={t.name}><div><strong>{t.name} · {pet.t[i]}/{TALENT_MAX}</strong><small>{t.text}</small></div><button className="action" aria-label={`Изучить ${t.name}`} disabled={points<=0||pet.t[i]>=TALENT_MAX} onClick={()=>petTalent(picked,i)}>+</button></div>)}
    <p className="hint">Одно очко таланта за каждые 5 уровней спутника.{talentSpent(pet)>0&&<> <button className="link" onClick={()=>petTalentReset(picked)}>Сбросить за 200 золота</button></>}</p>
    {legacy>=0&&<details className="saga-disclosure"><summary>Эволюция и боевая ветвь</summary><CompanionGrowth p={p} pet={legacy as 0|1}/></details>}
   </>}
  </div>
  <h3>Призыв</h3>
  <div className="summon"><p>Призыв приносит осколки спутников: новые соратники присоединяются к дружине, а лишние осколки превращаются в звёзды.</p>
   <div className="summon-actions"><Btn disabled={resCount(p,'seal')<SUMMON.seal} onClick={()=>call(1,'seal')}>Призыв · 1 печать</Btn><Btn disabled={resCount(p,'seal')<SUMMON.seal*10} onClick={()=>call(10,'seal')}>×10 · 10 печатей</Btn><Btn kind="secondary" disabled={p.gems<SUMMON.gems} onClick={()=>call(1,'gems')}>Призыв · {SUMMON.gems} самоцветов</Btn><Btn kind="secondary" disabled={p.gems<SUMMON.gems*10} onClick={()=>call(10,'gems')}>×10 · {SUMMON.gems*10} самоцветов</Btn></div>
   {results&&<div className="summon-results" role="status">{results.map((r,i)=><span key={i} className={r.unlocked?'new':''} style={{'--rarity':companionColors[companions[r.id].rarity],animationDelay:`${i*60}ms`} as React.CSSProperties}><img src={art(r.id)} alt=""/><b>{r.unlocked?'Новый спутник!':`+${r.shards} оск.`}</b><small>{companions[r.id].name}</small></span>)}</div>}
   <details className="saga-disclosure"><summary>Шансы призыва</summary><div className="bonus-card">{summonTable.map(r=><span key={r.id}><b>{companions[r.id].name}</b> {Math.round(r.chance*100)}% · {r.shards} осколков</span>)}</div></details></div>
  <p className="hint">Звёзды и пробуждение каждого спутника усиливают героя, даже когда спутник не в строю: +0,5% здоровья и атаки за звезду.</p>
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
 const tiles=[['realm','rune','Царство тьмы',run?`Поход идёт · этаж ${run.f}`:`Этаж ${p.darkFloor}`],['darkgear','shield','Тёмная энергия',`${d.eq.filter(Boolean).length}/12 · склад ${d.inv.length}`],['gems','gem','Драгоценные камни',`${Object.values(gemState(p).sock).flat().filter(Boolean).length} вставлено`],['relic','amulet','Реликвии',`${relicCollection(p).owned}/${relicIds.length} открыто`],['companions','people','Спутники',`${s.owned.length}/${companionIds.length} в дружине`]] as const;
 return <div className="dark-hub">{tiles.map(([id,icon,name,detail])=><button key={id} onClick={()=>open(id)}><Icon name={icon}/><strong>{name}</strong><small>{detail}</small></button>)}</div>;
}
