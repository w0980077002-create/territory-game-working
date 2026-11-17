/* node --import tsx scripts/qa/dark-realm-fixture.ts && node scripts/qa/dark-realm.cjs
 * Real battle, isolated profile, deterministic simulation stepping (no damage/HP manipulation).
 * BASE_URL defaults to Vite; source imports are used only by this local verification harness.
 */
const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const base=process.env.BASE_URL||'http://localhost:5173/';
const key='lootborn-codex-v1:test:darkworld';
const hash=s=>require('node:crypto').createHash('sha256').update(s).digest('hex');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const report=[];
 try{for(const width of [320,360,390,430]){
  const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:2});
  const profile=JSON.parse(fs.readFileSync('.tmp/qa/realm-player.json'));
  await context.addInitScript(({key,profile})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(profile))},{key,profile});
  const page=await context.newPage(),errors=[],bad=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)bad.push([r.status(),r.url()])});
  await page.goto(base+'?testProfile=darkworld');await page.waitForFunction(async()=>!!(await import('/src/game/Battle.ts')).battle);await page.waitForFunction(async()=>(await import('/src/game/Battle.ts')).battle?.realmScenery.ready());
  await page.evaluate(async()=>{const {battle:b}=await import('/src/game/Battle.ts');b.pause();b.draw()});
  const hud=await page.locator('.hud').boundingBox();
  await page.screenshot({path:`.tmp/qa/dark-${width}-pve.png`});
  // Reach the realm through its actual Adventure button and challenge screen.
  await page.getByRole('button',{name:'приключение',exact:true}).click();
  await page.locator('.row').filter({hasText:'Царство тьмы'}).getByRole('button',{name:'Открыть',exact:true}).click();
  await page.getByRole('button',{name:/Вызов/}).click();
  for(let room=1;room<=3;room++){
   const arrived=await page.evaluate(async room=>{
    const {battle:b}=await import('/src/game/Battle.ts');const {useGame}=await import('/src/core/store.ts');useGame.getState().open(null);b.running=true;
    for(let n=0;n<4000&&b.phase==='walk';n++)b.update(.05);
    if(b.phase!=='fight')return {phase:b.phase};for(let n=0;n<4;n++)b.update(.05);
    b.pause();b.draw();return {phase:b.phase,view:b.realmView(),mode:b.mode,hero:b.heroX,striker:b.strikerPos(),guardian:b.journey.dog.worldX-b.journey.cameraX-48,hp:b.hp};
   },room);
   await page.waitForLoadState('networkidle');assert.equal(arrived.phase,'fight');assert.equal(arrived.mode,'darkness');assert.equal(arrived.view.room,room);assert.equal(arrived.view.floor,1);
   assert.ok(arrived.hero-arrived.striker.x>=185,'striker must be distinct from hero');assert.ok(arrived.hero-arrived.guardian>=200,'guardian must be distinct from hero');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight),false);
   assert.deepEqual(await page.locator('.hud').boundingBox(),hud,'HUD remains fixed');
   await page.screenshot({path:`.tmp/qa/dark-${width}-room-${room}.png`});
   // Paused canvas is bit-identical; all atmosphere uses simulation time.
   const visualBefore=await page.evaluate(async()=>{const {battle:b}=await import('/src/game/Battle.ts');return {clock:b.clock,quality:b.quality,running:b.running}});
   const canvas=page.locator('canvas').first(),frozen=hash(await canvas.evaluate(c=>c.toDataURL()));
   const environment=()=>page.evaluate(async()=>{const {battle:b}=await import('/src/game/Battle.ts');const canvas=document.createElement('canvas');canvas.width=864;canvas.height=940;const c=canvas.getContext('2d');const view={...b.realmView(),quality:1};b.realmScenery.drawBack(c,b.journey,view);b.realmScenery.drawFront(c,b.journey,view);return canvas.toDataURL()});
   const cave=hash(await environment());const caveView=await page.evaluate(async()=>{const {battle:b}=await import('/src/game/Battle.ts');return b.realmView()});
   await page.waitForTimeout(180);const frozenAfter=hash(await canvas.evaluate(c=>c.toDataURL()));if(frozenAfter!==frozen){console.log({visualBefore,visualAfter:await page.evaluate(async()=>{const {battle:b}=await import('/src/game/Battle.ts');return {clock:b.clock,quality:b.quality,running:b.running}})});await page.screenshot({path:'.tmp/qa/pause-mismatch.png'})}assert.equal(frozenAfter,frozen,'pause freezes scenery and actors');
   const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
   await page.reload();await page.waitForFunction(async()=>!!(await import('/src/game/Battle.ts')).battle);await page.waitForFunction(async()=>(await import('/src/game/Battle.ts')).battle?.realmScenery.ready());
   await page.waitForLoadState('networkidle');const restored=await page.evaluate(async()=>{const {battle:b}=await import('/src/game/Battle.ts');b.draw();return {mode:b.mode,running:b.running,hp:b.hp,view:b.realmView(),snapshot:b.snapshot()}});
   assert.equal(restored.running,false);assert.equal(restored.mode,'darkness');assert.equal(restored.view.room,room);assert.equal(restored.hp,saved.encounter.hp);
   assert.deepEqual(restored.snapshot.journey,saved.encounter.journey);
   await page.screenshot({path:`.tmp/qa/dark-${width}-reload-${room}.png`});
   const rebuilt=hash(await environment());if(rebuilt!==cave)console.log({caveView,restored:restored.view});assert.equal(rebuilt,cave,'reload rebuilds identical paused cave layers');
   // Simplify effects while preserving all three artwork planes.
   if(room===3){await page.evaluate(async()=>{const {battle:b}=await import('/src/game/Battle.ts');b.quality=.45;b.draw()});await page.screenshot({path:`.tmp/qa/dark-${width}-reduced-quality.png`});}
   const won=await page.evaluate(async()=>{
    const {battle:b}=await import('/src/game/Battle.ts');const {useGame}=await import('/src/core/store.ts');useGame.setState({auto:true});b.running=true;
    for(let n=0;n<10000&&b.phase==='fight';n++)b.update(.05);
    b.pause();b.draw();return {phase:b.phase,view:b.realmView(),snapshot:b.snapshot(),p:useGame.getState().p};
   });assert.equal(won.phase,'victory','natural battle wins without changing HP or damage');assert.equal(won.view.room,room,'reward advancement must not change victory scenery');
   await page.screenshot({path:`.tmp/qa/dark-${width}-victory-${room}.png`});
   // Reload during the reward interval must keep the completed room's art too.
   await page.reload();await page.waitForFunction(async()=>!!(await import('/src/game/Battle.ts')).battle);
   assert.equal(await page.evaluate(async()=>{const {battle:b}=await import('/src/game/Battle.ts');return b.realmView().room}),room);
   await page.evaluate(async()=>{const {battle:b}=await import('/src/game/Battle.ts');b.running=true;for(let i=0;i<36;i++)b.update(.05);b.pause();b.draw()});
  }
  await page.waitForTimeout(200);
  await page.getByText('Этаж 1 пройден впервые!',{exact:true}).waitFor();
  const final=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  assert.equal(final.darkFloor,2);assert.equal(final.chaosite,profile.chaosite-5);assert.equal(final.stage,profile.stage);assert.equal(final.wave,profile.wave);
  assert.ok(final.saga.box.dgear.inv.length>=2);
  await page.getByRole('button',{name:'К следующему этажу',exact:true}).click();await page.getByRole('button',{name:/Вызов/}).click();
  await page.evaluate(async()=>{const {battle:b}=await import('/src/game/Battle.ts');for(let n=0;n<35;n++)b.update(.05);b.pause()});
  await page.reload();await page.waitForFunction(async()=>!!(await import('/src/game/Battle.ts')).battle);
  const next=await page.evaluate(async()=>{const {battle:b}=await import('/src/game/Battle.ts');return {view:b.realmView(),mode:b.mode,running:b.running}});
  assert.equal(next.view.floor,2);assert.equal(next.view.room,1);assert.equal(next.mode,'darkness');assert.equal(next.running,false);
  assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);report.push({width,threeRooms:true,naturalCombat:true,rewards:true,nextFloor:2,reload:true,pausePixels:true,errors,bad});
  await context.close();
 }}finally{await browser.close();fs.writeFileSync('.tmp/qa/dark-world-results.json',JSON.stringify(report,null,2));}
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
