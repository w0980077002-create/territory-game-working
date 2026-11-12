# TRACEABILITY MATRIX — проверка полноты Lootborn Warriors

**Дата:** 12.11.2026. **Назначение:** не забыть ни один раздел, механический результат и негативный сценарий из полного GDD и открытого аудита. Этот список не означает, что функции уже реализованы. 

Источники: [основное ТЗ](GDD_OWNER_CONSOLIDATED_RU.md), [дополнение](LOOTBORN_FULL_SYSTEMS_APPROVED_20261112_RU.md), [глубокий аудит и ссылки](LOOTBORN_DEEP_AUDIT_20261112_RU.md), [точные версии, экономика и каталоги](LOOTBORN_PRECISION_AUDIT_ECONOMY_CATALOGS_20261112_RU.md), [официальные подробности 2026](LOOTBORN_2026_OFFICIAL_PATCH_MECHANICS_RU.md), [сезонные камни и маунты](LOOTBORN_2026_SEASON_GEMS_MOUNT_FORGE_CN_RU.md), [100%-экран](SCREEN_100_PERCENT.md). 

**Статус реализации всех строк на дату записи — НЕ НАЧАТО**. OWNER = утверждено владельцем; GLOBAL-OFFICIAL/ GUIDE и CN-OFFICIAL/COMMUNITY относятся к проверяемости источника, а не к готовности. Цифры CN нельзя автоматически применять в глобальном билде.

## A. Оболочка, интерфейс и onboarding

| ID | Механика/экран | Минимальная проверка готовности | Происхождение |
|---|---|---|---|
| A01 | 100%-главный экран | Сравнение с утверждённым PNG, все размеры/слои/кнопки; нет подмены дизайна | OWNER |
| A02 | Portrait/layout | 320/360/390/430 px и 480×854 desktop; safe-area и 100dvh | OWNER |
| A03 | Профиль | Аватар, ник, уровень, VIP, CP, HP; длинные ники | OWNER/GLOBAL |
| A04 | Валютный HUD | Счётчики, формат крупных чисел, +, переходы в магазин | OWNER/GLOBAL |
| A05 | Прогресс главы | Текст главы/стадии, цепь волн и босса, кнопка входа | OWNER/GLOBAL |
| A06 | Боковые кнопки | Задания, события, друзья, награды, приглашение, рынок, испытания, Арена | OWNER |
| A07 | Нижнее меню | Вкладки, крупная игровая кнопка, достижимость без скролла сцены | OWNER |
| A08 | Первый запуск | Выбор героя, обучение, первые награды, первые предметы | GLOBAL-GUIDE |
| A09 | Локализация | RU/EN, русские длинные подписи, цифры/единицы | OWNER |
| A10 | Настройки | Звук/музыка/графика/вибрация/язык/помощь/промокоды | GLOBAL-GUIDE |
| A11 | Разблокировка режимов | По уровню/стадии/дню сервера с объяснением причин | GLOBAL/CN |
| A12 | Событийные badges | Неполученные награды/красные точки/таймеры не врут | GLOBAL/CN |
| A13 | Почта | Получение один раз, срок, вложения, массовое получение | GLOBAL/CN |
| A14 | Уведомления | Таймер/босс/ресурс/награда/обслуживание; изоляция от Telegram уведомлений | GLOBAL/CN |

## B. Бой и основной цикл

| ID | Механика/экран | Минимальная проверка готовности | Происхождение |
|---|---|---|---|
| B01 | Живое сражение | Hero и спутники слева, враги справа, атаки/HP/замахи | OWNER |
| B02 | Волны и боссы | 4 обычных + босс 5-й, 30с, фарм при поражении | OWNER |
| B03 | Классы врагов | Мили, дальние, танки, черепаха, мини-боссы, многофазные боссы | OWNER |
| B04 | Боевые эффекты | Крит, отлёт, экипировка летит, hitstop, shake, комиксные плашки | OWNER |
| B05 | x1/x2 | Бесплатное ускорение без разгона экономических таймеров | OWNER |
| B06 | Автобой | Toggle и удержание, корректное возобновление после модалки | OWNER |
| B07 | Рог Трофеев | Заряд, падение сундука, реальный лут, cooldown/regen | OWNER |
| B08 | Умения | Визуальный CD, MP, авто/ручной каст, порядок событий | OWNER/GLOBAL |
| B09 | Поражение/результат | Фарм/повторный босс/закрытие/отказ/сохранение | OWNER |
| B10 | Фазы и AI | Разные роли и реакции, таймеры, контроль, анти-создание дубликатов | OWNER |
| B11 | Статы боя | ATK, DEF, HP, ASPD, crit, lifesteal, dodge, reductions, DoT, heal | OWNER |
| B12 | CP и сравнение | Исходная формула автора, пересчёт после смены сета/крыльев/спутника | OWNER |
| B13 | Офлайн возврат | 12h из GDD, конфликт с гайдом не скрыт; нужен A/B тест оригинала | OWNER/UNVERIFIED |
| B14 | Повторное открытие | Ресурсы и волна не удваиваются после reload/второго устройства | TECH |

