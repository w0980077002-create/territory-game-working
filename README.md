# VIKING VS ROME: LOOTBORN SAGA

Новая отдельная Telegram Mini App. Цель — игровой мир VIKING VS ROME с нашими персонажами и утверждённым экраном. **Работающий игровой код и ссылка уже есть:** основа Codex и «Живой мир» Claude объединены в `codex-build`.

## Для Codex и Claude: обязательный короткий порядок

1. [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) — **единственные действующие правила**.
2. [AGENTS.md](AGENTS.md) — компактная памятка для обоих агентов; Claude также использует [CLAUDE.md](CLAUDE.md).
3. [PROJECT_BRIEF.md](PROJECT_BRIEF.md) — утверждённые свойства игры, без автоматического запуска долгосрочных систем.
4. [Экран «100%»](assets/references/main-screen-100-percent.png) и **последнее прямое поручение владельца**.

Все большие исторические GDD, исследования Lootborn, старые Issue/PR и 201-пунктный список — **архив/долгосрочная дорожная карта**, а не текущие задачи. Сначала закончить имеющуюся увлекательную одиночную игру; балерину Капучино не трогать.

**21 персонаж уже распакован:** 21 PNG-мастер, 21 одиночный WebP и 10 оригиналов. [Манифест](docs/CHARACTER_MANIFEST.md) · [отчёт](assets/characters/v2-source/EXTRACTION_REPORT.json). Стоп-кадры — не анимации. Не распаковывать повторно.

**Открыть общую игру:** https://w0980077002-create.github.io/territory-game-working/ — постоянная ссылка из `codex-build`. [Порядок мобильного тестирования](docs/TEST_LINK_DELIVERY.md).

**Тестовые числа уже заданы:** [config/test-balance.v1.json](config/test-balance.v1.json). Это редактируемые тестовые значения, не цены оригинала и не реальные платежи.

## Исполнение

**Рабочая игра уже есть.** Разработчик начинает с актуального `codex-build` и **последнего поручения владельца**, не с исторического Issue #7 или #8. Не повторять стартовые этапы; беречь прогресс, утверждённых персонажей и другую действующую TERRITORY.

**История первых этапов:** [#1](https://github.com/w0980077002-create/territory-game-working/issues/1) · [#2](https://github.com/w0980077002-create/territory-game-working/issues/2) · [#3](https://github.com/w0980077002-create/territory-game-working/issues/3). Они не являются новым обязательным поручением.

## Исследовательский архив (справочник, не отдельные команды)

[Решения и расхождения](docs/DECISIONS_AND_GAPS.md) · [Описание экрана](docs/SCREEN_100_PERCENT.md) · [Аудит](docs/LOOTBORN_DEEP_AUDIT_20261112_RU.md) · [Каталоги и экономика](docs/LOOTBORN_PRECISION_AUDIT_ECONOMY_CATALOGS_20261112_RU.md) · [Магазин](docs/LOOTBORN_SHOP_PACKS_PRICES_20261112_RU.md) · [Патчи 2026](docs/LOOTBORN_2026_OFFICIAL_PATCH_MECHANICS_RU.md) · [Сезонные системы](docs/LOOTBORN_2026_SEASON_GEMS_MOUNT_FORGE_CN_RU.md) · [Архив раннего ТЗ](docs/OWNER_ORIGINAL_GDD_20261112_RU.md)

Международные и китайские данные различаются по версиям и датам: неподтверждённые цифры не выдавать за точные. Три транспортных ZIP удалены из текущего дерева GitHub по решению владельца: исходные PNG/WebP и десять оригинальных референсов уже распакованы в `assets/characters/v2-source/`. Старые ZIP остаются доступными в истории Git, но не нужны для сборки. Единственный эталон экрана — `assets/references/main-screen-100-percent.png`.
