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
  {key:'attack', label:'Атака', icon:'stat-attack'},
  {key:'hp', label:'Здоровье', icon:'stat-health'},
  {key:'defense', label:'Защита', icon:'stat-defense'},
] as const;

function Crest({rank}: {rank: number}) {
  return <img className="honor-crest" src={art(`honor/crest-${rank}`)} alt="" draggable={false}/>;
}

function RankCard({rank, next = false}: {rank: number; next?: boolean}) {
  const {name, numeral} = honorRanks[rank];
  return <div className={`honor-banner${next ? ' honor-banner-next' : ''}`}>
    <Crest rank={rank}/>
    <div><span>{next ? 'Следующее' : 'Текущее'}</span><strong>{numeral && <b>{numeral} · </b>}{name}</strong></div>
  </div>;
}

function Comparison({current, after, rank}: {current: Stats; after?: Stats; rank: number}) {
  const {bonuses} = honorRanks[rank];
  return <table className="honor-stats" aria-label="Боевые характеристики">
    <thead><tr><th scope="col">Характеристика</th><th scope="col">Сейчас</th><th scope="col">{after ? 'После' : 'Бонус звания'}</th></tr></thead>
    <tbody>{attributes.map(({key, label, icon}) => <tr key={key}>
      <th scope="row"><span><Icon name={icon}/>{label}</span></th>
      <td>{number(current[key])}</td>
      <td className="honor-stat-gain">{after ? <><strong>{number(after[key])}</strong><small>+{number(after[key] - current[key])}</small></> : <strong>+{number(bonuses[key])}%</strong>}</td>
    </tr>)}</tbody>
  </table>;
}

export function HonorPanel({p, onClose}: {p: Player; onClose: () => void}) {
  const claim = useGame(s => s.claimHonor);
  const [received, setReceived] = useState(false);
  const rank = honorRank(p);
  const next = received ? undefined : honorRanks[rank + 1];
  const conditions = next && honorConditions(p, next);
  const requirements = next && conditions && [
    {id:'stage', icon:'map', label:'Победа над боссом', value:p.stage - 1, target:next.stage, progress:`${p.stage > 1 ? stageLabel(p.stage - 1) : '—'} / ${stageLabel(next.stage)}`, done:conditions.stage},
    {id:'level', icon:'medal', label:'Уровень героя', value:p.level, target:next.level, progress:`${number(p.level)} / ${number(next.level)}`, done:conditions.level},
    {id:'gold', icon:'coins', label:'Золото', value:p.gold, target:next.gold, progress:`${number(p.gold)} / ${number(next.gold)}`, done:conditions.gold},
  ];

  const footer = (requirements || received) && <footer className="honor-footer">
    {next && requirements ?
      <button type="button" className="action honor-claim" disabled={!requirements.every(req => req.done)} onClick={() => {
        if (claim(rank + 1)) setReceived(true);
      }}>Получить звание · {number(next.gold)} золота</button> :
      <button type="button" className="action honor-claim" onClick={onClose}>Готово</button>}
  </footer>;

  return <DialogShell panel="honor" title="Почётные звания" footer={footer}>
    <section className="honor-panel">
      <div className="honor-banners">
        <RankCard rank={rank}/>
        {next && <RankCard rank={rank + 1} next/>}
      </div>
      <Comparison current={stats(p)} after={next && stats(p, rank + 1)} rank={rank}/>
      {requirements ? <>
        <h3 className="honor-requirement-title">Условия повышения</h3>
        <ul className="honor-requirements">{requirements.map(({id, icon, label, value, target, progress, done}) =>
          <li key={id} data-done={done}>
            <Icon name={icon}/>
            <strong>{label}</strong>
            <small>{progress}</small>
            <progress aria-label={label} aria-valuetext={progress} value={Math.min(value,target)} max={target}/>
            <span className="honor-condition-mark">{done ? '✓ Выполнено' : 'В процессе'}</span>
          </li>
        )}</ul>
      </> : <p className="honor-receipt" role="status">{received ? `Звание «${honorRanks[rank].name}» получено` : 'Высшее почётное звание достигнуто'}</p>}
    </section>
  </DialogShell>;
}
