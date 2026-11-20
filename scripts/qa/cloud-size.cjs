/* Telegram CloudStorage mock (≤4096 chars per value, ≤1024 keys) in the real app:
 * a 1500-item save is backed up, the device copy is wiped, and the restart restores everything;
 * failed uploads warn and keep both the device progress and the previous cloud copy;
 * the manual backup can be copied and pasted back on 320/360/390/430 px.
 * npm run dev; node --import tsx scripts/qa/fixtures.ts; BASE_URL=http://localhost:5173/ node scripts/qa/cloud-size.cjs */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.BASE_URL||'http://localhost:5173/';
const key='lootborn-codex-v1:telegram:1234567';
const STORED=Number(process.env.STORED||1500);

function bigSave(){
 const p=require('./ui-fixture.cjs')(60);
 const proto=p.inventory.slice(0,12);
 p.pendingLoot=Array.from({length:STORED},(_,i)=>({...proto[i%proto.length],id:'qa-stored-'+i,upgrade:i%5,rarity:i%9,locked:i%11===0}));
 p.inventory[1]={...p.inventory[1],slot:'boots',perk:'boots',name:'Сапоги бурильщика',origin:'Трофей Логова · Старший бурильщик',locked:true};
 p.claimed=['wings',...Array.from({length:3000},(_,i)=>'battle:enc-old-'+i)];
 return p;
}
const ids=p=>[...Object.values(p.equipment).filter(Boolean).map(i=>i.id),...p.inventory.map(i=>i.id),...(p.pendingLoot??[]).map(i=>i.id)];

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),args:['--no-sandbox']});
 const report=[];
 try{
  for(const [width,height] of [[390,844],[320,568],[360,780],[430,932]]){
   const full=width===390;
   const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1});
   await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:new URL(base).origin});
   await context.route('https://telegram.org/**',route=>route.fulfill({body:'',contentType:'application/javascript'}));
   await context.addInitScript(()=>{
    window.mockCloud={reads:0,writes:0};
    window.Telegram={WebApp:{initData:new URLSearchParams({user:JSON.stringify({id:1234567})}).toString(),ready(){},expand(){},CloudStorage:{
     getItem(k,done){window.mockCloud.reads++;done(null,localStorage.getItem('mock:'+k)??'')},
     setItem(k,v,done){window.mockCloud.writes++;
      if(typeof v!=='string'||v.length>4096){done(Error('VALUE_TOO_LONG'),false);return}
      if(localStorage.getItem('mock:fail')&&k!=='save_meta'){done(Error('Offline'),false);return}
      localStorage.setItem('mock:'+k,v);
      if(Object.keys(localStorage).filter(x=>x.startsWith('mock:save')).length>1024){done(Error('KEYS_TOO_MANY'),false);return}
      done(null,true)}
    }}};
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   // Telegram profiles expose no test hooks: everything below goes through storage and real taps.
   await page.addInitScript(()=>{window.__notices=[];new MutationObserver(()=>{for(const n of document.querySelectorAll('[role=status]'))if(n.textContent&&!window.__notices.includes(n.textContent))window.__notices.push(n.textContent)}).observe(document,{subtree:true,childList:true,characterData:true})});
   // Edits to the device copy are applied before the app starts: leaving a page persists its live state.
   await page.addInitScript(k=>{const op=localStorage.getItem('qa:op');if(!op)return;localStorage.removeItem('qa:op');const {type,value}=JSON.parse(op);
    if(type==='seed')localStorage.setItem(k,value);
    if(type==='wipe')for(const x of Object.keys(localStorage))if(x.startsWith(k))localStorage.removeItem(x);
    if(type==='gold'){const p=JSON.parse(localStorage.getItem(k));p.gold+=value;localStorage.setItem(k,JSON.stringify(p))}},key);
   const restart=async(type,value)=>{await page.evaluate(op=>localStorage.setItem('qa:op',op),JSON.stringify({type,value}));await page.reload();await page.waitForFunction(k=>!!localStorage.getItem(k),key,{timeout:20000});await start()};
   const local=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
   const checkpoint=()=>page.evaluate(()=>{window.mockCloud.writes=0;Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden});
   const meta=()=>page.evaluate(()=>localStorage.getItem('mock:save_meta'));
   const sawNotice=re=>page.waitForFunction(src=>window.__notices.some(t=>new RegExp(src).test(t)),re.source,{timeout:20000});
   const start=async()=>{await page.waitForFunction(()=>window.mockCloud?.reads>0);await page.waitForTimeout(600)};
   await page.goto(base+'?miniapp=1');await start();
   await restart('seed',JSON.stringify(bigSave()));
   assert.equal((await local()).pendingLoot.length,STORED,'big save loads');
   if(full){
    // 1. Backup, wipe the device copy, restart: everything comes back from Telegram.
    await checkpoint();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('mock:save_meta')||'null')?.z===1,null,{timeout:20000});
    const m=JSON.parse(await meta()),saved=await local();
    assert.ok(m.count<=20,'compressed into '+m.count+' chunks');
    await restart('wipe');
    const restored=await local();
    assert.deepEqual(ids(restored),ids(saved),'no item lost after restart');assert.equal(new Set(ids(restored)).size,ids(saved).length,'no duplicated item');
    assert.deepEqual(restored.equipment,saved.equipment,'12 slots + wings restored');assert.equal(restored.inventory[1].perk,'boots','named trophy restored');
    assert.equal(restored.gold,saved.gold);assert.deepEqual(restored.claimed,saved.claimed,'reward receipts restored');
    report.push({width,stored:STORED,saveChars:JSON.stringify(saved).length,chunks:m.count,restoredItems:ids(restored).length});
    // 2. Upload fails: honest warning, device progress kept, previous cloud copy untouched; the next success says so.
    const before=await meta();
    await page.evaluate(()=>localStorage.setItem('mock:fail','1'));await restart('gold',777);
    assert.equal((await local()).gold,restored.gold+777);
    await checkpoint();await sawNotice(/Копия Telegram не обновлена · прогресс сохранён на устройстве, прежняя копия цела/);
    assert.equal(await meta(),before,'cloud still points at the previous complete copy');
    assert.equal((await local()).gold,restored.gold+777,'device progress kept');
    assert.equal(await page.evaluate(()=>window.__notices.some(t=>/снова обновлена/.test(t))),false,'no false success');
    await page.evaluate(()=>localStorage.removeItem('mock:fail'));
    await checkpoint();await sawNotice(/Копия Telegram снова обновлена/);
    assert.notEqual(await meta(),before,'new copy committed');
    await restart('wipe');
    assert.equal((await local()).gold,restored.gold+777,'the committed copy restores after another restart');
   }
   // 3. Manual backup: copy (clipboard + visible text), paste back, confirm.
   await page.getByRole('button',{name:'Меню',exact:true}).tap();await page.getByRole('dialog').waitFor();await page.waitForTimeout(400);
   await page.getByRole('button',{name:'Сохранение и восстановление',exact:true}).tap();
   const copyBtn=page.getByRole('button',{name:'Скопировать резервную копию',exact:true});await copyBtn.scrollIntoViewIfNeeded();await copyBtn.tap();
   const box=page.locator('[role=dialog] textarea[readonly]');await box.waitFor();
   const text=await box.inputValue();const clip=await page.evaluate(()=>navigator.clipboard.readText());
   assert.equal(clip,text,'clipboard holds the backup');const parsed=JSON.parse(text);assert.deepEqual(ids(parsed),ids(await local()));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0,'no horizontal scroll');
   await box.scrollIntoViewIfNeeded();const r=await box.boundingBox(),d=await page.getByRole('dialog').boundingBox();assert.ok(r.x>=d.x&&r.x+r.width<=d.x+d.width+1,'backup text stays inside the window');
   const pasteBtn=page.getByRole('button',{name:'Вставить резервную копию',exact:true});await page.waitForTimeout(400);await pasteBtn.scrollIntoViewIfNeeded();await pasteBtn.tap();
   const field=page.locator('[role=dialog] textarea:not([readonly])');await field.waitFor();
   parsed.gold=123456;await field.fill(JSON.stringify(parsed));
   await page.waitForTimeout(400);const check=page.getByRole('button',{name:'Проверить копию',exact:true});await check.scrollIntoViewIfNeeded();await check.tap();
   await page.getByRole('heading',{name:'Восстановить сохранение?'}).waitFor();
   await page.waitForTimeout(400);const ok=page.getByRole('button',{name:'Восстановить этот прогресс',exact:true});await ok.scrollIntoViewIfNeeded();await ok.tap();
   await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).gold===123456,key);
   assert.deepEqual(ids(await local()),ids(parsed),'pasted backup restored without loss');
   await page.screenshot({path:`.tmp/cloud-size-${width}.png`});
   report.push({width,copy:'ok',paste:'ok',backupChars:text.length});
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log(JSON.stringify(report,null,1));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
