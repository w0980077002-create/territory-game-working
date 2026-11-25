import {useState} from 'react';
import {xpNeeded} from '../core/experience';
import {
 readBrotherhoodAdmin,type BrotherhoodAward,type BrotherhoodPair,type BrotherhoodResources,
 type BrotherhoodRewards,type BrotherhoodStats,
} from '../community/client';

const resourceNames:Record<keyof BrotherhoodResources,string>={
 gold:'Золото',gems:'Самоцветы',horn:'Заряды Рога',chaosite:'Хаосит',
 rune_scrolls:'Рунические свитки',summon_seals:'Печати призыва',relic_shards:'Осколки реликвий',
};
const titles={
 comrade:'Боевой товарищ',leader:'Предводитель',chief:'Вождь братства',
};
const stageLabel=(tier:number)=>'Совместных дней · '+tier;

export function BrotherResources({resources}:{resources:BrotherhoodResources}){
 return <ul className="brother-resources">{(Object.keys(resourceNames) as (keyof BrotherhoodResources)[]).map(key=>{
  const amount=resources[key];
  return amount?<li key={key}>{resourceNames[key]} <strong>{amount}</strong></li>:null;
 })}</ul>;
}

type AwardControls={enabled:boolean;pending:string|null;claim:(id:string)=>void};
export function BrotherAward({award,enabled,pending,claim}:{award:BrotherhoodAward}&AwardControls){
 return <div className="brother-award">
  <BrotherResources resources={award.payload}/>
  {award.received?<span>Получено</span>:<button type="button" className="action secondary"
   disabled={!enabled||pending!==null} onClick={()=>claim(award.id)}>Получить</button>}
 </div>;
}

export function BrotherhoodOath({pair,rewards,...controls}:{pair:BrotherhoodPair;rewards:BrotherhoodRewards}&AwardControls){
 const next=Object.keys(rewards.oath).find(tier=>Number(tier)>pair.days);
 return <div className="brother-oath">
  <h4>Клятва братства</h4>
  <p>{'Совместных дней · '+pair.days+' / 7'}</p>
  <progress max={7} value={pair.days} aria-label="Совместные дни"/>
  <p>Засчитывается день UTC, когда оба подтвердили первую победу над Матриархом, сражались в завершённом бою «Отряд» или «Хаос» либо выполнили задание гильдии мирового босса. Занятия могут различаться, дни могут идти с перерывами.</p>
  {next&&<p>{'Ближайшая награда · '+stageLabel(Number(next))}</p>}
  <ul className="confirmed-referrals">{Object.entries(rewards.oath).map(([tier,payload])=>{
   const award=pair.awards.find(item=>item.kind==='oath'&&item.tier===Number(tier));
   return <li key={tier}>
    <strong>{stageLabel(Number(tier))}</strong>
    {award?<BrotherAward award={award} {...controls}/>:<BrotherResources resources={payload}/>}
   </li>;
  })}</ul>
 </div>;
}

export function BrotherhoodLevels({pair,rewards,...controls}:{pair:BrotherhoodPair;rewards:BrotherhoodRewards}&AwardControls){
 const level=pair.verifiedLevel??0;
 const next=Object.keys(rewards.level).find(tier=>Number(tier)>level);
 return <details className="saga-disclosure">
  <summary>Развитие героя</summary>
  <p>{level?'Подтверждённый уровень · '+level:'Победы в кампании ожидают подтверждения.'}</p>
  {level>0&&<label>{'Подтверждённый опыт · '+(pair.verifiedXp??0)+' / '+xpNeeded(level)}
   <progress value={pair.verifiedXp??0} max={xpNeeded(level)}/>
  </label>}
  {next&&<p>{'Ближайшая награда · уровень '+next}</p>}
  <ul className="confirmed-referrals">{Object.entries(rewards.level).map(([tier,payload])=>{
   const award=pair.awards.find(item=>item.kind==='level'&&item.tier===Number(tier));
   return <li key={tier}><strong>{'Уровень '+tier}</strong>
    {award?<BrotherAward award={award} {...controls}/>:<BrotherResources resources={payload}/>}
   </li>;
  })}</ul>
 </details>;
}

export function BrotherhoodMilestones({rewards,qualified,awards,...controls}:{
 rewards:BrotherhoodRewards;qualified:number;awards:BrotherhoodAward[];
}&AwardControls){
 return <details className="saga-disclosure">
  <summary>Легенда братства</summary>
  <p>{'Друзей с подтверждённым 20-м уровнем · '+qualified}</p>
  <ul className="confirmed-referrals">{Object.entries(rewards.legend).map(([tier,entry])=>{
   const award=awards.find(item=>item.tier===Number(tier));
   return <li key={tier}>
    <strong>{titles[entry.title]}</strong><span>{'Друзей 20-го уровня · '+tier}</span>
    {award?<BrotherAward award={award} {...controls}/>:<BrotherResources resources={entry.resources}/>}
    {entry.honor&&<span>{award?.received?'Почётное звание получено':'Почётное звание'}</span>}
   </li>;
  })}</ul>
 </details>;
}

export function BrotherhoodAdmin(){
 const [data,setData]=useState<BrotherhoodStats>();
 const [busy,setBusy]=useState(false);
 const [failed,setFailed]=useState(false);
 async function load(enabled?:boolean){
  setBusy(true);
  setFailed(false);
  try{setData(await readBrotherhoodAdmin(enabled));}
  catch{setFailed(true);}
  finally{setBusy(false);}
 }
 return <section className="brother-card" aria-label="Статистика Боевого братства">
  <h3>Боевое братство</h3>
  <button type="button" className="action secondary" disabled={busy} onClick={()=>void load()}>Обновить статистику братства</button>
  {failed&&<p role="status">Статистика братства недоступна.</p>}
  {data&&<>
   <p>{'Приглашено · '+data.invited+' · Активных друзей · '+data.active}</p>
   <p>{data.enabled?'Выдача включена':'Выдача приостановлена'}</p>
   <button type="button" className="action secondary" disabled={busy} onClick={()=>void load(!data.enabled)}>
    {data.enabled?'Приостановить выдачу':'Возобновить выдачу'}
   </button>
   <h4>Достигнутые ступени</h4>
   <ul className="brother-stats">{Object.entries(data.tiers).map(([key,total])=>
    <li key={key}>{key.startsWith('welcome:')?'Дар братства':key.startsWith('level:')?'Уровень '+key.split(':')[1]:
     key.startsWith('legend:')?'Легенда братства · '+key.split(':')[1]:stageLabel(Number(key.split(':')[1]))} · {total}</li>
   )}</ul>
   <h4>Начисленные ресурсы</h4>
   <BrotherResources resources={data.issued}/>
   <h4>Отклонённые операции</h4>
   <ul className="brother-stats">
    <li>Самоприглашения · {data.rejections.self_referral??0}</li>
    <li>Недоступные награды · {data.rejections.foreign_or_unknown_award??0}</li>
   </ul>
  </>}
 </section>;
}
