import {useEffect} from 'react';
import {useGame} from '../core/store';
import {battle} from '../game/Battle';
import {hasFlag,setFlag} from '../saga/save';
import {CardDialog} from './SagaUI';

/** A one-time, persistent end of the six-region story, not a second reward. */
export function StoryFinale(){
 const g=useGame();
 // The story ended in a committed boss victory; do not let auto-battle silently
 // begin the first legendary stage while the conclusion is being read.
 useEffect(()=>{battle?.pause()},[]);
 const acknowledge=()=>{
  if(!g.mutate(p=>{
   if(hasFlag(p,'story:done')&&!hasFlag(p,'story:finale-seen'))
    setFlag(p,'story:finale-seen');
  },true))g.notice('Не удалось сохранить завершение саги · попробуйте снова');
 };
 return <CardDialog className="story-finale" title="Сага Севера завершена" onClose={acknowledge}>
  <div className="panel-intro">
   <span aria-hidden="true">✦</span>
   <div><h3>Шесть регионов освобождены</h3>
    <p>Все 60 этапов пройдены. Последний владыка повержен, а награды за победу уже сохранены в вашем герое.</p>
   </div>
  </div>
  <p>Основная история завершена. Впереди <strong>Легенда I</strong> — новый круг тех же регионов с возрастающей угрозой. Герой, экипировка и достижения остаются с вами.</p>
  <button type="button" className="action" onClick={acknowledge}>К Легенде I</button>
 </CardDialog>;
}
