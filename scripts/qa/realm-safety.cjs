/** Multi-tab/visibility protocol tests; uses pure realm events to prepare a result, not a video fixture. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.BASE_URL||'http://localhost:5173/';
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
 const context=await browser.newContext({viewport:{width:390,height:600},locale:'en-US'}),a=await context.newPage();await a.goto(base+'?testProfile=realm-safety');
 await a.waitForFunction(async()=>!!(await import('/src/game/Battle.ts')).battle&&(await import('/src/dark/session.ts')).realmSessionWritable());
 const initial=await a.evaluate(async()=>{
  const {useGame:g}=await import('/src/core/store.ts'),r=await import('/src/dark/realm.ts');
  g.getState().mutate(p=>{p.chaosite=100;r.realmBox(p).run=r.newRealmRun(1,'ward');p.chaosite-=r.REALM_COST;
   let id=0;while(r.realmRun(p)){const run=r.realmRun(p);if(run.pair)r.realmChoose(p,run.pair[0].id);else r.realmVictory(p,'protocol-'+id++)}
  });g.getState().open('realm');return {gold:g.getState().p.gold,chaosite:g.getState().p.chaosite};
 });
 const b=await context.newPage();await b.goto(base+'?testProfile=realm-safety');await b.waitForFunction(async()=>!!(await import('/src/game/Battle.ts')).battle);
 assert.equal(await b.evaluate(async()=>(await import('/src/dark/actions.ts')).collectRealmReward()),false);
 const paid=await a.evaluate(async()=>{const {collectRealmReward}=await import('/src/dark/actions.ts'),{useGame:g}=await import('/src/core/store.ts');const first=collectRealmReward(),second=collectRealmReward();return {first,second,gold:g.getState().p.gold,floor:g.getState().p.darkFloor,chaosite:g.getState().p.chaosite}});
 assert.equal(paid.first,true);assert.equal(paid.second,false);assert.ok(paid.gold>initial.gold);assert.equal(paid.floor,2);assert.equal(paid.chaosite,initial.chaosite);
 await b.waitForFunction(async()=>(await import('/src/core/store.ts')).useGame.getState().p.saga.box.realm.last.ack===true);
 assert.equal(await b.evaluate(async()=>(await import('/src/dark/actions.ts')).collectRealmReward()),false);
 await a.close();await b.waitForFunction(async()=>(await import('/src/dark/session.ts')).realmSessionWritable());
 assert.equal(await b.evaluate(async()=>(await import('/src/dark/actions.ts')).collectRealmReward()),false);
 // Start another paid itinerary, then exercise explicit pause, nested panels and hidden/visible.
 await b.evaluate(async()=>{const {useGame:g}=await import('/src/core/store.ts'),{realmStart}=await import('/src/dark/actions.ts');g.getState().open(null);realmStart(1,'ward')});
 const paused=await b.evaluate(async()=>{const {battle:b}=await import('/src/game/Battle.ts'),{useGame:g}=await import('/src/core/store.ts');b.pause();const snap=b.snapshot();g.getState().open('hero');g.getState().open('skills');g.getState().open(null);b.update(5);return {running:b.running,hp:b.hp,cooldowns:b.cooldowns,snap}});
 assert.equal(paused.running,false);assert.equal(paused.hp,paused.snap.hp);assert.deepEqual(paused.cooldowns,paused.snap.cooldowns);
 const visibility=await b.evaluate(async()=>{const {battle:b}=await import('/src/game/Battle.ts');b.toggle();Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));return b.running});assert.equal(visibility,false);
 const settings=await b.evaluate(async()=>{const {useGame:g}=await import('/src/core/store.ts');g.getState().configure({auto:false,speed:2});return {auto:g.getState().auto,speed:g.getState().speed}});assert.deepEqual(settings,{auto:false,speed:2});
 await b.evaluate(()=>{document.documentElement.style.setProperty('--tg-safe-area-inset-top','28px');document.documentElement.style.setProperty('--tg-content-safe-area-inset-bottom','24px');window.dispatchEvent(new Event('resize'))});
 await b.evaluate(async()=>(await import('/src/core/store.ts')).useGame.getState().open('realm'));
 await b.locator('.saga-modal').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished))});const box=await b.locator('.saga-modal').boundingBox();console.log({box});assert.ok(box.y>=28);assert.ok(box.y+box.height<=600-24);
 await b.screenshot({path:'docs/qa/issue-32/safe-area.png'});
 fs.writeFileSync('docs/qa/issue-32/safety.json',JSON.stringify({twoTabs:true,lockHandoff:true,claimOnce:true,explicitPause:true,nestedPanels:true,visibility:true,auto:false,speed:2,safeArea:{top:28,bottom:24,height:600},locale:'en-US'},null,2));
 await context.close();console.log('realm safety passed');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
