# Codex · Viking vs Rome

Изолированная от действующей TERRITORY браузерная игра VIKING VS ROME, рабочая ветка `codex-build`. Codex и Claude последовательно расширяют один и тот же код. React 19 + TypeScript strict + Vite, Zustand, Canvas 2D.

- `core`: типы, исходные damage/CP formulas, транзакции прогресса, локальный versioned save и Telegram CloudStorage с чанками <4000 байт. Каждое действие сохраняется; visibilitychange/15 sec — резерв. Клиентский прогресс не является доверенной серверной экономикой.
- `data`: 21 утверждённый персонаж, 12 основных слотов + wings, навыки/руны/классы, TEST_ONLY баланс из config.
- `game`: requestAnimationFrame, walk/attack/hurt/death, деформация сегментов PNG-мастеров и независимые оружие/крылья, AI, projectiles, damage numbers, particles, 4 waves + 30-second boss, defeat/farm/retry.
- `ui`: композиция 864×1536 с пропорциональным масштабированием, Canvas за HUD, модальные вкладки. Сетка 12+1, отдельный задний слой крыльев; клик по вещи → сравнение и настоящая транзакция.
- Состояние: persisted player/inventory/equipment/skills/runes/companions/talents/shop/quests; ephemeral combat/cooldowns/particles. Reload начинает текущую волну заново без повторной награды. Ресурсы и предметы начисляются одной синхронной транзакцией.
- Центральный гексагон с топорами управляет боем: START / PAUSE / RESUME без сброса волны, HP и повторной выдачи наград. Auto управляет навыками, x1/x2 — скоростью боя. Рог и боевая сводка открываются отдельно.
- Слоты 11/12 имеют нейтральные тестовые названия с UNVERIFIED в данных. Визуальная композиция и правила OWNER имеют приоритет. Сохранена конфигурируемая офлайн-награда до 12 часов; точное соответствие оригиналу не подтверждено. Forge и Blessing раздельны.
- Публикация: отдельный GitHub Actions workflow только codex-build → GitHub Pages, без main. Нужен включённый Pages / GitHub Actions в Settings (интеграция не имеет Administration).

## Дальнейший полный объём
Этапы и все 201 проверки из docs/IMPLEMENTATION_PLAN.md и docs/LOOTBORN_FEATURE_CHECKLIST_20261112_RU.md сохраняются: основной loop → каталоги/классы/руны/Forge/Blessing/спутники/таланты/PvE → серверный PvP/гильдии/сезоны/события → региональные системы и все крайние состояния → физические Android/Telegram и приёмка владельцем. Наличие пункта в этой схеме не означает, что он реализован. Реальные платежи отключены. Будущие серверные системы нельзя выдавать за работающий multiplayer.
