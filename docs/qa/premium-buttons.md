# Premium home buttons · 2026-11-14

Scope: two original lightweight SVG artworks (7 KB total), central press feedback,
«Порт» → «Карта», panel title → «Карта и мастерские». The `port` route and
`battle.toggle()` handler remain unchanged. No balance, storage, save format,
character, background or other button changes.

Validation:
- `npm run build`: passed (existing bundle-size advisory).
- `npm test`: 162 passed, 0 failed.
- `node scripts/qa/premium-buttons.cjs`: passed in Chromium mobile/touch emulation
  at 320×568, 360×780, 390×844, 430×932. All five navigation hit areas remain
  in bounds without overlap. Art loads; no page errors or failed HTTP responses.
- Actual map open/close preserves player data (excluding `savedAt`). Exact
  level/stage/wave, gear, inventory, currencies, skills, companions and encounter
  survive reload. Real defeat handler + axes tap retries the same chapter/wave;
  walking proceeds into combat with no further taps. Test profiles only.
- Production preview at 390×844: both artworks load, physical held press gives
  `matrix(0.96, 0, 0, 0.96, 0, 5)`, release starts combat, map → forge works.
- Screenshots at `.tmp/premium-buttons/` visually reviewed at 320 and 430 px.
  This is browser emulation, not a physical Android/Telegram acceptance test.

Reproduce: start `npm run dev`, then run `node scripts/qa/premium-buttons.cjs`.
Use `BASE_URL` to target a production preview or shared Pages deployment.
