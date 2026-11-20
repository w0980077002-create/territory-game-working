import {soloResources,type SoloResource} from '../saga/soloEconomy';
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

export const soloIcons:Record<SoloResource,string>={
 soul:'soul',awake:'awake',awakeShard:'awake-shard',scroll:'scroll',monopoly:'ship',
 fortune:'banner',jackpot:'jackpot',wing:'wings',
};
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
  for(const [key,count] of Object.entries(reward.solo??{})){
    if(count)parts.push({key,count,icon:soloIcons[key as SoloResource],name:soloResources[key as SoloResource].name});
  }
  return parts;
}

export function RewardArt({reward, names = false}: {reward: Reward; names?: boolean}) {
  return <span className={`reward-art${names ? ' named' : ''}`}>
    {rewardParts(reward).map(part => <span className="reward-piece" role="img" key={part.key} title={part.name}
      aria-label={`${part.name} × ${part.count}`}>
      <Icon name={part.icon}/><strong>{part.count.toLocaleString('ru')}</strong>
      {names && <small>{part.name}</small>}
    </span>)}
  </span>;
}

export function RewardDetails({reward,extra}:{reward:Reward;extra?:string}){
 return <details className="reward-details">
  <summary aria-label="Состав награды"><RewardArt reward={reward}/>{extra&&<Icon name="chest"/>}</summary>
  <ul>{rewardParts(reward).map(part=><li key={part.key}>{part.name} × {part.count.toLocaleString('ru')}</li>)}{extra&&<li>{extra}</li>}</ul>
 </details>;
}

export function RewardNotice({message,reward}:{message:string;reward?:Reward}){
 const parts=reward&&rewardParts(reward);
 return parts?.length ? <span className="reward-notice">{message}<RewardArt reward={reward!}/></span> : message;
}
