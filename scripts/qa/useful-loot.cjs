const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const fixture=require('./ui-fixture.cjs');

const base=process.env.BASE_URL||'http://localhost:5173/';
const out=process.env.OUT||'.tmp/window-qa/useful-loot';

async function withProfile(browser,viewport,name,player,check){
 const key='lootborn-codex-v1:test:'+name;
 const context=await browser.newContext({viewport,isMobile:true,hasTouch:true});
 const errors=[];
 try{
  await context.route('https://telegram.org/**',route=>route.abort());
  await context.addInitScript(({key,player})=>{
   if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(player));
  },{key,player});
  const page=await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'?testProfile='+name);
  await page.waitForFunction(()=>!!window.__lootborn?.battle);
  const button=name=>page.getByRole('button',{name,exact:typeof name==='string'});
  const close=async()=>{
   await button('Закрыть').tap();
   await page.getByRole('dialog').waitFor({state:'detached'});
   // Adjacent taps immediately after closing a panel are intentionally guarded.
   await page.waitForTimeout(370);
  };
  const read=()=>page.evaluate(()=>window.__lootborn.useGame.getState().p);
  await check({page,button,close,read});
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
}

async function navigation({page,button,close},width,height){
 const panel=name=>page.locator(`[data-panel="${name}"]`);
 const body=page.locator('.modal-body');
 const scroll=()=>body.evaluate(element=>element.scrollTop);
 await button('Меню').tap();
 await button('Экипировка').tap();
 const openSlot=label=>panel('equipment').locator('.row').filter({has:page.getByText(label,{exact:true})}).getByRole('button').tap();
 for(const [slot,label] of [['armor','Доспех'],['helmet','Шлем']]){
  const entry=panel('equipment').locator('.row').filter({has:page.getByText(label,{exact:true})}).getByRole('button');
  await entry.scrollIntoViewIfNeeded();
  const before=await scroll();
  await openSlot(label);
  await panel('gear:'+slot).waitFor();
  const back=button('← Назад');
  assert.ok((await back.boundingBox()).height>=44);
  assert.equal(await back.evaluate(el=>el.scrollWidth>el.clientWidth),false);
  if(slot==='armor'){
   await page.waitForTimeout(370);
   await button('Редкие').tap();
   await page.locator('.tabs .selected').filter({hasText:'Редкие'}).waitFor();
   const tiles=page.getByRole('group',{name:'Предметы в рюкзаке'}).getByRole('button');
   await tiles.first().scrollIntoViewIfNeeded();
   const prior=await scroll();
   assert.ok(prior>0);
   await tiles.first().tap();
   await panel('item').waitFor();
   await back.tap();
   await panel('gear:armor').waitFor();
   assert.ok(await button('Редкие').evaluate(el=>el.classList.contains('selected')));
   assert.equal(await scroll(),prior);
   await page.waitForTimeout(370);
  }
  await back.tap();
  await panel('equipment').waitFor();
  assert.equal(await scroll(),before);
 }
 await close();
 await button('Карта').tap();
 await button('Рюкзак').tap();
 await button(/^Фильтр качества:/).tap();
 await page.getByRole('option',{name:'Именные / сеты'}).tap();
 const item=page.getByRole('button',{name:/Каменная стража · Кольцо I ·/});
 await item.tap();
 await button('← Назад').tap();
 assert.ok(await button('Фильтр качества: Именные / сеты').isVisible());
 await page.screenshot({path:`${out}/${width}x${height}-backpack.png`});
 await close();
}

async function capacity({page,button,close,read}){
 const forge=async()=>{
  await button('Карта').tap();
  await page.getByRole('button',{name:'Кузница',exact:true}).tap();
  await button('Создание').tap();
 };
 const countAndWallet=async()=>{
  const p=await read();
  return [p.inventory.length,p.gold,p.gems,p.tokens,p.saga.n['mat:ember']];
 };
 const initial=await countAndWallet();
 await forge();
 await page.getByText(/Рюкзак полон\. Для готовой вещи/).waitFor();
 assert.equal(await button(/^Выковать/).isDisabled(),true);
 await button('Освободить место').tap();
 assert.ok(await page.getByRole('button',{name:/Рюкзак 80\/80/}).isVisible());
 assert.deepEqual(await countAndWallet(),initial);
 await close();
 await button('Магазин').tap();
 await page.locator('.shop-tabs').getByRole('button',{name:'Экипировка',exact:true}).tap();
 const offer=page.locator('[data-offer="basic-equipment"]');
 assert.equal(await offer.getByRole('button',{name:/^Купить/}).isDisabled(),true);
 await offer.getByRole('button',{name:/^Подробнее/}).tap();
 await page.getByRole('dialog',{name:'Снаряжение дружины'}).getByRole('button',{name:'Освободить место'}).tap();
 const inventory=page.getByRole('group',{name:'Предметы в рюкзаке'});
 await inventory.getByRole('button',{name:/Свободное место QA/}).tap();
 await button(/^Распылить \+/).tap();
 await page.getByRole('dialog',{name:'Рюкзак'}).waitFor();
 assert.equal((await read()).inventory.length,79);
 await close();
 await forge();
 assert.equal(await button(/^Выковать/).isEnabled(),true);
 const before=await countAndWallet();
 const label=await button(/^Выковать/).innerText();
 await button(/^Выковать/).tap();
 await page.locator('[data-panel="item"]').waitFor();
 const after=await countAndWallet();
 assert.equal(after[0],80);
 const cost=Number(label.match(/·\s*([\d\s]+) золота/)[1].replace(/\s/g,''));
 assert.equal(after[1],before[1]-cost);
 assert.equal(after[4],before[4]-12);
 await page.reload();
 await page.waitForFunction(()=>!!window.__lootborn?.battle);
 assert.deepEqual(await countAndWallet(),after);
}

