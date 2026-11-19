import {useId} from 'react';

/** Original vector art for the carnival: points token, festive tent medal, bunting and fireworks. */

export function CarnivalToken({className = ''}: {className?: string}) {
  const id = useId().replace(/:/g, '');
  return <svg className={'carnival-token ' + className} viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="33" r="28" fill="#5a2a14"/>
    <circle cx="32" cy="31" r="27" fill={`url(#${id}r)`}/>
    <circle cx="32" cy="31" r="20" fill={`url(#${id}c)`} stroke="#7a3a12" strokeWidth="2"/>
    <path d="M32 13l4.6 10.4 11.4 1.2-8.5 7.6 2.4 11.2L32 37.7l-9.9 5.7 2.4-11.2-8.5-7.6 11.4-1.2Z" fill="#fff4c4" stroke="#b8501b" strokeWidth="2.2" strokeLinejoin="round"/>
    <circle cx="32" cy="30" r="4.2" fill="#e8413a"/>
    <path d="M14 18q3-6 9-8" stroke="#fff9dd" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".75"/>
    <defs>
      <linearGradient id={id + 'r'} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe47a"/><stop offset=".55" stopColor="#f2a52c"/><stop offset="1" stopColor="#b9621a"/></linearGradient>
      <radialGradient id={id + 'c'} cx=".4" cy=".3"><stop offset="0" stopColor="#ff9b5c"/><stop offset=".7" stopColor="#d9442e"/><stop offset="1" stopColor="#9d2424"/></radialGradient>
    </defs>
  </svg>;
}

/** Striped Viking festival tent with a raven pennant: the carnival button medal. */
export function CarnivalTent({className = ''}: {className?: string}) {
  return <svg className={'carnival-tent ' + className} viewBox="0 0 96 96" aria-hidden="true">
    <path d="M48 6v14" stroke="#4a2b1a" strokeWidth="3.5"/>
    <path d="M49 6l20 6-20 6Z" fill="#2fb5c9" stroke="#123c47" strokeWidth="2.4" strokeLinejoin="round"/>
    <path d="M13 58Q30 40 48 18Q66 40 83 58Z" fill="#ffd34f" stroke="#40210f" strokeWidth="3.5" strokeLinejoin="round"/>
    <path d="M48 18Q42 40 34 58H22Q36 40 48 18ZM48 18Q54 40 62 58H74Q60 40 48 18Z" fill="#e5393d"/>
    <path d="M13 58Q30 40 48 18Q66 40 83 58" fill="none" stroke="#40210f" strokeWidth="3.5" strokeLinejoin="round"/>
    <path d="M17 57h62v29H17Z" fill="#c9372f" stroke="#40210f" strokeWidth="3.5" strokeLinejoin="round"/>
    <path d="M30 57v29M48 57v29M66 57v29" stroke="#ffd34f" strokeWidth="7"/>
    <path d="M17 57h62v29H17Z" fill="none" stroke="#40210f" strokeWidth="3.5" strokeLinejoin="round"/>
    <path d="M39 86V71q9-10 18 0v15Z" fill="#3a1d16" stroke="#40210f" strokeWidth="3"/>
    <path d="M14 58q7 8 14 0 7 8 13 0 7 8 14 0 7 8 13 0 7 8 14 0" fill="#ffe991" stroke="#40210f" strokeWidth="3" strokeLinejoin="round"/>
    <circle cx="48" cy="18" r="4" fill="#fff3b0" stroke="#40210f" strokeWidth="2.4"/>
  </svg>;
}

const flagColors = ['#e8413a', '#ffcd3c', '#2fb5c9', '#8c5ad8', '#5bc457'];
/** Swagged garland of pennants; purely decorative. */
export function Bunting({flags = 13, sag = 16, className = ''}: {flags?: number; sag?: number; className?: string}) {
  const w = 320, step = w / flags;
  const y = (x: number) => 4 + sag * Math.sin(Math.PI * x / w);
  return <svg className={'carnival-bunting ' + className} viewBox={`0 0 ${w} ${sag + 26}`} preserveAspectRatio="none" aria-hidden="true">
    <path d={`M0 4Q${w / 2} ${4 + sag * 2} ${w} 4`} fill="none" stroke="#3b2214" strokeWidth="2"/>
    {Array.from({length: flags}, (_, i) => {
      const x = i * step + step * .12, x2 = x + step * .76, mid = (x + x2) / 2;
      return <path key={i} d={`M${x} ${y(x)}L${x2} ${y(x2)}L${mid} ${y(mid) + 17}Z`} fill={flagColors[i % flagColors.length]} stroke="#3b2214" strokeWidth="1.4" strokeLinejoin="round"/>;
    })}
  </svg>;
}

export function Firework({color, className = ''}: {color: string; className?: string}) {
  return <svg className={'carnival-firework ' + className} viewBox="0 0 60 60" aria-hidden="true">
    {Array.from({length: 12}, (_, i) => {
      const a = i * Math.PI / 6, r1 = 8, r2 = i % 2 ? 22 : 27;
      return <path key={i} d={`M${30 + Math.cos(a) * r1} ${30 + Math.sin(a) * r1}L${30 + Math.cos(a) * r2} ${30 + Math.sin(a) * r2}`} stroke={color} strokeWidth="2.6" strokeLinecap="round"/>;
    })}
    <circle cx="30" cy="30" r="3.5" fill="#fff7d6"/>
  </svg>;
}
