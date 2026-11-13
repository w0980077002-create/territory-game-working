/* Isolated mobile UI audit. Never reads/writes the owner's save or cloud. */
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const out=process.env.OUT||'.tmp/ui-before';
const base=process.env.BASE_URL||'http://localhost:5173/';
const panels=['inventory','hero','equipment',...['weapon','armor','helmet','shield','boots','belt','ring1','ring2','amulet','cloak','extra1','extra2','wings'].map(s=>'gear:'+s),'item','forge','skills','talents','companions','quests','rewards','shop','port','adventure','arena','events','collection','menu','controls','battle','loot','wings','blessing','relic','friends','invite','autobattle'];
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox'],...(process.env.BROWSER_PROXY?{proxy:{server:process.env.BROWSER_PROXY}}:{})});
 const fixture=require('./ui-fixture.cjs')(Number(process.env.STAGE||34),process.env.EMPTY==='1');
 const results=[];
 for(const [width,height] of [[320,568],[360,780],[390,844],[430,932]].filter(([w])=>!process.env.WIDTHS||process.env.WIDTHS.split(',').map(Number).includes(w))){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await context.addInitScript(p=>{const k='lootborn-codex-v1:test:ui-audit';if(!localStorage.getItem(k))localStorage.setItem(k,JSON.stringify(p))},fixture);
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'?testProfile=ui-audit');await page.waitForFunction(()=>window.__lootborn);const assertBuild=await page.locator('.build-label').textContent();if(process.env.EXPECT_BUILD_ID&&!assertBuild.includes(process.env.EXPECT_BUILD_ID))throw Error('Unexpected deployed build: '+assertBuild);
  for(const panel of panels){
   await page.evaluate(panel=>{const g=window.__lootborn.useGame.getState();panel==='item'&&g.p.inventory.length?g.select('ui-item-0'):g.open(panel)},panel);
   await page.waitForTimeout(100);
   const dialog=page.getByRole('dialog');await dialog.waitFor();
   const geometry=await dialog.evaluate(el=>{
    const r=el.getBoundingClientRect();
    const inaccessible=[...el.querySelectorAll('header button,footer button')].filter(x=>{const b=x.getBoundingClientRect();return b.width>0&&(b.width<44||b.height<44||b.top<0||b.bottom>innerHeight+1)}).map(x=>x.textContent);
    const outsideViewport=r.x<0||r.y<0||r.right>innerWidth+1||r.bottom>innerHeight+1;
    const overflow=[...el.querySelectorAll('*')].filter(x=>{
     if(x instanceof SVGElement)return false;const s=getComputedStyle(x),b=x.getBoundingClientRect();
     return b.width>0&&s.position!=='absolute'&&s.position!=='fixed'&&(b.right>r.right+1||b.left<r.left-1);
    }).map(x=>({tag:x.tagName,cls:x.className,text:x.textContent.slice(0,90)}));
    return {inaccessible,outsideViewport,rect:{x:r.x,y:r.y,width:r.width,height:r.height},overflow,clipped:[...el.querySelectorAll('*')].filter(x=>!(x instanceof SVGElement)&&x.clientWidth>0&&x.scrollWidth>x.clientWidth+2&&getComputedStyle(x).textOverflow!=='ellipsis'&&!x.matches('.saga-scene,.saga-scenery,.ambient')).map(x=>({cls:x.className,text:x.textContent.slice(0,70),width:x.clientWidth,content:x.scrollWidth})),scrolls:[...el.querySelectorAll('*')].filter(x=>['auto','scroll'].includes(getComputedStyle(x).overflowY)&&x.scrollHeight>x.clientHeight+1).map(x=>({cls:x.className,height:x.clientHeight,content:x.scrollHeight})),setWidths:[...el.querySelectorAll('.set-line')].map(x=>x.getBoundingClientRect().width),horizontal:document.documentElement.scrollWidth>innerWidth};
   });
   if(process.env.ALL_SHOTS||['inventory','item','hero','forge','skills','autobattle','gear:weapon'].includes(panel))await dialog.screenshot({path:path.join(out,`${width}-${panel.replace(':','-')}.png`)});
   results.push({width,height,panel,...geometry});
   // Reach last content and ensure the close/action area remains in the viewport.
   await dialog.evaluate(el=>{for(const x of el.querySelectorAll('*'))if(['auto','scroll'].includes(getComputedStyle(x).overflowY))x.scrollTop=x.scrollHeight});
   const exit=dialog.getByRole('button',{name:'К бою',exact:true});
   if(await exit.count())await exit.tap();else await dialog.getByRole('button',{name:'Закрыть',exact:true}).tap();
   if(await page.getByRole('dialog').count())throw Error(panel+' did not close');
  }
  await page.evaluate(()=>window.__lootborn.useGame.getState().open(null));
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('lootborn-codex-v1:test:ui-audit')));
  await page.reload();await page.waitForFunction(()=>window.__lootborn);const restoredBuild=await page.locator('.build-label').textContent();if(process.env.EXPECT_BUILD_ID&&!restoredBuild.includes(process.env.EXPECT_BUILD_ID))throw Error('Unexpected deployed build: '+restoredBuild);
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('lootborn-codex-v1:test:ui-audit')));
  for(const key of ['equipment','inventory','pendingLoot','level','gold','gems'])if(JSON.stringify(before[key])!==JSON.stringify(after[key]))throw Error('Reload changed '+key);
  if(errors.length)throw Error(errors.join('\n'));
  await context.close();
 }
 fs.writeFileSync(path.join(out,'geometry.json'),JSON.stringify(results,null,2));
 const defects=results.filter(r=>r.outsideViewport||r.inaccessible.length||r.horizontal||r.overflow.length||r.clipped.length||r.scrolls.length>1||r.setWidths.some(w=>w<150));
 console.log(JSON.stringify({screens:results.length,defects,reload:true},null,2));
 if(defects.length&&process.env.ALLOW_DEFECTS!=='1')throw Error('Mobile geometry defects: '+defects.length);
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
