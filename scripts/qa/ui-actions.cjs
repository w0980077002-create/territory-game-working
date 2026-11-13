/* Real UI interactions, isolated test profile. Run with a built or dev server. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const out=process.env.OUT||'.tmp/ui-actions',base=process.env.BASE_URL||'http://localhost:5173/';
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox'],...(process.env.BROWSER_PROXY?{proxy:{server:process.env.BROWSER_PROXY}}:{})});
 const results=[];
 for(const [width,height] of [[320,568],[360,780],[390,844],[430,932]].filter(([w])=>!process.env.WIDTHS||process.env.WIDTHS.split(',').map(Number).includes(w))){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
  const p=require('./ui-fixture.cjs')();
  await context.addInitScript(p=>{const k='lootborn-codex-v1:test:ui-actions';if(!localStorage.getItem(k))localStorage.setItem(k,JSON.stringify(p))},p);
  const page=await context.newPage(),errors=[],bad=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)bad.push(r.url())});
  await page.goto(base+'?testProfile=ui-actions');await page.waitForFunction(()=>window.__lootborn);
  const open=async panel=>{await page.evaluate(panel=>window.__lootborn.useGame.getState().open(panel),panel);await page.getByRole('dialog').waitFor()};
  const state=()=>page.evaluate(()=>JSON.parse(JSON.stringify(window.__lootborn.useGame.getState().p)));
  await open('inventory');
  const type=()=>page.getByRole('button',{name:/^Тип предмета:/});
  for(const name of ['Сила ↓','Редкость ↓','Новые ↓']){await page.getByRole('button',{name:/^Сортировка:/}).tap();await page.getByRole('option',{name,exact:true}).tap();assert.equal(await page.getByRole('button',{name:/^Сортировка:/}).evaluate(el=>el.firstElementChild.scrollWidth<=el.firstElementChild.clientWidth),true,'sort label must fit beside arrow')}
  await page.getByRole('dialog').screenshot({path:`${out}/${width}-inventory.png`});
  await type().tap();await page.getByRole('listbox').waitFor();await page.screenshot({path:`${out}/${width}-filter.png`});
  await page.getByRole('option',{name:'Крылья',exact:true}).scrollIntoViewIfNeeded();await page.getByRole('option',{name:'Крылья',exact:true}).tap();
  assert.match(await type().getAttribute('aria-label'),/Крылья/);
  await type().tap();
  assert.equal(await page.getByRole('option',{name:'Крылья',exact:true}).evaluate(el=>{const a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom}),true,'selected option must open in view');
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),1);assert.equal(await page.locator(':popover-open').count(),0);
  await type().focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  assert.match(await type().getAttribute('aria-label'),/Оружие/);
  await type().tap();await page.getByRole('heading',{name:'Рюкзак',exact:true}).tap();assert.equal(await page.locator(':popover-open').count(),0);assert.equal(await page.getByRole('dialog').count(),1);
  await type().tap();await page.getByRole('option',{name:'Все типы',exact:true}).tap();
  await page.getByRole('button',{name:/^Хранение/}).tap();
  assert.equal(await page.getByRole('button',{name:'Забрать доступные',exact:true}).isDisabled(),true);
  await page.evaluate(()=>window.__lootborn.useGame.getState().mutate(p=>{p.inventory.pop()}));
  await page.getByRole('button',{name:'Забрать доступные',exact:true}).tap();
  assert.equal((await state()).inventory.length,80);assert.equal((await state()).pendingLoot.length,40);
  await page.getByRole('button',{name:/^Рюкзак/}).tap();
  // Make one expendable item; precious and protected items stay in the same inventory.
  await page.evaluate(()=>window.__lootborn.useGame.getState().mutate(p=>{const i=p.inventory[1];i.rarity=0;i.upgrade=0;i.locked=false;delete i.set;delete i.perk;delete i.engrave;delete i.uniqueId}));
  const before=await state();
  await page.getByRole('button',{name:'☑ Выбрать',exact:true}).tap();
  await page.getByRole('group',{name:'Предметы в рюкзаке'}).locator('button:not(:disabled)').first().tap();
  await page.getByRole('button',{name:'Распылить выбранное',exact:true}).tap();assert.equal((await state()).inventory.length,before.inventory.length);
  await page.getByRole('button',{name:'Назад',exact:true}).tap();assert.equal((await state()).inventory.length,80);
  await page.getByRole('button',{name:'Распылить выбранное',exact:true}).tap();
  await page.evaluate(()=>window.__lootborn.useGame.getState().mutate(()=>{}));await page.waitForTimeout(50);
  assert.equal(await page.getByRole('button',{name:'Да, распылить 1',exact:true}).count(),1,'background save must not cancel confirmation');
  await page.getByRole('dialog').screenshot({path:`${out}/${width}-confirmation.png`});
  await page.getByRole('button',{name:'Да, распылить 1',exact:true}).tap();
  const after=await state();assert.equal(after.inventory.length,79);assert.ok(after.inventory.some(i=>i.id==='ui-item-0'),'set/perk item must survive');
  await open('autobattle');const prior=await page.getByRole('checkbox',{name:'Автобой навыков',exact:true}).isChecked();
  await page.getByRole('checkbox',{name:'Автобой навыков',exact:true}).setChecked(!prior);await page.getByRole('button',{name:'Отмена',exact:true}).tap();
  assert.equal(await page.evaluate(()=>window.__lootborn.useGame.getState().auto),prior);
  await open('autobattle');await page.getByRole('button',{name:'×2',exact:true}).tap();await page.getByRole('checkbox',{name:'Разбирать вещи слабее надетых',exact:true}).check();
  await page.getByRole('button',{name:'Сохранить',exact:true}).focus();await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Закрыть','Tab wraps inside dialog');
  await page.getByRole('button',{name:'Сохранить',exact:true}).tap();assert.equal((await state()).preferences.speed,2);assert.equal((await state()).preferences.autoSalvageWeaker,true);
  // Every existing item presentation variant, including the actual 2/4/6 bonus text.
  const variants=[{rarity:0},{rarity:2},{rarity:3},{rarity:5},{rarity:5,uniqueId:'storm_ring'},{rarity:8,set:'legion'},{rarity:4,upgrade:7},{rarity:5,perk:'echo'},{rarity:8,set:'stone',perk:'echo',engrave:'might',uniqueId:'storm_ring'}];
  for(const [n,variant] of variants.entries()){
   await page.evaluate(({variant,n})=>{const g=window.__lootborn.useGame.getState();g.mutate(p=>{p.inventory=p.inventory.filter(i=>i.id!=='qa-variant');p.inventory.unshift({...p.equipment.ring1,id:'qa-variant',slot:'ring1',name:'Древнее кольцо хранителя северных горных крепостей',origin:'Встреча основной главы · Каменная стража',locked:false,upgrade:0,...variant})});g.select('qa-variant')},{variant,n});
   await page.locator('.item-card').first().waitFor();
   assert.equal(await page.locator('.item-card').first().evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'item variant overflow');
   if(variant.set){
    const set=page.locator('.item-card').first().locator('.set-line');assert.ok(await set.evaluate(el=>el.getBoundingClientRect().width)>200,'set must have normal width');
    assert.equal(await set.locator('li').count(),3);assert.match(await set.textContent(),/2.*4.*6/s);
    await set.scrollIntoViewIfNeeded();
    assert.equal(await set.locator('li span').evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)),true,'bonus text cannot clip');
    if(n===8){await page.evaluate(()=>window.__lootborn.useGame.setState({toast:''}));await page.getByRole('dialog').screenshot({path:`${out}/${width}-set-details.png`});}
   }
  }
  // Valuable item cannot disappear on the first salvage click, even for a low-rarity set.
  await page.evaluate(()=>{const g=window.__lootborn.useGame.getState();g.mutate(p=>{const i=p.inventory.find(i=>i.id==='qa-variant');i.rarity=0;delete i.uniqueId});g.select('qa-variant')});
  await page.getByRole('button',{name:/^Распылить \+/}).tap();assert.ok((await state()).inventory.some(i=>i.id==='qa-variant'));
  assert.equal(await page.getByRole('button',{name:'Подтвердить распыление',exact:true}).count(),1);
  await page.getByRole('dialog').screenshot({path:`${out}/${width}-valuable-confirmation.png`});
  await page.getByRole('button',{name:'Отмена',exact:true}).tap();
  const equippedBefore=(await state()).equipment.ring1.id;await page.getByRole('button',{name:'Надеть',exact:true}).tap();assert.equal((await state()).equipment.ring1.id,'qa-variant');assert.ok((await state()).inventory.some(i=>i.id===equippedBefore));
  await open('forge');
  const filter=page.getByRole('button',{name:/^Слот для ковки:/});await filter.scrollIntoViewIfNeeded();await filter.tap();
  await page.locator('.modal-body').evaluate(el=>el.scrollTop+=30);await page.waitForTimeout(30);assert.equal(await page.locator(':popover-open').count(),0,'scrolling parent closes filter');
  // Emulate Telegram's insets. This verifies CSS, not physical Android/Telegram.
  await page.evaluate(()=>{document.documentElement.style.setProperty('--tg-content-safe-area-inset-top','28px');document.documentElement.style.setProperty('--tg-content-safe-area-inset-bottom','22px')});
  await open('inventory');const box=await page.getByRole('dialog').boundingBox();assert.ok(box.y>=28&&box.y+box.height<=height-22+1,'Telegram safe area');
  await page.getByRole('dialog').screenshot({path:`${out}/${width}-safe-area.png`});
  const saved=await state();await page.reload();await page.waitForFunction(()=>window.__lootborn);
  const restored=await state();for(const key of ['inventory','equipment','pendingLoot','gold','gems','level','preferences'])assert.deepEqual(restored[key],saved[key],`reload changed ${key}`);
  assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
  results.push({width,height,filters:'touch/keyboard/escape/outside/scroll',storage:true,bulkConfirmation:true,itemVariants:variants.length,saveReload:true,safeArea:true,errors,bad});
  await context.close();
 }
 await browser.close();fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
