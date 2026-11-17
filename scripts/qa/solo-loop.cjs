/* First play hour outside the Dark Realm, real taps on an isolated profile (?hero=solo-loop-*).
 * npm run dev; node scripts/qa/solo-loop.cjs   (CHROMIUM_PATH optional, OUT=.tmp/solo-loop)
 * boss victory → trophy → card → equip (double tap) → reload; defeat → strengthen → retry; quest reward → reload.
 */
const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
const base=process.env.BASE_URL||'http://localhost:5173/',out=process.env.OUT||'.tmp/solo-loop';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 for(const [W,H] of [[320,568],[360,740],[390,844],[430,932]]){
  const c=await b.newContext({viewport:{width:W,height:H},isMobile:true,hasTouch:true});
  const page=await c.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const boot=async()=>{await page.waitForFunction(()=>window.__lootborn);await page.waitForTimeout(500)};
  const st=()=>page.evaluate(()=>{const g=window.__lootborn.useGame.getState(),p=g.p;return {stage:p.stage,wave:p.wave,mission:p.mission,gems:p.gems,inv:p.inventory.map(i=>i.id),weapon:p.equipment.weapon.id,offer:p.rewardOffer,panel:g.panel,phase:g.battle.phase,running:g.battle.running}});
  const until=async(fn,ms=60000)=>{for(let t=0;t<ms;t+=400){const s=await st();if(fn(s))return s;await page.waitForTimeout(400)}throw Error('timeout '+W)};
  // 1. Boss of 1-1 → trophy offer → card → double tap «Надеть» → reload.
  await page.goto(base+'?hero=solo-loop-'+W);await boot();
  await page.evaluate(()=>{const g=window.__lootborn.useGame.getState();g.mutate(p=>{p.wave=5});g.configure({continueOnVictory:false,speed:2})});
  await page.reload();await boot();
  await page.locator('button.central').tap();
  const won=await until(s=>s.offer&&!s.offer.resolved);assert.equal(won.stage,2);
  await page.waitForTimeout(1500);assert.equal((await st()).running,false,'the trophy waits for the player');
  await page.getByRole('button',{name:'Трофей босса · открыть добычу'}).tap();
  await page.getByRole('button',{name:/^Надеть/}).first().dblclick();await page.waitForTimeout(400);
  let s=await st();assert.equal(s.weapon,won.offer.itemId);assert.equal(s.panel,null,'the second tap does not open another window');
  assert.equal(s.inv.length,1,'old weapon in the backpack, nothing duplicated');
  await page.reload();await boot();s=await st();assert.equal(s.weapon,won.offer.itemId);assert.equal(s.offer.resolved,true);assert.equal(s.running,false);
  assert.equal(await page.getByRole('button',{name:'Трофей босса · открыть добычу'}).count(),0,'no stale trophy after reload');
  // 2. Defeat → honest ribbon with existing ways to get stronger → windows never restart the fight.
  await page.evaluate(()=>window.__lootborn.useGame.getState().mutate(p=>{p.stage=25;p.wave=5}));await page.reload();await boot();
  await page.locator('button.central').tap();await until(s=>s.phase==='defeat'&&!s.running,90000);await page.waitForTimeout(3400);
  const ribbon=page.getByRole('region',{name:'Поражение · способы усилиться'});await ribbon.waitFor();
  const rs=await ribbon.locator('button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {h:r.height,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===e}}));for(const r of rs)assert.ok(r.h>=43.5&&r.hit,'44px reachable target '+JSON.stringify(rs));
  await page.screenshot({path:`${out}/${W}-defeat.png`});
  await page.evaluate(()=>window.__lootborn.useGame.getState().mutate(p=>{const w=structuredClone(p.equipment.helmet);w.id='solo-strong';w.attack+=400;p.inventory.push(w)}));
  await page.locator('.gear-helmet .gear-better').waitFor();
  await ribbon.getByRole('button',{name:'Надеть лучшее'}).tap();assert.equal(await page.evaluate(()=>window.__lootborn.useGame.getState().p.equipment.helmet.id),'solo-strong');assert.equal(await page.locator('.gear-better').count(),0);
  await ribbon.getByRole('button',{name:'Кузница'}).tap();await page.getByRole('button',{name:'К бою'}).tap();await page.waitForTimeout(300);
  assert.equal((await st()).running,false,'closing a window after defeat never starts the fight');
  await page.locator('button.central').tap();await page.waitForTimeout(300);assert.equal(await ribbon.count(),0);await page.locator('button.central').tap();
  // 3. Chapter reward is on top of «Путь героя», paid once per boss, survives reload.
  await page.evaluate(()=>window.__lootborn.useGame.getState().mutate(p=>{p.bosses=2;p.mission=1}));
  await page.getByRole('button',{name:/Пройти Основную Главу/}).tap();
  const claim=page.locator('.chapter-reward-ready').getByRole('button',{name:'Получить награду'});
  assert.ok(await claim.evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}),'visible without scrolling');
  await page.screenshot({path:`${out}/${W}-quests.png`});
  const gems=(await st()).gems;await claim.dblclick();await page.waitForTimeout(300);s=await st();
  assert.equal(s.mission,2);assert.equal(s.gems,gems+15,'one boss → one reward');
  await page.reload();await boot();s=await st();assert.equal(s.mission,2);assert.equal(s.gems,gems+15);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);assert.deepEqual(errors,[]);
  console.log(W,'ok');await c.close();
 }
 await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
