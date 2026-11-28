import {useState} from 'react';
import {applyNaval, emptyNaval, navalBuildReady, navalSalvage, voyageReward, type NavalAction} from '../core/naval';
import {HULLS, NAVAL, RIGS, ROUTES, type Hull, type Rig} from '../core/navalBalance';
import type {Ship, ShipyardState} from '../core/shipyard';
import {useGame} from '../core/store';
import {Action} from './SagaUI';

export function NavalPanel({fleet, ship, now}: {fleet: ShipyardState; ship: Ship; now: number}) {
  const stage = useGame(state => state.p.stage);
  const gold = useGame(state => state.p.gold);
  const [hull, setHull] = useState<Hull>('merchant');
  const [rig, setRig] = useState<Rig>('sails');
  const [route, setRoute] = useState<(typeof ROUTES)[number]['hours']>(4);
  const [confirmShip, setConfirmShip] = useState<string>();
  const naval = fleet.naval ?? emptyNaval;
  const day = Math.floor(now / 86_400_000);
  const canContract = naval.qualifiedDay === day && (naval.lastContractDay ?? -1) < day;
  const upgrade = NAVAL.upgrades[ship.level - 1];
  const refund = navalSalvage(ship);
  const ready = navalBuildReady(stage, fleet.ships.length, naval.contracts);
  const equipped = ship.rig ? RIGS[ship.rig] : undefined;
  const reward = voyageReward(ship, route);

  function perform(action: NavalAction, message: string) {
    const {mutate, notice} = useGame.getState();
    const ok = mutate(draft => applyNaval(draft, action, Date.now()), true);
    notice(ok ? message : 'Действие недоступно или сохранение не записано');
    if (ok) setConfirmShip(undefined);
  }

  return <section className="naval-panel" aria-label="Морские экспедиции">
    <p><strong>{naval.materials} материалов · {naval.seals} морских печатей</strong></p>
    <h3>{HULLS[ship.hull ?? 'scout'].name} · уровень {ship.level}/5</h3>
    <p>{HULLS[ship.hull ?? 'scout'].specialty}{equipped && ' · ' + equipped.name + ' (' + equipped.specialty + ')'}</p>
    {ship.voyage ? <div>
      <p>Рейс на {ship.voyage.hours} ч · {now >= ship.voyage.endsAt ? 'прибыл' : 'осталось ' + Math.ceil((ship.voyage.endsAt - now) / 60_000) + ' мин'}</p>
      <Action disabled={now < ship.voyage.endsAt} onClick={() => perform({type: 'claim', id: ship.id}, 'Добыча доставлена в гавань')}>Забрать добычу рейса</Action>
    </div> : ship.repair ? <Action disabled={gold < ship.repair}
        onClick={() => perform({type: 'repair', id: ship.id}, 'Корабль отремонтирован')}>Ремонт · {ship.repair} золота</Action>
      : <>
        <label>Длительность рейса <select value={route} onChange={event => setRoute(Number(event.target.value) as typeof route)}>
          {ROUTES.map(option => <option key={option.hours} value={option.hours}>{option.hours} ч</option>)}
        </select></label>
        <p>Добыча · {reward.gold} золота, {reward.materials} материалов, {reward.seals} печатей. Ремонт после рейса · {reward.repair} золота.</p>
        <Action onClick={() => perform({type: 'launch', id: ship.id, hours: route}, 'Корабль вышел в море')}>Отправить экспедицию</Action>
        <Action disabled={!upgrade || gold < upgrade.gold || naval.materials < upgrade.materials}
          onClick={() => perform({type: 'upgrade', id: ship.id, level: ship.level}, 'Корабль улучшен')}>
          {upgrade ? `Улучшить · ${upgrade.gold} золота, ${upgrade.materials} материалов` : 'Макс. уровень'}
        </Action>
        <details className="saga-disclosure">
          <summary>Оснащение и разбор</summary>
          <label>Оснащение <select value={rig} onChange={event => setRig(event.target.value as Rig)}>
            {(Object.keys(RIGS) as Rig[]).map(key => <option key={key} value={key}>{RIGS[key].name} · {RIGS[key].specialty}</option>)}
          </select></label>
          <p>Одно оснащение на корабль. Новая установка заменяет предыдущую.</p>
          <Action disabled={ship.rig === rig || naval.materials < RIGS[rig].materials || naval.seals < RIGS[rig].seals}
            onClick={() => perform({type: 'outfit', id: ship.id, rig}, 'Оснащение установлено')}>
            Оснастить · {RIGS[rig].materials} материалов, {RIGS[rig].seals} печати
          </Action>
          {refund ? confirmShip === ship.id ? <div>
            <p>Корабль и оснащение будут разобраны. Возврат · {refund.gold} золота и {refund.materials} материалов.</p>
            <Action onClick={() => perform({type: 'salvage', id: ship.id, level: ship.level}, 'Корабль разобран')}>Подтвердить разбор</Action>
            <Action onClick={() => setConfirmShip(undefined)}>Отмена</Action>
          </div> : <Action onClick={() => setConfirmShip(ship.id)}>Разобрать корабль</Action>
            : <p>Этот корабль сохраняет место в наследном флоте.</p>}
        </details>
      </>}
    <h3>Морской контракт · выполнено {naval.contracts}</h3>
    <p>Соберите добычу рейса от {NAVAL.contract.minimumHours} ч. Контракт выдаётся раз в сутки по UTC.</p>
    <Action disabled={!canContract} onClick={() => perform({type: 'contract'}, 'Морской контракт выполнен')}>
      Получить · {NAVAL.contract.gold} золота, 1 материал и 1 печать
    </Action>
    <h3>Причалы · {fleet.ships.length}/{NAVAL.maxShips}</h3>
    {fleet.ships.length < NAVAL.maxShips && <>
      <label>Корпус <select value={hull} onChange={event => setHull(event.target.value as Hull)}>
        {(Object.keys(HULLS) as Hull[]).map(key => <option key={key} value={key}>{HULLS[key].name}</option>)}
      </select></label>
      <p>{HULLS[hull].specialty}. Для нового корпуса нужны этап {NAVAL.buildStage} и {NAVAL.berthContracts[fleet.ships.length]} выполненных морских контрактов.</p>
      <Action disabled={!ready || gold < NAVAL.build.gold || naval.materials < NAVAL.build.materials}
        onClick={() => perform({type: 'build', hull}, 'Корабль построен')}>
        Построить корабль · {NAVAL.build.gold} золота, {NAVAL.build.materials} материалов
      </Action>
      <p>Покупка за {NAVAL.stars} Stars готовится к отдельному запуску.</p>
    </>}
  </section>;
}
