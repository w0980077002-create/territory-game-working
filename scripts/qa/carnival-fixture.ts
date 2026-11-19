/**
 * QA-only data for the carnival UI stand (scripts/qa/carnival-preview.html). Not imported by the game.
 * Task names follow the owner's day themes from issue #51 revision 48; numbers are placeholders for layout
 * checks until Codex publishes the real table. The stand never touches the player's save.
 */
import type {CarnivalTask, CarnivalView} from '../../src/ui/carnival/model';

const DAY = 86_400_000;
type Row = [text: string, goal: number, icon: string, route: string, reward?: CarnivalTask['reward']];
const table: Row[][] = [
  [['Войдите в игру в день карнавала', 1, 'gift', 'rewards'], ['Победите врагов в походе', 150, 'axes', 'campaign', {gold: 20000}],
    ['Откройте Рог Трофеев', 20, 'horn', 'loot'], ['Распылите снаряжение', 15, 'hammer', 'inventory', {mats: {ice: 3}}], ['Наденьте новую вещь', 3, 'armor', 'equipment']],
  [['Пройдите Логово', 3, 'lair-keeper', 'dungeon', {gems: 20}], ['Улучшите навык', 2, 'skill', 'skills'],
    ['Заработайте золото в боях', 50000, 'coins', 'campaign'], ['Используйте навыки в бою', 60, 'lightning', 'campaign'], ['Победите босса главы', 1, 'crown', 'campaign', {horn: 10}]],
  [['Закалите снаряжение в кузнице', 5, 'hammer', 'forge'], ['Соберите материалы региона', 20, 'mat-ice', 'campaign', {mats: {harbor: 4}}],
    ['Создайте вещь по рецепту', 1, 'book', 'forge'], ['Повысьте Благословение', 1, 'crown', 'blessing'], ['Потратьте золото на улучшения', 100000, 'coins', 'forge']],
  [['Призовите спутника', 10, 'companion', 'companions', {res: {seal: 2}}], ['Улучшите спутника', 2, 'people', 'companions'],
    ['Вставьте камень в гнездо', 2, 'gem', 'gems'], ['Объедините камни 3 → 1', 1, 'gem', 'gems'], ['Победите врагов вместе со спутниками', 200, 'axes', 'campaign']],
  [['Пройдите испытание Царства тьмы', 2, 'portal', 'realm', {chaosite: 6}], ['Улучшите реликвию', 1, 'relic-shard', 'relic'],
    ['Соберите эссенцию', 30, 'essence', 'realm'], ['Наденьте тёмную вещь', 1, 'dusk-stone', 'darkgear'], ['Победите стража портала', 1, 'portal', 'realm']],
  [['Сразитесь на Арене', 5, 'arena', 'arena', {tokens: 30}], ['Победите на Арене', 3, 'medal', 'arena'],
    ['Смените руну навыка', 1, 'rune', 'skills'], ['Нанесите критические удары', 120, 'lightning', 'campaign'], ['Выиграйте бой без поражения', 10, 'shield', 'campaign']],
  [['Пройдите Логово', 3, 'lair-keeper', 'dungeon'], ['Откройте Рог Трофеев', 30, 'horn', 'loot', {gems: 30}],
    ['Улучшите снаряжение', 5, 'hammer', 'forge'], ['Призовите спутника', 5, 'companion', 'companions'], ['Сразитесь на Арене', 3, 'arena', 'arena', {gold: 50000}]],
];

export function carnivalFixture(now = Date.now(), {daysAgo = 3 + 11 / 24 + 44 / 1440 + 52 / 86400, points = 340, progressDays = 3} = {}): CarnivalView {
  const startsAt = now - daysAgo * DAY;
  const tasks: CarnivalTask[] = table.flatMap((rows, d) => rows.map(([text, goal, icon, route, reward], i) => {
    const day = d + 1, open = day <= progressDays + 1;
    const progress = !open ? 0 : day <= progressDays ? (i < 4 ? goal : Math.floor(goal * .6)) : Math.floor(goal * [1, .4, 1, 0, .7][i]);
    return {id: `d${day}t${i + 1}`, day, text, goal, progress, points: 20, reward, route, icon, claimed: day < progressDays && i < 4 || day === progressDays && i < 2};
  }));
  return {
    periodId: new Date(startsAt).toISOString().slice(0, 7), startsAt, endsAt: startsAt + 7 * DAY, claimUntil: startsAt + 9 * DAY, points,
    tiers: [
      {points: 100, reward: {gems: 20, gold: 30000}, claimed: true},
      {points: 200, reward: {horn: 20, mats: {ice: 6}}, claimed: true},
      {points: 300, reward: {gems: 30, chaosite: 5}, claimed: false},
      {points: 400, reward: {gold: 75000, horn: 30}, claimed: false},
      {points: 500, reward: {gems: 50, res: {ess: 40}}, claimed: false},
      {points: 600, reward: {gems: 200, horn: 50, chaosite: 20}, claimed: false, title: 'Сундук Великого карнавала'},
    ],
    tasks,
  };
}
