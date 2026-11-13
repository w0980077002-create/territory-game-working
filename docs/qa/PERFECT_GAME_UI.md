# Mobile UI restoration — VIKING VS ROME: LOOTBORN SAGA

Base: `e7d55299da42c7ce48a753181e375ee3c0f27d78` on `codex-build`, including merged PR #14 (`219d28a`). No core rules, balance, save schema, reward amounts, camera, character animations or battle backgrounds were changed. No TERRITORY repository, database or player data was accessed.

## Actual causes and repairs

| Finding | Repair |
|---|---|
| Old 864px scaled modal styles leaked into native CSS-pixel dialog content, including `!important` paragraph sizing | Scoped legacy rules to `.game`; DialogShell owns its own dimensions, typography and scrolling |
| Implicit item-card grid placement could assign effect/set content to an icon column | Shared `ItemDetails` explicitly separates summary, stats and full-width effects; every 2/4/6 bonus remains rendered |
| Forge material grid exceeded the dialog width | Explicit shrinking columns and full readable material labels; checked inner scrollWidth, not only page overflow |
| Build rows with two fixed-width actions squeezed the description | Description spans the row; Save/Equip occupy a separate action row |
| Android native selects opened full-screen system menus | Shared `CompactFilter` uses the browser top-layer popover, game-sized options, selected value, keyboard navigation, Escape, focus return and outside-touch dismissal |
| Narrow media rule replaced Telegram safe-area with a fixed 9px inset | Safe-area calculations persist at all tested widths, including left/right Telegram insets |
| Autobattle had separate focus/layout behavior and oversized controls | Shared DialogShell, segmented ×1/×2, draft settings, fixed Save/Cancel footer and focus trap |
| Toasts were absolutely positioned over controls | Status is a bounded layout row between header and content |
| Generic bulk-selection controls were large outside the backpack | InventoryGrid owns compact controls consistently in equipment and storage too |
| Excess decoration pushed decisions down | Removed duplicate loot/gear/hero banners and forge weapon art; new item appears before equipped comparison; guides use accessible disclosures |
| Background refill/autosave recreated `p` and reset bulk confirmation every 15 seconds | Confirmation depends on selected item identities/values and filters; execution still revalidates protection in the store |

The base `e7d5529` **already prevented the reported icon-width set column in its comparison view** in our reproduction. We did not claim to reproduce the owner's old screenshot on that base. Its implicit placement rules were replaced with a shared structural solution, including equipment and forge. Automated checks assert normal set width and that all three bonus texts remain present and unclipped.

## Art and actual controls

Original walnut/mahogany, hammered iron and woven lining WebP textures plus an authored iron/rope/rivet SVG corner total about 83 KiB. Only dialogs use these assets; the approved battlefield/HUD materials are preserved. Item illustrations, rarity, capacity, storage and actions use real game data. No fake consumable/material tabs or decorative item stars were invented.

The inventory retains capacity 80, separate storage, mass selection, protection and confirmation. Auto-salvage uses the existing preference and existing protected-item rules. At 320×568 the default chest shows 12 item cells; larger phones show more. The item tray is its only scrolling area.

## Coverage and evidence

- **Production build, Chromium touch emulation:** 320×568, 360×780, 390×844, 430×932 CSS px.
- **156 window checks:** 39 routes/states × four sizes. Inventory, hero, equipment, all 13 gear slots including percentage wings, new loot/comparison, forge, skills/runes, talents, companions, quests, rewards, shop, port, adventure, arena, events, collection, menu/settings, combat controls, battle summary, trophy horn, wings acquisition, blessing, relic, friends and invitation.
- **Additional profiles:** early stage 1 with empty inventory/equipment/storage and late stage 60 with 80 inventory + 41 stored items, 56 checks each at 320/390. These sweeps used the original 28-window list; the final 156-check sweep includes every gear slot.
- **80 expanded/changed states:** saved builds with all three populated rows, all four quest tabs, hunting/trophy disclosures, all six set recipes, selected runes, evolved companions, daily reward claimed, purchased shop offer, ready/claimed event reward and actual newly generated loot. Four sizes.
- **Item variants:** common, rare, epic, legendary, named, set, upgraded, perk and combined unique/set/perk/engraving; 36 presentations across four sizes. All 2/4/6 descriptions remain visible at normal width.
- **Interactions:** touch/keyboard filter selection, last option visible on reopening, Escape closes filter only, outside touch, parent scroll dismissal, Tab cycle, storage capacity/claim, bulk cancel/confirm, confirmation surviving background mutate, low-rarity valuable-item confirmation, equip/swap and reload.
- **Recovery:** corrupt original preserved, Escape cannot dismiss recovery, import cancellation, restoration with raw backup, export and reload; long notification occupies layout space. Isolated 320/390 profiles.
- **Battle:** existing ON/OFF and partial-journey reload checks passed for stages 1/34 at 320/390, with no page errors or failed asset responses.
- **Logic:** `npm test` — 162 passed, 0 failed. Production build passed. Vite still reports its existing large main-bundle warning (~972 KB raw / 287 KB gzip); this change does not introduce an always-running effect.