## C. Обычное снаряжение, крылья, визуал

| ID | Механика/экран | Минимальная проверка готовности | Происхождение |
|---|---|---|---|
| C01 | 12 основных слотов | Не 10, точные два недостающих названия не выдумывать | OWNER |
| C02 | 13-е крылья | Отдельный предмет, за спиной персонажа, проценты реально действуют | OWNER |
| C03 | Смена крыльев | Новые % заменяют старые, прежние снимаются, CP пересчитывается | OWNER |
| C04 | Скрытие вида крыльев | Morph может скрывать графику без снятия бонуса; сверить | GLOBAL-GUIDE |
| C05 | Paper Doll | Оружие/шлем/крылья реально меняют арт героя в бою | OWNER |
| C06 | Редкости лута | 9 качеств по гайду; точная таблица цветов и доступности по версии | GLOBAL-GUIDE |
| C07 | Модалка лута | Две вещи, ΔCP/статы, надеть/распылить, кнопки работают | OWNER |
| C08 | Авторазбор | Порог качества, сравнение CP, исключения, подтверждение опасных | OWNER |
| C09 | Инвентарь | Фильтр, сортировка, вместимость, склад, item IDs, описание | GLOBAL/CN |
| C10 | Кузница | Цена золото, уровни, улучшение, связи с редкостями отдельно от Blessing | OWNER |
| C11 | Комплекты | 2/4/6-piece эффект, реальные баффы и UI подсказки | GLOBAL/CN |
| C12 | Umbra отдельно | 12 тёмных позиций, random affixes, наборы, loot levels | GLOBAL-GUIDE/CN |
| C13 | Реролл | 6 affixes, часть доступна для reroll, материалы, журнал | CN-COMMUNITY |
| C14 | Гнёзда/камни | Вставить, снять, 3 одинаковых слить, сохранить ранги | GLOBAL/CN |
| C15 | Eternal/season gear | Eternal forge, Blueprints/Meteorite, пределы экипировки | CN-OFFICIAL |
| C16 | Morph | Облики полученных предметов, отдельные визуал/статы | GLOBAL-GUIDE |
| C17 | Пресеты предметов | PvE/PvP/Dark Realm, запрет потери предмета при switch | GLOBAL/CN |

## D. Классы, навыки, руны, таланты

| ID | Механика/экран | Минимальная проверка готовности | Происхождение |
|---|---|---|---|
| D01 | 3 авторских класса | Берсерк/Следопыт/Рунолог по первоначальному GDD | OWNER |
| D02 | Оригинальные классы | Варвар/Маг/Arcanist/Shadow Ranger по версиям; разделять | GLOBAL/CN |
| D03 | Смена класса | Профиль/сборка, корректные статы/спрайт | GLOBAL-OFFICIAL |
| D04 | 5 категорий навыков | Basic, Core, Control, Support, Ultimate; + passives | GLOBAL-GUIDE |
| D05 | Авторские 3 активных | Сохранить 3 слота первоначального ТЗ до решения о полном loadout | OWNER |
| D06 | Руны-ветви | Огонь/Гром/Пир, Ярость/Кожа/Ускорение, Пробитие/Цепь/Жадность | OWNER |
| D07 | Реальные runic sets | Strike/Shard, Whirlwind/Thunder, Ragnarok и т. д. | GLOBAL-GUIDE |
| D08 | Прокачка/merge | Повторы, уровни, отсутствие потерянных материалов | OWNER |
| D09 | Система summon | Качество, стоимость, pity, честные шансы — неизвестные не выдумывать | GLOBAL-GUIDE |
| D10 | Пассивы | Слоты, Aura, MP regeneration, CD, статические бонусы | GLOBAL/CN |
| D11 | Древо Ярости/Стойкости/Удачи | Очки за уровень, сброс за золото и UI | OWNER |
| D12 | Zenith | Дополнительные очки/сброс после level gate, старые данные источника | GLOBAL-GUIDE |
| D13 | Сезонные таланты | Отдельная конфигурация, не смешивать с базовыми | CN-OFFICIAL |
| D14 | Общие рунические уровни | Общая прогрессия по классам в CN; сверить доступность | CN-OFFICIAL |

