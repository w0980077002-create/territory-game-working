import {rarityColors,rarityNames} from '../data/catalog';
import {dropRarityOdds} from '../saga/blessingOdds';
import './blessingOdds.css';

const pct=(v:number)=>(v*100).toLocaleString('ru',{maximumFractionDigits:v<.01?2:1})+'%';
/** Real drop rarity distribution now and after the next blessing level, as coloured bars. */
export function BlessingOdds({level,canImprove}:{level:number;canImprove:boolean}){
 const now=dropRarityOdds(level),next=dropRarityOdds(level+1),max=Math.max(...now,...next);
 return <section className="blessing-odds" aria-label="Шансы редкости добычи">
  <h4>Редкость случайной добычи</h4>
  <ul>{now.map((v,i)=><li key={i} style={{'--rarity':rarityColors[i]} as React.CSSProperties}>
   <span>{rarityNames[i]}</span>
   <i aria-hidden="true"><b style={{width:Math.max(1.5,v/max*100)+'%'}}/></i>
   <em>{pct(v)}{canImprove&&next[i]!==v&&<small className={next[i]>v?'up':'down'}> → {pct(next[i])}</small>}</em>
  </li>)}</ul>
 </section>;
}
