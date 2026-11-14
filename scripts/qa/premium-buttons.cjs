/* Isolated profile only. BASE_URL may target the built game or shared Pages. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const out='.tmp/premium-buttons';fs.mkdirSync(out,{recursive:true});const results=[];
 for(const [width,height] of [[320,568],[360,780],[390,844],[430,932]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[],bad=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)bad.push([r.status(),r.url()])});
  await page.goto((process.env.BASE_URL||'http://localhost:5173/')+'?testProfile=premium-buttons-'+width);
  await page.waitForFunction(()=>window.__lootborn?.battle);
  await page.evaluate(()=>{const g=window.__lootborn.useGame.getState();g.mutate(p=>{p.sound=false;p.reducedMotion=true})});
  const axes=page.locator('.bottom>.central'),map=page.getByRole('button',{name:'Карта',exact:true});
  await page.waitForFunction(()=>[...document.querySelectorAll('.forged-axes-art,.adventure-map-art')].every(i=>i.complete&&i.naturalWidth>0));
  const boxes=await page.locator('.bottom>button').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}));
  for(const r of boxes){assert.ok(r.x>=0&&r.x+r.w<=width+.5&&r.y>=0&&r.y+r.h<=height,JSON.stringify(r))}
  for(let i=1;i<boxes.length;i++)assert.ok(boxes[i-1].x+boxes[i-1].w<=boxes[i].x+1,'navigation hit areas overlap');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`${out}/${width}-home.png`});
  const state=()=>page.evaluate(()=>JSON.parse(JSON.stringify(window.__lootborn.useGame.getState().p)));
  const beforeMap=await state();await map.tap();await page.getByRole('dialog',{name:'Карта и мастерские',exact:true}).waitFor();
  assert.equal(await page.getByRole('dialog').getByText(/Порт/).count(),0);
  await page.screenshot({path:`${out}/${width}-map.png`});
  const afterMap=await state();delete beforeMap.savedAt;delete afterMap.savedAt;assert.deepEqual(afterMap,beforeMap,'map must not mutate player');
  await page.getByRole('button',{name:'Закрыть',exact:true}).tap();
  await axes.tap();await page.waitForFunction(()=>window.__lootborn.battle.running);await page.waitForTimeout(600);
  assert.equal(await axes.getAttribute('aria-pressed'),'true');
  await axes.tap();await page.waitForFunction(()=>!window.__lootborn.battle.running);
  const paused=await state();await page.reload();await page.waitForFunction(()=>window.__lootborn?.battle);
  const reloaded=await state();for(const key of ['level','stage','wave','equipment','inventory','gold','gems','skills','companions','encounter'])assert.deepEqual(reloaded[key],paused[key],'reload '+key);
  assert.equal(await axes.getAttribute('aria-pressed'),'false');
  // Real defeat handler; tap the actual button to retry the same chapter.
  await page.evaluate(()=>{const {battle:b}=window.__lootborn;b.hp=0;b.defeat()});
  await page.waitForFunction(()=>window.__lootborn.battle.phase==='defeat'&&!window.__lootborn.battle.running);
  const dead=await state();await axes.tap();await page.waitForFunction(()=>window.__lootborn.battle.running&&window.__lootborn.battle.hp>0);
  const alive=await state();assert.equal(alive.stage,dead.stage);assert.equal(alive.wave,dead.wave);assert.deepEqual(alive.equipment,dead.equipment);
  // One start progresses naturally from walking into combat, with no more taps.
  await page.waitForFunction(()=>window.__lootborn.battle.phase==='fight',{},{timeout:20000});
  assert.equal(await axes.getAttribute('aria-pressed'),'true');await axes.tap();
  await axes.focus();assert.equal(await axes.evaluate(e=>e===document.activeElement),true);
  assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
  results.push({width,height,boxes,map:true,reload:true,deathRetry:true,automaticWalkToCombat:true,errors,bad});await context.close();
 }
 await browser.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
