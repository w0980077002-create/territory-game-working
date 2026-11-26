/* Solo 1.1 · P2 interface: real taps on an isolated ?testProfile= save at 320/360/390/430.
   Hero class switch, backpack and warehouse salvage, filtered picks, 9 ranks,
   one entry per duplicate route, harbour guide, reload. Run after: node --import tsx scripts/qa/fixtures.ts */
const {chromium}=require('playwright');const fs=require('node:fs');const assert=require('node:assert/strict');
const base=process.env.BASE_URL||'http://localhost:5173/',out=process.env.OUT||'.tmp/solo11-ui';
const ranks=['Грубый','Обычный','Добротный','Редкий','Эпический','Сказочный','Мифический','Безупречный','Сумрачный'];
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),args:['--no-sandbox']});const results=[];
 for(const [width,height] of [[320,568],[360,780],[390,844],[430,932]]){
  const profile='solo11-ui-'+width,key='lootborn-codex-v1:test:'+profile;
  const p=require('./ui-fixture.cjs')(60);p.daily='';p.arenaPotions=4;
  // Ten plainly weaker drops (two of them boots) and one with the legacy lock flag.
  const worn=Object.values(p.equipment).filter(i=>i.slot!=='wings'&&i.slot!=='boots');
  for(let n=0;n<10;n++){const g=n<2?p.equipment.boots:worn[n%worn.length];p.inventory[70+n]={...g,id:'weak-'+n,level:Math.max(1,g.level-20),attack:1,hp:1,defense:1,rarity:n%3,upgrade:0,set:undefined,perk:undefined,engrave:undefined,uniqueId:undefined,percent:undefined,locked:false,origin:'Встреча основной главы',name:'Слабая вещь '+n}}
  p.inventory[69]={...p.inventory[70],id:'weak-locked',locked:true,name:'Старая слабая вещь'};
  const plain={...p.inventory[70],locked:undefined};
  p.pendingLoot.push(
   {...plain,id:'qa-ordinary',name:'Обычная вещь со склада'},
   {...plain,id:'qa-percent',name:'Вещь с процентным бонусом',percent:{hp:1,attack:0,defense:0}},
   {...plain,id:'qa-wings',name:'Крылья со склада',slot:'wings'},
   {...plain,id:'qa-storage-rare',name:'Ценная вещь со склада',rarity:4,set:'frost',upgrade:1},
   {...plain,id:'qa-storage-legacy',name:'Старая вещь со склада',locked:true}
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

  // 3) Backpack 80/80: exact transactions for storage and visible backpack picks.
  await btn('Карта').tap();await page.locator('.harbor-scene').waitFor();
  await page.screenshot({path:`${out}/${width}-harbor.png`});
  await page.locator('.harbor-building',{hasText:'Рюкзак'}).tap();await page.getByRole('dialog',{name:'Рюкзак'}).waitFor();
  assert.match(await page.getByRole('group',{name:'Место хранения'}).getByRole('button',{name:/^Рюкзак/}).innerText(),/80\/80/);assert.match(await page.locator('.pack-full').innerText(),/полон/);
  const packTabs=page.getByRole('group',{name:'Место хранения'});
  await packTabs.getByRole('button',{name:'Расходники',exact:true}).tap();
  const consumables=page.getByRole('list',{name:'Расходуемые предметы'});
  assert.equal(await consumables.getByRole('listitem').count(),1);
  await consumables.getByText('Сердце Вальгаллы',{exact:true}).waitFor();
  await consumables.getByText('×4',{exact:true}).waitFor();
  await consumables.getByText(/Восстанавливает 45%/).waitFor();
  assert.equal(await btn('Распылить').count(),0);
  assert.equal(await page.getByLabel(/Авторазбор/).count(),0);
  assert.equal((await state()).inventory.length,80);
  await noOverflow('consumables');
  assert.equal(await packTabs.evaluate(node=>[...node.querySelectorAll('button')].every(button=>button.scrollWidth<=button.clientWidth+1)),true);
  await page.getByRole('dialog').screenshot({path:`${out}/${width}-consumables.png`});
  await packTabs.getByRole('button',{name:/^Рюкзак/}).tap();
  await page.getByRole('button',{name:/^Фильтр качества:/}).tap();assert.equal(await page.getByRole('option',{name:/замк/i}).count(),0,'no lock filter');await page.keyboard.press('Escape');await page.waitForTimeout(200);
  await btn('Ранги').tap();const shown=(await page.locator('.pack-ranks li').allInnerTexts()).map(s=>s.trim());assert.deepEqual(shown,ranks);await btn('Ранги').tap();
  await btn('Как работает авторазбор').tap();assert.match(await page.locator('.pack-explain').innerText(),/новую/);await btn('Как работает авторазбор').tap();
  const storageTab=page.getByRole('group',{name:'Место хранения'}).getByRole('button',{name:/^Склад/});
  const bulk=page.locator('dialog.bulk-confirm');
  const type=label=>page.getByRole('option',{name:label,exact:true}).tap();
  const filterType=async label=>{await page.getByRole('button',{name:/^Тип предмета:/}).tap();await type(label)};
  const tiles=page.getByRole('group',{name:'Предметы в рюкзаке'});
  const picks=()=>page.locator('.bulk-gear.chosen').count();
  const guard=()=>page.waitForTimeout(400);

  await storageTab.tap();
  const storedGroup=page.getByRole('group',{name:'Предметы на хранении'});
  await btn('Распылить').tap();
  for(const name of ['Ценная вещь со склада','Старая вещь со склада']){
   await storedGroup.getByRole('button',{name:new RegExp('^'+name+' ·')}).tap();
  }
  await btn('Распылить 2').tap();await bulk.waitFor();
  assert.match(await bulk.innerText(),/Ценных вещей: 1/);
  await bulk.locator('summary').tap();assert.match(await bulk.innerText(),/Старая вещь со склада/);
  const beforeBatch=await state();
  assert.equal(beforeBatch.inventory.length,80);
  await guard();
  if(width===390){
   await page.evaluate(key=>{
    const write=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('QA write failure','QuotaExceededError');return write.call(this,k,v)};
    window.qaRestoreStorage=()=>{Storage.prototype.setItem=write};
   },key);
   try{
    await bulk.getByRole('button',{name:'Да, распылить 2'}).tap();
    assert.deepEqual((await state()).pendingLoot,beforeBatch.pendingLoot);
    assert.equal((await state()).gold,beforeBatch.gold);
    assert.equal(await bulk.getByRole('listitem').count(),2);
   }finally{await page.evaluate(()=>window.qaRestoreStorage())}
   await page.evaluate(()=>window.__lootborn.useGame.getState().mutate(p=>{
    p.pendingLoot.find(item=>item.id==='qa-storage-rare').upgrade++;
   }));
   await bulk.getByRole('button',{name:'Обновить подтверждение'}).tap();
   assert.equal((await state()).pendingLoot.length,beforeBatch.pendingLoot.length);
   await guard();
  }
  await bulk.getByRole('button',{name:'Да, распылить 2'}).dblclick();await bulk.waitFor({state:'detached'});
  const afterBatch=await state();
  assert.deepEqual(afterBatch.inventory,beforeBatch.inventory);
  assert.deepEqual(afterBatch.pendingLoot,beforeBatch.pendingLoot.filter(i=>!['qa-storage-rare','qa-storage-legacy'].includes(i.id)));
  await page.getByRole('group',{name:'Место хранения'}).getByRole('button',{name:/^Рюкзак/}).tap();

  // Full backpack: choose every visible item, clear, then hide one pick through the filter.
  assert.equal((await state()).inventory.length,80);
  await btn('Выбрать').tap();
  await btn('Выбрать всё').tap();assert.equal(await picks(),80);
  await btn('Снять выбор').tap();assert.equal(await picks(),0);
  for(const name of ['Старая слабая вещь','Слабая вещь 0','Слабая вещь 2']){
   await tiles.getByRole('button',{name:new RegExp('^'+name+' ·')}).tap();
  }
  assert.equal(await picks(),3);
  await filterType('Сапоги');assert.equal(await picks(),2);
  await filterType('Все типы');assert.equal(await picks(),2);
  await btn('Распылить 2').tap();await bulk.waitFor();
  await bulk.locator('summary').tap();
  assert.equal(await bulk.getByRole('list',{name:'Выбранные вещи'}).getByRole('listitem').count(),2);
  assert.match(await bulk.innerText(),/Старая слабая вещь/);
  const dialogBounds=await bulk.boundingBox();
  assert.ok(dialogBounds.y>=0&&dialogBounds.y+dialogBounds.height<=height+1,'confirmation fits the viewport');
  await bulk.screenshot({path:`${out}/${width}-clean-confirm.png`});
  const pre=await state();
  await guard();await bulk.getByRole('button',{name:'Да, распылить 2'}).dblclick();await bulk.waitFor({state:'detached'});
  const post=await state();
  assert.equal(post.inventory.length,78);
  assert.equal(post.arenaPotions,4);
  assert.ok(!post.inventory.some(i=>i.id==='weak-0'||i.id==='weak-locked'));
  assert.ok(post.inventory.some(i=>i.id==='weak-2'));
  assert.ok(post.gold>pre.gold);

  await storageTab.tap();
  await btn('Забрать').tap();
  await storedGroup.getByRole('button',{name:/^Обычная вещь со склада/}).tap();
  assert.equal(await btn('Забрать 1').isEnabled(),true);
  await btn('Снять выбор').tap();assert.equal(await picks(),0);
  await btn('Готово').tap();

  // Test the item card separately from storage management.
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
   if(dialog==='Драгоценные камни')assert.equal(await page.locator('.sockets .socket').count(),3);
   await close();
  }
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
