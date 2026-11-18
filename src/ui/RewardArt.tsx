import {resources,type ResId} from '../dark/rules';
import {materials} from '../saga/gear';
import type {Reward} from '../saga/rewards';
import {Icon} from './Icon';

const currencies = [
  ['gold','coins','Золото'],
  ['gems','gem','Самоцветы'],
  ['horn','horn','Заряды Рога'],
  ['chaosite','rune','Хаосит'],
  ['tokens','medal','Жетоны Арены'],
  ['xp','star','Опыт'],
] as const;

export const materialIcon = (id: string) => id === 'dusk' ? 'dusk-stone' : `mat-${id}`;

export function rewardParts(reward: Reward) {
  const parts = currencies.flatMap(([key, icon, name]) =>
    reward[key] ? [{key: String(key), icon: String(icon), name: String(name), count: reward[key]}] : []);
  for (const [key, count] of Object.entries(reward.res ?? {})) {
    const resource = resources[key as ResId];
    if (resource && count) parts.push({key, count, icon:resource.icon, name:resource.name});
  }
  for (const [key, count] of Object.entries(reward.mats ?? {})) {
    if (materials[key] && count) parts.push({key, count, icon:materialIcon(key), name:materials[key].name});
  }
  return parts;
}

export function RewardArt({reward, names = false}: {reward: Reward; names?: boolean}) {
  return <span className={`reward-art${names ? ' named' : ''}`}>
    {rewardParts(reward).map(part => <span className="reward-piece" key={part.key} title={part.name}
      aria-label={`${part.name} × ${part.count}`}>
      <Icon name={part.icon}/><strong>{part.count.toLocaleString('ru')}</strong>
      {names && <small>{part.name}</small>}
    </span>)}
  </span>;
}
