/* Real taps on the routes fixed by the button audit. Isolated ?testProfile= saves only.
   Run after `npm run build && npx vite preview --port 4173` (BASE_URL overrides). */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const out=process.env.OUT||'.tmp/button-routes',base=process.env.BASE_URL||'http://localhost:4173/';
const slotNames={weapon:'Оружие',armor:'Доспех',helmet:'Шлем',shield:'Щит',boots:'Сапоги',belt:'Пояс',ring1:'Кольцо I',ring2:'Кольцо II',amulet:'Амулет',cloak:'Плащ',extra1:'Предмет XI',extra2:'Предмет XII',wings:'Крылья'};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}:{});
 const results=[];
 for(const [width,height] of [[320,568],[360,780],[390,844],[430,932],[360,560]]){
  const profile='button-routes-'+width+'x'+height;
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
  const fixture=require('./ui-fixture.cjs')();fixture.mineAt=Date.now()-3600e3;fixture.wingVisible=true;
  await context.addInitScript(([k,p])=>{if(!localStorage.getItem(k))localStorage.setItem(k,JSON.stringify(p))},['lootborn-codex-v1:test:'+profile,fixture]);
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'?testProfile='+profile);await page.waitForFunction(()=>window.__lootborn?.battle);
  const state=()=>page.evaluate(()=>JSON.parse(JSON.stringify(window.__lootborn.useGame.getState().p)));
  const dialog=name=>page.getByRole('dialog',{name,exact:true});
  const close=async()=>{await page.getByRole('button',{name:'Закрыть',exact:true}).tap();await page.getByRole('dialog').waitFor({state:'detached'});await page.waitForTimeout(400)};// past the 350 ms tap-through guard
  const row={width,height,slots:0};
  // 1) every one of the 12 slots + wings opens its own card, tapped at its real centre
  for(const [slot,name] of Object.entries(slotNames)){
   const tile=page.locator('.gear-'+slot);const box=await tile.boundingBox();
   const own=await tile.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))});
   assert.ok(own,`${slot}: centre of the tile is covered by another element`);
   const before=await state();await tile.tap();
   const expected=slot==='wings'&&!before.equipment.wings?'Крылья':name;
   await dialog(expected).waitFor({timeout:3000});
   row.slots++;row[slot]=Math.round(Math.min(box.width,box.height));
   if(slot==='ring1')await page.screenshot({path:`${out}/${width}x${height}-ring1-card.png`});
   await close();
  }
  // double tap on a small slot must still end on that slot card (ghost-tap guard keeps it)
  await page.locator('.gear-amulet').dblclick();await dialog('Амулет').waitFor();await page.waitForTimeout(600);await close();
  // 2) currency «+» → «Где получить» with real actions
  await page.locator('.currency.gold').tap();await dialog('Где получить золото').waitFor();
  await page.screenshot({path:`${out}/${width}x${height}-gold-sources.png`});
  const g0=await state();await dialog('Где получить золото').getByRole('button',{name:'Собрать',exact:true}).tap();
  await page.waitForFunction(g=>window.__lootborn.useGame.getState().p.gold>g,g0.gold);
  const g1=await state();assert.ok(g1.chaosite>g0.chaosite,'mine also yields Хаосит');assert.equal(g1.inventory.length,g0.inventory.length);
  await dialog('Где получить золото').getByRole('button',{name:'Перейти'}).first().tap();await dialog('Путь героя').waitFor();await close();
  await page.locator('.currency.gems').tap();await dialog('Где получить самоцветы').waitFor();
  await dialog('Где получить самоцветы').getByRole('button',{name:/Забрать|Открыть/}).first().tap();await dialog('Ежедневная награда').waitFor();await close();
  await page.locator('.currency.chaosite').tap();await dialog('Где получить Хаосит').waitFor();
  assert.equal(await dialog('Где получить Хаосит').getByRole('button',{name:'Копится'}).isDisabled(),true,'mine already collected cannot pay twice');
  await dialog('Где получить Хаосит').getByRole('button',{name:'Перейти'}).last().tap();await dialog('Северная гавань').waitFor();await close();
  // 3) «Войти» while a chapter fight runs keeps it running
  await page.locator('.bottom>.central').tap();await page.waitForFunction(()=>window.__lootborn.battle.running);
  await page.locator('.enter').tap();await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.__lootborn.battle.running),true,'Войти must not pause the chapter');
  assert.match(await page.locator('.toast').innerText(),/Основная глава уже идёт/);
  await page.locator('.bottom>.central').tap();await page.waitForFunction(()=>!window.__lootborn.battle.running);
  // 4) «Новый герой» needs confirmation; cancel keeps the same hero and URL
  const url=page.url(),saved=await state();
  await page.getByRole('button',{name:'Меню',exact:true}).tap();await dialog('Меню').waitFor();
  const heroes=page.locator('summary',{hasText:'Другие герои на этом устройстве'});
  await page.waitForTimeout(400);// past the 350 ms tap-through guard after a window opens
  await heroes.tap();await page.getByRole('button',{name:'Новый герой · первый поход'}).tap();
  await page.getByText('Начать нового героя?').waitFor();assert.equal(page.url(),url);
  await page.screenshot({path:`${out}/${width}x${height}-new-hero-confirm.png`});
  await page.getByRole('button',{name:'Отмена',exact:true}).tap();assert.equal(await page.getByText('Начать нового героя?').count(),0);
  if(!await page.getByRole('button',{name:'Новый герой · первый поход'}).isVisible())await heroes.tap();
  await page.getByRole('button',{name:'Новый герой · первый поход'}).tap();await page.getByRole('button',{name:'Начать нового героя'}).tap();
  await page.waitForURL(/hero=hero-/);await page.waitForFunction(()=>window.__lootborn?.battle);
  const fresh=await state();assert.equal(fresh.level,1);
  // 5) the original hero is intact after reload and the new one is listed under «Мои герои»
  await page.goto(url);await page.waitForFunction(()=>window.__lootborn?.battle);
  const back=await state();for(const k of ['level','stage','gold','gems','chaosite'])assert.equal(back[k],saved[k],k);assert.equal(back.inventory.length,saved.inventory.length);
  await page.getByRole('button',{name:'Меню',exact:true}).tap();await page.getByRole('heading',{name:'Мои герои'}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal scroll');
  assert.deepEqual(errors,[]);
  results.push(row);await context.close();
 }
 await browser.close();
 console.table(results.map(r=>({width:r.width,height:r.height,slots:r.slots,ring1:r.ring1,belt:r.belt,amulet:r.amulet,extra1:r.extra1})));
 console.log('button-routes: ok');
})().catch(e=>{console.error(e);process.exit(1)});
