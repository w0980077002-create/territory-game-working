# Issue #8 — internal verification, 2026-11-12

Base: `5b52477` on `codex-build`, including RPG loot commit `72b7ec6`.

## Coverage

Every row below opened in live Chromium at 320×640, 360×844, 390×844 and 430×844. 152 panel/width combinations: no horizontal content overflow; 44px close target; fixed footer remains inside viewport; local scroll; background inert. No page exceptions or failed asset requests.

| Panels | Material / scene | Action checks |
|---|---|---|
| equipment, inventory | oak vault, velvet cells, real hero | slots, filters/order, item selection; 80 places and pending counter |
| item | item rarity, trophy spotlight | real boss drop, protected salvage disabled, equipped from full backpack, old item retained in pending |
| gear: all 13 slots | charred oak, forge | preview, confirmation, actual +1, one spend; stale duplicate rejected; reload retained +1 |
| forge | fire workshop | same real training handler; price/resource/next drop-level visible; equipped items lead to their upgrade preview |
| skills, talents | carved ice stone | actual rune selected and retained across reload; unaffordable training / no talent points disabled |
| hero, wings, companions | moonlight, leather, actual art | current class and real equipped wings behind hero; existing class/training/visibility handlers retained |
| port, adventure, quests | fjord / map table | workshop and mode navigation; free selection remains separate from paid start; hunt/chronicle real data |
| arena, controls, battle | Roman bronze / standards | training label preserved; actual axes pause/resume, Auto and x1/x2 preserved |
| rewards, events, blessing | warm gold | genuine claimed / eligible states and resource guards retained |
| relic | cold stone, separate progression | real rank/attack and price, unaffordable action disabled |
| shop | merchant vault | TEST shop label; real prices; full-horn rejection notice visible in portal |
| collection | moonlit album | all 21 original small WebP assets; current party/encounter marked honestly; no invented historical unlocks |
| friends, invite, menu | travel desk | copy/settings/save controls retained; keyboard Menu → Inventory stays inside dialog |
| recovery, import preview | shared shell / metal inset | recovery uses native-size controls; original backup/export/import mechanisms untouched |
| world cards, chronicle, trophy ribbon, HUD | shared iron/oak, semantic accents | event types retain timer/actions; fixed game composition unchanged |

## Gameplay / data checks

- 101 existing game tests pass. Production TypeScript/Vite build passes.
- Browser: axes started real travel; OFF froze the complete encounter snapshot; opening Port paused; closing did not resume automatically.
- Browser simulation exercised actual Battle.update for the four distinct first-chapter rosters and Spider Queen phases 1/2/3; reached stage 2 with one boss reward. Simulation was advanced programmatically for this check, not waited through in wall-clock time.
- Actual trophy opened from the ribbon; rarity, source, stats, CP and original item artwork rendered. Three real choices remain fixed below the scrolling comparison. Reload did not replay first reveal or grant another reward.
- Separate actual boss scenario with 80/80 inventory: new trophy retained in pending; equipping preserved 80 items and placed previous weapon on pending storage.
- Rune, upgrade and reward persisted across reload. Reduced-motion browser hid particles and retained controls.
- Browser also exercised forge/blessing/relic/hero/skill/companion training, talent allocation/reset, free wings and visibility, class switch, unequip/equip, daily claim, test shop purchase, settings, export/import/backup and recovery dialog. No page exceptions.
- Critic found portal notice stacking and keyboard panel-transition issues; both corrected and reproduced checks passed.

No formula, store transaction, drop table, save schema, combat/camera or old TERRITORY changes. Local browser storage and the same GitHub Pages host remain in use. Physical Android / Telegram WebView and device FPS were not measured.