## E. Спутники, коллекция, крылья и mount

| ID | Механика/экран | Минимальная проверка готовности | Происхождение |
|---|---|---|---|
| E01 | Спутник main/support | Схема по источнику 1+2 support; визуал по 100%-сцене | GLOBAL-GUIDE/OWNER |
| E02 | Базовые 4 союзника из GDD | Кабан, друид, Брок, Валькирия; способности действуют | OWNER |
| E03 | Набор спутника | Animite, обновления магазина, rarity, лимиты | GLOBAL-GUIDE |
| E04 | Уровень спутника | Anima Essence, эффективность, пределы | GLOBAL-GUIDE |
| E05 | Звёзды/Ascension | Дубликаты, поглощение и предупреждения | GLOBAL-GUIDE |
| E06 | Codex | Бонус за новый экземпляр, уровни коллекции | GLOBAL/CN |
| E07 | Союзные связи | Материалы, awakening, уровни, гейты | CN-OFFICIAL |
| E08 | Смерть и revives | Уроны/баффы от main корректно прекращаются/возвращаются | GLOBAL-GUIDE |
| E09 | Ездовые животные | Сбор, уровень общий, звёзды, корм, способности | CN-OFFICIAL |
| E10 | 4 предмета mount gear | Статы, умения, улучшения, передача | CN-OFFICIAL |
| E11 | Внешний вид | Морфинг/Hide wings и разница между косметикой/силой | GLOBAL/CN |

## F. Ресурсы, лагерь, благословение, исследования

| ID | Механика/экран | Минимальная проверка готовности | Происхождение |
|---|---|---|---|
| F01 | Chaosite | Отдельный боевой ресурс; не равен Рогу | GLOBAL-GUIDE |
| F02 | Gold/Gems/Dark Gold | Три разных единицы, источники и списания | GLOBAL/CN |
| F03 | Crystals/Haste Scrolls | Вклад в Blessing и ускорение | GLOBAL-GUIDE |
| F04 | Blessing Tree | Отдельно от кузницы, таймер/цена/шанс редкостей | GLOBAL-GUIDE |
| F05 | Honor promotions | Gate уровня и EXP carry-over | GLOBAL-GUIDE |
| F06 | Шахты/лагерь | Четыре основных типа добычи, таймеры/уровни | GLOBAL-GUIDE |
| F07 | Автошахта | Платная привилегия и длительность из CN; глобально не подтверждено | CN-COMMUNITY |
| F08 | Chaos Ranch | Вызов, Blitz, расход энергии, награды | GLOBAL-GUIDE |
| F09 | Library | Shell, bombs, statues, research, sages, cooldown | GLOBAL-GUIDE |
| F10 | Задания/ежедневки | Daily, weekly, storyline, milestones, reset | GLOBAL/CN |
| F11 | Achievement/reward claims | Забрать однократно, этапы, сезонные ограничения | GLOBAL/CN |
| F12 | Ресурсный журнал | Единый транзакционный ledger без двойных трат | TECH |

## G. PvE и высокоуровневые режимы

