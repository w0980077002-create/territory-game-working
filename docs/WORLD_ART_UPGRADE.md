# Living-world art upgrade · 2026-11-13

Implemented in the existing shared game, starting from `codex-build` at `fc50aab`.

The green townsman, gray rune slab and geometric brazier were cosmetic `WorldLife` drawings. They have no collision or interaction handlers. Their world anchors and all road-event state, timings, choices, rewards and saves are preserved. The townsman now stays planted at its anchor rather than sliding without a walking animation.

Painted replacements: fur-clad bearded townsman (breathing, blink, collar gesture, gentle proximity lean), carved icy monolith (pulse and restrained motes), forged dragon brazier (eight-frame fire and snow reflection). Nearby runes and braziers brighten as the hero approaches. Existing quality limits, simulation-clock pause and reduced-motion mode are respected.

The audit also replaced schematic standards, garlands/rigging, perched/flying ravens, chests, merchant sled, rune tree, frozen/open barrel, raven nest, ambush shrubs, mushrooms and omen props. Approved buildings, terrain, party/enemy art and UI artwork were retained. Revealed ambushes use an empty shrub state; a broken barrel remains a barrel. Existing shield art is reused for buried equipment and the Minotaur warning.

## Visual evidence

[Before](art-review/before.png) · [After](art-review/after.png).

Both screenshots use the same camera X=3920, clock=10, party placement and district 3. The before image substitutes the original `fc50aab` decorative renderer into the same scene. These are isolated visual fixtures, not modifications to a player's save. Full screenshots for widths 320, 360, 390, 430 and three magnified in-scene object captures were also inspected during browser verification.

## Verification

- `npm run build`: passed; existing large-main-chunk advisory remains.
- `npm test`: 105 passed, zero failed.
- Chromium touch/mobile viewports 320, 360, 390, 430: game bounds exactly match viewport width; no horizontal overflow, page exceptions or failed asset requests.
- Browser game cycle: actual travel → cache decision → act → reward once → fight → pause/save → reload. Gold and journey position survive; duplicate choice does not pay twice.
- Pixel checks: animation changes with simulation time, repeated rendering at the same time is stable, paused updates preserve the encounter snapshot.
- Production build served separately: clicked top axes to start/pause, opened/closed hero panel, reloaded; all three atlas requests succeeded, no JavaScript errors.
- Extra art costs 528,804 bytes. No new unbounded particle systems. Desktop Chromium scenery benchmark (180 draws): p95 ~0.2 ms; this is not an Android performance measurement.
- Read-only critic review found no critical gameplay/save regressions; the three visual state issues it identified were corrected.

[Mobile/cycle results](art-review/browser-verification.json) · [Animation check](art-review/motion-verification.json).

Physical Android and Telegram WebView were **not available for testing**. Browser emulation does not establish performance or acceptance on budget Android hardware.
