import {HULLS, NAVAL, RIGS, ROUTES, type Hull, type Rig, type RouteHours} from './navalBalance';
import {previewShips, starterShipyard, validShipyard, type Ship, type ShipWallet} from './shipyard';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const amount = (n: number, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= 0 && n <= max;
const has = (table: object, key: string) => Object.hasOwn(table, key);

export interface NavalState {
  version: 1;
  serial: number;
  materials: number;
  seals: number;
  contracts: number;
  lastContractDay?: number;
  qualifiedDay?: number;
  lastActionAt?: number;
}

interface VoyageReward {gold: number; materials: number; seals: number; repair: number}
export interface Voyage extends VoyageReward {hours: RouteHours; endsAt: number}
export const emptyNaval: Readonly<NavalState> = {version: 1, serial: 0, materials: 0, seals: 0, contracts: 0};

export function validNaval(naval: NavalState): boolean {
  return !!naval && naval.version === 1 && [naval.serial, naval.materials, naval.seals, naval.contracts].every(n => amount(n))
    && [naval.lastContractDay, naval.qualifiedDay, naval.lastActionAt].every(n => n === undefined || amount(n));
}

export function validNavalShip(ship: Ship, serial: number): boolean {
  const legacy = /^drakkar-[1-3]$/.test(ship.id);
  const number = Number(ship.id.slice(6));
  if (!legacy && (!/^fleet-[1-9]\d*$/.test(ship.id) || !amount(number, serial) || !ship.hull)) return false;
  if (legacy && (ship.hull !== undefined || ship.costBasis !== undefined)) return false;
  if (!legacy && (!ship.costBasis || !amount(ship.costBasis.gold, 100_000) || !amount(ship.costBasis.materials, 1_000))) return false;
  const voyage = ship.voyage;
  return (ship.hull === undefined || has(HULLS, ship.hull))
    && (ship.legacyLevel === undefined || (legacy && amount(ship.legacyLevel, ship.level) && ship.legacyLevel > 0))
    && (ship.rig === undefined || has(RIGS, ship.rig))
    && (ship.repair === undefined || amount(ship.repair, 1_000))
    && (voyage === undefined || (!!voyage && !ship.repair && amount(voyage.endsAt)
      && ROUTES.some(r => r.hours === voyage.hours) && amount(voyage.repair, 4_000) && voyage.repair > 0
      && amount(voyage.gold, 4_000) && amount(voyage.materials, 20) && amount(voyage.seals, 20)));
}

function routeRepair(ship: Ship, cost: number): number {
  return ship.hull === 'warship' ? Math.floor(cost * 90 / 100) : cost;
}

export function voyageReward(ship: Ship, hours: RouteHours): VoyageReward {
  const route = ROUTES.find(r => r.hours === hours)!;
  const hull = HULLS[ship.hull ?? 'scout'];
  const level = NAVAL.levelPercent[ship.level - 1];
  const goldBonus = (ship.rig === 'sails' ? 10 : 0) + (ship.hull === 'dragon' && hours >= 12 ? 10 : 0);
  const scale = (base: number, specialty: number, bonus: number) =>
    Math.floor(base * level * specialty * (100 + bonus) / 1_000_000);
  return {
    gold: scale(route.gold, hull.gold, goldBonus),
    materials: scale(route.materials, hull.materials, ship.rig === 'nets' ? 25 : 0),
    seals: scale(route.seals, hull.seals, ship.rig === 'pennant' ? 25 : 0),
    repair: routeRepair(ship, route.repair),
  };
}

export function navalBuildReady(stage: number, count: number, contracts: number): boolean {
  return count < NAVAL.maxShips && stage >= NAVAL.buildStage && contracts >= NAVAL.berthContracts[count];
}

export function navalSalvage(ship: Ship) {
  if (!ship.costBasis || ship.voyage || ship.repair) return null;
  return {
    gold: Math.floor(ship.costBasis.gold * NAVAL.salvagePercent / 100),
    materials: Math.floor(ship.costBasis.materials * NAVAL.salvagePercent / 100),
  };
}

export type NavalAction =
  | {type: 'build'; hull: Hull}
  | {type: 'contract'}
  | {type: 'launch'; id: string; hours: RouteHours}
  | {type: 'outfit'; id: string; rig: Rig}
  | {type: 'salvage' | 'upgrade'; id: string; level: number}
  | {type: 'claim' | 'repair'; id: string};

export function applyNaval(p: ShipWallet & {stage: number}, action: NavalAction, now: number): boolean {
  if (!amount(now)) return false;
  const fleet = previewShips(p.shipyard ?? starterShipyard(now), now);
  const naval = {...(fleet.naval ?? emptyNaval)};
  if (now < (naval.lastActionAt ?? 0)) return false;
  const day = Math.floor(now / DAY);
  let gold = p.gold;

  if (action.type === 'build') {
    if (!has(HULLS, action.hull) || !navalBuildReady(p.stage, fleet.ships.length, naval.contracts)
      || gold < NAVAL.build.gold || naval.materials < NAVAL.build.materials || naval.serial >= Number.MAX_SAFE_INTEGER) return false;
    gold -= NAVAL.build.gold;
    naval.materials -= NAVAL.build.materials;
    fleet.ships.push({id: 'fleet-' + ++naval.serial, level: 1, hull: action.hull, costBasis: {...NAVAL.build}});
  } else if (action.type === 'contract') {
    if (naval.qualifiedDay !== day || (naval.lastContractDay ?? -1) >= day) return false;
    naval.lastContractDay = day;
    naval.contracts++;
    gold += NAVAL.contract.gold;
    naval.materials += NAVAL.contract.materials;
    naval.seals += NAVAL.contract.seals;
  } else {
    const ship = fleet.ships.find(s => s.id === action.id);
    if (!ship) return false;
    if (action.type === 'claim') {
      const voyage = ship.voyage;
      if (!voyage || now < voyage.endsAt) return false;
      delete ship.voyage;
      ship.repair = voyage.repair;
      gold += voyage.gold;
      naval.materials += voyage.materials;
      naval.seals += voyage.seals;
      if (voyage.hours >= NAVAL.contract.minimumHours) naval.qualifiedDay = Math.max(naval.qualifiedDay ?? day, day);
    } else {
      if (ship.voyage) return false;
      if (action.type === 'repair') {
        if (!ship.repair || gold < ship.repair) return false;
        gold -= ship.repair;
        delete ship.repair;
      } else {
        if (ship.repair) return false;
        switch (action.type) {
          case 'launch':
            if (!ROUTES.some(r => r.hours === action.hours) || !amount(now + action.hours * HOUR)) return false;
            ship.voyage = {...voyageReward(ship, action.hours), endsAt: now + action.hours * HOUR, hours: action.hours};
            break;
          case 'upgrade': {
            const cost = NAVAL.upgrades[ship.level - 1];
            if (!cost || ship.level !== action.level || gold < cost.gold || naval.materials < cost.materials) return false;
            gold -= cost.gold;
            naval.materials -= cost.materials;
            if (ship.costBasis) {
              ship.costBasis = {gold: ship.costBasis.gold + cost.gold, materials: ship.costBasis.materials + cost.materials};
            } else {
              ship.legacyLevel ??= ship.level;
            }
            ship.level++;
            break;
          }
          case 'outfit': {
            if (!has(RIGS, action.rig) || ship.rig === action.rig) return false;
            const cost = RIGS[action.rig];
            if (naval.materials < cost.materials || naval.seals < cost.seals) return false;
            naval.materials -= cost.materials;
            naval.seals -= cost.seals;
            ship.rig = action.rig;
            break;
          }
          case 'salvage': {
            const refund = navalSalvage(ship);
            if (!refund || ship.level !== action.level) return false;
            gold += refund.gold;
            naval.materials += refund.materials;
            fleet.ships = fleet.ships.filter(entry => entry.id !== ship.id);
            break;
          }
        }
      }
    }
  }

  naval.lastActionAt = now;
  const next = {...fleet, naval};
  if (!Number.isFinite(gold) || gold < 0 || !validShipyard(next)) return false;
  p.gold = gold;
  p.shipyard = next;
  return true;
}
