import {CompactFilter} from './CompactFilter';
import {useState} from 'react';
import {carnivalNow} from '../core/profile';
import {useGame} from '../core/store';
import type {Player, Slot} from '../core/types';
import {rarityColors, rarityNames, slotNames} from '../data/catalog';
import {sets} from '../saga/gear';
import {mailbox} from '../saga/mail';
import {Icon, gearIcon} from './Icon';
import {RewardArt} from './RewardArt';
import {CardDialog, DialogShell} from './SagaUI';
import './mail.css';

const dateFormat = new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'});
const monthFormat = new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'});

export function MailPanel({p}: {p:Player}) {
  const action = useGame(state => state.mailAction);
  const [selected,setSelected] = useState<string>();
  const [slot,setSlot] = useState<Slot>();
  const letters = mailbox(p,carnivalNow());
  const letter = letters.find(entry => entry.id === selected);
  const gear = letter?.gear;
  const footer = <footer className="mail-footer">
    <button type="button" className="action secondary" disabled={!letters.some(entry => entry.read && !entry.pending)}
      onClick={()=>action({kind:'deleteRead'})}>Удалить прочитанные</button>
    <button type="button" className="action mail-gold" disabled={!letters.some(entry => entry.pending)}
      onClick={()=>action({kind:'claimAll'})}>Забрать всё</button>
  </footer>;
  return <DialogShell panel="mail" title="Почта" footer={footer}>
    {letters.length ? <ul className="mail-list">{letters.map(entry => <li key={entry.id}>
      <button type="button" className="mail-letter" data-unread={!entry.read} onClick={()=>{
        if(!entry.read)action({kind:'read',id:entry.id});
        setSelected(entry.id);
        setSlot(undefined);
      }}>
        <Icon name="mail"/>
        <span>
          <strong>{entry.title??'Награды карнавала'}</strong>
          <small><time dateTime={new Date(entry.date).toISOString()}>{dateFormat.format(entry.date)}</time> · {entry.pending ? 'Вложения' : 'Получено'}</small>
        </span>
        {!entry.read && <span className="mail-unread" aria-label="Непрочитанное письмо"/>}
        <b aria-hidden="true">›</b>
      </button>
    </li>)}</ul> : <div className="mail-empty">
      <Icon name="mail"/><strong>Писем пока нет</strong>
      <small>Сюда приходят незабранные награды завершённых событий.</small>
    </div>}
    {letter && <CardDialog key={letter.id} title={letter.title??'Награды карнавала'} className="mail-detail" onClose={()=>setSelected(undefined)}
      actions={letter.pending ? <button type="button" className="action mail-gold"
        onClick={()=>action({kind:'claim',id:letter.id,slot})}>Забрать</button> : <span className="mail-delivered">✓ Вложения получены</span>}>
      <div className="mail-message">
        <span>{letter.title??'Карнавал'} · {monthFormat.format(letter.date)}</span>
        <time dateTime={new Date(letter.date).toISOString()}>{dateFormat.format(letter.date)}</time>
      </div>
      {letter.pending && <div className="mail-attachments">
        <RewardArt reward={letter.reward}/>
        {letter.chests?.map((name,i)=><p key={i}>{name} · сундук появится в Событиях</p>)}
        {gear && <div className="mail-gear" style={{'--item-trim':rarityColors[gear.rarity]} as React.CSSProperties}>
          <Icon name={slot ? gearIcon(slot) : 'chest'}/>
          <span><strong>{sets[gear.set].name} × 1</strong><small>{rarityNames[gear.rarity]} · ур. {gear.level}</small></span>
          <CompactFilter label="Слот награды" value={slot??''} options={[{value:'',label:'Выберите слот',icon:'chest'},...gear.slots.map(value=>({value,label:slotNames[value],icon:gearIcon(value)}))]} onChange={value=>setSlot((value||undefined) as Slot|undefined)}/>
        </div>}
      </div>}
    </CardDialog>}
  </DialogShell>;
}
