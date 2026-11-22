/* Last campaign boss → reward decision → one-time story ending → Legend I.
 * Seed only the isolated late-game profile; use the real victory receipt and UI taps.
 */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fixtures=JSON.parse(fs.readFileSync('.tmp/qa/fixtures.json','utf8'));
const base=process.env.BASE_URL||'http://localhost:5173/';
const out=process.env.OUT||'.tmp/window-qa/story-finale';
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
  for(const [width,height] of [[320,568],[360,780],[390,844],[430,932]]){
   const id='story-finale-'+width,key='lootborn-codex-v1:test:'+id;
   const fixture=structuredClone(fixtures.find(x=>x.stage===60));
   assert.ok(fixture);
   fixture.stage=60;fixture.wave=5;
   if(fixture.saga?.flags)fixture.saga.flags=fixture.saga.flags.filter(x=>x!=='story:done'&&x!=='story:finale-seen');
   delete fixture.rewardOffer;
   const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
   await context.route('https://telegram.org/**',route=>route.abort());
   await context.addInitScript(({key,fixture})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(fixture));
   },{key,fixture});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',err=>errors.push(err.message));
   const read=()=>page.evaluate(()=>window.__lootborn.useGame.getState().p);
   try{
    await page.goto(base+'?testProfile='+id);
    await page.waitForFunction(()=>!!window.__lootborn?.battle);
    const first=await read();
    assert.equal(first.stage,60);
    assert.ok(!(first.saga?.flags??[]).includes('story:done'));
    assert.equal(await page.getByRole('dialog',{name:'Сага Севера завершена'}).count(),0);
    const won=await page.evaluate(async id=>{
     const {battle}=await import('/src/game/Battle.ts');
     const {useGame}=await import('/src/core/store.ts');
     battle.pause();
     return useGame.getState().win('campaign',id);
    },'final-boss-'+width);
    assert.equal(won,true);
    const pending=await read();
    assert.equal(pending.stage,61);
    assert.ok((pending.saga?.flags??[]).includes('story:done'));
    assert.ok(pending.rewardOffer&&!pending.rewardOffer.resolved);
    assert.equal(await page.getByRole('dialog',{name:'Сага Севера завершена'}).count(),0,'boss trophy comes first');
    await page.locator('.trophy-ribbon').tap();
    const keep=page.getByRole('button',{name:/^(В рюкзак|На хранение)$/});
    await keep.tap();
    await page.getByRole('dialog',{name:'Сага Севера завершена'}).waitFor({state:'visible'});
    assert.ok(((await read()).saga?.flags??[]).includes('story:done'));
    assert.ok(!((await read()).saga?.flags??[]).includes('story:finale-seen'));
    await page.screenshot({path:out+'/'+width+'-ending.png'});
    // Resolving the trophy just closed a panel. The game's deliberate 350 ms
    // ghost/double-tap guard blocks an immediate adjacent tap.
    // Test a distinct user tap after that guard; do not disable it for CI.
    await page.waitForTimeout(400);
    await page.getByRole('button',{name:'К Легенде I',exact:true}).tap();
    await page.getByRole('dialog',{name:'Сага Севера завершена'}).waitFor({state:'detached'});
    const acknowledged=await read();
    assert.ok((acknowledged.saga?.flags??[]).includes('story:finale-seen'));
    assert.equal((acknowledged.saga?.flags??[]).filter(x=>x==='story:finale-seen').length,1);
    assert.equal(acknowledged.stage,61);
    assert.equal(acknowledged.lastBattleReward,'final-boss-'+width);
    const savedGold=acknowledged.gold, savedGems=acknowledged.gems;
    await page.reload();await page.waitForFunction(()=>!!window.__lootborn?.battle);
    assert.equal(await page.getByRole('dialog',{name:'Сага Севера завершена'}).count(),0);
    const restored=await read();
    assert.equal(restored.stage,61);
    assert.equal(restored.gold,savedGold);
    assert.equal(restored.gems,savedGems);
    assert.equal((restored.saga?.flags??[]).filter(x=>x==='story:finale-seen').length,1);
    assert.deepEqual(errors,[]);
    console.log(width+'x'+height+' finale shown after trophy, acknowledged once, reload safe');
   }finally{await context.close()}
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
