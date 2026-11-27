/* Companion stars: player feedback «Старший бурильщик ★ 1/40, старые осколки 18/20». Real taps on an isolated
   ?testProfile= save at 320/360/390/430 with an OLD (pre-v2) squad save: the Stars tab says what the player has, what
   the next star needs and where to get it; nothing is lost; a copy merged from the guide gives ★ 2.
   Run after: node --import tsx scripts/qa/fixtures.ts */
const {chromium}=require('playwright');const fs=require('node:fs');const assert=require('node:assert/strict');
const base=process.env.BASE_URL||'http://localhost:5173/',out=process.env.OUT||'.tmp/companion-stars';
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({args:['--no-sandbox']});const results=[];
 for(const [width,height] of [[320,568],[360,780],[390,844],[430,932]]){
  const profile='stars-'+width,key='lootborn-codex-v1:test:'+profile;
  const p=require('./ui-fixture.cjs')(60);
  p.saga??={v:1,n:{},flags:[],seen:[],trophies:[],box:{}};
  p.saga.n['solo:soul']=40;p.saga.n['res:seal']=3;delete p.saga.box.followerMarket;
  // Old squad format (before follower instances): level 100, one star, 18 legacy shards.
  p.saga.box.squad={own:{senior_driller:{lv:100,st:1,sh:18,aw:false,t:[0,0,0]}},act:['goose_aviator','brown_white_dog']};
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
  await context.addInitScript(([k,p])=>{if(!localStorage.getItem(k))localStorage.setItem(k,JSON.stringify(p))},[key,p]);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'?testProfile='+profile);await page.waitForFunction(()=>window.__lootborn?.battle);await page.waitForTimeout(400);
  const state=()=>page.evaluate(()=>{const p=window.__lootborn.useGame.getState().p;return JSON.parse(JSON.stringify(p))});
  const squad=async()=>{await page.evaluate(()=>window.__lootborn.useGame.getState().mutate(p=>{void p;return false}));return (await state()).saga.box.squad};
  const card=()=>page.locator('.game-detail');
  const noOverflow=async label=>{
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,label+': page scroll');
   assert.equal(await card().evaluate(el=>[...el.querySelectorAll('.star-guide *')].some(n=>n.scrollWidth>n.clientWidth+1&&getComputedStyle(n).overflowX!=='visible')),false,label+': guide overflow');
  };
  const openDriller=async()=>{
   await page.evaluate(()=>window.__lootborn.useGame.getState().open('companions'));await page.waitForTimeout(300);
   await page.getByRole('button',{name:/^Старший бурильщик(, экземпляр 1)?$/}).first().tap();
   await card().getByRole('button',{name:'Звёзды',exact:true}).tap();await page.waitForTimeout(200);
  };
  await openDriller();
  const guide=card().locator('.star-guide');
  await guide.getByText('Как получить ★ 2').waitFor();
  assert.match(await guide.innerText(),/Свободные копии:\s*0/);
  assert.match(await guide.innerText(),/цена 60 Душ · не хватает 20/);
  assert.match(await guide.innerText(),/Обменяйте печати призыва на Души/,'3 seals cover the missing souls');
  assert.match(await card().innerText(),/★ 1\/40/);
  await card().getByText(/Старые осколки · 18/).tap();
  await card().getByText(/18\/20\. Не хватает 2, а новых осколков не будет/).waitFor();
  assert.equal(await card().getByRole('button',{name:/Звезда 2/}).count(),0,'no dead disabled star button');
  await noOverflow(width+' guide');
  await page.screenshot({path:`${out}/stars-${width}.png`});
  // Nothing lost by the old-save migration.
  const migrated=(await state()).saga.box.squad,driller=migrated.instances['follower:senior_driller'];
  assert.deepEqual([driller.lv,driller.st,migrated.shards.senior_driller],[100,1,18]);
  // The guide's button opens the summon window.
  await guide.getByRole('button',{name:'Открыть Призыв'}).tap();
  await page.getByText('Призыв спутников').waitFor();await page.screenshot({path:`${out}/summon-${width}.png`});
  await page.locator('.game-detail').getByRole('button',{name:'Закрыть'}).first().tap();await page.waitForTimeout(300);await page.screenshot({path:`${out}/after-summon-${width}.png`});
  // A copy from the summon: the guide offers the merge and the star rises to 2; shards stay untouched.
  await page.evaluate(()=>window.__lootborn.useGame.getState().mutate(p=>{
   const sq=p.saga.box.squad;sq.instances['follower:copy:77']={...JSON.parse(JSON.stringify(sq.instances['follower:senior_driller'])),lv:1,st:0,step:0,locked:false};return true}));
  await openDriller();
  assert.match(await guide.innerText(),/Свободные копии:\s*1/);
  await guide.getByRole('button',{name:'Объединить с копией'}).tap();
  await card().getByRole('button',{name:/^Материал:/}).tap();await card().getByRole('option',{name:/ур\. 1 · ★ 0/}).tap();
  await card().getByRole('button',{name:'Объединить',exact:true}).tap();await card().getByRole('button',{name:'Подтвердить расход'}).tap();
  await page.waitForTimeout(300);
  const after=(await state()).saga.box.squad;
  assert.equal(after.instances['follower:senior_driller'].st,2);assert.equal(after.instances['follower:copy:77'],undefined);
  assert.equal(after.shards.senior_driller,18);assert.equal(after.instances['follower:senior_driller'].lv,100);
  // Reload keeps it.
  await page.reload();await page.waitForFunction(()=>window.__lootborn?.battle);
  assert.equal((await state()).saga.box.squad.instances['follower:senior_driller'].st,2);
  assert.deepEqual(errors,[]);
  results.push({width,ok:true});await context.close();
 }
 await browser.close();console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exit(1)});
