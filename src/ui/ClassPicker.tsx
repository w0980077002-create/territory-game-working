import {useState} from 'react';
import {useGame} from '../core/store';
import {classNames,heroArt,art} from '../data/catalog';
import type {HeroClass,Player} from '../core/types';
import './classPicker.css';

/** Bonuses mirror src/core/formulas.ts stats(); attack style mirrors src/game/Battle.ts. */
const classInfo:Record<HeroClass,{style:string;bonus:string}>={
 berserker:{style:'Ближний бой мечом',bonus:'+25% здоровья · +10% вампиризма'},
 ranger:{style:'Стрелы издалека',bonus:'+15% крита · +20% скорости атаки'},
 runologist:{style:'Ледяные руны издалека',bonus:'+30% урона навыков'},
};
const order:HeroClass[]=['berserker','ranger','runologist'];

/** Uses the existing setClass only: it changes p.heroClass and nothing else. */
export function ClassPicker({p}:{p:Player}){
 const setClass=useGame(s=>s.setClass);
 const [open,setOpen]=useState(false);
 return <section className="class-picker" aria-label="Персонаж">
  <button type="button" className="class-toggle" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
   <img src={art(heroArt[p.heroClass])} alt="" aria-hidden="true" draggable={false}/>
   <span><small>Персонаж · {classNames[p.heroClass]}</small><strong>{open?'Скрыть выбор':'Сменить персонажа'}</strong></span>
   <b aria-hidden="true">{open?'▴':'▾'}</b>
  </button>
  {open&&<>
   <div className="class-cards" role="group" aria-label="Выбор класса">
    {order.map(c=>{const current=p.heroClass===c;return <button key={c} type="button" className={current?'class-card current':'class-card'} aria-pressed={current} onClick={()=>{if(!current)setClass(c)}}>
     <img src={art(heroArt[c])} alt="" aria-hidden="true" draggable={false}/>
     <strong>{classNames[c]}</strong>
     <small>{classInfo[c].style}</small>
     <em>{classInfo[c].bonus}</em>
     <i>{current?'✓ Выбран':'Выбрать'}</i>
    </button>})}
   </div>
   <p className="class-note">Бесплатно, в любой момент. Уровень, снаряжение, рюкзак, валюта, таланты и навыки сохраняются. Меняются облик, способ атаки и бонус класса.</p>
  </>}
 </section>;
}
