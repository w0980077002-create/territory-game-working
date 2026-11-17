import type {CSSProperties} from 'react';
import './harbor.css';
type Ship={id:string;level:number};
type Destination='shipyard'|'forge'|'inventory'|'blessing'|'companions'|'talents'|'relic'|'realm'|'darkgear'|'gems';
type Props={view:'port'|'shipyard';ships:readonly Ship[];selectedShipId?:string;onNavigate?:(id:Destination)=>void;onChooseShip?:(id:string)=>void};
const berths=[{x:205,y:371,left:'23%'},{x:452,y:373,left:'50%'},{x:698,y:370,left:'77%'}] as const;
function Drakkar({x,y,level,index}:{x:number;y:number;level:number;index:number}){
 const sails=['#a9473a','#bc8735','#53898e'];
 return <g transform={'translate('+x+' '+y+')'}>
  <g className="harbor-bob" style={{animationDelay:(-index*1.2)+'s'} as CSSProperties}>
   <ellipse cy="26" rx="106" ry="12" fill="#092638" opacity=".5"/>
   <path d="M-95-5Q-70 36 0 33Q75 34 95-5L76 10H-76Z" fill="#925237" stroke="#2f282a" strokeWidth="6"/>
   <path d="M-93-6H93" stroke="#e8b86c" strokeWidth="5"/>
   {[-58,-30,0,30,58].map((dx,j)=><g key={j}><circle cx={dx} cy="10" r="12" fill={j%2?'#9bb5b7':'#c36c58'} stroke="#372e2c" strokeWidth="4"/><circle cx={dx} cy="10" r="4" fill="#e6c16c"/></g>)}
   <path d="M-93-7q-23-5-15-33m201 33q20-8 8-34" fill="none" stroke="#76402d" strokeWidth="8" strokeLinecap="round"/>
   <path d="M-5-10V-143" stroke="#402e27" strokeWidth="9" strokeLinecap="round"/>
   <path d="M-3-140Q40-133 69-91L-4-29Z" fill={sails[index%3]} stroke="#34292a" strokeWidth="5"/>
   <path d="m-3-133 60 41-60 45" fill="#f0d49a" opacity=".22"/>
   <path d="M-5-140-79-9m74-131L84-9" stroke="#dbb688" fill="none" strokeWidth="2.6"/>
   <path d="M-5-148h40v15H-5Z" fill="#e2b45c" stroke="#5b382e" strokeWidth="3"/>
   {level>1&&<path d="M-49-94 0-120 54-94" stroke="#f0cb74" strokeWidth="5" fill="none"/>}
   {level>3&&<path d="m-6-81 9-24 9 24-9 15Z" fill="#ffe38b" stroke="#5a3b28" strokeWidth="3"/>}
  </g>
  <path className="harbor-foam" d="M-110 30q24 6 49 0m111 8q24-5 60 0" stroke="#b9efeb" strokeWidth="4" fill="none" strokeLinecap="round"/>
 </g>;
}
/** Shows actual saved ships; empty berths remain empty. No gameplay state is created by the art. */
export function HarborScene({view,ships,selectedShipId,onNavigate,onChooseShip}:Props){
 const yard=view==='shipyard';
 return <section className={'harbor-scene harbor-'+view} aria-label={yard?'Верфь драккаров':'Северная гавань'}>
  {yard&&<svg className="harbor-art" viewBox="0 0 900 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
   <defs>
    <linearGradient id="harborSky" x2="0" y2="1"><stop stopColor="#203e64"/><stop offset=".58" stopColor="#83a3af"/><stop offset="1" stopColor="#d4ab76"/></linearGradient>
    <linearGradient id="harborSea" x2="0" y2="1"><stop stopColor="#69a5b5"/><stop offset=".54" stopColor="#36738a"/><stop offset="1" stopColor="#11384c"/></linearGradient>
    <linearGradient id="harborWood" x2="0" y2="1"><stop stopColor="#c89a61"/><stop offset=".6" stopColor="#785039"/><stop offset="1" stopColor="#422d29"/></linearGradient>
   </defs>
   <rect width="900" height="500" fill="url(#harborSky)"/>
   <circle cx="675" cy="97" r="66" fill="#ffe0a5" opacity=".17"/><circle cx="675" cy="97" r="37" fill="#ffde9a" opacity=".85"/>
   <path d="M0 247 94 120 182 210 275 72 370 207 449 126 548 231 658 102 768 225 843 130 900 214V299H0Z" fill="#52758a"/>
   <path d="m239 119 36-47 40 55-25-10-13 10-18-13Zm392 22 27-39 42 53-34-12-11 7Z" fill="#cbdadc"/>
   <path d="M0 280 100 208 177 257 279 188 396 280 506 220 670 278 815 211 900 269V332H0Z" fill="#325f6a"/>
   <g className="harbor-cloud" fill="#e7e8dc" opacity=".66"><ellipse cx="142" cy="78" rx="78" ry="15"/><ellipse cx="170" cy="68" rx="43" ry="19"/><ellipse cx="560" cy="67" rx="56" ry="13"/></g>
   <path d="M0 279Q124 262 240 278T495 272T900 276V500H0Z" fill="url(#harborSea)"/>
   <g className="harbor-waves" stroke="#b1dfe2" strokeWidth="3" fill="none" opacity=".7"><path d="M0 326q45-9 91 1m150 13q52-10 105 0m65-28q52-7 98 0m133 17q61-10 112 0"/><path d="M25 413q53-8 100-1m145-26q38-6 80 0m171 32q43-7 83 0m123-14q41-6 91 1"/><path d="M95 460q52-8 97 0m170-13q52-5 104 0m183 20q50-6 99-1"/></g>
   <g stroke="#352d2d" strokeWidth="5" strokeLinejoin="round">
    <path d="M5 283V210l46-45 44 45v73Z" fill="#805940"/><path d="m-3 210 54-63 54 63Z" fill="#423939"/>
    <path d="M133 290v-90l70-43 69 43v92Z" fill="#98714f"/><path d="m123 199 80-68 82 68Z" fill="#483937"/>
    <path d="M339 289v-83h116v83Z" fill="#735043"/><path d="m329 207 67-58 73 58Z" fill="#42423e"/>
    <path d="M761 285V170l49-56 47 56v114Z" fill="#98734e"/><path d="m744 170 66-70 62 70Z" fill="#463a35"/>
   </g>
   <g fill="#edba61" stroke="#6e513a" strokeWidth="3"><path d="M31 237h36v43H31Z"/><path d="M183 231h40v58h-40Z"/><path d="M361 229h23v33h-23Z"/><path d="M413 229h23v33h-23Z"/><path d="M785 197h43v32h-43Z"/></g>
   <g stroke="#60442f" strokeWidth="7" fill="none"><path d="M532 286V163m0 0 81 23m-21-5v72"/><path d="m590 251-13 21h26Z" fill="#9e714d"/></g>
   <g fill="url(#harborWood)" stroke="#392b2a" strokeWidth="5"><path d="M0 424 163 379 352 404 272 453 0 500Z"/><path d="M562 444 760 384 900 419V500l-143-30Z"/></g>
   <g stroke="#d9ac72" strokeWidth="4" opacity=".7" fill="none"><path d="m13 428 149-41 181 21m236 34 176-49 141 26"/><path d="m61 422 32 59m55-68 33 48m477-49 37 57m65-71 45 64"/></g>
   <g stroke="#49322c" strokeWidth="9" strokeLinecap="round"><path d="M100 389v102m157-92v92m407-90v89m178-71v75"/></g>
   <g fill="#ffda83"><circle cx="104" cy="372" r="11"/><circle cx="664" cy="379" r="11"/></g>
   {berths.map((b,i)=>ships[i]?<Drakkar key={ships[i].id} x={b.x} y={b.y} level={ships[i].level} index={i}/>:yard?<path key={'berth'+i} d={'M'+(b.x-73)+' '+(b.y+20)+'q73 19 146 0'} fill="none" stroke="#d7b37a" strokeWidth="7" strokeDasharray="14 10" opacity=".65"/>:null)}
   <path d="m40 165 32 12-32 12Zm830 17 25 9-25 10Z" fill="#b74742" stroke="#51372e" strokeWidth="3"/>
  </svg>}
  {!yard&&<><div className="harbor-aurora" aria-hidden="true"/><div className="harbor-smoke" aria-hidden="true"/><div className="harbor-reflections" aria-hidden="true"/><svg className="harbor-live-fleet" viewBox="0 0 900 500" aria-hidden="true">{berths.map((b,i)=>ships[i]?<Drakkar key={ships[i].id} x={b.x} y={b.y} level={ships[i].level} index={i}/>:null)}</svg></>}
  <div className="harbor-title"><small>ᚠ ᚢ ᚦ</small><strong>{yard?'Верфь драккаров':'Северная гавань'}</strong></div>
  {yard?<div className="harbor-boat-buttons">
   {berths.map((b,i)=>ships[i]?<button key={ships[i].id} style={{left:b.left} as CSSProperties} type="button" className={'harbor-boat-pick'+(selectedShipId===ships[i].id?' selected':'')} onClick={()=>onChooseShip?.(ships[i].id)} aria-pressed={selectedShipId===ships[i].id} aria-label={'Выбрать драккар '+(i+1)+', уровень '+ships[i].level}>
     Драккар {i+1}<b>ур. {ships[i].level}</b>
   </button>:<span key={'free'+i} className="harbor-empty" style={{left:b.left} as CSSProperties}>Причал {i+1}</span>)}
  </div>:<nav className="harbor-links" aria-label="Постройки гавани">
   {([['blessing','Благословение',22,15],['talents','Таланты',50,23],['companions','Спутники',49,34],['forge','⚒ Кузница',22,46],['inventory','▣ Рюкзак',78,46],['relic','Реликвии',20,62],['shipyard','⚓ Верфь',77,64],['realm','Царство тьмы',22,85],['darkgear','Тёмная энергия',75,85],['gems','Самоцветы',78,15]] as const).map(([id,label,x,y])=><button key={id} className={'harbor-building harbor-building-'+id} style={{left:x+'%',top:y+'%'}} type="button" onClick={()=>onNavigate?.(id)}>{label}</button>)}
  </nav>}
 </section>;
}
