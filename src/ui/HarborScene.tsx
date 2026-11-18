import type {CSSProperties} from 'react';
import {Icon} from './Icon';
import './harbor.css';

type Ship = {id: string; level: number};
const buildings = [
  {id:'blessing',label:'Благословение',icon:'crown',x:17,y:18,color:'gold'},
  {id:'talents',label:'Таланты',icon:'skill',x:50,y:31,color:'gold'},
  {id:'realm',label:'Царство тьмы',icon:'portal',x:82,y:21,color:'violet'},
  {id:'forge',label:'Кузница',icon:'hammer',x:23,y:47,color:'copper'},
  {id:'inventory',label:'Рюкзак',icon:'chest',x:77,y:44,color:'gold'},
  {id:'companions',label:'Спутники',icon:'companion',x:16,y:32,color:'gold'},
  {id:'relic',label:'Реликвии',icon:'relic-shard',x:23,y:67,color:'violet'},
  {id:'shipyard',label:'Верфь',icon:'ship',x:70,y:70,color:'copper'},
  {id:'darkgear',label:'Тёмная энергия',icon:'essence',x:16,y:82,color:'violet'},
  {id:'gems',label:'Камни',icon:'gem',x:85,y:56,color:'teal'},
] as const;
type Destination = typeof buildings[number]['id'];
type Props = {
  view: 'port' | 'shipyard';
  ships: readonly Ship[];
  selectedShipId?: string;
  onNavigate?: (id: Destination) => void;
  onChooseShip?: (id: string) => void;
};

export function HarborScene({view,ships,selectedShipId,onNavigate,onChooseShip}: Props) {
  const yard = view === 'shipyard';
  return <section className={'harbor-scene harbor-' + view} aria-label={yard ? 'Верфь драккаров' : 'Карта Северной гавани'}>
    <div className="harbor-reflections" aria-hidden="true"/>
    {yard ? <div className="harbor-berths">
      {[0,1,2].map(index => {
        const ship = ships[index];
        return ship ? <button key={ship.id} className="harbor-boat-pick" type="button"
          aria-pressed={selectedShipId === ship.id}
          aria-label={'Выбрать драккар ' + (index + 1) + ', уровень ' + ship.level}
          onClick={() => onChooseShip?.(ship.id)}>
          <Icon name="ship" className="harbor-bob"/>
          <span>Драккар {index + 1}<b>ур. {ship.level}</b></span>
        </button> : <div key={index} className="harbor-empty"><span>Причал {index + 1}</span></div>;
      })}
    </div> : <>
      <div className="harbor-aurora" aria-hidden="true"/>
      <div className="harbor-forge-light" aria-hidden="true"/>
      <div className="harbor-smoke" aria-hidden="true"><i/><i/></div>
      <div className="harbor-live-fleet" aria-hidden="true">
        {ships.slice(0,3).map((ship,index) => <Icon key={ship.id} name="ship" className={'harbor-bob vessel-'+index}/>)}
      </div>
      <nav className="harbor-links" aria-label="Постройки гавани">
        {buildings.map(({id,label,icon,x,y,color}) => <button key={id} type="button"
          className={'harbor-building sign-' + color} style={{left:x+'%',top:y+'%'} as CSSProperties}
          onClick={() => onNavigate?.(id)}>
          <span><Icon name={icon}/>{label}</span>
        </button>)}
      </nav>
    </>}
  </section>;
}
