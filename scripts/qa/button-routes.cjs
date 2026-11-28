/* Real taps on the routes fixed by the button audit. Isolated ?testProfile= saves only.
   Run after `npm run build && npx vite preview --port 4173` (BASE_URL overrides). */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const out=process.env.OUT||'.tmp/button-routes',base=process.env.BASE_URL||'http://localhost:4173/';
// Use viewport coordinates so taps exercise the hit zone, including the free gutter.
async function hitZone(locator,{corners=false}={}){
 return locator.evaluate((element,corners)=>{
  const {left,top,right,bottom,width,height}=element.getBoundingClientRect();
  const midX=left+width/2,midY=top+height/2;
  const points=[[midX,midY],[left+1,midY],[right-1,midY],[midX,top+1],[midX,bottom-1]];
  if(corners)points.push([left+1,top+1],[right-1,top+1],[left+1,bottom-1],[right-1,bottom-1]);
  const hits=points.map(([x,y])=>document.elementFromPoint(x,y)?.closest('button')===element);
  return {width:+width.toFixed(2),height:+height.toFixed(2),points,hits};
 },corners);
}
async function measure(locator,label,options){
 const zone=await hitZone(locator,options);
 assert.ok(zone.hits.every(Boolean),label+' intercepted: '+JSON.stringify(zone));
 return zone;
}
const currencyTitles={gold:'Где получить золото',gems:'Где получить самоцветы',chaosite:'Где получить Хаосит'};
const neighbors=['.enter','.hud-mail','.sound-chip','.bottom button:nth-child(1)','.bottom button:nth-child(2)','.bottom .central','.bottom button:nth-child(4)','.bottom button:nth-child(5)'];
const slotNames={weapon:'Оружие',armor:'Доспех',helmet:'Шлем',shield:'Щит',boots:'Сапоги',belt:'Пояс',ring1:'Кольцо I',ring2:'Кольцо II',amulet:'Амулет',cloak:'Плащ',extra1:'Предмет XI',extra2:'Предмет XII',wings:'Крылья'};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}:{});
 const results=[];
 for(const [width,height] of [[320,568],[360,780],[390,844],[430,932],[360,560]]){
  const profile='button-routes-'+width+'x'+height;
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
  await context.route('https://telegram.org/**',route=>route.abort());
  const fixture=require('./ui-fixture.cjs')();fixture.mineAt=Date.now()-6*3600e3;fixture.wingVisible=true;
  await context.addInitScript(([k,p])=>{if(!localStorage.getItem(k))localStorage.setItem(k,JSON.stringify(p))},['lootborn-codex-v1:test:'+profile,fixture]);
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'?testProfile='+profile);await page.waitForFunction(()=>window.__lootborn?.battle);
  const state=()=>page.evaluate(()=>JSON.parse(JSON.stringify(window.__lootborn.useGame.getState().p)));
  const dialog=name=>page.getByRole('dialog',{name,exact:true});
  const close=async()=>{await page.getByRole('button',{name:'Закрыть',exact:true}).tap();await page.getByRole('dialog').waitFor({state:'detached'});await page.waitForTimeout(400)};// past the 350 ms tap-through guard
  const row={width,height,slots:0};
  if(height===560){
   await page.evaluate(()=>{
    const root=document.documentElement;
    root.style.setProperty('--tg-content-safe-area-inset-top','12px');
    root.style.setProperty('--tg-safe-area-inset-bottom','8px');
    dispatchEvent(new Event('resize'));
   });
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('.viewport')).paddingTop==='12px');
  }
  const assertDisjoint=async selectors=>{
   const collisions=await page.evaluate(selectors=>{
    const targets=selectors.flatMap(selector=>[...document.querySelectorAll(selector)]);
    const boxes=targets.map(element=>element.getBoundingClientRect());
    return boxes.flatMap((box,i)=>boxes.slice(i+1).flatMap((other,j)=>
     Math.min(box.right,other.right)-Math.max(box.left,other.left)>.05&&
     Math.min(box.bottom,other.bottom)-Math.max(box.top,other.top)>.05
      ? [[targets[i].className,targets[i+j+1].className]]:[]));
   },selectors);
   assert.deepEqual(collisions,[],'adjacent hit zones intersect');
  };
  const measureHud=async(landscape=false)=>{
   await assertDisjoint(['.avatar','.power','.currency','.hud-mail','.sound-chip']);
   await assertDisjoint(['.equipment .gear']);

   const sizes={};
   for(const [selector,corners] of [['.power',true],...Object.keys(currencyTitles).map(k=>['.currency.'+k,true]),...neighbors.map(k=>[k,false])]){
    const control=page.locator(selector);
    const zone=await hitZone(control,{corners});
    // In the original landscape layout mail already covers the right edge of «Войти».
    // Keep that edge available to either of those two controls and require the other four points.
    if(landscape&&selector==='.enter'){
     assert.ok(zone.hits.every((hit,index)=>index===2||hit),'landscape «Войти» lost a hit point');
     const owner=await page.evaluate(([x,y])=>document.elementFromPoint(x,y)?.closest('button')?.className,zone.points[2]);
     assert.ok(owner==='enter'||owner==='hud-mail','unexpected landscape interceptor: '+owner);
    }else assert.ok(zone.hits.every(Boolean),selector+' intercepted: '+JSON.stringify(zone));
    sizes[selector]=[zone.width,zone.height];
   }
   return sizes;
  };
  const metrics=await measureHud();
  await page.screenshot({path:`${out}/${width}x${height}-hud.png`});
  if(height===560){
   await page.setViewportSize({width:560,height:360});
   await page.waitForFunction(()=>document.querySelector('.game').getBoundingClientRect().height<=340.1);
   await measureHud(true);
   for(const slot of Object.keys(slotNames))await measure(page.locator('.gear-'+slot),slot+' landscape',{corners:true});
   await page.setViewportSize({width,height});
   await page.waitForFunction(()=>document.querySelector('.game').getBoundingClientRect().height>=539.9);
  }
  const tapEdge=async locator=>{
   const zone=await measure(locator,'tap target',{corners:true});
   await page.touchscreen.tap(...zone.points[4]);
  };
  await tapEdge(page.locator('.power'));await dialog('Северный страж').waitFor();await close();
  await page.locator('.mission').tap();await dialog('Путь героя').waitFor();await close();

  // 1) all 12 slots and wings open the correct card, including from the widened compact targets
  for(const [slot,name] of Object.entries(slotNames)){
   const tile=page.locator('.gear-'+slot);
   const box=await measure(tile,slot,{corners:true});
   metrics[slot]=[box.width,box.height];
   const before=await state();
   const point=slot==="ring1"?1:slot==="ring2"?2:slot==="belt"?4:0;
   await page.touchscreen.tap(...box.points[point]);
   const expected=slot==='wings'&&!before.equipment.wings?'Крылья':name;
   await dialog(expected).waitFor({timeout:3000});
   row.slots++;row[slot]=Math.round(Math.min(box.width,box.height));
   if(slot==='ring1')await page.screenshot({path:`${out}/${width}x${height}-ring1-card.png`});
   await close();
  }
  // double tap on a small slot must still end on that slot card (ghost-tap guard keeps it)
  await page.locator('.gear-amulet').dblclick();await dialog('Амулет').waitFor();await page.waitForTimeout(600);await close();
  // The existing ledger offers a larger route to each compact slot.
  for(const [slot,label] of [['ring1','Кольцо I'],['ring2','Кольцо II'],['belt','Пояс']]){
   await page.getByRole('button',{name:'Меню',exact:true}).tap();
   await page.getByRole('button',{name:'Экипировка',exact:true}).tap();
   await dialog('Экипировка').waitFor();
   await page.waitForTimeout(380);
   const entry=page.locator('.equipment-ledger .row').filter({has:page.getByText(label,{exact:true})}).getByRole('button');
   await entry.scrollIntoViewIfNeeded();
   assert.ok((await entry.boundingBox()).height>=43.9,slot+' ledger button');
   await entry.tap();await dialog(label).waitFor();await close();
  }
  console.log(JSON.stringify({width,height,metrics}));
  // 2) currency «+» → «Где получить» with real actions
  await tapEdge(page.locator('.currency.gold'));await dialog('Где получить золото').waitFor();
  await page.screenshot({path:`${out}/${width}x${height}-gold-sources.png`});
  const g0=await state();await dialog('Где получить золото').getByRole('button',{name:'Собрать',exact:true}).tap();
  await page.waitForFunction(g=>window.__lootborn.useGame.getState().p.gold>g,g0.gold);
  const g1=await state();assert.ok(g1.chaosite>g0.chaosite,'mine also yields Хаосит');assert.equal(g1.inventory.length,g0.inventory.length);
  await dialog('Где получить золото').getByRole('button',{name:'Перейти'}).first().tap();await dialog('Путь героя').waitFor();await close();
  await tapEdge(page.locator('.currency.gems'));await dialog('Где получить самоцветы').waitFor();
  await dialog('Где получить самоцветы').getByRole('button',{name:/Забрать|Открыть/}).first().tap();await dialog('Ежедневная награда').waitFor();await close();
  await tapEdge(page.locator('.currency.chaosite'));await dialog('Где получить Хаосит').waitFor();
  assert.equal(await dialog('Где получить Хаосит').getByRole('button',{name:'Копится'}).isDisabled(),true,'mine already collected cannot pay twice');
  await dialog('Где получить Хаосит').getByRole('button',{name:'Перейти'}).last().tap();await dialog('Северная гавань').waitFor();await close();
  // 3) «Войти» while a chapter fight runs keeps it running
  await page.locator('.bottom>.central').tap();await page.waitForFunction(()=>window.__lootborn.battle.running);
  await page.locator('.enter').tap();await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.__lootborn.battle.running),true,'Войти must not pause the chapter');
  assert.match(await page.locator('.toast').innerText(),/Основная глава уже идёт/);
  await page.locator('.bottom>.central').tap();await page.waitForFunction(()=>!window.__lootborn.battle.running);
  // 4) «Новый герой» needs confirmation; cancel keeps the same hero and URL
  const url=page.url(),saved=await state();
  await page.getByRole('button',{name:'Меню',exact:true}).tap();await dialog('Меню').waitFor();
  await page.waitForTimeout(400); // The next taps are intentional actions after the window transition.
  const heroes=page.locator('summary',{hasText:'Другие герои на этом устройстве'});
  await heroes.tap();await page.getByRole('button',{name:'Новый герой · первый поход'}).tap();
  await page.getByText('Начать нового героя?').waitFor();assert.equal(page.url(),url);
  await page.screenshot({path:`${out}/${width}x${height}-new-hero-confirm.png`});
  await page.getByRole('button',{name:'Отмена',exact:true}).tap();assert.equal(await page.getByText('Начать нового героя?').count(),0);
  if(!await page.getByRole('button',{name:'Новый герой · первый поход'}).isVisible())await heroes.tap();
  await page.getByRole('button',{name:'Новый герой · первый поход'}).tap();await page.getByRole('button',{name:'Начать нового героя'}).tap();
  await page.waitForURL(/hero=hero-/);await page.waitForFunction(()=>window.__lootborn?.battle);
  const fresh=await state();assert.equal(fresh.level,1);
  const newHero=new URL(page.url()).searchParams.get('hero');
  const axes=page.locator('.bottom>.central');
  await axes.tap();await page.waitForFunction(()=>window.__lootborn.battle.running);
  await axes.tap();await page.waitForFunction(()=>!window.__lootborn.battle.running);
  await page.waitForFunction(id=>!!localStorage.getItem('lootborn-codex-v1:test:'+id),newHero);
  // 5) the original hero is intact after reload and the new one is listed under «Мои герои»
  await page.goto(url);await page.waitForFunction(()=>window.__lootborn?.battle);
  const back=await state();for(const k of ['level','stage','gold','gems','chaosite'])assert.equal(back[k],saved[k],k);assert.equal(back.inventory.length,saved.inventory.length);
  await page.getByRole('button',{name:'Меню',exact:true}).tap();await dialog('Меню').waitFor();
  await page.waitForTimeout(400);
  await heroes.tap();
  await page.getByRole('heading',{name:'Мои герои'}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal scroll');
  assert.deepEqual(errors,[]);
  results.push(row);await context.close();
 }
 await browser.close();
 console.table(results.map(r=>({width:r.width,height:r.height,slots:r.slots,ring1:r.ring1,belt:r.belt,amulet:r.amulet,extra1:r.extra1})));
 console.log('button-routes: ok');
})().catch(e=>{console.error(e);process.exit(1)});
