import {useState} from 'react';
import type {Player} from '../core/types';
import {useGame} from '../core/store';
import {art,slotNames,rarityColors,rarityNames} from '../data/catalog';
import {uniques} from '../core/gear';
import {perks,setIds,sets,type PerkId,type SetId} from '../saga/gear';
import {squadState} from '../dark/rules';
import {relicLevel,type RelicId} from '../dark/rules';
import {collectionPages,collectionMilestones,claimCollection,gearFound,gearSlots,wingLookList,wingLook,chooseWingLook,companionList,relicList,type CollectionId} from '../saga/collections';
import {rewardText} from '../saga/rewards';
import {soloAction} from '../saga/soloAction';
import {Album} from './SagaPanels';
import {GameTabs} from './CompactGame';
import {Icon,gearIcon} from './Icon';
import {MiniReward} from './MiniReward';
import './collections.css';

type Tab='album'|CollectionId;
const tabs:readonly (readonly [Tab,string])[]=[['album','Персонажи'],['gear','Снаряжение'],['wings','Крылья'],['companions','Спутники'],['relics','Реликвии']];

function Progress({found,total,label}:{found:number;total:number;label:string}){
 return <div className="coll-progress"><span>{label}</span><b>{found}/{total}</b><progress value={found} max={total} aria-label={label}/></div>;
}
function Milestones({p,id}:{p:Player;id:CollectionId}){
 const page=collectionPages(p).find(c=>c.id===id)!;
 const claim=(index:number)=>{let got='';if(soloAction(draft=>{const r=claimCollection(draft,id,index);if(r)got=rewardText(r);return !!r}))useGame.getState().notice('Коллекция: '+got)};
 return <ol className="coll-steps">{collectionMilestones(p,page).map(m=><li key={m.at} className={m.claimed?'claimed':m.reached?'ready':''}>
  <button type="button" disabled={!m.reached||m.claimed} onClick={()=>claim(m.index)} aria-label={`${m.at}% · ${rewardText(m.reward)} · ${m.claimed?'получено':m.reached?'получить':'ещё не собрано'}`}>
   <b>{m.at}%</b><MiniReward reward={m.reward}/><em>{m.claimed?'✓':m.reached?'Забрать':''}</em>
  </button>
 </li>)}</ol>;
}

/** «Коллекция»: everything found so far and what is still ahead, with fill indicators and one-time milestones. */
export function CollectionHub({p}:{p:Player}){
 const [tab,setTab]=useState<Tab>('album');
 const pages=collectionPages(p),found=new Set(gearFound(p)),squad=squadState(p);
 const page=tab==='album'?undefined:pages.find(c=>c.id===tab);
 return <section className="collection-hub">
  <GameTabs label="Коллекции" value={tab} items={tabs} onChange={setTab}/>
  {tab==='album'&&<Album p={p}/>}
  {page&&<><Progress found={page.found} total={page.total} label={page.name}/><Milestones p={p} id={page.id}/></>}
  {tab==='gear'&&<>
   <h3>Именные вещи</h3>
   <div className="coll-grid">
    {Object.entries(uniques).map(([id,u])=><Cell key={id} known={found.has('u:'+id)} icon={gearIcon(u.slot)} name={u.name} note={u.tag} rarity={u.rarity}/>)}
    {(Object.keys(perks) as PerkId[]).map(id=><Cell key={id} known={found.has('p:'+id)} icon={perks[id].icon} name={perks[id].name} note={perks[id].source} rarity={perks[id].rarity}/>)}
   </div>
   {setIds.map((set:SetId)=>{const have=gearSlots.filter(s=>found.has('s:'+set+':'+s)).length;return <details key={set} className={'saga-disclosure coll-set'+(have===gearSlots.length?' complete':'')} open={have>0&&have<gearSlots.length}>
    <summary><Icon name="chest"/><span>{sets[set].name} · {have}/{gearSlots.length}</span></summary>
    <div className="coll-grid coll-slots">{gearSlots.map(s=><Cell key={s} known={found.has('s:'+set+':'+s)} icon={gearIcon(s)} name={slotNames[s]} rarity={2}/>)}</div>
   </details>})}
   <p className="hint">Найденная вещь остаётся в коллекции, даже если её распылить.</p>
  </>}
  {tab==='wings'&&<>
   {!p.equipment.wings&&<p className="hint">Наденьте крылья, чтобы выбрать внешний вид. Открытые обличья сохраняются.</p>}
   <WingLookGallery p={p}/>
   <p className="hint">Внешность не меняет характеристики: сила крыльев растёт отдельно в окне «Крылья».</p>
  </>}
  {tab==='companions'&&<div className="coll-grid">{companionList().map(c=>{const own=squad.owned.includes(c.id);return <div key={c.id} className={`coll-cell${own?'':' locked'}`} style={{'--rarity':rarityColors[Math.min(8,c.rarity+2)]} as React.CSSProperties}>
   <img src={art(c.id)} alt="" style={own?undefined:{filter:'grayscale(1) brightness(.4)'}}/><strong>{c.name}</strong><small>{own?'В отряде':'Призыв или события'}</small>
  </div>})}</div>}
  {tab==='relics'&&<div className="coll-grid">{relicList().map(r=>{const lv=relicLevel(p,r.id as RelicId);return <Cell key={r.id} known={lv>0} icon={r.icon} name={r.name} note={lv>0?'Уровень '+lv:'Ещё не открыта'} rarity={Math.min(8,r.rarity+3)}/>})}</div>}
 </section>;
}
function Cell({known,icon,name,note,rarity}:{known:boolean;icon:string;name:string;note?:string;rarity:number}){
 return <div className={`coll-cell${known?'':' locked'}`} style={{'--rarity':rarityColors[rarity]} as React.CSSProperties} title={known?name:'Ещё не найдено'}>
  <Icon name={icon}/><strong>{known?name:'???'}</strong><small>{known?(note??rarityNames[rarity]):(note??'Ещё не найдено')}</small>
 </div>;
}

/** 2×3 gallery of wing looks: open ones can be worn, locked ones say how to earn them. */
export function WingLookGallery({p}:{p:Player}){
 const look=wingLook(p);
 return <div className="coll-wings">{wingLookList.map(l=>{const open=l.unlocked(p),worn=look.id===l.id&&p.wingVisible;return <button key={l.id} type="button" className={`coll-wing${open?'':' locked'}${worn?' worn':''}`} disabled={!open||!p.equipment.wings} aria-pressed={worn}
    onClick={()=>soloAction(draft=>chooseWingLook(draft,l.id))}>
    <img src={art('ui-wings')} alt="" style={{filter:open?l.filter:'grayscale(1) brightness(.35)'}}/>
    <strong>{l.name}</strong><small>{worn?'Надето':open?'Открыто':l.need}</small>
   </button>})}</div>;
}
