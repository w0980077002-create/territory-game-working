/* Regression: after a paid Dark Realm choice is saved on a paused screen, the
 * visible portal itself must be tappable after reload, without another entry fee.
 * State seeding is isolated to this QA-only profile; the choice uses a real tap.
 */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const BASE=process.env.BASE_URL||'http://localhost:5173/';
const OUT=process.env.OUT||'.tmp/window-qa/realm-portals';
fs.mkdirSync(OUT,{recursive:true});

(async()=>{
 const browser=await chromium.launch({
  ...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),
  args:['--no-sandbox']
 });
 try{
  for(const [width,height] of [[320,568],[360,780],[390,844],[430,932]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
   await context.route('https://telegram.org/**',route=>route.abort());
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   const snapshot=()=>page.evaluate(async()=>{
    const {useGame}=await import('/src/core/store.ts');
    const {realmRun}=await import('/src/dark/realm.ts');
    const {battle}=await import('/src/game/Battle.ts');
    const p=useGame.getState().p,r=realmRun(p);
    return {chaosite:p.chaosite,runId:r?.runId,stage:r?.stage,history:r?.history.length,
     phase:battle.phase,running:battle.running};
   });
   try{
    await page.goto(BASE+'?testProfile=portal-resume-'+width);
    await page.waitForFunction(async()=>{
     if(!window.__lootborn?.battle)return false;
     return (await import('/src/dark/session.ts')).realmSessionWritable();
    });
    const start=await page.evaluate(async()=>{
     const {useGame}=await import('/src/core/store.ts');
     const {battle}=await import('/src/game/Battle.ts');
     const {realmStart}=await import('/src/dark/actions.ts');
     const {realmRun,realmBox,portalPair}=await import('/src/dark/realm.ts');
     const g=useGame.getState();
     if(!g.mutate(p=>{p.chaosite=30}))throw Error('Cannot prepare isolated currency');
     if(!realmStart(1,'ward'))throw Error('Paid Realm start failed');
     battle.pause();
     if(!g.mutate(p=>{
      const r=realmRun(p);
      if(!r)throw Error('No paid Realm');
      r.r=2;r.stage='CHOICE_1';r.killed=0;r.total=0;
      r.pair=portalPair(r.runId,1,()=>.25);
      realmBox(p).run=r;
     }))throw Error('Cannot prepare saved fork');
     battle.phase='waiting';battle.running=false;battle.publish();
     if(!battle.checkpoint())throw Error('Could not persist paused portal');
     const saved=useGame.getState().p;
     return {chaosite:saved.chaosite,runId:realmRun(saved)?.runId};
    });
    await page.reload();
    await page.waitForFunction(()=>!!window.__lootborn?.battle);
    await page.locator('.realm-world-hit').first().waitFor({state:'visible'});
    const paused=await snapshot();
    assert.equal(paused.stage,'CHOICE_1');
    assert.equal(paused.phase,'waiting');
    assert.equal(paused.running,false);
    assert.equal(paused.chaosite,start.chaosite);
    assert.equal(paused.runId,start.runId);
    const mission=page.locator('.mission');
    assert.match(await mission.innerText(),/Цель похода · этаж 1[\s\S]*Выберите портал/i);
    const target=await mission.boundingBox();
    const x=target.x+target.width/2,y=target.y+target.height/2;
    await page.touchscreen.tap(x,y);await page.touchscreen.tap(x,y);
    const realm=page.getByRole('dialog',{name:'Царство тьмы',exact:true});
    await realm.waitFor();
    await realm.getByRole('button',{name:'Продолжить поход',exact:true}).waitFor();
    assert.equal(await page.locator('[data-panel="quests"]').count(),0);
    assert.deepEqual(await snapshot(),paused,'opening the objective leaves the paid fork intact');
    await page.screenshot({path:OUT+'/'+width+'-mission-dialog.png'});
    await realm.getByRole('button',{name:'Закрыть',exact:true}).tap();
    await page.waitForTimeout(380);
    assert.deepEqual(await snapshot(),paused,'closing the objective cannot start a paused run');
    const invalid=await page.evaluate(async()=>{
     const {battle}=await import('/src/game/Battle.ts');
     return battle.choosePortal('not-a-real-portal');
    });
    assert.equal(invalid,false);
    assert.equal((await snapshot()).running,false,'Invalid portal must not resume the fight');
    await page.locator('.realm-world-hit').first().tap();
    await page.waitForFunction(async()=>{
     const {useGame}=await import('/src/core/store.ts');
     const {realmRun}=await import('/src/dark/realm.ts');
     return realmRun(useGame.getState().p)?.stage==='SEGMENT_1';
    });
    const chosen=await snapshot();
    assert.equal(chosen.chaosite,start.chaosite,'Returning to a paid run costs nothing');
    assert.equal(chosen.runId,start.runId);
    assert.equal(chosen.history,1,'Only one portal choice can be recorded');
    assert.equal(chosen.running,true);
    await page.screenshot({path:OUT+'/'+width+'-after-tap.png'});
    assert.match(await mission.innerText(),/Цель похода · этаж 1[\s\S]*\d+\/\d+ врагов/i);
    await mission.tap();await realm.waitFor();
    assert.equal((await snapshot()).running,false,'opening the objective pauses active combat');
    await realm.getByRole('button',{name:'Продолжить поход',exact:true}).tap();
    await page.waitForFunction(()=>window.__lootborn.battle.running);
    assert.equal((await snapshot()).chaosite,start.chaosite);
    assert.equal((await snapshot()).runId,start.runId);
    await page.reload();
    await page.waitForFunction(()=>!!window.__lootborn?.battle);
    const after=await snapshot();
    assert.equal(after.chaosite,start.chaosite);
    assert.equal(after.runId,start.runId);
    assert.equal(after.stage,'SEGMENT_1');
    assert.equal(after.history,1);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({width,paid:start.chaosite,portalTap:'ok',reload:'ok'}));
   }finally{await context.close()}
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
