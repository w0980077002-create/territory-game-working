import {useState} from 'react';
import {stageLabel, stats} from '../core/formulas';
import {useGame} from '../core/store';
import type {Player, Stats} from '../core/types';
import {art} from '../data/catalog';
import {honorConditions, honorRank, honorRanks} from '../saga/honor';
import {Icon} from './Icon';
import {DialogShell} from './SagaUI';
import './honor.css';

const format = new Intl.NumberFormat('ru-RU');
const number = (value: number) => format.format(value);
const attributes = [
  {key:'attack', label:'Атака', icon:'axe'},
  {key:'hp', label:'Здоровье', icon:'heart'},
  {key:'defense', label:'Защита', icon:'shield'},
] as const;

function Crest({rank}: {rank: number}) {
  return <img className="honor-crest" src={art(`honor/crest-${rank}`)} alt="" draggable={false}/>;
}

export function HonorEntry({p, onOpen}: {p: Player; onOpen: () => void}) {
  const rank = honorRank(p);
  return <button type="button" className="honor-entry" onClick={onOpen}>
    <Crest rank={rank}/>
    <span><strong>Почётные звания</strong><small>{honorRanks[rank].name}</small></span>
    <b aria-hidden="true">›</b>
  </button>;
}

function RankCard({rank, next = false}: {rank: number; next?: boolean}) {
  const {name, numeral} = honorRanks[rank];
  return <div className={`honor-banner${next ? ' honor-banner-next' : ''}`}>
    <span>{next ? 'Следующее звание' : 'Текущее звание'}</span>
    <Crest rank={rank}/>
    <strong>{numeral && <b>{numeral} · </b>}{name}</strong>
  </div>;
}

function Comparison({current, after, rank}: {current: Stats; after?: Stats; rank: number}) {
  const {bonuses} = honorRanks[rank];
  return <table className="honor-stats" aria-label="Боевые характеристики">
    <thead><tr><th scope="col">Характеристика</th><th scope="col">Сейчас</th><th scope="col">{after ? 'После повышения' : 'Бонус звания'}</th></tr></thead>
    <tbody>{attributes.map(({key, label, icon}) => <tr key={key}>
      <th scope="row"><span><Icon name={icon}/>{label}</span></th>
      <td>{number(current[key])}</td>
      <td className="honor-stat-gain">{after ? <><strong>{number(after[key])}</strong><small>+{number(after[key] - current[key])}</small></> : <strong>+{number(bonuses[key])}%</strong>}</td>
    </tr>)}</tbody>
  </table>;
}

export function HonorPanel({p, onBack}: {p: Player; onBack: () => void}) {
  const claim = useGame(s => s.claimHonor);
  const [received, setReceived] = useState(false);
  const rank = honorRank(p);
  const next = received ? undefined : honorRanks[rank + 1];
  const conditions = next && honorConditions(p, next);
  const requirements = next && conditions && [
    {id:'stage', icon:'map', label:`Победить босса этапа ${stageLabel(next.stage)}`, progress:p.stage > 1 ? `${stageLabel(p.stage - 1)} / ${stageLabel(next.stage)}` : `— / ${stageLabel(next.stage)}`, done:conditions.stage},
    {id:'level', icon:'medal', label:'Уровень героя', progress:`${number(p.level)} / ${number(next.level)}`, done:conditions.level},
    {id:'gold', icon:'coins', label:'Золото для повышения', progress:`${number(p.gold)} / ${number(next.gold)}`, done:conditions.gold},
  ];

  const footer = (next && requirements || received) && <footer className="modal-footer honor-footer">
    {next && requirements ?
      <button type="button" className="action honor-claim" disabled={!requirements.every(req => req.done)} onClick={() => {
        if (claim(rank + 1)) setReceived(true);
      }}>Получить звание · {number(next.gold)} золота</button> :
      <button type="button" className="action honor-claim" onClick={onBack}>Готово</button>}
  </footer>;

  return <DialogShell panel="honor" title="Почётные звания" onBack={onBack} backLabel="К герою" footer={footer}>
    <section className="honor-panel">
      <div className="honor-banners">
        <RankCard rank={rank}/>
        {next && <RankCard rank={rank + 1} next/>}
      </div>
      <Comparison current={stats(p)} after={next && stats(p, rank + 1)} rank={rank}/>
      {requirements ? <>
        <h3 className="honor-requirement-title">Условия повышения</h3>
        <ul className="honor-requirements">{requirements.map(({id, icon, label, progress, done}) =>
          <li key={id} data-done={done}>
            <Icon name={icon}/>
            <div><strong>{label}</strong><small>{progress}</small></div>
            <span className="honor-condition-mark" aria-label={done ? 'Выполнено' : 'В процессе'}>{done ? '✓' : '·'}</span>
          </li>
        )}</ul>
      </> : <p className="honor-receipt" role="status">{received ? `Звание «${honorRanks[rank].name}» получено` : 'Высшее почётное звание достигнуто'}</p>}
    </section>
  </DialogShell>;
}
