# Mobile backpack verification

Base: codex-build, 219d28ae2c558a7bee0752f979cb83ae517315d3 (PR #14).

Backpack uses the existing oak, iron, cloth and item WebP art. Inventory and storage are separate tabs; only the grid scrolls. Filters, selection and confirmation stay accessible. Item details and existing individual actions use the original comparison panel. Protected items remain visible during bulk selection. Storage retrieval never salvages items and respects configured capacity.

Verified locally with 162 passing tests (`npm test`) and `npm run build`. Added tests cover exact gold and experience (including level transitions) for 1/10/20/40 items, repeat calls, backup restoration, 71/80 + 41 stored, selected retrieval, full capacity, rollback on failed writes, and navigation/save roundtrips. Existing protection and battle regression suites also pass.

Headless Chromium with touch/mobile emulation: selected and confirmed salvage of 1/10/20/40 items; transferred nine of 41 stored items into a 71/80 backpack; returned to storage from item details; reloaded and verified 79 inventory / 32 storage after one salvage; selection cleared on reload. No page errors. All browser fixtures use isolated `hero` profiles.

At 780 CSS px high: 320 wide shows 12 complete cells (three columns), 360/390/430 show 16 (four columns). Shorter viewports 320×568, 360×640, 390×664, 430×740 have no horizontal overflow or overlapping rows. Controls remain outside the scrolling grid. Existing dialog safe-area padding and focus trap are retained.

Independent critic identified storage checkmark, return-tab and storage lock issues; all three were corrected. Visual self-review found compressed grid rows with a large inventory; fixed with explicit max-content rows and checked again.

Physical Android and Telegram WebView were not tested. Final artistic acceptance belongs to the owner on their phone. The shared Chrome automation tool was unavailable; repeatable checks used installed Chromium via Playwright.