async function harvest({page,button,close,read},now){
 const harbor=()=>button('Карта').tap();
 await page.clock.setFixedTime(now);
 await page.locator('.currency.gold').tap();
 const compactMine=page.getByText('Северная шахта',{exact:true});
 await compactMine.waitFor();
 assert.ok((await compactMine.boundingBox()).width>100,'mine title keeps a readable column in the compact currency window');
 assert.equal(await button('Копится').isDisabled(),true);
 await close();
 await harbor();
 const mine=button('Собрать добычу шахтёров');
 if(!await mine.count())await button('‹ В гавань').tap();
 await page.getByText('Следующий сбор через').waitFor();
 assert.match(await page.locator('.collection-status').innerText(),/00:02/);
 assert.equal(await mine.isDisabled(),true);
 await page.clock.setFixedTime(now+1_999);
 await page.waitForFunction(()=>document.querySelector('.collection-status').textContent.includes('00:01'));
 assert.equal(await mine.isDisabled(),true);
 await page.clock.setFixedTime(now+2_000);
 await page.waitForFunction(()=>document.querySelector('button[aria-label="Собрать добычу шахтёров"]')?.disabled===false);
 const p=await read();
 await mine.tap();
 const collected=await read();
 assert.equal(collected.gold,p.gold+50);
 assert.equal(collected.chaosite,p.chaosite);
 assert.equal(await mine.isDisabled(),true);
 await page.getByRole('navigation',{name:'Постройки гавани'}).getByRole('button',{name:'Верфь',exact:true}).tap();
 await page.getByText('Следующий алмаз через').waitFor();
 assert.match(await page.locator('.collection-status').innerText(),/00:01/);
 assert.equal(await button('Добыча продолжается').isDisabled(),true);
 await page.clock.setFixedTime(now+3_000);
 await button(/^Забрать 1 красных алмазов/).tap();
 assert.equal((await read()).redDiamonds,(p.redDiamonds??0)+1);
 await page.getByText('Следующий алмаз через').waitFor();
 await close();
 await page.reload();
 await page.waitForFunction(()=>!!window.__lootborn?.battle);
 assert.equal((await read()).mineAt,now+2_000);
 assert.equal((await read()).redDiamonds,(p.redDiamonds??0)+1);
}

