const {chromium}=require('playwright');const fs=require('node:fs');const assert=require('node:assert/strict');
const base=process.env.BASE_URL||'http://localhost:4173/',out=process.env.OUT||'.tmp/ui-subpanels';
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const results=[];
 for(const [width,height] of [[320,568],[360,780],[390,844],[430,932]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true}),p=require('./ui-fixture.cjs')(60);
  p.bosses=60;p.daily='';p.companions=[15,15];
  await context.addInitScript(p=>{const k='lootborn-codex-v1:test:ui-subpanels';if(!localStorage.getItem(k))localStorage.setItem(k,JSON.stringify(p))},p);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'?testProfile=ui-subpanels');await page.waitForFunction(()=>window.__lootborn);
  const open=async panel=>{await page.evaluate(panel=>{window.__lootborn.useGame.getState().open(panel);window.__lootborn.useGame.setState({toast:''})},panel);await page.getByRole('dialog').waitFor()};
  const check=async name=>{
   const bad=await page.getByRole('dialog').evaluate(el=>[...el.querySelectorAll('*')].filter(x=>!(x instanceof SVGElement)&&x.clientWidth>0&&x.scrollWidth>x.clientWidth+2&&getComputedStyle(x).textOverflow!=='ellipsis'&&!x.matches('.saga-scene,.saga-scenery,.ambient')).map(x=>x.className));assert.deepEqual(bad,[],name+' clipped content');
   await page.getByRole('dialog').screenshot({path:`${out}/${width}-${name}.png`});results.push({width,height,state:name,clipped:bad});
  };
  await open('hero');await page.locator('summary').filter({hasText:/^Сохранённые сборки$/}).tap();
  for(let i=0;i<3;i++)await page.getByRole('button',{name:'Сохранить',exact:true}).nth(i).tap();
  await page.getByRole('button',{name:'Надеть',exact:true}).last().scrollIntoViewIfNeeded();await check('saved-builds');
  await open('quests');for(const name of ['День','Неделя','Сага','Мастерство']){await page.locator('.quest-board .tabs').getByRole('button',{name:new RegExp('^'+name)}).tap();await check('quests-'+name)}
  await page.locator('summary').filter({hasText:/^Цели охоты и источники добычи$/}).tap();await page.locator('.hunt-goals').scrollIntoViewIfNeeded();await check('hunt-sources');
  await page.locator('summary').filter({hasText:/^Именные трофеи саги$/}).tap();await page.locator('.hunt-item').last().scrollIntoViewIfNeeded();await check('trophy-guide');
  await open('forge');for(const [i,name] of ['frost','storm','rune','stone','legion','ember'].entries()){await page.locator('.tabs.wrap button').nth(i).tap();await page.locator('.material-row').scrollIntoViewIfNeeded();await check('recipe-'+name)}
  await open('skills');for(const card of await page.locator('.skill-card').all()){await card.locator('.rune-options button').last().tap()}await page.locator('.skill-card').last().scrollIntoViewIfNeeded();await check('runes-selected');
  await open('companions');await page.locator('.companion-card').last().scrollIntoViewIfNeeded();await check('companion-evolved');
  await open('rewards');const gold=await page.evaluate(()=>window.__lootborn.useGame.getState().p.gold);await page.getByRole('button',{name:'Забрать подарок',exact:true}).tap();assert.equal(await page.evaluate(()=>window.__lootborn.useGame.getState().p.gold),gold+200);await check('daily-claimed');
  await open('shop');await page.locator('.row .action').first().tap();assert.ok(await page.evaluate(()=>window.__lootborn.useGame.getState().p.bought.length)>0);await check('shop-purchased');
  await open('events');await check('event-rewards-ready');await page.locator('.row .action').first().tap();await check('event-reward-claimed');
  await page.evaluate(()=>window.__lootborn.useGame.getState().mutate(p=>{p.inventory.pop()}));
  await open('loot');const items=await page.evaluate(()=>{const p=window.__lootborn.useGame.getState().p;return p.inventory.length+(p.pendingLoot?.length??0)});await page.getByRole('button',{name:/^Протрубить/}).tap();
  assert.equal(await page.evaluate(()=>{const p=window.__lootborn.useGame.getState().p;return p.inventory.length+(p.pendingLoot?.length??0)}),items+1);await check('actual-new-loot');
  assert.deepEqual(errors,[]);await context.close();
 }
 await browser.close();fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({states:results.length,errors:[]},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
