/* Run after: node --import tsx scripts/qa/fixtures.ts. Needs Playwright + installed engines.
 * Tests isolated localStorage only; no owner session or cloud APIs. BASE_URL supports built and live Pages.
 */
const {chromium,firefox,webkit}=require('playwright');
const fs=require('node:fs');const assert=require('node:assert/strict');
const base=process.env.BASE_URL||'http://localhost:5173/';
const fixtures=JSON.parse(fs.readFileSync('.tmp/qa/fixtures.json','utf8')).filter(p=>!process.env.STAGES||process.env.STAGES.split(',').map(Number).includes(p.stage));
const widths=(process.env.WIDTHS||'320,360,390,430').split(',').map(Number);
(async()=>{const results=[];
 for(const [engine,type] of Object.entries({chromium,firefox,webkit})){
  if(process.env.ENGINES&&!process.env.ENGINES.split(',').includes(engine))continue;
  let browser;try{browser=await type.launch(engine==='chromium'?{executablePath:'/usr/bin/chromium',args:['--no-sandbox']}:{})}catch(e){results.push({engine,unavailable:e.message.split('\n').slice(0,5).join(' ')});continue}
  for(const width of widths)for(const p of fixtures){
   const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1});
   await context.addInitScript(({p})=>{const key='lootborn-codex-v1:test:p0qa';if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(p))},{p});
   const page=await context.newPage(),errors=[],bad=[],assets=new Set();
   page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)bad.push([r.status(),r.url()]);if(/\.(js|css|webp)(\?|$)/.test(r.url()))assets.add(r.url())});
   await page.goto(base+'?testProfile=p0qa');await page.waitForTimeout(900);
   const label=`${Math.floor((p.stage-1)/10)+1}-${(p.stage-1)%10+1}`;
   await page.waitForFunction(label=>document.body?.innerText.includes(label),label,{timeout:15000});
   const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lootborn-codex-v1:test:p0qa')));assert.equal(saved.stage,p.stage);assert.equal(saved.level,p.level);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(width===390)await page.screenshot({path:`.tmp/qa/${engine}-${p.stage}.png`});
   // Exercise real ON/OFF, persistence and exact reload at a partial journey.
   await page.getByRole('button',{name:'Начать или продолжить бой',exact:true}).click();await page.waitForTimeout(450);
   await page.getByRole('button',{name:'Остановить бой',exact:true}).click();
   const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lootborn-codex-v1:test:p0qa')));
   const before=await read();assert.ok(before.encounter.journey.worldX>1050+((p.stage-1)*5+p.wave-1)*1400-675);
   await page.reload();await page.waitForTimeout(600);const after=await read();
   for(const key of ['level','stage','wave','equipment','inventory','gold','gems','skills','companions','encounter'])assert.deepEqual(after[key],before[key],engine+' reload changed '+key);
   assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
   results.push({engine,width,stage:p.stage,level:p.level,camera:before.encounter.journey.cameraX,reload:true,errors,bad,assets:[...assets]});await context.close();
  }
  await browser.close();
 }
 fs.writeFileSync('.tmp/qa/browser-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(({assets,...r})=>r),null,2));
})().catch(e=>{console.error(e);process.exit(1)});
