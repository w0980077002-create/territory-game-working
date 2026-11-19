import type {Reward} from './rewards';

export const CARNIVAL_RULES_VERSION = 1;
export const CARNIVAL_START_DAY = 1;
export const CARNIVAL_DAYS = 7;
export const CARNIVAL_TASK_POINTS = 20;

export type CarnivalRoute = 'campaign'|'farm'|'dungeon'|'arena'|'realm'|'skills'|'loot'|'inventory'|'forge'|'companions'|'gems'|'relic';
export interface CarnivalObjective {
  text: string;
  keys: readonly string[];
  target: number;
  route?: CarnivalRoute;
}
interface DayReward extends Reward {bossGold?: number; regionMaterials?: number}
interface Task {primary: CarnivalObjective; alternative?: CarnivalObjective}
const goal = (text: string, keys: string | string[], target: number, route?: CarnivalRoute): Task =>
  ({primary: {text, keys: typeof keys === 'string' ? [keys] : keys, target, route}});
const either = (primary: Task, alternative: Task): Task => ({primary:primary.primary, alternative:alternative.primary});
const horn = (n: number) => goal('Открыть Рог Трофеев', 'horn', n, 'loot');
const farm = (n: number) => goal('Победить в Бесконечном фарме', 'win:farm', n, 'farm');
const campaign = (n: number) => goal('Выиграть встречи Основной главы', 'win:campaign', n, 'campaign');
const lair = () => goal('Победить хозяина Логова', 'win:dungeon', 1, 'dungeon');
const salvage = (n: number) => goal('Распылить предметы вручную', 'carnival:salvage', n, 'inventory');
const forge = (n: number) => goal('Усилить, перековать, выгравировать или изготовить предмет', ['upgrade','reforge','engrave','craft'], n, 'forge');
const bosses = (n: number) => goal('Победить боссов Основной главы или хозяев Логова', ['stat:bosses','win:dungeon'], n, 'campaign');
const visit = () => goal('Зайти в игру', 'carnival:visit', 1);
const seen = (n: number) => goal('Пережить события на дороге', 'world:events', n, 'campaign');

export const carnivalDays: readonly {title: string; reward: DayReward; tasks: readonly Task[]}[] = [
  {title:'Открытие', reward:{bossGold:.25}, tasks:[
    visit(), campaign(3), horn(3), salvage(2), goal('Надеть предмет из рюкзака или со склада', 'carnival:equip', 1, 'inventory'),
  ]},
  {title:'Испытание в бою', reward:{chaosite:1}, tasks:[
    either(lair(), farm(4)),
    either(goal('Повысить уровень навыка', 'carnival:skill', 1, 'skills'), farm(5)),
    goal('Заработать золото за победы в боях', 'carnival:battleGold', 150, 'farm'),
    either(bosses(1), campaign(5)), farm(3),
  ]},
  {title:'Работа в кузнице', reward:{bossGold:.25}, tasks:[
    either(forge(1), horn(5)), either(forge(2), salvage(4)),
    either(goal('Исполнить перековку или изготовить предмет', ['reforge','craft'], 1, 'forge'), horn(7)),
    salvage(3), either(goal('Полностью пройти этап Основной главы', 'stat:bosses', 1, 'campaign'), farm(6)),
  ]},
  {title:'Плечом к плечу', reward:{gems:1}, tasks:[
    either(goal('Призвать спутника', 'summon', 1, 'companions'), farm(5)),
    either(goal('Развить спутника: уровень, звезда или пробуждение', ['carnival:companion','pet:star','pet:awaken'], 1, 'companions'), horn(5)),
    either(goal('Вставить или синтезировать камень', ['gem:set','gem:synth'], 1, 'gems'), salvage(4)),
    campaign(3), either(seen(1), farm(7)),
  ]},
  {title:'За гранью света', reward:{res:{ess:1}}, tasks:[
    either(goal('Победить владыку этажа Царства тьмы', 'carnival:realm', 1, 'realm'), farm(6)),
    either(goal('Открыть или усилить реликвию', ['relic:open','relic:up'], 1, 'relic'), lair()),
    either(goal('Забрать эссенцию из результата похода во Тьму', 'carnival:realmEss', 3, 'realm'), farm(8)),
    either(bosses(1), campaign(5)), horn(4),
  ]},
  {title:'День поединков', reward:{tokens:2}, tasks:[
    either(goal('Выиграть поединок с NPC на Арене', 'win:arena', 1, 'arena'), farm(6)),
    goal('Выбрать другую руну навыка', 'carnival:rune', 1, 'skills'),
    goal('Заработать золото за победы в боях', 'carnival:battleGold', 200, 'farm'),
    either(lair(), campaign(5)), either(seen(2), horn(6)),
  ]},
  {title:'Финальный пир', reward:{gems:1}, tasks:[
    visit(), either(bosses(2), farm(9)), horn(6), either(forge(2), salvage(5)),
    either(goal('Выиграть поединок с NPC на Арене', 'win:arena', 1, 'arena'), campaign(6)),
  ]},
];

export const carnivalMilestones: readonly {points: number; reward: DayReward; gear?: boolean}[] = [
  {points:100, reward:{bossGold:2, horn:4}},
  {points:200, reward:{chaosite:10, regionMaterials:3}},
  {points:300, reward:{gems:12, horn:6}},
  {points:400, reward:{bossGold:3, res:{seal:1, shard:2}}},
  {points:500, reward:{gems:20, regionMaterials:5, res:{ess:10}}},
  {points:600, reward:{gems:30, bossGold:4, res:{seal:1}}, gear:true},
];