| ID | Механика/экран | Минимальная проверка готовности | Происхождение |
|---|---|---|---|
| G01 | Главная кампания | Глава/этап/враги/босс/награды, replay | OWNER/GLOBAL |
| G02 | Realm of Darkness | Ключи, этажи, награды, setback после поражения | GLOBAL-GUIDE |
| G03 | Umbra sets | Редкости, сет-бонусы, эффекты, переролл | GLOBAL/CN |
| G04 | Ancient Ruins | Вход, награды, карта, статус не все параметры известны | GLOBAL-OFFICIAL |
| G05 | Hero Tavern | Вкладка/ивент/награды | GLOBAL-OFFICIAL |
| G06 | Boss raids | Многофазность, попытки, награды, общий журнал | GLOBAL/CN |
| G07 | Trial Tower | Этажи, сопротивления, связки боссов, рост сложности | CN-OFFICIAL |
| G08 | Greed/Despair/Endless Abyss | Разные PvE режимы, сезонные правила, ранги | CN-OFFICIAL |
| G09 | Apocalypse Rift/Seasonal Realm | Сезонная добыча, экипировка, уровень | CN-OFFICIAL |
| G10 | Trial Dungeon co-op | Совместный режим двух билдов, награды | CN-OFFICIAL |
| G11 | Realm Hunt | Скрытые боссы 70+, обмен эмблем | CN-OFFICIAL |
| G12 | Eternal forge | Чертежи/метеориты/материалы и reroll limitations | CN-OFFICIAL |

## H. PvP, социальное и гильдейское

| ID | Механика/экран | Минимальная проверка готовности | Происхождение |
|---|---|---|---|
| H01 | Арена TERRITORY | Перенос выбранной механики в новый проект, старую не менять | OWNER |
| H02 | Dome War | Рейтинг, билеты, соперник, награды, refresh | GLOBAL-GUIDE |
| H03 | Дружеский спарринг | 60 сек без награды в CN; проверить целевую версию | CN-OFFICIAL |
| H04 | Турниры/лидерборды | Сезон, weekly reset, очки, выдача | GLOBAL/CN |
| H05 | Гильдии | Вступить, должности, члены, вклад, чат, магазин | GLOBAL/CN |
| H06 | Гильдейский босс | Попытки, урон, результаты, рейтинг | GLOBAL/CN |
| H07 | Cross-server wars | Сезонные PvP зоны/храм/ограничения | CN-OFFICIAL |
| H08 | Guild bounty | Пн-Ср, 5 заданий в день по CN, награды | CN-OFFICIAL |
| H09 | Lost Treasury | Анонс CN: 4 гильдии, 5 карт, выбор/топливо/таймер | CN-PREVIEW |
| H10 | Друзья/приглашения | Ник/профиль, deep-link, защита самореферала | OWNER |
| H11 | Подарки/передача | Коды подтверждения и rollback по CN, серверные проверки | CN-OFFICIAL |

## I. Сезоны, ивенты, реликвии, исследования

| ID | Механика/экран | Минимальная проверка готовности | Происхождение |
|---|---|---|---|
| I01 | 7-Day Carnival | Задания дня, progress, забрать, expiration | GLOBAL-GUIDE |
| I02 | Relics/Artifacts | Fabled/Mythic, звёзды, Hammers, пассивные бонусы | GLOBAL/CN |
| I03 | Miracle Relics | 5 Mythic stars gate, карты, 3 зоны и scouting XP | CN-OFFICIAL |
| I04 | Seasonal Gems | Обычные/сияющие, гнёзда, scoring, улучшения | CN-OFFICIAL |
| I05 | Engravings | Слоты, резонанс, предустановка, наборы | CN-OFFICIAL |
| I06 | Emblems/Hero albums | Ранговые коллекции, тематические награды | CN-OFFICIAL |
| I07 | Мировые/годовщинные события | Сезонные задачи, отдельная валюта/таймер/награды | CN-OFFICIAL |
| I08 | Сезонная миграция | Сброс временных ресурсов vs постоянный прогресс | CN-OFFICIAL |
| I09 | Временные коллаборации | Только по отдельным правам и решениям владельца | CN-OFFICIAL |
| I10 | Схема всех reward tiers | Таблица, доказательство источника, не подставлять неизвестные | TECH |

## J. Магазин, оплаты, выплаты, промокоды

