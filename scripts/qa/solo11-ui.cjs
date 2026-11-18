/* Solo 1.1 · P2 interface: real taps on an isolated ?testProfile= save at 320/360/390/430.
   Hero class switch, backpack «Очистить слабые», protection reasons, hidden-by-filter picks, 9 ranks,
   one entry per duplicate route, harbour guide, reload. Run after: node --import tsx scripts/qa/fixtures.ts */
const {chromium}=require('playwright');const fs=require('node:fs');const assert=require('node:assert/strict');
const base=process.env.BASE_URL||'http://localhost:5173/',out=process.env.OUT||'.tmp/solo11-ui';
const ranks=['Грубый','Обычный','Добротный','Редкий','Эпический','Сказочный','Мифический','Безупречный','Сумрачный'];
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),args:['--no-sandbox']});const results=[];
 for(const [width,height] of [[320,568],[360,780],[390,844],[430,932]]){
  const profile='solo11-ui-'+width,key='lootborn-codex-v1:test:'+profile;
  const p=require('./ui-fixture.cjs')(60);p.daily='';
  // Ten plainly weaker drops (two of them boots) and one weaker but locked item: only the ten may be bulk-salvaged.
  const worn=Object.values(p.equipment).filter(i=>i.slot!=='wings'&&i.slot!=='boots');
  for(let n=0;n<10;n++){const g=n<2?p.equipment.boots:worn[n%worn.length];p.inventory[70+n]={...g,id:'weak-'+n,level:Math.max(1,g.level-20),attack:1,hp:1,defense:1,rarity:n%3,upgrade:0,set:undefined,perk:undefined,engrave:undefined,uniqueId:undefined,percent:undefined,locked:false,origin:'Встреча основной главы',name:'Слабая вещь '+n}}
  p.inventory[69]={...p.inventory[70],id:'weak-locked',locked:true,name:'Старая слабая вещь'};
  const plain={...p.inventory[70],locked:undefined};
  p.pendingLoot.push(
   {...plain,id:'qa-ordinary',name:'Обычная вещь со склада'},
   {...plain,id:'qa-percent',name:'Вещь с процентным бонусом',percent:{hp:1,attack:0,defense:0}},
   {...plain,id:'qa-wings',name:'Крылья со склада',slot:'wings'}
  );
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
  await context.addInitScript(([k,p])=>{if(!localStorage.getItem(k))localStorage.setItem(k,JSON.stringify(p))},[key,p]);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'?testProfile='+profile);await page.waitForFunction(()=>window.__lootborn?.battle);await page.waitForTimeout(500);
  const state=()=>page.evaluate(()=>JSON.parse(JSON.stringify(window.__lootborn.useGame.getState().p)));
  const saved=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  const btn=(name,exact=true)=>page.getByRole('button',{name,exact});
  const close=async()=>{await btn('Закрыть').tap();await page.getByRole('dialog').waitFor({state:'detached'});await page.waitForTimeout(400)};
  const noOverflow=async label=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,label+': horizontal scroll');
  const row={width,height};

  // 1) Duplicates are gone, one entry each remains and opens its window.
  for(const gone of ['Лавка','Подарок','Испытания и функции'])assert.equal(await btn(gone).count(),0,gone+' side duplicate removed');
  for(const [name,dialog] of [['Магазин','Лавка сокровищ'],['Награды','Ежедневная награда'],['Приключения','Приключения'],['Верфь','Верфь драккаров']]){await btn(name).tap();await page.getByRole('dialog',{name:dialog}).waitFor();await close()}

  // 2) Hero: visible «Сменить персонажа» at the top, three classes, only heroClass changes.
  await btn('Герой').tap();const toggle=page.locator('.class-toggle');await toggle.waitFor();
  const dlg=await page.getByRole('dialog').boundingBox(),tb=await toggle.boundingBox();assert.ok(tb.y<dlg.y+dlg.height*0.45,'class switch is near the top');
  assert.equal(await page.getByRole('button',{name:/Повысить уровень/}).count(),0,'no paid level-up in the hero window');
  assert.equal(await page.locator('.spec-card').count(),0,'specs are not two huge open cards');
  await toggle.tap();assert.equal(await page.locator('.class-card').count(),3);
  await page.getByRole('dialog').screenshot({path:`${out}/${width}-hero-classes.png`});
  const before=await state();
  await page.locator('.class-card',{hasText:'Следопыт'}).dblclick();await page.waitForTimeout(300);
  const after=await state();assert.equal(after.heroClass,'ranger');
  for(const k of ['level','xp','gold','gems','inventory','equipment','talents','skills','runes','stage'])assert.deepEqual(after[k],before[k],'class switch kept '+k);
  assert.equal(await page.locator('.class-card.current strong').textContent(),'Следопыт');
  // Spec: one compact line, opens on request, same pickSpec; nothing else changes.
  const spec0=await state(),specToggle=page.locator('.spec-toggle');await specToggle.scrollIntoViewIfNeeded();
  const name0=await specToggle.locator('strong').textContent();await specToggle.tap();
  const other=page.locator('.spec-options button:not(.selected)');await other.tap();await page.waitForTimeout(200);
  assert.notEqual(await specToggle.locator('strong').textContent(),name0,'spec switched');
  const spec1=await state();for(const k of ['level','xp','gold','inventory','equipment','heroClass'])assert.deepEqual(spec1[k],spec0[k],'spec switch kept '+k);
  // Reach the end of the hero window.
  await page.locator('.hero-links').scrollIntoViewIfNeeded();await page.getByRole('dialog').screenshot({path:`${out}/${width}-hero-end.png`});
  await close();

  // 3) Backpack 80/80: clean weak → confirmation with preview → exactly the weak unlocked items go once.
  await btn('Карта').tap();await page.locator('.harbor-scene').waitFor();
  await page.screenshot({path:`${out}/${width}-harbor.png`});
  await page.locator('.harbor-building',{hasText:'Рюкзак'}).tap();await page.getByRole('dialog',{name:'Рюкзак'}).waitFor();
  assert.match(await page.locator('.pack-capacity').innerText(),/80 \/ 80[\s\S]*Полон/);
  await page.getByRole('button',{name:/^Фильтр качества:/}).tap();assert.equal(await page.getByRole('option',{name:/замк/i}).count(),0,'no lock filter');await page.keyboard.press('Escape');await page.waitForTimeout(200);
  await btn('Ранги').tap();const shown=(await page.locator('.pack-ranks li').allInnerTexts()).map(s=>s.trim());assert.deepEqual(shown,ranks);await btn('Ранги').tap();
  await btn('Как работает авторазбор').tap();assert.match(await page.locator('.pack-explain').innerText(),/новую/);await btn('Как работает авторазбор').tap();
  const clean=page.getByRole('button',{name:/^Очистить слабые · \d+$/});await clean.waitFor();
  const count=Number((await clean.textContent()).match(/\d+/)[0]);assert.equal(count,10,'ten weak, the locked one excluded');
  await clean.tap();const confirm=page.locator('.bulk-confirm');await confirm.waitFor();
  assert.equal(await page.locator('.bulk-gear.chosen').count(),10);
  assert.ok(await page.locator('.bulk-reason').count()>0,'protected items show their reason');
  assert.match(await page.locator('[aria-label*="Старая слабая вещь"]').getAttribute('aria-label'),/Только вручную/i);
  assert.equal((await page.getByRole('dialog').innerText()).includes('🔒'),false,'no lock symbols in the backpack');
  await page.getByRole('dialog').screenshot({path:`${out}/${width}-clean-confirm.png`});
  // Narrow to boots: the eight hidden picks must not be destroyed.
  await page.getByRole('button',{name:/^Тип предмета:/}).tap();await page.getByRole('option',{name:'Сапоги',exact:true}).tap();
  await page.waitForTimeout(200);assert.match(await page.locator('.bulk-preview').innerText(),/Выбрано: 2/);
  const pre=await state();await btn('Распылить выбранное').tap();await page.getByRole('button',{name:/^Да, распылить 2$/}).dblclick();await page.waitForTimeout(400);
  const post=await state();
  assert.equal(post.inventory.length,pre.inventory.length-2,'only the two visible boots were salvaged, once');
  assert.ok(!post.inventory.some(i=>i.id==='weak-0'||i.id==='weak-1'));assert.equal(post.inventory.filter(i=>/^weak-[2-9]$/.test(i.id)).length,8);
  assert.ok(post.inventory.some(i=>i.id==='weak-locked'),'locked item kept');
  assert.ok(post.gold>pre.gold,'gold granted');
  await page.getByRole('button',{name:/^Тип предмета:/}).tap();await page.getByRole('option',{name:'Все типы',exact:true}).tap();
  const clean2=page.getByRole('button',{name:/^Очистить слабые · 8$/});await clean2.tap();await page.getByRole('button',{name:/^Да, распылить 8$/}).tap();await page.waitForTimeout(300);
  const post2=await state();assert.equal(post2.inventory.length,post.inventory.length-8);
  await btn('Слабых нет').waitFor();
  // Storage tab: counts visible, items still selectable.
  await page.getByRole('group',{name:'Место хранения'}).getByRole('button',{name:/^Хранение/}).tap();await page.getByRole('group',{name:'Предметы на хранении'}).waitFor();
  const storageItems=page.getByRole('group',{name:'Предметы на хранении'});
  const salvage=page.getByRole('button',{name:/^Распылить \+\d+$/});
  const confirmBtn=btn('Подтвердить распыление');
  const reward=async()=>Number((await salvage.innerText()).match(/\d+$/)[0]);
  const stored0=await state();
  await storageItems.getByRole('button',{name:/^Обычная вещь со склада/}).tap();
  const ordinaryGold=await reward();
  await salvage.tap();
  const stored1=await state();
  assert.equal(stored1.pendingLoot.length,stored0.pendingLoot.length-1);
  assert.ok(!stored1.pendingLoot.some(i=>i.id==='qa-ordinary'));
  assert.equal(stored1.gold,stored0.gold+ordinaryGold);
  assert.equal(await confirmBtn.count(),0,'ordinary gear needs no separate confirmation');

  for(const [name,id] of [['Вещь с процентным бонусом','qa-percent'],['Крылья со склада','qa-wings']]){
   await storageItems.getByRole('button',{name:new RegExp('^'+name)}).tap();
   const before=await state(),gold=await reward();
   await salvage.tap();
   await confirmBtn.waitFor();
   assert.deepEqual((await state()).pendingLoot,before.pendingLoot);
   await page.waitForTimeout(400);
   await confirmBtn.dblclick();
   const after=await state();
   assert.deepEqual(after.inventory,before.inventory);
   assert.deepEqual(after.pendingLoot,before.pendingLoot.filter(i=>i.id!==id));
   assert.equal(after.gold,before.gold+gold,'only the confirmed salvage pays');
  }
  await noOverflow('backpack');await close();

  // 4) Reload keeps everything.
  await page.waitForTimeout(300);const keep=await state();await page.reload();await page.waitForFunction(()=>window.__lootborn?.battle);
  const again=await state();for(const k of ['heroClass','inventory','pendingLoot','gold','level'])assert.deepEqual(again[k],keep[k],'reload kept '+k);
  assert.equal((await saved()).heroClass,'ranger');

  // 5) Harbour guide routes to the three systems.
  for(const [label,dialog] of [['Тёмная энергия','Тёмная энергия'],['Камни','Драгоценные камни'],['Верфь','Верфь драккаров']]){
   await btn('Карта').tap();
   if(height<=700){const mapBefore=await page.locator('.harbor-scene').boundingBox();await page.locator('.harbor-help').tap();assert.deepEqual(await page.locator('.harbor-scene').boundingBox(),mapBefore,'«?» does not shrink the map')}
   await page.locator('.harbor-guide button',{hasText:label}).tap();await page.getByRole('dialog',{name:dialog}).waitFor();
   if(dialog==='Драгоценные камни')await page.locator('.panel-lead').waitFor();await close();
  }
  // 6) An item marked in a legacy save remains safe after reload and can be salvaged explicitly.
  await page.evaluate(()=>window.__lootborn.useGame.getState().select('weak-locked'));await page.getByRole('dialog').waitFor();
  const card=await page.getByRole('dialog').innerText();assert.doesNotMatch(card,/Защитить|Защищено|🔒|Снять защиту/,'no lock controls on the item card');
  const oldItem=await state(),oldGold=await reward();
  await salvage.dblclick();
  await confirmBtn.waitFor();
  assert.equal((await state()).gold,oldItem.gold,'a double tap cannot confirm an item');
  assert.deepEqual((await state()).inventory,oldItem.inventory);
  await btn('Отмена').tap();
  await close();
  await page.evaluate(()=>window.__lootborn.useGame.getState().select('weak-locked'));
  await salvage.tap();
  await confirmBtn.waitFor();
  await page.waitForTimeout(400);
  if(width===390){
   await page.evaluate(key=>{
    const setItem=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){
     if(k===key)throw new DOMException('QA write failure','QuotaExceededError');
     return setItem.call(this,k,v);
    };
    window.qaRestoreStorage=()=>{Storage.prototype.setItem=setItem};
   },key);
   try{
    await confirmBtn.tap();
    const failed=await state();
    assert.deepEqual(failed.inventory,oldItem.inventory);
    assert.equal(failed.gold,oldItem.gold);
    assert.equal(await confirmBtn.count(),1,'failed write keeps the item card open');
   }finally{await page.evaluate(()=>window.qaRestoreStorage())}
  }
  await confirmBtn.dblclick();
  const removed=await state();
  assert.deepEqual(removed.inventory,oldItem.inventory.filter(i=>i.id!=='weak-locked'));
  assert.equal(removed.gold,oldItem.gold+oldGold);

  // Even an otherwise ordinary item needs confirmation while its reward offer is active.
  await page.evaluate(ordinary=>{
   const g=window.__lootborn.useGame.getState();
   g.mutate(p=>{p.inventory.push({...ordinary,id:'qa-active-reward',rarity:0});
    p.rewardOffer={itemId:'qa-active-reward',encounterId:'qa-reward',resolved:false}});
   g.select('qa-active-reward');
  },plain);
  const active=await state();
  await salvage.tap();
  await confirmBtn.waitFor();
  assert.deepEqual((await state()).rewardOffer,active.rewardOffer);
  await btn('Отмена').tap();
  await close();
  await noOverflow('main');
  assert.deepEqual(errors,[]);
  row.ok=true;results.push(row);await context.close();
 }
 await browser.close();console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exit(1)});
