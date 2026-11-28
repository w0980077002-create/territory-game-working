export const NAVAL = {
  maxShips: 5,
  buildStage: 20,
  berthContracts: [0, 1, 7, 21, 45],
  build: {gold: 8_000, materials: 24},
  upgrades: [
    {gold: 800, materials: 6},
    {gold: 2_000, materials: 10},
    {gold: 4_300, materials: 18},
    {gold: 8_000, materials: 30},
  ],
  levelPercent: [100, 112, 124, 136, 148],
  repairPercent: 25,
  salvagePercent: 30,
  contract: {gold: 150, materials: 1, seals: 1, minimumHours: 4},
  stars: 250,
} as const;

export const HULLS = {
  scout: {name: 'Разведывательный', gold: 100, materials: 120, seals: 100, specialty: 'Поиск материалов'},
  merchant: {name: 'Торговый', gold: 120, materials: 100, seals: 100, specialty: 'Перевозка золота'},
  warship: {name: 'Боевой', gold: 100, materials: 115, seals: 110, specialty: 'Сопровождение конвоев · −10% к ремонту'},
  dragon: {name: 'Северный дракон', gold: 105, materials: 110, seals: 110, specialty: 'Дальние экспедиции · +10% золота в рейсах от 12 ч'},
  odin: {name: 'Флагман Одина', gold: 105, materials: 105, seals: 120, specialty: 'Добыча морских печатей'},
} as const;
export type Hull = keyof typeof HULLS;

export const ROUTES = [
  {hours: 1, gold: 110, materials: 1, seals: 0},
  {hours: 4, gold: 380, materials: 2, seals: 1},
  {hours: 8, gold: 680, materials: 3, seals: 2},
  {hours: 12, gold: 960, materials: 4, seals: 3},
  {hours: 24, gold: 1680, materials: 6, seals: 5},
] as const;
export type RouteHours = (typeof ROUTES)[number]['hours'];

export const RIGS = {
  sails: {name: 'Торговые паруса', specialty: '+10% золота', materials: 8, seals: 4},
  nets: {name: 'Поисковые сети', specialty: '+25% материалов', materials: 8, seals: 4},
  pennant: {name: 'Морской вымпел', specialty: '+25% печатей', materials: 8, seals: 4},
} as const;
export type Rig = keyof typeof RIGS;

export const NAVAL_SHOP = {
  materials: {name: 'Морские материалы ×4', seals: 5, amount: 4},
  chaosite: {name: 'Хаосит ×3', seals: 10, amount: 3},
  summon: {name: 'Печать призыва ×1', seals: 12, amount: 1},
} as const;
export type NavalOffer = keyof typeof NAVAL_SHOP;
