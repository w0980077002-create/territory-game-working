import type {ReactNode} from 'react';
import {Icon} from './Icon';
import './compactGame.css';

export function GameTiles({children,columns=3}:{children:ReactNode;columns?:2|3|4|5}){
 return <div className={'game-tiles columns-'+columns}>{children}</div>;
}
export function GameTile({label,icon,picture,value,onClick,active,ready,locked}:{label:string;icon?:string;picture?:string;value?:ReactNode;onClick:()=>void;active?:boolean;ready?:boolean;locked?:boolean}){
 return <button type="button" className="game-tile" data-locked={locked||undefined} aria-pressed={active} onClick={onClick}>
  {picture?<img src={picture} alt=""/>:icon&&<Icon name={icon}/>}
  <strong>{label}</strong>{value!==undefined&&<small>{value}</small>}{ready&&<i aria-label="Доступна награда"/>}
 </button>;
}
export function GameTabs<T extends string>({value,items,onChange,label}:{value:T;items:readonly (readonly [T,string])[];onChange:(tab:T)=>void;label:string}){
 return <div className="tabs compact-tabs" role="group" aria-label={label}>{items.map(([id,name])=><button type="button" className={value===id?'selected':''} key={id} aria-pressed={value===id} onClick={()=>onChange(id)}>{name}</button>)}</div>;
}