| ID | Механика/экран | Минимальная проверка готовности | Происхождение |
|---|---|---|---|
| J01 | App Store SKU | 10 глобальных украинских ценовых ступеней с проверенной датой | GLOBAL-OFFICIAL |
| J02 | Китайские цены | Все CNY-предложения помечены отдельным регионом | CN-COMMUNITY |
| J03 | First Top-Up | Карточка/одна покупка/многошаговая выдача по источнику | GLOBAL/CN |
| J04 | Daily/Weekly/Monthly | Лимиты, reset, условия доступности | GLOBAL/CN |
| J05 | Monthly/Lifetime privileges | Разные права и сроки, не гадать цены Stars | GLOBAL/CN |
| J06 | Auto mine privilege | Лимит и цена по целевому серверу | CN-COMMUNITY |
| J07 | Growth/Blessing/Level funds | Milestone, claimed, locked, region price | GLOBAL/CN |
| J08 | Battle/Season Pass | Free/paid дорожки, XP, обнуление, награды | GLOBAL/CN |
| J09 | Event exchange shops | Временные валюты, скидки, лимиты | GLOBAL/CN |
| J10 | Rune/companion shop | Пулы, rarity, pity, refresh, цены | GLOBAL-GUIDE |
| J11 | Rewarded Ads | Показ, серверная верификация, разовая награда, лимит | GLOBAL-OFFICIAL/TECH |
| J12 | Telegram Stars | Отдельная тестовая и реальная схема, чек по invoice | OWNER/TECH |
| J13 | Redeem Codes | Срок, регион, однократное использование, аудит | GLOBAL-GUIDE |
| J14 | Refund/Failed purchase | Никакого автоматического начисления; обработка повторов | TECH |
| J15 | VIP | Шкала/бонусы/наборы/цены до доказательства UNKNOWN | GLOBAL/UNVERIFIED |

## K. Сохранения, защита, проверки

| ID | Механика/экран | Минимальная проверка готовности | Происхождение |
|---|---|---|---|
| K01 | Telegram API | ready/expand/haptics/closing/safe-area support | OWNER |
| K02 | CloudStorage save chunks | Каждый до 4000 байт, versioning, migration, sync | OWNER |
| K03 | Device fallback | localStorage только тест, не источник premium | OWNER/TECH |
| K04 | Idempotency | Одна выдача за бой/квест/покупку, reload не обманывает | TECH |
| K05 | Disconnect | Фон, закрытие, reconnect, повторный вход, серверный reconcile | TECH |
| K06 | Store edge cases | Out of stock, expired, purchased, not eligible, payment fail | TECH |
| K07 | Inventory protection | Без случайного удаления легендарного/ценного, квота, rollback | TECH |
| K08 | Visual QA | Побочное сравнение по настоящему 100%-PNG | OWNER |
| K09 | Android/Telegram smoke | Физический телефон, производительность, 0 перекрытий | OWNER |
| K10 | Status truth | Готово ≠ CI, не называть стоп-кадр анимацией | OWNER |

## L. Уточнённая экономика и предметные каталоги

| ID | Механика/экран | Минимальная проверка готовности | Происхождение |
|---|---|---|---|
| P01 | Ручное подземелье мини-босса | Открыть вручную → бой → разблокировать следующую главу | GLOBAL-GUIDE |
| P02 | 1 Chaosite → опыт/материал | Числа 10 EXP/30 crystal только как проверяемый CN-2025 ориентир | CN-COMMUNITY |
| P03 | Неубитый враг/прерванная серия | Результат расхода Chaosite и награда не задваиваются | CN-COMMUNITY/TECH |
| P04 | EXP сверх лимита | Опыт сохраняется до Blessing/Honor promotion в CN, сверить с глобалом | CN-COMMUNITY |
| P05 | Скидка/торг гильдии | Корректная скидка без отрицательной цены и бесконечного дохода | CN-COMMUNITY |
| P06 | Поглощение спутника | Проверка потери XP, предупреждение и undo/защита редких | CN-COMMUNITY |
| P07 | Ауры main/support | Аура/талант разных юнитов правильно адресуются и умножаются | GLOBAL-OFFICIAL/CN |
| P08 | Шахты/компас | 4+2 шахты, 3+3 шахтёра, 10мин компас, 2ч refill как региональные config | CN-COMMUNITY |
| P09 | Передача карточек Hero Albums | Доступ, лимиты, возрастание серверного дня, ledger | CN-OFFICIAL |
| P10 | Strongest Warrior | 14-дневный цикл, score только в активном sprint, settlement | CN-OFFICIAL |
| P11 | Кумулятивные фонды | Учитывать расход накопительно, награду только один раз | CN-COMMUNITY |
| P12 | Monthly card Blitz | Не путать дополнительные попытки и бесплатные попытки | CN-COMMUNITY |
| P13 | 530 тёмных предметов | Использовать каталог с 12 Umbra слотами без копирования в базовые | CN-FAN-CATALOG |
| P14 | 48 skills / 72 runes | Индивидуальные эффекты, отдельные rarity/cooldown, не просто кнопки | CN-FAN-CATALOG |
| P15 | 48 Engravings | Событийные триггеры, внутренние CD, контроль рекурсии | CN-FAN-CATALOG |
| P16 | 45 Sidekicks / 13 Bonds | Не смешивать записи оригинала с 21 владельческим артом | CN-FAN-CATALOG |
| P17 | 35 Sages/274 mixed records | Типы и точная фактическая категория у каждой записи | CN-FAN-CATALOG |
| P18 | Крылья visible/hidden | Задний слой персонажа и % бонусы даже при скрытом виде | OWNER/GLOBAL-GUIDE |


