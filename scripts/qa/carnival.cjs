/* Start Vite with npm run dev, then run node scripts/qa/carnival.cjs. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const fs = require('node:fs');
const start = Date.UTC(2026,11,1,12);
const address = new URL(process.env.BASE_URL || 'http://localhost:5173/');
address.searchParams.set('hero','carnival-browser-qa');
const gold = page => page.evaluate(() => window.__lootborn.useGame.getState().p.gold);
const read = async page => page.evaluate(async () => {
  const {carnivalView} = await import('/src/saga/carnival.ts');
  return carnivalView(window.__lootborn.useGame.getState().p,Date.now());
});
const claim = page => page.evaluate(async () => (await import('/src/core/store.ts')).claimCarnivalReward('2026-12','task:1:1'));
const ready = page => page.waitForFunction(() => window.__lootborn?.battle && document.querySelector('.horn-counter'));
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath()),args:['--no-sandbox']});
  try {
    const context = await browser.newContext({viewport:{width:390,height:740},isMobile:true,hasTouch:true});
    const errors = [];
    const open = async () => {
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.setFixedTime(start);
      await page.goto(address.href);
      await ready(page);
      return page;
    };
    const first = await open();
    await first.locator('.horn-counter').click();
    await first.getByRole('button',{name:/Протрубить · 1 заряд/}).click();
    let period = (await read(first)).period;
    assert.equal(period.id,'2026-12');
    assert.equal(period.points,20);
    assert.equal(period.days[0].tasks[2].primary.progress,1);
    assert.equal(period.days[1].unlocked,false);
    const priorGold = await gold(first);
    const second = await open();
    assert.equal((await claim(second)).status,'save_failed');
    const receipt = await claim(first);
    assert.equal(receipt.status,'claimed');
    await second.waitForFunction(() => window.__lootborn.useGame.getState().p.carnival?.latest.claims['task:1:1'] === -1);
    await first.close();
    assert.equal((await claim(second)).status,'unavailable');
    await second.reload();
    await ready(second);
    period = (await read(second)).period;
    assert.equal(period.days[0].tasks[0].status,'claimed');
    assert.equal(await gold(second),priorGold+receipt.reward.gold);
    assert.equal(period.days[0].tasks[2].primary.progress,1);
    await second.clock.setFixedTime(Date.UTC(2026,11,8));
    assert.equal((await read(second)).phase,'between');
    assert.deepEqual(errors,[]);
    console.log('Chromium 390×740: Horn UI, task progress, one active writer, one-time claim, reload and UTC close verified.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1});
