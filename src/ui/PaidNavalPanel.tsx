import {useCallback, useEffect, useState} from 'react';
import {community, communityEnabled} from '../community/client';
import {HULLS, NAVAL, RIGS, ROUTES, type Hull, type Rig, type RouteHours} from '../core/navalBalance';
import {voyageReward} from '../core/naval';
import {tg} from '../core/telegram';
import {Action} from './SagaUI';

type PaidState = {
  open: boolean; gold: number; materials: number; seals: number;
  ship: null | {order: string; hull: Hull; level: number; version: number; state: 'pending'|'active'|'refunding';
    repair: number; rig?: Rig; salvageAt: string|null; voyage: null | {hours: number; endsAt: string}};
};

const messages: Record<string, string> = {
  insufficient: 'Недостаточно ресурсов морского счёта',
  stale: 'Состояние изменилось. Проверьте корабль перед повтором.',
  hold: 'Разбор доступен после расчёта Stars',
  awaiting_payment: 'Ожидается подтверждение Telegram',
  invoice_pending: 'Уже выставлен счёт на другой корпус',
  not_ready: 'Экспедиция ещё в пути',
};

export function PaidNavalPanel({hull, now, localFleetSize, onReserved}: {
  hull: Hull; now: number; localFleetSize: number; onReserved: (reserved: boolean) => void;
}) {
  const [state, setState] = useState<PaidState>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [route, setRoute] = useState<RouteHours>(4);
  const [rig, setRig] = useState<Rig>('sails');
  const [confirm, setConfirm] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const result = await community<PaidState>('shipyard_paid', {kind: 'state'}, signal ?? AbortSignal.timeout(8000));
    setState(result);
    onReserved(!!result.ship);
  }, [onReserved]);

  useEffect(() => {
    if (!communityEnabled || !tg()?.initData) return;
    const controller = new AbortController();
    void load(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [load]);

  if (!state || (!state.open && !state.ship && !state.gold && !state.materials && !state.seals)) return null;

  async function buy() {
    const app = tg();
    if (busy || !app?.openInvoice || localFleetSize >= NAVAL.maxShips) return;
    setBusy(true);
    try {
      const invoice = await community<{status: string; link?: string}>('shipyard_invoice', {hull:state?.ship?.hull ?? hull}, AbortSignal.timeout(8000));
      if (invoice.status !== 'ok' || !invoice.link) {
        setMessage(messages[invoice.status] ?? 'Счёт недоступен');
        await load();
        setBusy(false);
        return;
      }
      app.openInvoice(invoice.link, status => {
        setBusy(false);
        setMessage(status === 'paid' || status === 'pending' ? 'Ожидается подтверждение Telegram' : 'Счёт закрыт');
        void load().catch(() => undefined);
      });
    } catch {
      setMessage('Не удалось открыть счёт');
      setBusy(false);
    }
  }

  async function perform(kind: string, extra: object = {}) {
    if (!state?.ship || state.ship.state !== 'active' || busy) return;
    setBusy(true);
    try {
      const result = await community<{status: string; compensation?: number}>('shipyard_paid',
        {kind, order: state.ship.order, version: state.ship.version, ...extra}, AbortSignal.timeout(8000));
      setMessage(result.compensation ? `На аккаунт зачислено ${result.compensation} синих алмазов. Перенос герою доступен в Лавке.`
        : result.status === 'ok' ? 'Готово' : messages[result.status] ?? 'Действие недоступно');
      setConfirm(false);
      await load();
    } catch {
      setMessage('Ответ сервера не получен. Обновите состояние.');
    } finally {
      setBusy(false);
    }
  }

  const ship = state.ship;
  const upgrade = ship && NAVAL.upgrades[ship.level - 1];
  const quote = ship && voyageReward({id: ship.order, hull: ship.hull, level: ship.level, rig: ship.rig}, route);
  const ends = ship?.voyage ? Date.parse(ship.voyage.endsAt) : 0;
  const salvageAt = ship?.salvageAt ? Date.parse(ship.salvageAt) : Infinity;

  return <details className="saga-disclosure">
    <summary>Верфь Stars</summary>
    <p>Морской счёт · {state.gold} золота, {state.materials} материалов, {state.seals} печатей</p>
    {(!ship || ship.state === 'pending') && state.open && <Action disabled={busy || localFleetSize >= NAVAL.maxShips}
      onClick={() => void buy()}>{ship ? 'Открыть счёт снова' : 'Купить · ' + HULLS[hull].name + ' · ' + NAVAL.stars + ' Stars'}</Action>}
    {state.open && !ship && <p>Неиспользованный корпус можно вернуть в течение 14 дней через /paysupport. Разбор доступен через 21 день после оплаты.</p>}
    {ship?.state === 'pending' && <p>Ожидается подтверждение заказа.</p>}
    {ship?.state === 'refunding' && <p>Возврат на проверке Telegram.</p>}
    {ship?.state === 'active' && <>
      <h3>{HULLS[ship.hull].name} · уровень {ship.level}/5</h3>
      {ship.voyage ? <Action disabled={busy || now < ends} onClick={() => void perform('claim')}>
        {now < ends ? 'Рейс · осталось ' + Math.ceil((ends - now) / 60_000) + ' мин' : 'Забрать добычу рейса'}
      </Action> : ship.repair ? <Action disabled={busy || state.gold < ship.repair}
        onClick={() => void perform('repair')}>Ремонт · {ship.repair} золота</Action> : <>
        <label>Длительность рейса <select value={route} onChange={e => setRoute(Number(e.target.value) as RouteHours)}>
          {ROUTES.map(r => <option key={r.hours} value={r.hours}>{r.hours} ч</option>)}
        </select></label>
        <Action disabled={busy || localFleetSize >= NAVAL.maxShips} onClick={() => void perform('launch', {hours: route})}>
          В рейс · {quote?.gold} золота, ремонт {quote?.repair}
        </Action>
        {upgrade && <Action disabled={busy || state.gold < upgrade.gold || state.materials < upgrade.materials}
          onClick={() => void perform('upgrade')}>Улучшить · {upgrade.gold} золота, {upgrade.materials} материалов</Action>}
        <label>Оснащение <select value={rig} onChange={e => setRig(e.target.value as Rig)}>
          {(Object.keys(RIGS) as Rig[]).map(key => <option key={key} value={key}>{RIGS[key].name}</option>)}
        </select></label>
        <Action disabled={busy || ship.rig === rig || state.materials < 8 || state.seals < 4}
          onClick={() => void perform('outfit', {rig})}>Оснастить · 8 материалов, 4 печати</Action>
        {now < salvageAt ? <p>Разбор доступен через 21 день после оплаты.</p> : confirm ?
          <Action disabled={busy} onClick={() => void perform('salvage')}>Подтвердить разбор · {575 + 25 * ship.level} синих</Action> :
          <Action disabled={busy} onClick={() => setConfirm(true)}>Разобрать корабль</Action>}
      </>}
    </>}
    <Action disabled={busy} onClick={() => void load().catch(() => setMessage('Не удалось обновить состояние'))}>Обновить</Action>
    {message && <p role="status">{message}</p>}
  </details>;
}
