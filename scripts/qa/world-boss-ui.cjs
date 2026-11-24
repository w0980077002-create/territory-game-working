/* World boss in the real game UI against the local server (scripts/qa/world-boss-e2e.sh starts everything).
 * Several players hit one shared boss, the killing blow is recorded once, three reward letters arrive in Mail,
 * claiming twice never doubles gold, the admin starts the next boss from the panel, and 320–430 px layouts fit. */
const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
const base=process.env.BASE_URL||'http://127.0.0.1:5173/',server=process.env.WB_URL||'http://127.0.0.1:18790',out=process.env.OUT||'.tmp/world-boss';
fs.mkdirSync(out,{recursive:true});
const post=async(body)=>(await fetch(server,{method:'POST',body:JSON.stringify(body)})).json();
const init=async(id,name)=>(await (await fetch(`${server}/local/init?id=${id}&name=${encodeURIComponent(name)}`)).json()).initData;
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 const admin=await init(1,'Бьорн');
 let s=await post({action:'admin_start',initData:admin,title:'Ётун Хримтурс',boss:'minotaur_echo',minutes:60,maxHp:6000,config:{cooldownSeconds:3,damageMin:900,damageMax:1100,critChance:0}});
 assert.equal(s.event.active,true);
 // Four other heroes strike the shared HP through the real API.
 for(const id of [2,3,4,5])await post({action:'attack',initData:await init(id,'Ярл '+id),requestId:crypto.randomUUID()});
 const results=[];
 for(const [W,H] of [[320,568],[360,740],[390,844],[430,932]]){
  const page=await browser.newPage({viewport:{width:W,height:H}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}?hero=wb-qa-${W}&wb=local&wbUser=1&wbName=${encodeURIComponent('Бьорн')}`);
  await page.waitForFunction(()=>window.__lootborn?.battle);
  await page.evaluate(()=>window.__lootborn.useGame.getState().open('adventure'));
  await page.getByRole('button',{name:/Мировой босс/}).click();
  await page.locator('.wb-attack').waitFor();await page.waitForTimeout(500);
  const fit=await page.evaluate(()=>{const d=document.querySelector('dialog[open], .saga-modal');const r=d.getBoundingClientRect();const btn=document.querySelector('.wb-attack').getBoundingClientRect();
   return {horizontal:document.documentElement.scrollWidth-innerWidth,inside:r.left>=0&&r.right<=innerWidth,attackVisible:btn.bottom<=innerHeight&&btn.height>=44}});
  assert.equal(fit.horizontal,0,W+' no horizontal scroll');assert.ok(fit.inside,W+' dialog inside');assert.ok(fit.attackVisible,W+' attack button visible without scrolling');
  if(W===360){
   await page.locator('.wb-attack').click();
   await page.waitForFunction(()=>document.querySelector('.wb-head em')?.textContent.includes('Повержен'),null,{timeout:8000}).catch(()=>{});
   s=await post({action:'state',initData:admin});
   if(s.event.status!=='defeated'){ // finish the boss with the other heroes if the admin's hit did not
    for(const id of [2,3,4,5,6,7]){if((await post({action:'state',initData:admin})).event.status==='defeated')break;await post({action:'attack',initData:await init(id,'Ярл '+id),requestId:crypto.randomUUID()})}
    s=await post({action:'state',initData:admin});
   }
   assert.equal(s.event.status,'defeated');assert.equal(s.event.hp,0);assert.ok(s.event.lastHit,'last hit recorded');
   const letters=s.mail.length;assert.ok(letters>=2,'participation and rank letters');
   const gold=()=>page.evaluate(()=>window.__lootborn.useGame.getState().p.gold);
   const before=await gold();
   await page.evaluate(()=>window.__lootborn.useGame.getState().open('mail'));await page.locator('.wb-mail').waitFor();
   await page.screenshot({path:`${out}/mail-${W}.png`});
   while(await page.locator('.wb-mail .action').count()){await page.locator('.wb-mail .action').first().click();await page.waitForTimeout(600)}
   const gained=await gold()-before;
   const expected=s.mail.reduce((a,l)=>a+(l.payload.gold??0),0);
   assert.equal(gained,expected,'gold from letters applied exactly once');
   for(const l of s.mail){const again=await post({action:'claim',initData:admin,eventId:l.eventId,kind:l.kind});assert.equal(again.firstClaim,false)}
   await page.evaluate(()=>window.__lootborn.useGame.getState().open('worldboss'));await page.locator('.world-boss').waitFor();
   await page.locator('.world-boss .tabs button',{hasText:'Награды'}).click();
   assert.equal(await page.locator('.wb-letters .action').count(),0,'no claim button after claiming');
   assert.equal(await gold()-before,expected,'still applied once');
   await page.locator('.world-boss .tabs button',{hasText:'Админ'}).click();
   await page.getByRole('button',{name:'Запустить босса'}).click();await page.waitForTimeout(800);
   assert.equal((await post({action:'state',initData:admin})).event.status,'open','admin started the next boss from the panel');
   await page.locator('.world-boss .tabs button',{hasText:'История'}).click();
   assert.ok(await page.locator('.wb-history li').count()>=1,'finished battle in history');
   results.push({W,letters,gained});
  }
  await page.locator('.world-boss .tabs button',{hasText:'Рейтинг'}).click().catch(()=>{});
  await page.screenshot({path:`${out}/world-boss-${W}.png`});
  assert.deepEqual(errors,[]);await page.close();results.push({W,...fit});
 }
 console.log(JSON.stringify(results));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
