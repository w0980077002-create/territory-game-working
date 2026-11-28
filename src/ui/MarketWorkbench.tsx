import {useEffect, useState} from 'react';
import {community, type Market, type Trade} from '../community/client';
import {professions, type WorkshopState} from '../community/workshopCatalog';
import {lang} from '../i18n';

const l = (ru: string, en: string) => lang === 'en' ? en : ru;
export const marketNames:Record<string,string> = {
  'craft-ingot': l('Слиток','Ingot'),
  'craft-hide': l('Выделанная кожа','Tanned hide'),
  'craft-cloth': l('Морское полотно','Sailcloth'),
  'craft-inlay': l('Рунная вставка','Rune inlay'),
  'workshop-blade': l('Клинок мастерской','Workshop blade'),
  'workshop-grip': l('Рукоять мастерской','Workshop grip'),
  'workshop-mantle': l('Плащ мастерской','Workshop mantle'),
  'workshop-charm': l('Амулет мастерской','Workshop charm'),
  'world-boss-trophy': l('Клинок победителя','Boss trophy blade'),
};

export function MarketWorkbench({market, busy, trade, refresh}: {
  market: Market; busy: boolean; trade: (command: Trade) => void; refresh: () => void;
}) {
  const [workshop, setWorkshop] = useState<WorkshopState>();
  const [profession, setProfession] = useState<keyof typeof professions>('smith');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [catalogId, setCatalog] = useState('craft-ingot');
  const [price, setPrice] = useState('');
  const [selected, setSelected] = useState<string>();
  const [showWorkshop, setShowWorkshop] = useState(false);

  useEffect(() => {
    if (!showWorkshop) return;
    const controller = new AbortController();
    community<WorkshopState>('market_workshop', {}, controller.signal).then(setWorkshop, () => {
      if (!controller.signal.aborted) setMessage(l('Мастерская недоступна','Workshop unavailable'));
    });
    return () => controller.abort();
  }, [showWorkshop]);

  async function perform(command: object) {
    setWorking(true);
    setMessage('');
    try {
      await community('market_workshop', {...command, operationId:crypto.randomUUID()}, AbortSignal.timeout(8000));
      setWorkshop(await community<WorkshopState>('market_workshop', {}, AbortSignal.timeout(8000)));
      refresh();
    } catch {
      setMessage(l('Действие отклонено. Обновите рынок и проверьте ресурсы.','Action failed. Refresh and check your materials.'));
    } finally {
      setWorking(false);
    }
  }

  const chosen = workshop?.profession ? professions[workshop.profession] : null;
  const own = chosen && market.items.find(item => item.catalogId === chosen.own);
  const partner = chosen && market.items.find(item => item.catalogId === chosen.partner);
  const amount = Number(price);
  const validPrice = Number.isInteger(amount) && amount >= 10 && amount <= Math.min(market.gold, 1_000_000_000);

  return <>
    <p>{l('Комиссия с продажи 10%, округляется вверх.','Sales fee is 10%, rounded up.')}</p>
    <details className="saga-disclosure" onToggle={e => setShowWorkshop(e.currentTarget.open)}>
      <summary>{l('Сетевая мастерская','Online workshop')}</summary>
      {workshop && (chosen ? <>
        <p>{l(chosen.ru, chosen.en)} · {marketNames[chosen.product]}</p>
        <button className="action" disabled={working || !workshop.canGather}
          onClick={() => void perform({kind:'gather'})}>{l('Добыть','Gather')} · {marketNames[chosen.own]}</button>
        {!workshop.verified && <p>{l('Для добычи нужна подтверждённая победа над первым боссом.','Gathering requires a verified first boss victory.')}</p>}
        <p>{marketNames[chosen.own]} + {marketNames[chosen.partner]} + 120 {l('золота','gold')}</p>
        <button className="action" disabled={working || !own || !partner || market.gold < 120}
          onClick={() => own && partner && void perform({kind:'craft',own:own.id,partner:partner.id})}>{l('Изготовить','Craft')}</button>
      </> : <>
        <label>{l('Профессия','Profession')} <select value={profession} onChange={e => setProfession(e.target.value as typeof profession)}>
          {(Object.keys(professions) as (keyof typeof professions)[]).map(id=><option key={id} value={id}>{l(professions[id].ru,professions[id].en)}</option>)}
        </select></label>
        <button className="action" disabled={working} onClick={() => void perform({kind:'choose',profession})}>
          {l('Подтвердить профессию','Confirm profession')}
        </button>
      </>)}
      {message && <p role="status">{message}</p>}
    </details>
    <details className="saga-disclosure">
      <summary>{l('Заявки на покупку','Buy orders')}</summary>
      <form onSubmit={e => {e.preventDefault(); if (validPrice) trade({kind:'request',catalogId,price:amount});}}>
        <label>{l('Товар','Item')} <select value={catalogId} onChange={e => setCatalog(e.target.value)}>
          {Object.entries(marketNames).map(([id,name])=><option key={id} value={id}>{name}</option>)}
        </select></label>
        <label>{l('Резерв золота','Gold to reserve')} <input type="number" min="10" max="1000000000" value={price} onChange={e=>setPrice(e.target.value)}/></label>
        <button className="action" disabled={busy || !validPrice}>{l('Выставить заявку','Place order')}</button>
      </form>
      <ul>{market.requests?.map(order => {
        const item = market.items.find(i=>i.catalogId===order.catalogId && !i.rank && i.id!==market.equipment?.equipped);
        return <li key={order.id}>
          {marketNames[order.catalogId] ?? order.catalogId} · {order.price}{order.expired && ' · '+l('Истекла','Expired')}
          {order.mine ? <button className="action" disabled={busy} onClick={() => trade({kind:'withdraw',requestId:order.id})}>{l('Вернуть резерв','Return escrow')}</button>
            : item && (selected===order.id ? <button className="action" disabled={busy} onClick={()=>{
              setSelected(undefined); trade({kind:'fulfill',requestId:order.id,itemId:item.id});
            }}>{l('Подтвердить продажу','Confirm sale')} · {order.price-Math.ceil(order.price/10)}</button>
              : <button className="action" disabled={busy} onClick={()=>setSelected(order.id)}>{l('Продать по заявке','Fill order')}</button>)}
        </li>;
      })}</ul>
    </details>
    {!!market.priceHistory?.length && <details className="saga-disclosure">
      <summary>{l('История цен','Price history')}</summary>
      <ul>{market.priceHistory.map((line,index)=><li key={line.at+index}>
        {marketNames[line.catalogId] ?? line.catalogId} · {line.price} · {new Date(line.at).toLocaleDateString(lang)}
      </li>)}</ul>
    </details>}
  </>;
}
