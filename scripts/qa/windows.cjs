/* Isolated UI acceptance. Never reads the owner's profile or contacts CloudStorage.
 * npm run dev; node scripts/qa/windows.cjs
 * BASE_URL=http://localhost:5174 BEFORE=1 captures the unchanged base for comparison.
 */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const output=process.env.OUTPUT||'.tmp/window-qa';fs.mkdirSync(output,{recursive:true});
const before=!!process.env.BEFORE;
async function seed(page,empty=false){await page.evaluate(empty=>{const g=window.__lootborn.useGame.getState();g.mutate(p=>{p.darkFloor=12;p.gold=6400000;p.chaosite=900;p.reducedMotion=true;p.saga??={v:1,seen:[],trophies:[],flags:[],n:{},box:{}};Object.assign(p.saga.n,{'res:ess':10000,'res:shard':10000,'res:seal':100,'mat:dusk':100});p.saga.box.dgear={inv:empty?[]:Array.from({length:60},(_,i)=>({id:'qa'+i,s:i%12,r:i%6,l:12,u:0,...(i%6>=3?{e:'reaper'}:{})})),eq:Array(12).fill(null)};});},empty);}
const read=page=>page.evaluate(()=>structuredClone(window.__lootborn.useGame.getState().p));
async function open(page,panel){await page.evaluate(panel=>window.__lootborn.useGame.getState().open(panel),panel);await page.locator(`[data-panel="${panel}"]`).waitFor();await page.waitForTimeout(350);if(!before)assert.equal(await page.locator('.dialog-notice').count(),0,'previous-window receipt must not appear in '+panel);}
async function closeCard(page){await page.getByRole('button',{name:'Закрыть карточку',exact:true}).click();await page.locator('dialog[open]').waitFor({state:'detached'});}
async function geometry(page){return page.evaluate(()=>{const body=document.querySelector('.modal-body'),r=body.getBoundingClientRect();const local=document.querySelector('.local-scroll');return {outerOverflow:body.scrollHeight-body.clientHeight,horizontal:document.documentElement.scrollWidth-innerWidth,body:{top:r.top,bottom:r.bottom},local:local?{height:local.clientHeight,scroll:local.scrollHeight}:null};});}
async function assertCard(page){assert.equal(await page.locator('dialog[open]').count(),1);assert.equal(await page.evaluate(()=>{const d=document.querySelector('dialog[open]');const r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&d.scrollWidth<=d.clientWidth+1&&d.contains(document.activeElement)}),true);}
async function assertSigns(page){assert.equal(await page.locator('.harbor-links button').evaluateAll(es=>{for(let i=0;i<es.length;i++){const a=es[i].getBoundingClientRect();if(a.width<76||a.height<44||document.elementFromPoint(a.x+a.width/2,a.y+a.height/2)?.closest('button')!==es[i])return false;for(let j=i+1;j<es.length;j++){const b=es[j].getBoundingClientRect();if(Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top))return false}}return true}),true,'All city signs have separate reachable touch areas');}
async function verifyMail(page,width) {
 const december = Date.UTC(2026,11,1,12);
 const january = Date.UTC(2027,0,1,12);
 await page.clock.setFixedTime(december);
 await page.goto((process.env.BASE_URL || 'http://localhost:5173/') + '?hero=mail-qa');
 await page.waitForFunction(() => window.__lootborn?.battle);
 const persist = () => page.evaluate(() => window.__lootborn.useGame.getState().persist());
 await persist();
 await page.clock.setFixedTime(january);
 await persist();
 await page.clock.setFixedTime(Date.UTC(2027,0,8,12));
 await persist();
 const openMail = async () => {
  await page.getByRole('button',{name:'Почта',exact:true}).tap();
  await page.getByRole('dialog',{name:'Почта',exact:true}).waitFor();
 };
 await page.setViewportSize({width,height:568});
 await page.evaluate(() => {
  document.documentElement.style.setProperty('--tg-content-safe-area-inset-top','26px');
  document.documentElement.style.setProperty('--tg-safe-area-inset-bottom','24px');
  // Recalculate the game scale after applying the simulated insets.
  window.dispatchEvent(new Event('resize'));
 });
 const menu = page.getByRole('button',{name:'Меню',exact:true});
 const envelope = page.getByRole('button',{name:'Почта',exact:true});
 await page.waitForFunction(() => {
  const box=document.querySelector('.hud-mail').getBoundingClientRect();
  const game=document.querySelector('.game').getBoundingClientRect();
  return game.top>=25.9 && game.bottom<=544.1 && box.width>=43.9 && box.height>=43.9;
 });
 const envelopeLayout = await envelope.evaluate(button => {
  const box=button.getBoundingClientRect();
  const counter=document.querySelector('.currency.chaosite').getBoundingClientRect();
  const menu=document.querySelector('.side-menu').getBoundingClientRect();
  const controls=document.querySelectorAll('.side,.stage,.enter,.hud button,.hud .name');
  return {
   aligned:box.right<=innerWidth+1 && box.top>=25.9 && box.top>=counter.bottom && box.top-counter.bottom<6
     && Math.abs((box.left+box.right)-(counter.left+counter.right))<4,
   envelopeTap:document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)?.closest('button')===button,
   menuTap:document.elementFromPoint(menu.x+menu.width/2,menu.y+menu.height/2)?.closest('button')?.matches('.side-menu'),
   overlaps:Array.from(controls).filter(control=>{
      const rect=control.getBoundingClientRect();
      return box.right>rect.left && box.left<rect.right && box.bottom>rect.top && box.top<rect.bottom;
    }).map(control=>control.className),
  };
 });
 assert.deepEqual(envelopeLayout,{aligned:true,envelopeTap:true,menuTap:true,overlaps:[]},
  `the envelope is directly below Chaosite with a separate touch area at ${width}px`);
 assert.equal(await envelope.locator('i').textContent(),'2');
 assert.equal(await menu.locator('.side-medal i').count(),0);
 await envelope.locator('img').evaluate(img=>img.decode());
 await page.screenshot({path:`${output}/mail-entry-${width}.png`});
 await menu.tap();
 const settings = page.getByRole('dialog',{name:'Меню',exact:true});
 for(const label of ['Почта','Герой','Рюкзак','Альбом','Экспорт сохранения','Импорт сохранения'])
  assert.equal(await settings.getByRole('button',{name:label,exact:true}).count(),0);
 assert.equal(await settings.getByRole('button',{name:'Экипировка',exact:true}).count(),1);
 assert.ok((await geometry(page)).outerOverflow<=1);
 await page.screenshot({path:`${output}/menu-${width}.png`});
 await settings.getByRole('button',{name:'Сохранение и восстановление',exact:true}).tap();
 const tools = page.getByRole('dialog',{name:'Сохранение и восстановление',exact:true});
 await tools.getByRole('button',{name:'Экспорт сохранения',exact:true}).waitFor();
 await tools.getByRole('button',{name:'К меню',exact:true}).tap();
 await settings.getByRole('button',{name:'Закрыть',exact:true}).tap();
 await settings.waitFor({state:'detached'});
 // The close button and the envelope are close on short screens. Start a new tap
 // after the viewport's deliberate protection against a double tap through a closing dialog.
 await page.waitForTimeout(350);
 await openMail();
 const inbox = page.getByRole('dialog',{name:'Почта',exact:true});
 const letters = inbox.locator('.mail-letter');
 const unread = inbox.locator('.mail-letter[data-unread="true"]');
 const remove = inbox.getByRole('button',{name:'Удалить прочитанные'});
 const all = inbox.getByRole('button',{name:'Забрать всё'});
 assert.equal(await unread.count(),2);
 assert.equal(await remove.isDisabled(),true);
 assert.equal((await geometry(page)).horizontal,0);
 for(const button of [all,remove]){
  const box=await button.boundingBox();
  assert.ok(box && box.height>=44 && box.y+box.height<=544,'mail actions above the bottom safe area');
 }
 await letters.locator('img').evaluateAll(images => Promise.all(images.map(image=>image.decode())));
 await page.screenshot({path:`${output}/mail-${width}.png`});
 await letters.first().tap();
 const detail = page.getByRole('dialog',{name:'Награды карнавала',exact:true});
 await assertCard(page);
 assert.equal(await detail.locator('.reward-piece img').count(),1);
 assert.equal(await detail.locator('.reward-piece strong').textContent(),'38');
 await page.screenshot({path:`${output}/mail-letter-${width}.png`});
 const balance = (await read(page)).gold;
 await detail.getByRole('button',{name:'Забрать',exact:true}).evaluate(button=>{button.click();button.click()});
 await detail.getByText('Вложения получены',{exact:false}).last().waitFor();
 assert.equal((await read(page)).gold,balance+38);
 await closeCard(page);
 assert.equal(await unread.count(),1);
 assert.equal(await page.locator('.hud-mail i').textContent(),'1');
 await remove.tap();
 assert.equal(await letters.count(),1);
 await all.evaluate(button=>{button.click();button.click()});
 assert.equal((await read(page)).gold,balance+76);
 await page.reload();
 await page.waitForFunction(() => window.__lootborn?.battle);
 assert.equal(await envelope.locator('i').count(),0);
 await openMail();
 assert.equal(await all.isDisabled(),true);
 await remove.tap();
 await inbox.getByText('Писем пока нет').waitFor();
 assert.equal((await read(page)).gold,balance+76);
 await inbox.getByRole('button',{name:'Закрыть',exact:true}).tap();
 await envelope.waitFor();
 assert.equal(await settings.count(),0);
}
async function verifyManualCry(page) {
 await page.goto((process.env.BASE_URL || 'http://localhost:5173/') + '?hero=cry-qa');
 await page.waitForFunction(() => window.__lootborn?.battle);
 await page.evaluate(() => window.__lootborn.useGame.getState().configure({auto:false}));
 await page.getByRole('button', {name:'Начать или продолжить бой'}).tap();
 const cry = page.getByRole('button', {name:'Клич Одина',exact:true});
 await cry.waitFor();
 const box = await cry.boundingBox();
 assert.ok(box && box.width >= 44 && box.height >= 44, 'manual cry is a reachable touch control at 320px');
 const status = await page.locator('.battle-status').boundingBox();
 assert.ok(status && box.y + box.height < status.y, 'manual cry leaves the battle status button fully accessible');
 await page.screenshot({path:`${output}/honor-fight-320.png`});
 await cry.tap();
 await page.waitForFunction(() => window.__lootborn.battle.buff > 0 && window.__lootborn.battle.cooldowns[1] > 0);
 assert.equal(await cry.isDisabled(), true);
 await page.getByRole('button', {name:'Почётные звания',exact:true}).tap();
 await page.getByRole('dialog', {name:'Почётные звания'}).waitFor();
 assert.equal(await page.evaluate(() => window.__lootborn.battle.running), false);
 await page.getByRole('button', {name:'Закрыть',exact:true}).tap();
 assert.equal(await page.evaluate(() => window.__lootborn.battle.running), true);
 await page.evaluate(() => {
  const {battle,useGame} = window.__lootborn;
  battle.buff = 0;
  battle.cooldowns[1] = 0;
  useGame.getState().configure({auto:true});
 });
 await page.waitForFunction(() => window.__lootborn.battle.buff > 0 && window.__lootborn.battle.cooldowns[1] > 0);
}
async function verifyHonor(page, width, height) {
 if(width===320)await verifyManualCry(page);
 await page.goto((process.env.BASE_URL || 'http://localhost:5173/') + '?hero=honor-qa');
 await page.waitForFunction(() => window.__lootborn?.battle);
 const crown = page.getByRole('button', {name:'Почётные звания',exact:true});
 assert.equal(await crown.evaluate(el => el.previousElementSibling.matches('.quick-auto') && el.nextElementSibling.matches('.quick-thor')), true);
 assert.equal(await crown.locator('.honor-ready').count(), 0);
 assert.equal(await page.getByRole('button', {name:'Клич Одина',exact:true}).count(), 0);
 await page.getByRole('button', {name:'Герой',exact:true}).tap();
 assert.equal(await page.getByRole('dialog').getByRole('button', {name:/^Почётные звания/}).count(), 0);
 await page.getByRole('button', {name:'Закрыть',exact:true}).tap();
 await page.evaluate(() => window.__lootborn.useGame.getState().mutate(p => {p.gold = 99}));
 await crown.tap();
 const dialog = page.getByRole('dialog', {name:'Почётные звания'});
 const claim = dialog.getByRole('button', {name:'Получить звание · 100 золота'});
 assert.equal(await claim.isDisabled(), true);
 const bars = dialog.getByRole('progressbar');
 assert.deepEqual(await bars.evaluateAll(els => els.map(el => [el.value,el.max])), [[0,1],[1,2],[99,100]]);
 await page.evaluate(() => window.__lootborn.useGame.getState().mutate(p => {
  p.stage = 61;
  p.level = 25;
  p.gold = 100000;
 }));
 assert.equal(await dialog.locator('.honor-requirements li[data-done="true"]').count(), 3);
 assert.deepEqual(await bars.evaluateAll(els => els.map(el => el.position)), [1,1,1]);
 await dialog.getByRole('button', {name:'Закрыть',exact:true}).tap();
 await crown.locator('.honor-ready').waitFor();
 await crown.tap();
 assert.equal(await claim.isEnabled(), true);
 const preview = await dialog.locator('.honor-stat-gain strong').allTextContents();
 const hp = Number(preview[1].replace(/\s/g, ''));
 await page.setViewportSize({width, height:568});
 await page.evaluate(() => {
  document.documentElement.style.setProperty('--tg-content-safe-area-inset-top', '26px');
  document.documentElement.style.setProperty('--tg-safe-area-inset-bottom', '24px');
 });
 await dialog.locator('.honor-crest').evaluateAll(images => Promise.all(images.map(image => image.decode())));
 await page.locator('.level-award').waitFor({state:'hidden'});
 assert.equal((await geometry(page)).horizontal, 0);
 assert.ok((await geometry(page)).outerOverflow <= 1, 'rank cards, stats and all progress bars fit above the promotion button');
 const box = await claim.boundingBox();
 assert.ok(box && box.height >= 44 && box.y + box.height <= 544, `promotion reachable in the short ${width}px window: ${JSON.stringify(box)}`);
 await page.screenshot({path:`${output}/honor-${width}.png`});
 await claim.evaluate(button => {button.click(); button.click()});
 await dialog.getByText('Звание «Дружинник» получено').waitFor();
 assert.equal((await read(page)).saga.box.honor.rank, 1);
 assert.equal((await read(page)).gold, 99900);
 await page.waitForFunction(value => window.__lootborn.battle.maxHp === value, hp);
 assert.deepEqual(await dialog.locator('.honor-stats tbody td:nth-child(2)').allTextContents(), preview);
 await dialog.getByRole('button', {name:'Готово'}).tap();
 await dialog.waitFor({state:'detached'});
 assert.equal(await page.evaluate(() => window.__lootborn.battle.running), false);
 await crown.locator('.honor-ready').waitFor();
 await page.reload();
 await page.waitForFunction(() => window.__lootborn?.battle);
 await crown.tap();
 assert.equal(await dialog.getByRole('button', {name:'Получить звание · 350 золота'}).isEnabled(), true);
 const restored = await read(page);
 assert.equal(restored.gold, 99900);
 assert.equal(restored.saga.box.honor.rank, 1);
 await page.setViewportSize({width, height});
}
async function verifyRealmVictory(page,width){
 await page.setViewportSize({width,height:568});
 await page.evaluate(()=>{
  document.documentElement.style.setProperty('--tg-content-safe-area-inset-top','26px');
  document.documentElement.style.setProperty('--tg-safe-area-inset-bottom','24px');
  const g=window.__lootborn.useGame.getState();
  g.mutate(p=>{
   // The preceding warehouse scenario fills storage; this receipt exercises normal item delivery.
   if(p.saga.box.dgear)p.saga.box.dgear.inv=[];
   const item={id:'qa-finale-armor',s:1,r:3,l:p.darkFloor,u:0};
   const totals={ess:36,gold:8765,xp:37,shard:3,dusk:1,seal:1,gems:25,loot:['Затменный · Панцирь Ночи','Рубин 2 ур.','Рубин 2 ур.']};
   p.saga.box.realm={last:{...totals,stage:'WIN_PENDING',resultId:'qa-finale',ack:false,f:p.darkFloor,win:true,rooms:6,first:true,
    pending:[{totals,items:[item],gem:'ruby:2'},{totals:{ess:0,gold:0,xp:0,shard:0,dusk:0,seal:0,gems:0,loot:[]},items:[],gem:'ruby:2'}]}};
  });
  g.open('realm');
 });
 const prior=await read(page),reward=page.getByRole('dialog',{name:'Победа'});
 await reward.waitFor();
 const grid=reward.locator('.realm-loot-grid');
 assert.equal(await grid.getByRole('button').count(),9,'seven resource icons, one armor card and one stacked gem card');
 assert.equal(await grid.locator('img,.gem-dot').count(),9,'all reward tiles show art');
 const armor=grid.getByRole('button',{name:'Затменный · Панцирь Ночи · 1'});
 const gem=grid.getByRole('button',{name:'Рубин 2 ур. · 2'});
 assert.equal(await armor.locator('img').count(),1);
 assert.equal(await gem.locator('.realm-loot-count').textContent(),'2');
 await gem.tap();assert.equal(await reward.locator('.realm-loot-detail').textContent(),'Рубин 2 ур.');
 const collect=reward.getByRole('button',{name:'Забрать',exact:true});
 const rect=await collect.boundingBox();assert.ok(rect&&rect.y+rect.height<=544,'collect stays above the Telegram bottom safe area');
 await assertCard(page);
 await page.screenshot({path:`${output}/realm-victory-${width}.png`});
 await collect.evaluate(e=>{e.click();e.click()});
 await reward.waitFor({state:'detached'});
 const after=await read(page);
 assert.equal(after.gold,prior.gold+8765);
 assert.equal(after.darkFloor,prior.darkFloor+1);
 assert.equal(after.saga.box.dgear.inv.filter(x=>x.id==='qa-finale-armor').length,1);
 assert.equal(after.saga.box.gems.bag['ruby:2'],(prior.saga.box.gems?.bag?.['ruby:2']??0)+2);
 await page.reload();
 await page.waitForFunction(()=>window.__lootborn&&document.querySelector('.viewport'));
 assert.equal((await read(page)).gold,after.gold);
 await open(page,'realm');
 assert.equal(await reward.count(),0,'reload cannot reopen a claimed victory');
}
let browser;
(async()=>{browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),args:['--no-sandbox']});const report=[];
 for(const [width,height] of [[320,640],[360,740],[390,780],[430,932]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:true,isMobile:true,reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('response',r=>{if(r.status()>=400&&/\.(webp|svg|png|js|css)(\?|$)/.test(r.url()))errors.push(r.status()+' '+r.url())});page.on('pageerror',e=>errors.push(e.message));
  if(!before){
   const mailPage=await context.newPage();
   mailPage.on('pageerror',e=>errors.push(e.message));
   await verifyMail(mailPage,width);
   await mailPage.close();
  }
  if(!before)await verifyHonor(page,width,height);
  await page.goto((process.env.BASE_URL||'http://localhost:5173/')+'?hero=windows-qa');await page.waitForFunction(()=>window.__lootborn&&document.querySelector('.viewport'));await seed(page);
  // Finish normal quest initialization before comparing the complete Saga across reload.
  // Otherwise its regular 15s initialization can race the readback on a slow runner.
  await page.evaluate(()=>window.__lootborn.useGame.getState().open('quests'));
  await page.waitForFunction(()=>window.__lootborn.useGame.getState().p.saga?.box.quests?.week);
  await page.evaluate(()=>window.__lootborn.useGame.getState().open(null));
  for(const panel of ['realm','darkgear','companions','relic','port']){
   await open(page,panel);await page.screenshot({path:`${output}/${before?'before':'after'}-${width}-${panel}.png`});const geo=await geometry(page);report.push({width,height,panel,...geo});
   assert.equal(geo.horizontal,0);
   if(before)continue;
   assert.ok(geo.outerOverflow<=1,`${width} ${panel} outer scroll: ${geo.outerOverflow}`);
   if(panel==='realm'){
    assert.equal(await page.locator('[data-panel="realm"] .modal-header button').count(),1,'one exit on direct entry');
    const floors=page.getByRole('group',{name:'Этажи Царства тьмы'});
    assert.ok(await floors.evaluate(e=>e.scrollHeight>e.clientHeight&&e.scrollTop>0),'vertical list opens around the selected floor');
    assert.equal(await floors.getByRole('button',{name:/Этаж 13 Закрыт/}).isDisabled(),true);
    const tenth=floors.getByRole('button',{name:/Этаж 10 Пройден/});
    await tenth.click();assert.equal(await tenth.getAttribute('aria-pressed'),'true','unlocked floors can be picked directly');
    await floors.evaluate(e=>e.scrollTop=0);
    const first=floors.getByRole('button',{name:/Этаж 1 Пройден/});
    await first.click();assert.equal(await first.getAttribute('aria-pressed'),'true','scroll reaches earlier floors');
    for(const selector of ['.realm-floor-list','.bless-grid','.workspace-actions']){const box=await page.locator(selector).boundingBox();assert.ok(box.y>=geo.body.top&&box.y+box.height<=geo.body.bottom+1,`${width} ${selector} clipped`);}
    await page.locator('.bless-grid button').nth(1).click();assert.equal(await page.locator('.bless-grid button').nth(1).getAttribute('aria-pressed'),'true');
    await page.getByRole('button',{name:'Награды и правила'}).click();await assertCard(page);await closeCard(page);
   }
   if(panel==='darkgear'){
    assert.equal(await page.locator('.dark-slot').count(),12);assert.equal(await page.locator('.dark-slot').evaluateAll(els=>els.every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===e})),true,'12 reachable 44px slots');assert.ok(geo.local.height>=100,'first two item rows visible');
    const scroller=page.locator('.storage-scroll');await scroller.evaluate(e=>e.scrollTop=125);const offset=await scroller.evaluate(e=>e.scrollTop);
    const item=page.locator('.dark-grid button').nth(15);await item.click();await assertCard(page);await page.screenshot({path:`${output}/compare-${width}.png`});await page.locator('dialog .context-header h3').evaluate(e=>e.textContent='Первородный артефакт хранителя северных врат вечного сумрака');await assertCard(page);
    if(width===320){await page.locator('.compare-tabs button').nth(1).click();assert.equal(await page.locator('.compare-worn').isVisible(),true);await page.locator('.compare-tabs button').nth(0).click();}
    await closeCard(page);assert.equal(await scroller.evaluate(e=>e.scrollTop),offset);
    await page.locator('.dark-grid button').nth(15).click();await page.getByRole('button',{name:'Надеть',exact:true}).click();assert.equal(await page.locator('dialog[open]').count(),0);assert.equal((await read(page)).saga.box.dgear.inv.length,59);
    const p=await read(page),worn=p.saga.box.dgear.eq.find(Boolean);assert.ok(worn);
    await page.locator('.dark-slot').nth(worn.s).click();await assertCard(page);const gold=p.gold;await page.getByRole('button',{name:/Усилить до/}).click();const upgraded=await read(page);assert.equal(upgraded.saga.box.dgear.eq[worn.s].u,1);assert.ok(upgraded.gold<gold);assert.match(await page.locator('.context-status').innerText(),/Усиление успешно/);
    await closeCard(page);await page.getByRole('combobox',{name:'Фильтр склада'}).selectOption(String(worn.s));await page.locator('.dark-grid button').first().click();await assertCard(page);assert.equal(await page.locator('.dark-card i.down').count(),1);assert.equal(await page.locator('.context-status').innerText(),'');assert.equal(await page.locator('dialog').evaluate(d=>{const body=d.querySelector('.context-body').getBoundingClientRect(),effect=d.querySelector('.compare-new em').getBoundingClientRect();return effect.bottom<=body.bottom+1}),true,'effect visible without searching below actions');if(width>=375){const worn=await page.locator('.compare-worn').boundingBox(),fresh=await page.locator('.compare-new').boundingBox();assert.ok(worn.x<fresh.x,'equipped left, new right');}await page.screenshot({path:`${output}/compare-equipped-${width}.png`});await closeCard(page);await page.getByRole('combobox',{name:'Фильтр склада'}).selectOption('all');await page.locator('.dark-slot').nth(worn.s).click();
    assert.equal(await page.getByRole('button',{name:'Защитить',exact:true}).count(),0);
    await page.getByRole('button',{name:'Снять на склад',exact:true}).click();assert.equal((await read(page)).saga.box.dgear.inv.length,60);
    await page.getByRole('combobox',{name:'Фильтр склада'}).selectOption('0');assert.ok(await page.locator('.dark-grid button').count()>0);await page.getByRole('combobox',{name:'Фильтр склада'}).selectOption('all');
    await page.getByRole('button',{name:'Разобрать',exact:true}).click();await assertCard(page);await closeCard(page);
    await page.locator('.dark-grid button').first().click();await assertCard(page);const countBefore=(await read(page)).saga.box.dgear.inv.length;
    await page.getByRole('button',{name:/^Разобрать \+/}).click();assert.equal((await read(page)).saga.box.dgear.inv.length,countBefore);await page.getByRole('button',{name:'Подтвердить разбор',exact:true}).click();assert.equal((await read(page)).saga.box.dgear.inv.length,countBefore-1);
   }
   if(panel==='companions'){
    const initial=await page.locator('.squad-grid').boundingBox();await page.locator('.squad-grid button').first().click();await assertCard(page);
    await page.getByRole('button',{name:'Звёзды',exact:true}).click();await page.getByRole('button',{name:'Таланты',exact:true}).click();await page.getByRole('button',{name:'Пробуждение',exact:true}).click();assert.equal(await page.getByRole('button',{name:/Пробудить ·/}).isDisabled(),true);await page.getByRole('button',{name:'Уровень',exact:true}).click();
    const lv=(await read(page)).companions[0];await page.getByRole('button',{name:/Повысить уровень/}).click();assert.equal((await read(page)).companions[0],lv+1);assert.match(await page.locator('.context-status').innerText(),/Уровень спутника повышен/);await page.screenshot({path:`${output}/notice-live-${width}.png`});await page.screenshot({path:`${output}/companion-${width}.png`});await closeCard(page);assert.deepEqual(await page.locator('.squad-grid').boundingBox(),initial);await page.getByRole('button',{name:'‹ В гавань',exact:true}).click();assert.equal(await page.locator('.dialog-notice').count(),0);await page.screenshot({path:`${output}/notice-destination-${width}.png`});await page.getByRole('navigation',{name:'Постройки гавани'}).getByRole('button',{name:'Спутники',exact:true}).click();
    await page.getByRole('button',{name:'Призыв',exact:true}).click();await assertCard(page);assert.equal(await page.locator('.context-status').innerText(),'');const seals=(await read(page)).saga.n['res:seal'];await page.getByRole('button',{name:'Призыв · 1 печать',exact:true}).click();assert.equal((await read(page)).saga.n['res:seal'],seals-1);await closeCard(page);
    const formation=page.getByRole('group',{name:'Состав дружины'});
    assert.equal(await formation.locator(':scope > *').count(),3);
    await page.evaluate(()=>window.__lootborn.useGame.getState().mutate(p=>{
     const squad=p.saga.box.squad;
     const starter=squad.instances['follower:goose_aviator'];
     squad.instances['follower:08_armored_boar']={...structuredClone(starter),species:'08_armored_boar',lv:100};
    }));
    const boar=page.getByRole('button',{name:'Броненосный вепрь',exact:true});
    await boar.tap();await assertCard(page);
    assert.equal(await page.getByText('Предел повышения · 100',{exact:true}).count(),1);
    await page.getByRole('button',{name:'Таланты',exact:true}).tap();
    const talents=page.getByRole('list',{name:'Ячейки талантов'});
    assert.equal(await talents.getByRole('listitem').count(),8);
    assert.equal(await talents.locator('.locked').count(),4);
    await page.screenshot({path:`${output}/follower-talents-${width}.png`});
    await page.getByRole('button',{name:'В сопровождение II',exact:true}).tap();
    assert.equal((await read(page)).saga.box.squad.formation[2],'follower:08_armored_boar');
    await closeCard(page);
    await page.reload();await page.waitForFunction(()=>window.__lootborn?.battle);
    await open(page,'companions');
    await formation.getByRole('button',{name:'Сопровождение II · Броненосный вепрь',exact:true}).waitFor();
    assert.equal(await formation.getByText('Вне боя',{exact:true}).count(),1);
    assert.equal(await formation.evaluate(group=>{
     const boxes=[...group.children].map(cell=>cell.getBoundingClientRect());
     return boxes.every((box,i)=>box.width>=44&&box.height>=44&&(i===0||box.left>=boxes[i-1].right));
    }),true);
    await page.screenshot({path:`${output}/follower-formation-${width}.png`});
    await formation.getByRole('button',{name:'Сопровождение II · Броненосный вепрь',exact:true}).tap();
    await page.getByRole('button',{name:'Освободить сопровождение II',exact:true}).tap();
    assert.equal((await read(page)).saga.box.squad.formation[2],null);
    await closeCard(page);
   }
   if(panel==='relic'){
    await page.locator('.relic-grid button').first().click();await assertCard(page);const old=(await read(page)).relic;await page.getByRole('button',{name:/Развить ·/}).click();assert.equal((await read(page)).relic,old+1);assert.match(await page.locator('.context-status').innerText(),/Уровень повышен/);await page.screenshot({path:`${output}/relic-card-${width}.png`});await closeCard(page);
    await page.locator('.relic-grid button').nth(1).click();await assertCard(page);await closeCard(page);
   }
   if(panel==='port'){
    await assertSigns(page);const harbor=page.getByRole('navigation',{name:'Постройки гавани'});
    for(const label of ['Кузница','Верфь','Рюкзак','Спутники','Реликвии'])assert.equal(await harbor.getByRole('button',{name:label,exact:true}).count(),1);
    await harbor.getByRole('button',{name:'Кузница',exact:true}).click();await page.getByRole('button',{name:'Создание',exact:true}).click();await page.getByRole('button',{name:'Экипировка',exact:true}).click();await page.getByRole('button',{name:'‹ В гавань',exact:true}).click();
    for(const [label,target] of [['Спутники','companions'],['Реликвии','relic'],['Царство тьмы','realm'],['Тёмная энергия','darkgear'],['Камни','gems'],['Благословение','blessing'],['Таланты','talents']]){await harbor.getByRole('button',{name:label,exact:true}).click();await page.locator(`[data-panel="${target}"]`).waitFor();if(target==='realm')assert.equal(await page.locator('[data-panel="realm"] .modal-header button').count(),1,'one return to the harbor');await page.getByRole('button',{name:'‹ В гавань',exact:true}).click();}
    await harbor.getByRole('button',{name:'Верфь',exact:true}).click();assert.ok(await page.getByRole('button',{name:/Построить драккар/}).isVisible());await page.getByRole('button',{name:'‹ В гавань',exact:true}).click();
   }
   await page.getByRole('button',{name:'Закрыть',exact:true}).click();assert.equal(await page.locator('.saga-modal').count(),0);await open(page,panel);
  }
  if(!before){
   // Reload retains all changed game data, no UI open/close grants or charges.
   const saved=await read(page);await page.reload();await page.waitForFunction(()=>window.__lootborn&&document.querySelector('.viewport'));const restored=await read(page);for(const key of ['gold','relic','companions','saga'])assert.deepEqual(restored[key],saved[key],`reload ${key}`);
   await seed(page,true);await open(page,'darkgear');assert.ok((await page.locator('.storage-scroll').innerText()).includes('Склад пуст'));
   await page.evaluate(()=>window.__lootborn.useGame.getState().mutate(p=>{p.gold=0;p.chaosite=0;p.saga.n['res:seal']=0;p.gems=0}));await open(page,'realm');assert.equal(await page.getByRole('button',{name:/Вызов ·/}).isDisabled(),true);
   await open(page,'relic');await page.locator('.relic-grid button').first().click();assert.equal(await page.getByRole('button',{name:/Развить ·/}).isDisabled(),true);await closeCard(page);
   // Telegram safe areas plus short WebView; labels must wrap without horizontal scroll.
   await page.setViewportSize({width,height:568});await page.evaluate(()=>{document.documentElement.style.setProperty('--tg-content-safe-area-inset-top','26px');document.documentElement.style.setProperty('--tg-safe-area-inset-bottom','24px')});await open(page,'realm');assert.ok((await geometry(page)).outerOverflow<=1);const call=await page.locator('.workspace-actions').boundingBox();assert.ok(call.y+call.height<=544);await page.screenshot({path:`${output}/short-safe-${width}.png`});
   for(const shortPanel of ['darkgear','companions','relic','port']){await open(page,shortPanel);assert.ok((await geometry(page)).outerOverflow<=1,`short ${width} ${shortPanel}`);await page.screenshot({path:`${output}/short-${width}-${shortPanel}.png`});if(shortPanel==='darkgear')assert.ok((await geometry(page)).local.height>=44,'short warehouse first row');if(shortPanel==='port')await assertSigns(page);}
   // Late-game art and slot legibility use a separate, explicitly seeded QA save.
   await seed(page);await page.evaluate(()=>window.__lootborn.useGame.getState().mutate(p=>{p.saga.box.dgear.eq=Array.from({length:12},(_,s)=>({id:'qa-worn-'+s,s,r:s%6,l:12,u:s%3,...(s%6>=3?{e:'reaper'}:{})}));}));await open(page,'darkgear');assert.ok((await geometry(page)).local.height>=44);await page.screenshot({path:`${output}/short-filled-${width}-darkgear.png`});
   await page.setViewportSize({width,height});await page.evaluate(()=>{document.documentElement.style.removeProperty('--tg-content-safe-area-inset-top');document.documentElement.style.removeProperty('--tg-safe-area-inset-bottom')});await page.screenshot({path:`${output}/populated-${width}-darkgear.png`});assert.equal(await page.locator('.dark-slot small').count(),12);
   await open(page,'realm');
   await page.evaluate(()=>window.__lootborn.useGame.getState().mutate(p=>p.chaosite=10));await page.getByRole('button',{name:/Вызов ·/}).evaluate(e=>{e.click();e.click()});assert.equal((await read(page)).chaosite,5);await page.reload();await page.waitForFunction(()=>window.__lootborn&&document.querySelector('.viewport'));assert.equal((await read(page)).chaosite,5);await open(page,'realm');assert.equal(await page.getByRole('button',{name:'Продолжить поход',exact:true}).count(),1);
   await verifyRealmVictory(page,width);
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 await browser.close();fs.writeFileSync(`${output}/${before?'before':'after'}-results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1});