## M. Точные правила официальных китайских патчей 2026 (региональные)

| ID | Механика/экран | Минимальная проверка готовности | Происхождение |
|---|---|---|---|
| M01 | Treasure maps | Неопознанная -> опознанная карта через склад; тратит нужную карту один раз | CN-OFFICIAL 2026 |
| M02 | Treasure zones | Три локации, разные loot tables и поисковый XP | CN-OFFICIAL 2026 |
| M03 | Treasure outcomes | Неудача/успех/большой успех, XP даже при неудаче | CN-OFFICIAL 2026 |
| M04 | Search level | Порог суммарно 5 мифических звёзд, улучшение со временем/свитком | CN-OFFICIAL 2026 |
| M05 | Miracle relic item | Равная/лучшая звезда сохраняется, худшая распыляется, базовый уровень фиксирован | CN-OFFICIAL 2026 |
| M06 | Boss Auto threshold | 1/3/5 попыток и 1/3/5 поражений с понятной причиной остановки | CN-OFFICIAL 2026 |
| M07 | Shared realm floor | Общий прогресс этажа по классам после патча, не сбрасывать при switch | CN-OFFICIAL 2026 |
| M08 | Endless skip | Число пропущенных волн зависит от оставшегося времени | CN-OFFICIAL 2026 |
| M09 | Event Blessing token | 10/day и +10 с monthly (историч. event), разный loot quality | CN-OFFICIAL 2026 |
| M10 | Event leftovers/mail | Неиспользованные coins/statues не исчезают, pass rewards высылаются | CN-OFFICIAL 2026 |
| M11 | Relic quality promote | Повышение после max stars, успех случайный, шанс повышается после неудачи | CN-OFFICIAL 2026 |
| M12 | Relic star mini-ranks | 4 шага на звезду, 1–5 и 6–10 требуют разные материалы | CN-OFFICIAL 2026 |
| M13 | Engraving bulk safety | 100000 nectar — UI threshold; улучшение до 30, защитный фильтр распыления | CN-OFFICIAL 2026 |
| M14 | Changed pack price | ¥30 заменён ¥18 в CN 2026, старая карточка не остаётся действующей | CN-OFFICIAL 2026 |
| M15 | Retro compensation | 2 недели для fund, 1–3 рабочих дня + 90d lookback для packs, idempotent | CN-OFFICIAL 2026 |
| M16 | Gift restricted chest | Предметы/сундуки могут быть server-tradeable=false, включая вложения | CN-OFFICIAL 2026 |
| M17 | PvPvE extraction | 10sec protection/8min max/2min chest refresh/30% loot risk (CN past event) | CN-OFFICIAL 2026 |
| M18 | Boss affix floor60 | 50% physical resist, DoT→heal 10% missing HP, aura/en regen | CN-OFFICIAL 2026 |
| M19 | Boss affix floor70 | 95% crit resist, каждые 2с 3 charges shield, 30% dodge | CN-OFFICIAL 2026 |
| M20 | Boss affix floor80 | DoT удаляет реген-стек, без DoT добавляет, max20, 5%/stack | CN-OFFICIAL 2026 |
| M21 | Boss affix floor90 | 80% ATK Thorns per hit, 95% crit resist, CC иммунитет кроме slow | CN-OFFICIAL 2026 |
| M22 | Boss affix floor110 | Buff stacks+2s, успешный CC удаляет 2, cleanse cooldown | CN-OFFICIAL 2026 |
| M23 | Boss affix floor130 | 95% DoT resist, одиночный удар >5% босса снимает 2 buff stacks | CN-OFFICIAL 2026 |
| M24 | Skill loadout 2026 | Официальный CN гайд 5 активных и 4 пассива; конфликт с OWNER 3 слота на главном экране зафиксирован | CN-OFFICIAL/OWNER |
| M25 | Warlock and S3 status | Зимний Warlock и S3 — анонс, не falsely shipped; механика summons-proc в плане | CN-PREVIEW 2026 |