Geometry checks fail on page overflow, inner clipped content, narrow set blocks, more than one content scroller, a dialog outside the viewport or header/footer buttons below 44 CSS px/outside the viewport. Closing is exercised with real taps after scrolling to the end. Reload compares actual inventory, equipment, stored loot, level and currencies.

Evidence: [geometry](perfect-game-ui/geometry.json), [interactions](perfect-game-ui/actions.json), [expanded states](perfect-game-ui/subpanels.json), [recovery](perfect-game-ui/recovery.json), [battle](perfect-game-ui/battle.json).

## Visual iteration and independent criticism

Real screenshots caught issues that builds/tests did not: inflated perk text after a cascade conflict, fused hero labels/values, metal decoration over a footer button, stacked autobattle actions and the forge CTA below the fold. All were corrected and captured again. A separate read-only critic inspected final 320px hero, inventory, forge, autobattle and bulk confirmation, plus 390px item/set and inventory, and independently exercised the production filter's last option/focus/Escape behavior. No blocker remained in those checks; this is not a claim that the critic personally inspected every window.

| Evidence | Image |
|---|---|
| Before: plain chest | [390px](perfect-game-ui/before-inventory-390.png) |
| Before: new item starts below the fold | [320px](perfect-game-ui/before-loot-320.png) |
| Chest after repair | [390px](perfect-game-ui/inventory-390.png), [320px](perfect-game-ui/inventory-320.png) |
| Full-width set, 2/4/6 and engraving | [320px](perfect-game-ui/loot-set-320.png) |
| Compact game filter | [320px](perfect-game-ui/filter-320.png) |
| Forge CTA / autobattle | [Forge](perfect-game-ui/forge-320.png), [Autobattle](perfect-game-ui/autobattle-320.png) |
| Hero / valuable-item confirmation | [Hero](perfect-game-ui/hero-390.png), [Confirmation](perfect-game-ui/confirmation-320.png) |
| Corrupt-save recovery | [320px](perfect-game-ui/recovery-320.png) |

## Reproduction

Use the repository dependencies (`npm ci`), Playwright and installed Chromium. Playwright is a QA runner only; it is not part of the shipped game. This environment supplies it through `NODE_PATH=/opt/codex/cua_node/lib/node_modules`; elsewhere install Playwright locally without changing the application lockfile. Generate fixtures with `node --import tsx scripts/qa/fixtures.ts`, build and serve the built game on 4173, then run:

```sh
BASE_URL=http://localhost:4173/ OUT=.tmp/ui-release ALL_SHOTS=1 node scripts/qa/ui-audit.cjs
BASE_URL=http://localhost:4173/ node scripts/qa/ui-actions.cjs
BASE_URL=http://localhost:4173/ node scripts/qa/ui-subpanels.cjs
BASE_URL=http://localhost:4173/ node scripts/qa/ui-recovery.cjs
```

All scripts use separate `?testProfile=ui-*` keys. They never read the owner's normal profile or call real Telegram CloudStorage. Screenshots and downloads stay under `.tmp` unless selected as review evidence above.

## Verification limits

Physical Android and Telegram were **not** tested. Safe-area behavior was emulated with CSS variables; real Telegram CloudStorage was covered by existing mocked logic tests, not a live Telegram session. Firefox/Safari, on-screen keyboard behavior and device-specific GPU performance are not claimed. Visual acceptance against the owner's reference remains a human judgement; publication and passing tests do not constitute the owner's acceptance.
