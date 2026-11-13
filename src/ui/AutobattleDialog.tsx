import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useGame} from '../core/store';
import './autobattle.css';

/** The approved combat-settings screen, modelled on the owner's in-game reference.
 * All visible controls are functional; existing premium currencies and inventory are untouched.
 */
export function AutobattleDialog(){
 const g=useGame();
 const [speed,setSpeed]=useState<1|2>(g.speed===2?2:1);
 const [auto,setAuto]=useState(g.auto);
 const [stopOnDeath,setStopOnDeath]=useState(g.stopOnDeath);
 const [continueOnVictory,setContinueOnVictory]=useState(g.continueOnVictory);
 const saveRef=useRef<HTMLButtonElement>(null);
 const close=()=>g.open(null);
 const save=()=>{g.configure({speed,auto,stopOnDeath,continueOnVictory});g.open(null)};
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  const viewport=document.querySelector<HTMLElement>('.viewport');
  if(viewport)viewport.inert=true;
  saveRef.current?.focus({preventScroll:true});
  return()=>{if(viewport)viewport.inert=false;previous?.focus({preventScroll:true})};
 },[]);
 return createPortal(
  <div className="autobattle-shade" onMouseDown={e=>{if(e.target===e.currentTarget)close()}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();close()}}}>
   <section className="autobattle-dialog" role="dialog" aria-modal="true" aria-labelledby="autobattle-title">
    <header className="autobattle-heading">
     <h2 id="autobattle-title">Автобой</h2>
     <button className="autobattle-close" onClick={close} aria-label="Закрыть без сохранения">✕</button>
    </header>
    <div className="autobattle-body">
     <div className="autobattle-options">
      <div className="autobattle-settings">
       <label className="autobattle-speed">
        <span>Скорость боя</span>
        <select value={speed} onChange={e=>setSpeed(Number(e.target.value)===2?2:1)} aria-label="Скорость боя">
         <option value={1}>×1</option><option value={2}>×2</option>
        </select>
       </label>
       <label className="autobattle-check">
        <input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/>
        <span className="autobattle-square" aria-hidden="true">{auto?'✔':''}</span>
        <span>Автобой навыков</span>
       </label>
       <label className="autobattle-check">
        <input type="checkbox" checked={stopOnDeath} onChange={e=>setStopOnDeath(e.target.checked)}/>
        <span className="autobattle-square" aria-hidden="true">{stopOnDeath?'✔':''}</span>
        <span>Остановить при смерти</span>
       </label>
       <label className="autobattle-check">
        <input type="checkbox" checked={continueOnVictory} onChange={e=>setContinueOnVictory(e.target.checked)}/>
        <span className="autobattle-square" aria-hidden="true">{continueOnVictory?'✔':''}</span>
        <span>Авто-переход после победы</span>
       </label>
      </div>
      <aside className="autobattle-rules">
       <strong>Условия боя</strong>
       <p>Главы проходятся без расхода специальных камней.</p>
       <p>Опыт и награды начисляются за реальные победы.</p>
       <p>После поражения повторяется <b>тот же этап</b>.</p>
      </aside>
     </div>
     <button ref={saveRef} className="autobattle-save" onClick={save}>Сохранить</button>
     <p className="autobattle-footer-note">Экипировка сохраняется в рюкзаке · автоматический разбор выключен</p>
    </div>
   </section>
  </div>,
  document.body
 );
}
