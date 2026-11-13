const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.BASE_URL||'http://localhost:4173/',out=process.env.OUT||'.tmp/ui-recovery';
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const results=[];
 for(const [width,height] of [[320,568],[390,844]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
  const raw='{"version":1,"damaged":"original save must remain untouched"';
  await context.addInitScript(raw=>{const key='lootborn-codex-v1:test:ui-recovery';if(!localStorage.getItem(key))localStorage.setItem(key,raw)},raw);
  const page=await context.newPage();await page.goto(base+'?testProfile=ui-recovery');await page.waitForFunction(()=>window.__lootborn);
  await page.getByRole('dialog',{name:'Восстановление прогресса'}).waitFor();
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:'Восстановление прогресса'}).count(),1);
  assert.equal(await page.evaluate(()=>localStorage.getItem('lootborn-codex-v1:test:ui-recovery')),raw);
  await page.getByRole('dialog').screenshot({path:`${out}/${width}-recovery.png`});
  await page.getByRole('button',{name:'Открыть импорт и резервную копию',exact:true}).tap();
  const file={name:'isolated-test-save.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(require('./ui-fixture.cjs')()))};
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('heading',{name:'Восстановить сохранение?',exact:true}).scrollIntoViewIfNeeded();
  await page.getByRole('dialog').screenshot({path:`${out}/${width}-import-confirmation.png`});
  await page.getByRole('button',{name:'Отмена',exact:true}).tap();
  assert.equal(await page.evaluate(()=>localStorage.getItem('lootborn-codex-v1:test:ui-recovery')),raw,'cancel cannot overwrite original');
  await page.locator('input[type=file]').setInputFiles(file);await page.getByRole('button',{name:'Восстановить этот прогресс',exact:true}).tap();
  assert.equal(await page.evaluate(()=>window.__lootborn.useGame.getState().recoveryRequired),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('lootborn-codex-v1:test:ui-recovery:before-import')),raw,'raw original remains backed up');
  await page.getByRole('button',{name:'Экспорт сохранения',exact:true}).scrollIntoViewIfNeeded();
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Экспорт сохранения',exact:true}).tap();const download=await downloaded;await download.saveAs(`${out}/${width}-save.json`);
  const exported=JSON.parse(fs.readFileSync(`${out}/${width}-save.json`));assert.equal(exported.inventory.length,80);assert.equal(exported.pendingLoot.length,41);assert.equal(exported.version,1);
  await page.evaluate(()=>{const g=window.__lootborn.useGame.getState();g.open('inventory');g.notice('Длинное русское уведомление: предметы защищены, награды сохранены, рюкзак заполнен — выберите вещи для массового разбора или откройте отдельное хранение.')});
  const boxes=await page.getByRole('dialog').evaluate(el=>({status:el.querySelector('.dialog-status').getBoundingClientRect().bottom,body:el.querySelector('.modal-body').getBoundingClientRect().top}));assert.ok(boxes.status<=boxes.body+1,'notification must occupy its own layout space');
  await page.getByRole('dialog').screenshot({path:`${out}/${width}-notification.png`});
  await page.reload();await page.waitForFunction(()=>window.__lootborn);assert.equal(await page.evaluate(()=>window.__lootborn.useGame.getState().p.inventory.length),80);
  results.push({width,height,corruptSavePreserved:true,importCancel:true,restoreAndBackup:true,export:true,notificationNoOverlap:true,reload:true});
  await context.close();
 }
 await browser.close();fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
