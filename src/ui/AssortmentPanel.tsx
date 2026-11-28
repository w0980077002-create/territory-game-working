import {useCallback,useEffect,useState} from 'react';
import {community} from '../community/client';
import {useGame} from '../core/store';
import {tg} from '../core/telegram';
import './assortment.css';

type Offer = {sku:string;title:string;stars:number};
type State = {open:boolean;adsReady:boolean;adTokens:number;owned:string[];vipUntil:string|null;
  season:null|{title:string;endsAt:string;freeGoal:boolean;pass:boolean};offers:Offer[]};
const description:Record<string,string> = {
  'edition-north':'Ледяная рамка героя и синий флаг гавани',
  'edition-rome':'Римская рамка героя и алый флаг гавани',
  'edition-vip':'Планировщик рейсов на 30 дней, без автозапуска и боевых бонусов',
  'edition-pass':'Сезонная рамка за подтверждённое участие',
  'edition-flag':'Морской флаг для гавани',
};

export function AssortmentPanel() {
  const [state,setState] = useState<State>();
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [style,setStyle] = useState('');
  const fleet = useGame(s=>s.p.shipyard?.ships);
  const load = useCallback(async (signal?:AbortSignal) => {
    const next=await community<State>('assortment',{},signal??AbortSignal.timeout(8000));
    setState(next);
  },[]);
  useEffect(()=>{
    if(!tg()?.initData)return;
    const controller=new AbortController();
    void load(controller.signal).catch(()=>undefined);
    const refresh=()=>{if(!document.hidden)void load(controller.signal).catch(()=>undefined)};
    document.addEventListener('visibilitychange',refresh);
    return ()=>{controller.abort();document.removeEventListener('visibilitychange',refresh)};
  },[load]);
  const choices = new Set(state?.owned??[]);
  if (state?.season?.freeGoal) choices.add('season-free');
  if (state?.season?.pass&&state.season.freeGoal) choices.add('edition-pass');
  if (state?.adTokens) choices.add('rewarded-ad');
  function appearance(next:string) {
    if (next) document.documentElement.dataset.vvrStyle=next;
    else delete document.documentElement.dataset.vvrStyle;
    setStyle(next);
  }
  const proof=JSON.stringify(Array.from(choices));
  useEffect(()=>{
    const active=document.documentElement.dataset.vvrStyle;
    if (state && active && !(JSON.parse(proof) as string[]).includes(active)) delete document.documentElement.dataset.vvrStyle;
  },[proof,state]);
  if (!state || !(state.open||state.adsReady||state.vipUntil||state.season||choices.size)) return null;

  async function buy(offer:Offer) {
    const app=tg();
    if(busy||!app?.openInvoice)return;
    setBusy(true);setMessage('');
    try{
      const invoice=await community<{status:string;link?:string}>('assortment_invoice',{sku:offer.sku},AbortSignal.timeout(8000));
      if(invoice.status!=='ok'||!invoice.link){setMessage('Предложение недоступно');setBusy(false);return}
      app.openInvoice(invoice.link,status=>{
        setBusy(false);
        setMessage(status==='paid'||status==='pending'?'Ожидается подтверждение Telegram. Можно обновить витрину.':'Оплата не завершена');
        void load().catch(()=>undefined);
      });
    }catch{setMessage('Не удалось открыть счёт');setBusy(false)}
  }
  async function watch() {
    const app=tg();
    if(busy||!app?.openLink)return;
    setBusy(true);
    try{
      const ad=await community<{status:string;url?:string}>('rewarded_ad',{},AbortSignal.timeout(8000));
      if(ad.status==='ok'&&ad.url){app.openLink(ad.url);setMessage('После подтверждённого просмотра обновите витрину.')}
      else setMessage('Просмотр пока недоступен или дневной лимит исчерпан.');
    }catch{setMessage('Не удалось открыть рекламу')}
    finally{setBusy(false)}
  }

  return <details className="saga-disclosure">
    <summary>Наборы, VIP и оформление</summary>
    {state.open&&state.offers.filter(offer=>offer.sku!=='edition-pass'||state.season).map(offer=>{
      const owned=choices.has(offer.sku)||offer.sku==='edition-vip'&&!!state.vipUntil||offer.sku==='edition-pass'&&!!state.season?.pass;
      return <div className="assortment-offer" key={offer.sku}>
        <strong>{offer.title}</strong><small>{description[offer.sku]}</small>
        <button type="button" className="action" disabled={busy||owned} onClick={()=>void buy(offer)}>
          {owned?'Доступно на аккаунте':offer.stars+' Stars'}</button>
      </div>;
    })}
    {!!choices.size&&<label>Оформление <select value={choices.has(style)?style:''} onChange={e=>appearance(e.target.value)}>
      <option value="">Обычное</option>
      {Array.from(choices, id=><option key={id} value={id}>
        {state.offers.find(offer=>offer.sku===id)?.title??(id==='season-free'?'Знак сезона':'Бронзовая рамка')}
      </option>)}
    </select></label>}
    {state.vipUntil&&<details className="saga-disclosure"><summary>Планировщик рейсов · VIP до {new Date(state.vipUntil).toLocaleDateString('ru')}</summary>
      <ul>{fleet?.map((ship,index)=><li key={ship.id}>Корабль {index+1} · {ship.voyage
        ? new Date(ship.voyage.endsAt).toLocaleString('ru') : ship.repair ? 'Нужен ремонт' : 'В гавани'}</li>)}</ul>
      <button type="button" className="action" onClick={()=>useGame.getState().open('shipyard')}>Открыть Верфь</button>
    </details>}
    {state.season&&<p>{state.season.title} · до {new Date(state.season.endsAt).toLocaleDateString('ru')}. {state.season.freeGoal
      ? 'Бесплатный знак открыт.' : 'Подтвердите участие в Арене или мировом боссе для знака сезона.'}</p>}
    {state.adsReady&&<details className="saga-disclosure"><summary>Добровольная реклама</summary>
      <p>Подтверждённый просмотр открывает бронзовую рамку. До 3 подтверждений за сутки UTC.</p>
      <button type="button" className="action" disabled={busy} onClick={()=>void watch()}>Смотреть добровольно</button>
    </details>}
    <button type="button" className="action secondary" disabled={busy} onClick={()=>void load().catch(()=>setMessage('Витрина недоступна'))}>Обновить ассортимент</button>
    {message&&<p role="status">{message}</p>}
  </details>;
}
