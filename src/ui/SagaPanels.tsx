import {CompactFilter} from './CompactFilter';
/** Saga windows: chapter map, album and (later) every long-term system. Rendered inside the shared DialogShell. */
import {useGame} from '../core/store';
import type {Player} from '../core/types';
import {regions,regionIndex,stageInRegion,legendLap,hazards,STORY_STAGES} from '../saga/regions';
import {count} from '../saga/save';
import {characters,art,heroArt} from '../data/catalog';
import {battle} from '../game/Battle';
import './sagaPanels.css';
const categoryNames:Record<string,string>={heroes:'Герои',companions:'Спутники',enemies:'Враги',minibosses:'Мини-боссы',bosses:'Боссы',special:'Жители'};
/** Six regions as one road. Shows real progress from the save, never a decorative map. */
export function ChapterMap({p}:{p:Player}){
 const open=useGame(s=>s.open),current=regionIndex(p.stage),lap=legendLap(p.stage),storyDone=p.stage>STORY_STAGES;
 return <div className="chapter-map">
  <header><strong>{storyDone?`Легендарные маршруты · круг ${lap}`:'Сага Севера'}</strong><span>{storyDone?'Шесть регионов возвращаются с растущей угрозой':`Пройдено ${Math.min(STORY_STAGES,p.stage-1)} из ${STORY_STAGES} этапов`}</span></header>
  <ol>{regions.map((r,i)=>{const done=storyDone?(current%6>i||false):current>i,active=current%6===i,cleared=active?stageInRegion(p.stage)-1:done?10:0,locked=!active&&!done&&!storyDone;
   return <li key={r.id} className={`${active?'active':''} ${done?'done':''} ${locked?'locked':''}`} style={{'--tone':r.look.glow} as React.CSSProperties}>
    <div className="chapter-head"><b>{i+1}</b><div><strong>{r.name}</strong><small>{r.tagline}</small></div><em>{done&&!active?'✓':locked?'🔒':`${cleared}/10`}</em></div>
    {active&&<><p>{r.story}</p><div className="chapter-nodes" aria-label={`Этапы региона: пройдено ${cleared} из 10`}>{r.bosses.map(([,title],n)=><i key={n} title={title} className={`${n<cleared?'won':n===cleared?'now':''} ${n===4||n===9?'boss':''}`}>{n===9?'♛':n===4?'☠':n+1}</i>)}</div>
     <dl><dt>Опасность</dt><dd>{hazards[r.hazard].name} — {hazards[r.hazard].hint}</dd><dt>Сейчас</dt><dd>Страж этапа: {r.bosses[stageInRegion(p.stage)-1][1]}</dd><dt>Владыка</dt><dd>{r.bosses[9][1]} · ресурс региона: {r.material}</dd></dl>
     <button className="action" onClick={()=>{battle?.challenge();open(null)}}>В путь · этап {i+1+lap*6}-{stageInRegion(p.stage)}</button></>}
    {done&&!active&&<p className="chapter-done">{r.finale}</p>}
   </li>})}</ol>
 </div>;
}
/** The album remembers every character really met in a fight (saved in saga.seen), not just the current encounter. */
export function Album({p}:{p:Player}){
 const seen=new Set([...(p.saga?.seen??[]),...(p.encounter?.units.map(u=>u.id)??[]),heroArt[p.heroClass],'goose_aviator','brown_white_dog']),total=characters.length,met=characters.filter(c=>seen.has(c.id)).length;
 return <><p>Встречено {met} из {total}. Альбом хранит всех, с кем герой действительно сражался или путешествовал.</p>
  {Object.keys(categoryNames).map(cat=>{const list=characters.filter(c=>c.category===cat);if(!list.length)return null;return <section key={cat}><h3>{categoryNames[cat]} · {list.filter(c=>seen.has(c.id)).length}/{list.length}</h3>
   <div className="collection-grid">{list.map(c=>{const known=seen.has(c.id)||cat==='heroes'||cat==='special',kills=count(p,'kill:'+c.id);return <div key={c.id} className={`${known?'recorded':'unrecorded'} category-${c.category}`}><small className="album-status">{cat==='heroes'?(heroArt[p.heroClass]===c.id?'Ваш герой':'Класс'):cat==='companions'?'В отряде':known?(kills?`Побед: ${kills}`:'Встречен'):'Не встречен'}</small><img loading="lazy" decoding="async" src={art(c.id)} alt={known?c.name.split(',')[0]:'Неизвестный'} style={known?undefined:{filter:'brightness(0) opacity(.55)'}}/><small>{known?c.name.split(',')[0]:'???'}</small></div>})}</div></section>})}
 </>;
}
// ───────────────────────── Stage B: builds, sets, forge, companions, quests ─────────────────────────
import {useState} from 'react';
import type {Item,Slot} from '../core/types';
import {slotNames,slots,rarityNames,classNames} from '../data/catalog';
import {sets,setIds,setOf,setCounts,perkOf,perks,perkIds,engravings,engraveOf,materials,materialIds,matCount,dropRules,setChance,type SetId,type EngraveId} from '../saga/gear';
import {specs,specIndex} from '../saga/specs';
import {branches,branchOf,evoName,evoPower,nextEvolution,BRANCH_LEVEL,combos} from '../saga/companions';
import {reforge,reforgePlan,engrave,engravePlan,craftSet,craftPlan,setUnlocked,trade,pickSpec,pickBranch,buildsOf,saveBuild,applyBuild,forgeLevel} from '../saga/actions';
import {dailyView,weeklyView,storyQuests,activeStory,masteryView,masteryTiers,claimBoard,claimStory,claimMastery,goals,ensureQuests,type QuestView} from '../saga/quests';
import {rewardText,type Reward} from '../saga/rewards';
import {Icon,gearIcon} from './Icon';
const short=(v:number)=>v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e4?`${(v/1000).toFixed(1)}K`:Math.round(v).toLocaleString('ru');
const Btn=({children,onClick,disabled=false,kind=''}:{children:React.ReactNode;onClick:()=>void;disabled?:boolean;kind?:string})=><button className={`action ${kind}`} onClick={onClick} disabled={disabled}>{children}</button>;
/** Set membership, perk and engraving of one item — shown inside every item card. */
export function SagaItemLines({item,p}:{item:Item;p:Player}){
 const set=setOf(item),perk=perkOf(item),rune=engraveOf(item);if(!set&&!perk&&!rune)return null;const n=set?setCounts(p)[set]:0;
 return <div className="saga-item-lines">
  {perk&&<div className="perk-line"><strong>✦ {perk.tag}</strong><p>{perk.text}</p><small>{perk.source}</small></div>}
  {set&&<div className="set-line" style={{'--tone':sets[set].color} as React.CSSProperties}><strong>Комплект «{sets[set].name}» · надето {n}/6</strong><ol>{sets[set].bonuses.map((b,i)=><li key={i} className={n>=(i+1)*2?'on':''}><b>{(i+1)*2}</b><span>{b}</span></li>)}</ol></div>}
  {rune&&<div className="rune-line"><b>{engravings[rune].sign}</b> {engravings[rune].name}: {engravings[rune].text}</div>}
 </div>;
}
/** Active set bonuses of the hero at a glance. */
export function SetSummary({p}:{p:Player}){
 const n=setCounts(p),active=setIds.filter(id=>n[id]>0);
 return <div className="saga-section"><h3>Комплекты</h3>{active.length?active.map(id=><div key={id} className="set-line" style={{'--tone':sets[id].color} as React.CSSProperties}><strong>{sets[id].name} · {n[id]}/6 <small>{sets[id].tag}</small></strong><ol>{sets[id].bonuses.map((b,i)=><li key={i} className={n[id]>=(i+1)*2?'on':''}><b>{(i+1)*2}</b><span>{b}</span></li>)}</ol></div>):<p className="hint">Предметы комплектов выпадают в своих регионах и куются по рецептам в Кузнице. 2, 4 и 6 вещей одного набора включают боевые бонусы.</p>}</div>;
}
export function SpecChooser({p}:{p:Player}){
 const current=specIndex(p);
 return <div className="saga-section"><h3>Сборка класса · {classNames[p.heroClass]}</h3><div className="spec-grid">{specs[p.heroClass].map((s,i)=><button key={s.id} className={`spec-card ${current===i?'selected':''}`} aria-pressed={current===i} onClick={()=>pickSpec(i)}><strong>{s.name}</strong><small>{s.tag}</small><ul>{s.lines.map(l=><li key={l}>{l}</li>)}</ul><em>Сочетается: {s.pairs}</em></button>)}</div><p className="hint">Сборку можно менять между боями бесплатно. Она меняет поведение атак, а не только цифры.</p></div>;
}
export function BuildSlots({p}:{p:Player}){
 const list=buildsOf(p);
 return <div className="saga-section"><h3>Сохранённые сборки</h3>{[0,1,2].map(i=>{const b=list[i];return <div className="row" key={i}><Icon name="book"/><div className="row-content"><strong>Слот {i+1}{b?` · ${classNames[b.cls]} · ${specs[b.cls][b.spec]?.name??''}`:''}</strong><small>{b?`${Object.keys(b.gear).length} предметов · руны ${b.runes.map(r=>['ᚠ','ᚦ','ᛟ'][r]).join(' ')}`:'Пусто — сохраните текущий класс, руны, ветвь и экипировку'}</small></div><Btn onClick={()=>saveBuild(i)}>Сохранить</Btn>{b&&<Btn kind="secondary" onClick={()=>applyBuild(i)}>Надеть</Btn>}</div>})}</div>;
}
/** Reforge and engraving for the item in a slot. Shows price, material and the exact result before paying. */
export function ForgeBench({slot,p}:{slot:Slot;p:Player}){
 const item=p.equipment[slot];if(!item||slot==='wings')return null;const plan=reforgePlan(item,p),eng=engravePlan(item,p);
 return <div className="saga-section forge-bench"><h3>Кузнечный верстак</h3>
  {plan?<><p>Перековка до ур.{plan.next.level}: Атака {item.attack} → {plan.next.attack} · HP {item.hp} → {plan.next.hp} · Защита {item.defense} → {plan.next.defense}. Имя, редкость, усиления, комплект и свойство сохраняются.</p><Btn disabled={p.gold<plan.gold||matCount(p,plan.material)<plan.mats} onClick={()=>reforge(slot)}>Перековать · {short(plan.gold)} золота · {plan.mats} × {materials[plan.material].name} ({matCount(p,plan.material)})</Btn></>:<p className="hint">Предмет уже на уровне кузницы ({forgeLevel(p)}). Развивайте кузницу и героя, чтобы перековывать любимые вещи дальше.</p>}
  <p>Гравировка: одна руна на предмет. Цена {short(eng.gold)} золота и {eng.mats} × {materials[eng.material].name} ({matCount(p,eng.material)}).</p>
  <div className="engrave-grid">{(Object.keys(engravings) as EngraveId[]).map(id=><button key={id} className={item.engrave===id?'selected':''} disabled={item.engrave===id||p.gold<eng.gold||matCount(p,eng.material)<eng.mats} onClick={()=>engrave(slot,id)}><b>{engravings[id].sign}</b><span>{engravings[id].name}</span><small>{engravings[id].text}</small></button>)}</div>
 </div>;
}
export function Materials({p}:{p:Player}){return <div className="material-row">{[...materialIds,'pearl','dusk'].map(id=><span key={id} style={{'--tone':materials[id].color} as React.CSSProperties} title={materials[id].name}><i/>{matCount(p,id)}<small>{materials[id].name}</small></span>)}</div>}
/** Set recipes and material exchange inside the Forge. */
export function Recipes({p}:{p:Player}){
 const [set,setSet]=useState<SetId>(()=>setIds.filter(id=>setUnlocked(p,id)).at(-1)??'frost'),[slot,setSlot]=useState<Slot>('weapon'),[from,setFrom]=useState('ice'),plan=craftPlan(set,p),open=setUnlocked(p,set),n=setCounts(p)[set];
 return <div className="saga-section"><h3>Рецепты комплектов</h3><Materials p={p}/>
  <div className="tabs wrap">{setIds.map(id=><button key={id} className={set===id?'selected':''} onClick={()=>setSet(id)} style={{'--tone':sets[id].color} as React.CSSProperties}>{setUnlocked(p,id)?'':'🔒 '}{sets[id].name}</button>)}</div>
  <div className="set-line" style={{'--tone':sets[set].color} as React.CSSProperties}><strong>{sets[set].name} · {sets[set].tag} · надето {n}/6</strong><ol>{sets[set].bonuses.map((b,i)=><li key={i} className={n>=(i+1)*2?'on':''}><b>{(i+1)*2}</b><span>{b}</span></li>)}</ol></div>
  <div className="inventory-order"><span>Слот</span><CompactFilter label="Слот для ковки" value={slot} onChange={v=>setSlot(v as Slot)} options={slots.filter(s=>s!=='wings').map(s=>({value:s,label:slotNames[s]+(setOf(p.equipment[s])===set?' ✓':'')}))}/></div>
  <Btn disabled={!open||p.gold<plan.gold||matCount(p,plan.material)<plan.mats} onClick={()=>craftSet(set,slot)}>{open?`Выковать ур.${plan.level} · ${rarityNames[plan.rarity]}+ · ${short(plan.gold)} золота · ${plan.mats} × ${materials[plan.material].name}`:`Откроется в регионе «${regions[sets[set].region].name}»`}</Btn>
  <p className="hint">Материалы дают победы в регионе: {Math.round(dropRules.materialWave*100)}% за встречу, {dropRules.materialBoss} за стража, {dropRules.materialFinale} за владыку. Благословение даёт шанс выковать вещь на ступень лучше.</p>
  <div className="inventory-order"><span>Обмен 3 → 1</span><CompactFilter label="Материал для обмена" value={from} onChange={setFrom} options={materialIds.map(id=>({value:id,label:`${materials[id].name} (${matCount(p,id)})`}))}/></div>
  <Btn kind="secondary" disabled={matCount(p,from)<3||from===plan.material} onClick={()=>trade(from,plan.material)}>Обменять на {materials[plan.material].name}</Btn>
 </div>;
}
/** Honest drop table of sets and named trophies. */
export function GearGuide({p}:{p:Player}){
 const owned=new Set([...Object.values(p.equipment),...p.inventory,...(p.pendingLoot??[])].flatMap(i=>i?.perk?[i.perk]:[]));
 return <div className="saga-section"><h3>Именные трофеи саги</h3><p className="hint">Владыка региона при первой победе всегда отдаёт свой трофей. Комплектные вещи: {Math.round(setChance(dropRules.setChanceRegular,p.blessing)*100)}% с обычной добычи региона, {Math.round(setChance(dropRules.setChanceBoss,p.blessing)*100)}% с боссов, {Math.round(setChance(dropRules.setChanceHorn,p.blessing)*100)}% из Рога (растёт с Благословением). TEST_ONLY.</p>
  {perkIds.map(id=><div className="hunt-item" key={id}><Icon name={gearIcon(perks[id].slot)}/><div><b>{perks[id].name} {owned.has(id)?'✓':''}</b><small>{perks[id].tag} · {perks[id].source}</small><p>{perks[id].text}</p></div></div>)}</div>;
}
export function CompanionGrowth({p,pet}:{p:Player;pet:0|1}){
 const level=p.companions[pet],branch=branchOf(p,pet),next=nextEvolution(level);
 return <div className="pet-growth"><div className="pet-evo"><b>{evoName(level)}</b><span>сила умений ×{evoPower(level).toFixed(2)}</span>{next&&<small>Следующая эволюция «{next.name}» на ур.{next.level}</small>}</div>
  <div className="spec-grid">{branches[pet].map((b,i)=><button key={b.name} className={`spec-card ${branch===i?'selected':''}`} disabled={level<BRANCH_LEVEL} aria-pressed={branch===i} onClick={()=>pickBranch(pet,i)}><strong>{b.name}</strong><small>{b.tag}</small><ul><li>{b.text}</li></ul></button>)}</div>
  {level<BRANCH_LEVEL&&<p className="hint">Ветвь открывается на {BRANCH_LEVEL} уровне спутника.</p>}
  <p className="hint">{pet===0?`Комбо: гусь срывает выстрел → ваш следующий удар «${combos.finish.label}» наносит +${Math.round(combos.finish.bonus*100)}%.`:`Комбо: пёс принимает удар → ваш следующий удар «${combos.riposte.label}» — крит и +${Math.round(combos.riposte.bonus*100)}%.`}</p></div>;
}
function QuestRow({q,onClaim}:{q:{text:string;progress:number;goal:number;done:boolean;claimed:boolean;reward:Reward};onClaim:()=>void}){
 return <div className={`quest-row ${q.claimed?'claimed':q.done?'ready':''}`}><div><strong>{q.text}</strong><small>{rewardText(q.reward)}</small><i><b style={{width:`${Math.min(100,q.progress/q.goal*100)}%`}}/></i></div><button className="action" disabled={!q.done||q.claimed} onClick={onClaim}>{q.claimed?'✓':q.done?'Забрать':`${short(q.progress)}/${short(q.goal)}`}</button></div>;
}
const boardRow=(q:QuestView)=>({text:q.def.text,progress:q.progress,goal:q.def.goal,done:q.done,claimed:q.claimed,reward:q.reward});
/** Quest board: daily, weekly, story chain and mastery. All progress comes from saved counters. */
export function QuestBoard({p}:{p:Player}){
 const g=useGame(),[tab,setTab]=useState<'day'|'week'|'story'|'mastery'>('day'),now=Date.now(),daily=dailyView(p,now),weekly=weeklyView(p,now);
 if(!daily.length||!weekly.length)setTimeout(()=>useGame.getState().mutate(p=>{ensureQuests(p)}),0);
 const claim=(fn:(p:Player)=>Reward|null)=>{let r:Reward|null=null;g.mutate(p=>{r=fn(p)});if(r)g.notice('Награда: '+rewardText(r))};
 const count=(list:{done:boolean;claimed:boolean}[])=>list.filter(q=>q.done&&!q.claimed).length,story=activeStory(p),m=masteryView(p);
 return <div className="quest-board">
  <div className="goal-strip">{goals(p,now).map(v=><div key={v.span}><small>{v.span}</small><span>{v.text}</span></div>)}</div>
  <div className="tabs">{([['day','День',count(daily)],['week','Неделя',count(weekly)],['story','Сага',count(story)],['mastery','Мастерство',m.filter(v=>v.ready).length]] as const).map(([id,name,n])=><button key={id} className={tab===id?'selected':''} onClick={()=>setTab(id)}>{name}{n?<em>{n}</em>:null}</button>)}</div>
  {tab==='day'&&<>{daily.map(q=><QuestRow key={q.def.id} q={boardRow(q)} onClaim={()=>claim(p=>claimBoard(p,'day',q.def.id))}/>)}<p className="hint">Шесть заданий из большого набора каждый день. Пропущенный день ничего не отнимает — завтра появится новый набор.</p></>}
  {tab==='week'&&<>{weekly.map(q=><QuestRow key={q.def.id} q={boardRow(q)} onClaim={()=>claim(p=>claimBoard(p,'week',q.def.id))}/>)}<p className="hint">Недельные цели рассчитаны на несколько спокойных вечеров.</p></>}
  {tab==='story'&&<>{story.map(q=><QuestRow key={q.id} q={q} onClaim={()=>claim(p=>claimStory(p,q.id))}/>)}<p className="hint">Сюжетная цепочка текущего региона: {regions[Math.min(5,regionIndex(p.stage))].name}. Выполнено всего: {storyQuests(p).filter(q=>q.claimed).length}/{storyQuests(p).length}.</p></>}
  {tab==='mastery'&&<>{[...new Set(m.map(v=>v.def.group))].map(group=><section key={group}><h3>{group}</h3>{m.filter(v=>v.def.group===group).map(v=><QuestRow key={v.def.id} q={{text:`${v.def.name} · ступень ${v.claimed}/4`,progress:v.value,goal:v.next,done:v.ready,claimed:v.claimed>=masteryTiers.length,reward:{gems:[10,25,60,150][Math.min(3,v.claimed)],horn:Math.min(4,v.claimed+1)}}} onClaim={()=>claim(p=>claimMastery(p,v.def.id))}/>)}</section>)}<p className="hint">Мастерство копится всю игру и никогда не сбрасывается.</p></>}
 </div>;
}
