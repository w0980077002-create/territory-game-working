import {useState} from 'react';
import {useGame} from '../core/store';
import {DialogShell} from './SagaUI';
import './autobattle.css';

/** Draft settings commit together; closing still discards unsaved changes. */
export function AutobattleDialog(){
 const g=useGame();
 const [speed,setSpeed]=useState<1|2>(g.speed===2?2:1),[auto,setAuto]=useState(g.auto),[stopOnDeath,setStopOnDeath]=useState(g.stopOnDeath),[continueOnVictory,setContinueOnVictory]=useState(g.continueOnVictory),[autoSalvageWeaker,setAutoSalvageWeaker]=useState(g.autoSalvageWeaker);
 const save=()=>{g.configure({speed,auto,stopOnDeath,continueOnVictory,autoSalvageWeaker});g.open(null)};
 return <DialogShell panel="autobattle" title="Автобой" footer={<footer className="modal-footer autobattle-actions"><button className="action secondary" onClick={()=>g.open(null)}>Отмена</button><button className="action" onClick={save}>Сохранить</button></footer>}>
  <div className="autobattle-speed"><strong>Скорость боя</strong><div role="group" aria-label="Скорость боя">{([1,2] as const).map(n=><button key={n} aria-pressed={speed===n} onClick={()=>setSpeed(n)}>×{n}</button>)}</div></div>
  <div className="autobattle-settings">{[
   {label:'Автобой навыков',value:auto,set:setAuto},
   {label:'Остановить при смерти',value:stopOnDeath,set:setStopOnDeath},
   {label:'Авто-переход после победы',value:continueOnVictory,set:setContinueOnVictory},
   {label:'Разбирать вещи слабее надетых',value:autoSalvageWeaker,set:setAutoSalvageWeaker}
  ].map(o=><label className="autobattle-check" key={o.label}><input type="checkbox" checked={o.value} onChange={e=>o.set(e.target.checked)}/><span>{o.label}</span></label>)}</div>
  <p className="autobattle-note">{autoSalvageWeaker?'Слабые обычные находки → золото и опыт. Редкие, именные, комплектные и защищённые вещи сохраняются.':'Авторазбор выключен. Новые вещи сохраняются в рюкзаке.'}</p>
  <details className="saga-disclosure"><summary>Условия боя</summary><p>Главы проходятся без специальных камней. Опыт и награды начисляются за реальные победы. После поражения повторяется тот же этап.</p></details>
 </DialogShell>;
}
