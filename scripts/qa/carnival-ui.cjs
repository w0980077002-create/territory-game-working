/* Carnival UI QA on the dev stand (needs `npm run dev`; fixtures: node --import tsx scripts/qa/fixtures.ts).
 * Real taps at 320/360/390/430: HUD medal, 7 day tabs, task claim/go, tier claim, final prize, double tap, no overflow. */
const {chromium}=require('playwright');const fs=require('node:fs');const assert=require('node:assert/strict');
const base=process.env.BASE_URL||'http://127.0.0.1:5173/',out=process.env.OUT||'.tmp/carnival-ui';
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined),args:['--no-sandbox']});
 const results=[];
 for(const [width,height] of [[320,568],[360,780],[390,844],[430,932]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true}),p=require('./ui-fixture.cjs')(34);
  await context.addInitScript(p=>{const k='lootborn-codex-v1:test:carnival';if(!localStorage.getItem(k))localStorage.setItem(k,JSON.stringify(p))},p);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'scripts/qa/carnival-preview.html?testProfile=carnival');
  const saveBefore=await page.evaluate(()=>localStorage.getItem('lootborn-codex-v1:test:carnival'));
  const view=()=>page.evaluate(()=>window.__carnival.view),log=()=>page.evaluate(()=>window.__carnival.log.slice());
  const overflow=async name=>{const bad=await page.evaluate(()=>[document.documentElement.scrollWidth>innerWidth,...[...document.querySelectorAll('.carnival-window *')].filter(x=>!(x instanceof SVGElement)&&!x.closest('.carnival-hero,.track-lane,.carnival-day')&&x.clientWidth>0&&x.scrollWidth>x.clientWidth+1).map(x=>x.className)].filter(Boolean));assert.deepEqual(bad,[],width+' '+name+' overflow');};
  // HUD medal: visible, inside the frame, badge for claimable prizes.
  const medal=page.locator('.carnival-side');await medal.waitFor();
  const box=await medal.boundingBox();assert.ok(box.x+box.width<=width+1&&box.width>=40,width+' medal fits and is tappable');
  assert.equal(await medal.locator('.carnival-medal i').count(),1,'badge');
  await page.screenshot({path:`${out}/${width}-hud.png`});
  await medal.tap();await page.locator('.carnival-window').waitFor();
  assert.match(await page.locator('.carnival-timer').innerText(),/Осталось 3д 12:1\d:\d\d/);
  await overflow('open');await page.getByRole('dialog').screenshot({path:`${out}/${width}-open.png`});
  // Tier 300 is ready: a double tap claims exactly once.
  const tierClaim=page.locator('.carnival-tier .carnival-btn.claim');
  await tierClaim.dblclick();await page.waitForTimeout(100);
  assert.equal((await log()).filter(x=>x==='tier:300').length,1,width+' tier double tap');
  assert.equal((await view()).tiers[2].claimed,true);
  assert.match(await page.locator('.carnival-tier .reward-plaque-head small').innerText(),/Ещё 60/);
  // Seven tabs, future days locked, today selected.
  const tabs=page.getByRole('tab');assert.equal(await tabs.count(),7);
  assert.equal(await tabs.nth(3).getAttribute('aria-selected'),'true');
  await tabs.nth(6).tap();assert.match(await page.locator('.carnival-day-head small').innerText(),/Откроется через/);
  assert.equal(await page.locator('.carnival-task .carnival-btn:not(:disabled)').count(),0,'future day has no actions');
  await overflow('day7');
  // Catch-up day 3: claim the remaining ready tasks with double taps.
  await tabs.nth(2).tap();
  const ready=page.locator('.carnival-task.ready .carnival-btn.claim');const n=await ready.count();assert.ok(n>=1);
  const pts=(await view()).points;
  for(let i=0;i<n;i++){await ready.first().dblclick();await page.waitForTimeout(60)}
  assert.equal((await view()).points,pts+20*n,width+' each task once');
  assert.equal(await page.locator('.carnival-days [role=tab]').nth(2).locator('.day-badge').count(),0);
  // «Перейти» routes to an existing window.
  await tabs.nth(3).tap();await page.locator('.carnival-task.go').filter({hasText:'Улучшите спутника'}).getByRole('button').tap();
  assert.equal(await page.evaluate(()=>window.__lootborn.useGame.getState().panel),'companions');
  await page.evaluate(()=>window.__lootborn.useGame.getState().open('carnival'));await page.locator('.carnival-window').waitFor();
  // Reach 600 and take the final prize once.
  await page.evaluate(()=>window.__carnival.set({...window.__carnival.view,points:600}));
  await page.locator('.carnival-finale').scrollIntoViewIfNeeded();
  await page.locator('.carnival-finale .carnival-btn.claim').dblclick();await page.waitForTimeout(80);
  assert.equal((await log()).filter(x=>x==='tier:600').length,1,'final once');
  assert.match(await page.locator('.carnival-finale').innerText(),/Приз получен/);
  await overflow('final');await page.getByRole('dialog').screenshot({path:`${out}/${width}-final.png`});
  // The stand must not touch the save.
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lootborn-codex-v1:test:carnival')).gems),JSON.parse(saveBefore).gems);
  assert.deepEqual(errors,[]);results.push({width,height,ok:true});await context.close();
 }
 await browser.close();console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exit(1)});