async function workshops({page,button,read},locked=false){
 const harbor=page.getByRole('navigation',{name:'Постройки гавани'});
 const workshop=page.getByRole('dialog',{name:'Мастерские'});
 await button('Карта').tap();
 await harbor.getByRole('button',{name:'Кузница',exact:true}).tap();
 await button('Мастерские').tap();
 await workshop.waitFor();
 assert.equal(await workshop.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
 const masters=workshop.getByRole('group',{name:'Мастерские гавани'});
 assert.deepEqual(await masters.getByRole('button').allTextContents(),['Кузнец','Кожевник','Портной','Ювелир']);
 const craft=workshop.getByRole('button',{name:/^Выковать/});
 if(locked){
  await workshop.getByText(/после победы над владыкой первого региона/).waitFor();
  assert.equal(await craft.isDisabled(),true);
  await button('В кузницу').tap();
  await page.getByRole('dialog',{name:'Кузница'}).waitFor();
  return;
 }
 await workshop.getByRole('button',{name:/^Где получить ·/}).tap();
 await button('Назад').tap();
 await workshop.waitFor();
 await masters.getByRole('button',{name:'Ювелир'}).tap();
 const slot=workshop.getByRole('button',{name:'Слот для ковки: Кольцо I'});
 await slot.scrollIntoViewIfNeeded();
 // Let the native smooth scroll settle before opening a popover that dismisses on scroll.
 await page.waitForTimeout(370);
 await slot.tap();
 await page.getByRole('option',{name:'Амулет',exact:true}).tap();
 const before=await read();
 await craft.evaluate(button=>{button.click();button.click()});
 await page.locator('[data-panel="item"]').waitFor();
 const after=await read(), item=after.inventory.at(-1);
 assert.equal(after.inventory.length,before.inventory.length+1);
 assert.equal(item.slot,'amulet');
 assert.equal(item.masterwork,true);
 assert.equal(after.gold,before.gold-Math.round(90*(Math.min(25,item.level)+.75*Math.max(0,item.level-25))));
 assert.equal(after.saga.n['mat:peaks'],before.saga.n['mat:peaks']-18);
 assert.equal(after.saga.n['masterwork:jeweler'],1);
 await button('← Назад').tap();
 await workshop.waitFor();
 await masters.getByRole('button',{name:'Ювелир'}).tap();
 await workshop.getByText('Изготовлено предметов · 1',{exact:true}).waitFor();
 await page.waitForTimeout(370);
 await button('В кузницу').tap();
 await page.getByRole('dialog',{name:'Кузница'}).waitFor();
 await page.reload();
 await page.waitForFunction(()=>!!window.__lootborn?.battle);
 const restored=await read();
 assert.deepEqual(restored.inventory.at(-1),item);
 assert.equal(restored.gold,after.gold);
 assert.equal(restored.saga.n['mat:peaks'],after.saga.n['mat:peaks']);
 assert.equal(restored.saga.n['masterwork:jeweler'],1);
}

async function personalWorkshop({page,button,read}){
 const workshop=page.getByRole('dialog',{name:'Мастерские'});
 const open=async()=>{
  await button('Карта').tap();
  await page.getByRole('navigation',{name:'Постройки гавани'}).getByRole('button',{name:'Кузница',exact:true}).tap();
  await button('Мастерские').tap();
 };
 await open();
 await page.waitForTimeout(370);
 await workshop.getByText('Справочник профессий',{exact:true}).tap();
 await workshop.getByText(/Остальные профессии доступны/).waitFor();
 await workshop.getByText('Справочник профессий',{exact:true}).tap();
 await button('Личная мастерская').tap();
 await workshop.getByRole('group',{name:'Выбор профессии'}).getByRole('button',{name:'Ювелир',exact:true}).tap();
 await button('Подтвердить выбор').tap();
 await workshop.getByRole('heading',{name:'Ювелир · Подмастерье'}).waitFor();
 assert.equal(await workshop.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
 const sets=workshop.getByRole('group',{name:'Комплекты для ковки'});
 const craft=workshop.getByRole('button',{name:/^Выковать/});
 await sets.getByRole('button',{name:/Рунный круг/}).tap();
 assert.equal(await craft.isDisabled(),true);
 await sets.getByRole('button',{name:'Ледяной шёлк',exact:true}).tap();
 const practice=workshop.getByRole('button',{name:/^Тренировать мастерство/});
 for(const xp of [3,6,9,12]){
  await practice.tap();
  await workshop.getByText(new RegExp(`^Опыт профессии ${xp} /`)).waitFor();
 }
 assert.equal((await read()).saga.n['mat:ice'],18);
 await sets.getByRole('button',{name:'Рунный круг',exact:true}).tap();
 await craft.tap();
 await page.locator('[data-panel="item"]').waitFor();
 const after=await read(),item=after.inventory.at(-1);
 assert.equal(item.masterworkBonus,27);
 assert.equal(item.slot,'ring1');
 assert.equal(after.saga.n['mat:forest'],7);
 assert.deepEqual(after.saga.box.workshop,{profession:'jeweler',xp:16});
 await page.reload();
 await page.waitForFunction(()=>!!window.__lootborn?.battle);
 await open();
 await workshop.getByRole('heading',{name:'Ювелир · Ремесленник'}).waitFor();
 assert.deepEqual((await read()).inventory.at(-1),item);
}

async function recommendation({page,button,close,read},variant){
 const mission=page.locator('.mission');
 assert.match(await mission.innerText(),/Основную Главу 2-1/);
 await mission.tap();
 const tip=page.getByText('Перед следующим регионом',{exact:true});
 if(variant==='unaffordable'){
  assert.equal(await tip.count(),0);
  return;
 }
 await tip.waitFor();
 assert.equal(await tip.count(),1);
 const text=await tip.locator('..').innerText();
 const delta=Number(text.match(/\+(\d+) к атаке/)[1]);
 assert.ok(delta>0);
 assert.match(text,/300 золота.*Северная шахта/);
 if(variant==='skip'){
  await button('Пропустить').tap();
  assert.equal(await tip.count(),0);
  await page.reload();
  await page.waitForFunction(()=>!!window.__lootborn?.battle);
  await mission.tap();
  assert.equal(await tip.count(),0);
  return;
 }
 const before=await read();
 await button('Открыть реликвии').tap();
 await button(/^Сердце ледника/).tap();
 const card=page.getByRole('dialog',{name:'Сердце ледника'});
 const attack=await card.getByText(/Атака героя ·/).innerText();
 const numbers=attack.match(/([\d\s]+) → ([\d\s]+)\./).slice(1).map(x=>Number(x.replace(/\s/g,'')));
 assert.equal(numbers[1]-numbers[0],delta);
 await button('Развить · 300 золота').tap();
 assert.equal((await read()).relic,1);
 assert.equal((await read()).gold,before.gold-300);
 await button('Закрыть карточку').tap();
 await close();
 await mission.tap();
 assert.equal(await tip.count(),0);
}

async function navalLifecycle({page, button, read}) {
 await page.clock.install({time:new Date('2026-11-28T09:00:00Z')});
 await button('Верфь').tap();
 const yard=page.getByRole('region',{name:'Морские экспедиции'});
 const next=label=>yard.getByRole('button',{name:label});
 const before=await read();
 await next('Отправить экспедицию').tap();
 assert.ok(await next('Забрать добычу рейса').isDisabled());
 await page.clock.fastForward(4*3_600_000);
 await next('Забрать добычу рейса').tap();
 await next('Ремонт · 95 золота').tap();
 await next(/Получить · 150 золота/).tap();
 assert.ok(await next(/Получить · 150 золота/).isDisabled());
 await next(/Построить корабль/).tap();
 await button(/Причал 2 · Торговый/).tap();
 assert.ok(await yard.getByRole('heading',{name:'Торговый · уровень 1/5'}).isVisible());
 await page.reload();
 await button(/Верфь/).first().tap();
 await button(/Причал 2 · Торговый/).tap();
 await yard.getByText('Оснащение и разбор',{exact:true}).tap();
 await next('Разобрать корабль').tap();
 await next('Подтвердить разбор').tap();
 const after=await read();
 assert.equal(after.shipyard.ships.length,1);
 assert.equal(after.shipyard.naval.contracts,1);
 assert.equal(after.shipyard.naval.serial,1);
 assert.equal(after.gold,before.gold+380-95+150-8000+2400);
 assert.equal(after.gems,before.gems);
 assert.equal(after.redDiamonds,before.redDiamonds);
}

(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
  for(const [width,height] of [[320,568],[360,780],[390,844],[430,932],[320,480]]){
   await withProfile(browser,{width,height},`useful-loot-${width}-${height}`,fixture(34),args=>navigation(args,width,height));
   const apprentice=fixture(34,true);
   apprentice.saga.n['mat:peaks']=25;
   await withProfile(browser,{width,height},`workshops-${width}-${height}`,apprentice,workshops);
   const owner=fixture(34,true);
   owner.saga.n['mat:ice']=30;
   owner.saga.n['mat:forest']=25;
   await withProfile(browser,{width,height},`personal-workshop-${width}-${height}`,owner,personalWorkshop);
   console.log(`${width}×${height} equipment navigation, backpack filter and harbor workshop passed`);
  }
  const viewport={width:390,height:844};
  const lockedWorkshop=fixture(1,true);
  lockedWorkshop.stage=10;
  lockedWorkshop.bosses=9;
  await withProfile(browser,viewport,'workshops-locked',lockedWorkshop,args=>workshops(args,true));
  const full=fixture(60);
  full.saga.n['mat:ember']=25;
  full.inventory[0]={...full.inventory[0],id:'qa-free-space',name:'Свободное место QA',rarity:0,upgrade:0,set:undefined,perk:undefined,engrave:undefined,uniqueId:undefined};
  await withProfile(browser,viewport,'useful-loot-capacity',full,capacity);
  const now=Date.now(),wallet=fixture(34);
  wallet.mineAt=now-598_000;
  wallet.shipyard={ships:[{id:'drakkar-1',level:1}],lastAt:now-3_597_000,stored:0};
  await withProfile(browser,viewport,'useful-loot-harvest',wallet,args=>harvest(args,now));
  const yard=fixture(34);
  yard.gold=10_000;
  yard.shipyard={ships:[{id:'drakkar-1',level:1}],lastAt:now,stored:0,
   naval:{version:1,serial:0,materials:21,seals:0,contracts:0}};
  await withProfile(browser,viewport,'naval-lifecycle',yard,navalLifecycle);

  for(const variant of ['apply','skip','unaffordable']){
   const early=fixture(13);
   early.stage=11;
   early.wave=1;
   early.bosses=10;
   early.relic=0;
   early.gold=variant==='unaffordable'?299:1000;
   await withProfile(browser,viewport,'useful-loot-tip-'+variant,early,args=>recommendation(args,variant));
  }
  console.log('Capacity and forge receipt, exact harbor boundaries, one actionable or skippable tip, and reload passed');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
