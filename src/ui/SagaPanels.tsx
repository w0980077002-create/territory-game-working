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
