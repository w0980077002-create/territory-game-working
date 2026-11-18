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
let browser;
(async()=>{browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),args:['--no-sandbox']});const report=[];
 for(const [width,height] of [[320,640],[360,740],[390,780],[430,932]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:true,isMobile:true,reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('response',r=>{if(r.status()>=400&&/\.(webp|svg|png|js|css)(\?|$)/.test(r.url()))errors.push(r.status()+' '+r.url())});page.on('pageerror',e=>errors.push(e.message));
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
    for(const selector of ['.floor-strip','.room-track','.bless-grid','.workspace-actions']){const box=await page.locator(selector).boundingBox();assert.ok(box.y>=geo.body.top&&box.y+box.height<=geo.body.bottom+1,`${width} ${selector} clipped`);}
    await page.locator('.bless-grid button').nth(1).click();assert.equal(await page.locator('.bless-grid button').nth(1).getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:'Предыдущий этаж'}).click();
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
    await page.getByRole('button',{name:'Защитить',exact:true}).click();assert.equal((await read(page)).saga.box.dgear.eq[worn.s].k,true);
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
   }
   if(panel==='relic'){
    await page.locator('.relic-grid button').first().click();await assertCard(page);const old=(await read(page)).relic;await page.getByRole('button',{name:/Развить ·/}).click();assert.equal((await read(page)).relic,old+1);assert.match(await page.locator('.context-status').innerText(),/Уровень повышен/);await page.screenshot({path:`${output}/relic-card-${width}.png`});await closeCard(page);
    await page.locator('.relic-grid button').nth(1).click();await assertCard(page);await closeCard(page);
   }
   if(panel==='port'){
    await assertSigns(page);const harbor=page.getByRole('navigation',{name:'Постройки гавани'});
    for(const label of ['Кузница','Верфь','Рюкзак','Спутники','Реликвии'])assert.equal(await harbor.getByRole('button',{name:label,exact:true}).count(),1);
    await harbor.getByRole('button',{name:'Кузница',exact:true}).click();await page.getByRole('button',{name:'Создание',exact:true}).click();await page.getByRole('button',{name:'Экипировка',exact:true}).click();await page.getByRole('button',{name:'‹ В гавань',exact:true}).click();
    for(const [label,target] of [['Спутники','companions'],['Реликвии','relic'],['Царство тьмы','realm'],['Тёмная энергия','darkgear'],['Камни','gems'],['Благословение','blessing'],['Таланты','talents']]){await harbor.getByRole('button',{name:label,exact:true}).click();await page.locator(`[data-panel="${target}"]`).waitFor();await page.getByRole('button',{name:'‹ В гавань',exact:true}).click();}
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
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 await browser.close();fs.writeFileSync(`${output}/${before?'before':'after'}-results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1});