## N. Сезонные камни, отдельная сила и синтез Mythic снаряжения ездовых животных (CN 2026)

| ID | Механика/экран | Минимальная проверка готовности | Происхождение |
|---|---|---|---|
| N01 | Сезонные камни 2+1 | На слот предмета 2 обычных +1 сияющий, тип гнезда проверять | CN-OFFICIAL 2026 |
| N02 | Separate seasonal score | Сезонные камни не повышают базовый CP, но улучшают сезонные статы | CN-OFFICIAL 2026 |
| N03 | Desperate Abyss only flawless | Только безупречный аффикс; сезонные статы не действуют | CN-OFFICIAL 2026 |
| N04 | Seasonal gem sources | Обычные из Apocalypse Invasion; сияющие из Boss Hunt; 3 sweep/день | CN-OFFICIAL 2026 |
| N05 | Boss HP bars & gem drops | За больше HP-полос и более высокого босса — соответствующая модель наград | CN-OFFICIAL 2026 |
| N06 | Season end gem return | Сезонный reset, конвертация в обычные и выдача по почте | CN-OFFICIAL 2026 |
| N07 | First clear once | Личный и общий в группе серверов первый проход: два независимых одноразовых claim | CN-OFFICIAL 2026 |
| N08 | Desperate Abyss chapters | Каждая сложность 3 этапа, 1-й открывает следующую, рейтинг tie-earliest | CN-OFFICIAL 2026 |
| N09 | New Dark gear & engravings | 3 класса ×7 Dark pieces=21; 12 engravings c отдельными источниками | CN-OFFICIAL 2026 |
| N10 | Ice-shield counter | Щит 10% maxHP/сек, 20 ice hits за 3сек отключают на 10сек | CN-OFFICIAL 2026 |
| N11 | DoT-counter regeneration | Стек регена каждые 2сек без DoT, DoT снимает стек; max20 | CN-OFFICIAL 2026 |
| N12 | Doom Orb timeout & cancel | Через 10сек 80% maxHP и 6с stun; прерывание при bossHP ниже35% | CN-OFFICIAL 2026 |
| N13 | Mount forge ingredients | 2 mythic gear same name/slot/max upgrade; префильтр | CN-OFFICIAL 2026 |
| N14 | Mount forge outcome | 95% обычный fully upgraded, 5% редкий unupgraded с min2 skills | CN-OFFICIAL 2026 |
| N15 | Mount skill inheritance | 36% per mythic skill (обычный результат), остальные reroll | CN-OFFICIAL 2026 |
| N16 | Mount merge keys | Gold keys по числу skill; 0 mythic skills → 5 silver keys | CN-OFFICIAL 2026 |
| N17 | Mount trade restriction | Если донор non-giftable, результат non-giftable, оба донора расходуются | CN-OFFICIAL 2026 |
| N18 | Mount gear set skills | Tier per 4 mythic skills, 3 совместимых эффекта, mixed = половина | CN-OFFICIAL 2026 |

## Контроль качества и источников

Итого **201 независимое требование/проверка**. Для каждого Claude должен заполнять: `status` = planned/in_progress/playable/verified_device; `owner_approved`; `last_test_date`; `evidence_url`; `source_region`; `unknown_fields[]`. Нельзя автоматически отмечать категорию как готовую, если есть только картинка, макет, PR или CI. Новые функции из обновлений добавляются с новой строкой, старые не удаляются без решения владельца.
