/* Telegram bridge and device handoff in Chromium. Generate data with node --import tsx scripts/qa/fixtures.ts. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.BASE_URL || 'http://localhost:4173/';
const browserKey = 'lootborn-codex-v1';
const telegramKey = browserKey + ':telegram:1234567';
const inviteUrl = 'https://t.me/VikingRomeGame';

const {gunzipSync}=require('node:zlib');
const {mkdirSync}=require('node:fs');
const {bigSave}=require('./cloud-size.cjs');
const deviceKey=id=>browserKey+':telegram:'+id;
const pauseCloud=page=>page.evaluate(()=>{
 Object.defineProperty(document,'hidden',{value:true,configurable:true});
 document.dispatchEvent(new Event('visibilitychange'));
 delete document.hidden;
});

async function transferBetweenDevices(browser){
 const accounts=new Map(),requests=[],id=900000001;
 const account=id=>{
  if(!accounts.has(id))accounts.set(id,new Map());
  return accounts.get(id);
 };
 const cloudCopy=id=>{
  const values=account(id),meta=JSON.parse(values.get('save_meta')??'null');
  if(!meta)return null;
  const payload=Array.from({length:meta.count},(_,i)=>values.get(`save_${meta.generation}_${i}`)).join('');
  return {meta,raw:meta.z?gunzipSync(Buffer.from(payload,'base64')).toString('utf8'):payload};
 };
 const key=deviceKey(id),wait=async check=>{
  for(let n=0;n<200;n++){if(check())return;await new Promise(r=>setTimeout(r,50))}
  throw Error('Timed out waiting for mock CloudStorage');
 };
 const deferred=()=>{let release;const promise=new Promise(r=>{release=r});return {promise,release}};
 const controls={};
 const errors=[];
 const device=async(label,user,seed)=>{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const control=controls[label]={};
  await ctx.route('https://telegram.org/**',route=>route.fulfill({body:'',contentType:'application/javascript'}));
  await ctx.exposeBinding('qaCloud',async(_,op,keys,value)=>{
   const req={label,op,keys,done:false};
   requests.push(req);
   const hold=op==='set'?control.holdWrite:control.holdRead;
   if(hold)await hold.promise;
   const data=account(user);
   try{
    if(control.offline||op==='set'&&control.failedKey===keys[0])return {error:'Offline'};
    if(op==='set'){
     if(value.length>4096||!data.has(keys[0])&&data.size===1024)return {error:'Limit'};
     data.set(keys[0],value);return {value:true};
    }
    if(op==='get')return {value:data.get(keys[0])??''};
    return {value:Object.fromEntries(keys.map(k=>[k,data.get(k)??'']))};
   }finally{req.done=true}
  });
  await ctx.addInitScript(({user,k,seed})=>{
   window.qaInitiallyEmpty=localStorage.getItem(k)===null;
   if(seed&&!localStorage.getItem(k))localStorage.setItem(k,JSON.stringify(seed));
   const invoke=(op,keys,value,cb)=>window.qaCloud(op,keys,value)
    .then(response=>cb(response.error??null,response.value),error=>cb(error));
   window.Telegram={WebApp:{ready(){},expand(){},initData:new URLSearchParams({user:JSON.stringify({id:user})}).toString(),CloudStorage:{
    getItem(k,cb){invoke('get',[k],null,cb)},
    getItems(ks,cb){invoke('batch',ks,null,cb)},
    setItem(k,v,cb){invoke('set',[k],v,cb)}
   }}};
  },{user,k:deviceKey(user),seed});
  const makePage=async()=>{
   const page=await ctx.newPage();
   page.on('pageerror',error=>errors.push(label+': '+error.message));
   return page;
  };
  return {ctx,control,makePage};
 };
 const tap=async(page,name)=>{
  await page.getByRole('button',{name,exact:typeof name==='string'}).tap();
  await page.waitForTimeout(380);
 };
 const local=(page,k=key)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),k);
 const awaitRead=async label=>wait(()=>requests.some(r=>r.label===label&&r.op==='get'&&r.done));
 const committed=async(page,label,after)=>{
  await wait(()=>requests.slice(after).some(r=>r.label===label&&r.op==='set'&&r.keys[0]==='save_meta'&&r.done));
  const copy=cloudCopy(id);
  await page.waitForFunction(({key,raw})=>localStorage.getItem(key+':cloud-base')===raw,{key,raw:copy.raw});
  assert.ok(requests.slice(after).filter(r=>r.label===label&&r.op==='set').every(r=>r.done));
  return copy;
 };
 const snapshot=p=>Object.fromEntries(['stage','wave','level','gold','gems','chaosite','mission','claimed','equipment','inventory','pendingLoot','lairAttempt'].map(k=>[k,p[k]]));
 const tools=async page=>{await tap(page,'Меню');await tap(page,'Сохранение и восстановление')};

 const out='.tmp/window-qa/telegram-transfer';
 mkdirSync(out,{recursive:true});
 const seed=bigSave(34);
 seed.bosses=33;seed.mission=32;seed.chaosite=45;seed.mineAt=Date.now()-3600e3;
 const a=await device('A',id,seed);
 let ap=await a.makePage();await ap.goto(base+'?miniapp=transfer-a');await awaitRead('A');
 await tap(ap,'Задания');await tap(ap,'Получить награду');await tap(ap,'Закрыть');
 assert.equal((await local(ap)).mission,33);
 assert.equal((await local(ap)).gems,seed.gems+15);
 await tap(ap,'Приключения');await tap(ap,/^Логово мини-босса/);
 await tap(ap,/^Капибара-Громила/);await tap(ap,'Выбрать бой');
 await ap.locator('.bottom>.central').tap();await ap.waitForTimeout(420);
 await ap.locator('.bottom>.central').tap();
 const paid=await local(ap);
 assert.equal(paid.chaosite,40);
 assert.ok(paid.lairAttempt?.id);
 let after=requests.length;
 a.control.holdWrite=deferred();
 await pauseCloud(ap);
 await wait(()=>requests.slice(after).some(r=>r.label==='A'&&r.op==='set'&&!r.done));
 assert.equal(cloudCopy(id),null,'no metadata before the chunk callbacks');
 a.control.holdWrite.release();delete a.control.holdWrite;
 const first=await committed(ap,'A',after);
 assert.ok(first.meta.count>1&&first.meta.count<=20,'large profile spans multiple bounded chunks');
 assert.deepEqual(snapshot(JSON.parse(first.raw)),snapshot(paid));
 await ap.close();

 const b=await device('B',id);
 b.control.holdRead=deferred();
 const bp=await b.makePage();await bp.goto(base+'?miniapp=transfer-b');
 assert.equal(await bp.evaluate(()=>window.qaInitiallyEmpty),true);
 await wait(()=>requests.some(r=>r.label==='B'&&r.op==='get'&&!r.done));
 await pauseCloud(bp);
 assert.equal(requests.filter(r=>r.label==='B'&&r.op==='set').length,0);
 assert.equal(await local(bp),null,'a visibility checkpoint must not create a starter save before the cloud reads');
 await bp.locator('.bottom>.central').tap();
 assert.equal(await bp.locator('.bottom>.central').getAttribute('aria-pressed'),'false');
 assert.equal(await local(bp),null,'a tap cannot start or save a new hero while the cloud read is pending');
 b.control.holdRead.release();delete b.control.holdRead;
 await bp.waitForFunction(({key,raw})=>localStorage.getItem(key)===raw,{key,raw:first.raw});
 assert.deepEqual(snapshot(await local(bp)),snapshot(paid));
 // The first action after restoring must commit without a retry.
 await tap(bp,'Скорость боя');
 assert.equal((await local(bp)).preferences.speed,(JSON.parse(first.raw).preferences.speed===2?1:2));
 await tap(bp,'Задания');
 assert.ok(await bp.getByRole('button',{name:'Получить награду',exact:true}).isDisabled());
 await tap(bp,'Закрыть');
 await tap(bp,'Приключения');await tap(bp,/^Логово мини-босса/);await tap(bp,'Продолжить');
 await bp.locator('.bottom>.central[aria-pressed=true]').tap();
 assert.equal((await local(bp)).lairAttempt.id,paid.lairAttempt.id);
 assert.equal((await local(bp)).chaosite,paid.chaosite);
 await tap(bp,/^Золото: /);await tap(bp,'Собрать');
 const advanced=await local(bp);assert.ok(advanced.gold>paid.gold&&advanced.chaosite>paid.chaosite);
 await tap(bp,'Закрыть');

 b.control.offline=true;
 after=requests.length;await pauseCloud(bp);
 await wait(()=>requests.slice(after).some(r=>r.op==='get'&&r.done));
 assert.equal(requests.slice(after).filter(r=>r.op==='set').length,0);
 assert.equal(cloudCopy(id).raw,first.raw);
 delete b.control.offline;
 b.control.failedKey=`save_${1-Number(first.meta.generation)}_0`;
 after=requests.length;await pauseCloud(bp);
 await bp.getByText(/Копия Telegram не обновлена · прогресс сохранён/).first().waitFor();
 assert.equal(requests.slice(after).filter(r=>r.keys[0]==='save_meta'&&r.op==='set').length,0);
 assert.equal(cloudCopy(id).raw,first.raw);
 assert.deepEqual(snapshot(await local(bp)),snapshot(advanced));
 delete b.control.failedKey;
 after=requests.length;await pauseCloud(bp);
 const second=await committed(bp,'B',after);
 assert.deepEqual(snapshot(JSON.parse(second.raw)),snapshot(advanced));
 await bp.close();

 ap=await a.makePage();after=requests.length;await ap.goto(base+'?miniapp=transfer-a');
 await ap.getByText(/Копия Telegram отличается/).first().waitFor();
 assert.equal((await local(ap)).gold,paid.gold);
 await tools(ap);await tap(ap,'Открыть копию из Telegram');
 await ap.getByRole('heading',{name:'Восстановить сохранение?'}).waitFor();
 await ap.screenshot({path:out+'/a-conflict-preview.png'});
 await tap(ap,'Отмена');assert.equal((await local(ap)).gold,paid.gold);
 await pauseCloud(ap);
 await wait(()=>requests.slice(after).filter(r=>r.op==='get'&&r.done).length>=3);
 assert.equal(requests.slice(after).filter(r=>r.op==='set').length,0);
 assert.equal(cloudCopy(id).raw,second.raw);
 await tap(ap,'Открыть копию из Telegram');await tap(ap,'Восстановить этот прогресс');
 assert.deepEqual(snapshot(await local(ap)),snapshot(advanced));
 assert.equal((await local(ap,key+':before-import')).gold,paid.gold);

 const cId=id+1,c=await device('C',cId);
 const cp=await c.makePage();await cp.goto(base+'?miniapp=transfer-c');await awaitRead('C');
 assert.equal(await local(cp),null);
 await tap(cp,'Награды');await tap(cp,'Забрать подарок');
 const other=await local(cp,deviceKey(cId));
 assert.ok(other.gold<paid.gold);assert.equal(other.stage,1);
 assert.equal(await local(cp),null);
 await tap(cp,'Закрыть');
 await pauseCloud(cp);await wait(()=>cloudCopy(cId)!==null);
 assert.equal(JSON.parse(cloudCopy(cId).raw).gold,other.gold);
 assert.equal(cloudCopy(id).raw,second.raw);

 // An invalid cloud snapshot exposes the manual fallback and cannot update the cloud.
 const values=account(cId);
 const meta=JSON.parse(values.get('save_meta'));
 values.set(`save_${meta.generation}_0`,'{bad backup');
 values.set('save_meta',JSON.stringify({generation:meta.generation,count:1}));
 after=requests.length;
 await tools(cp);await tap(cp,'Открыть копию из Telegram');
 await cp.getByText(/Копия Telegram повреждена/).first().waitFor();
 assert.equal((await local(cp,deviceKey(cId))).gold,other.gold);
 await tap(cp,'Вставить резервную копию');
 await cp.getByRole('textbox',{name:'Текст резервной копии'}).fill(JSON.stringify(other));
 await tap(cp,'Проверить копию');await tap(cp,'Восстановить этот прогресс');
 assert.equal((await local(cp,deviceKey(cId))).gold,other.gold);
 await pauseCloud(cp);
 await wait(()=>requests.slice(after).filter(r=>r.op==='get'&&r.done).length>=2);
 assert.equal(requests.slice(after).filter(r=>r.op==='set').length,0);
 assert.equal(cloudCopy(cId).raw,'{bad backup');
 await cp.screenshot({path:out+'/c-manual-restore.png'});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({roundtrip:'A → Cloud → B → Cloud → A',stage:advanced.stage,mission:advanced.mission,items:advanced.inventory.length,equipped:Object.keys(advanced.equipment).length,stored:advanced.pendingLoot.length,gold:[paid.gold,advanced.gold],gems:advanced.gems,chaosite:[paid.chaosite,advanced.chaosite],lairAttempt:paid.lairAttempt.id,cloudChunks:[first.meta.count,second.meta.count],isolatedStage:other.stage}));
 await Promise.all([a.ctx.close(),b.ctx.close(),c.ctx.close()]);
}

(async () => {
 const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--no-sandbox']
 });
 try {
  await transferBetweenDevices(browser);
  const context = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  await context.route('https://telegram.org/**', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
  await context.addInitScript(() => {
   const params = new URLSearchParams(location.search);
   if (!params.has('miniapp')) return;
   const initData = new URLSearchParams({user:JSON.stringify({id:1234567})});
   if(params.has('mail-acceptance'))initData.set('start_param','mail_acceptance');
   window.mockCloud = { reads: 0, writes: 0 };
   window.Telegram = { WebApp: {
    initData: initData.toString(),
    ready() {}, expand() {},
    CloudStorage: {
     getItem(key, done) {
      window.mockCloud.reads++;
      if (localStorage.getItem('mock:timeout')) return;
      if (localStorage.getItem('mock:error')) { done(Error('Offline'), ''); return; }
      done(null, localStorage.getItem('mock:' + key) ?? '');
     },
     setItem(key, value, done) {
      window.mockCloud.writes++;
      localStorage.setItem('mock:' + key, value);
      done(null, true);
     }
    }
   } };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const tap = (name) => page.getByRole('button', { name, exact: true }).tap();
  const read = key => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  const open = mini => page.goto(base + (mini ? '?miniapp=1' : ''));
  const waitForCloud = () => page.waitForFunction(() => window.mockCloud?.reads > 0);
  const putCloud = value => page.evaluate(value => {
   const raw = JSON.stringify(value);
   const chunks = raw.match(/.{1,1000}/gu);
   localStorage.setItem('mock:save_meta', JSON.stringify({generation:'0',count:chunks.length}));
   chunks.forEach((part, i) => localStorage.setItem('mock:save_0_' + i, part));
  }, value);
  const checkpoint = async () => {
   await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
   });
   await page.waitForFunction(() => window.mockCloud.reads > 0);
  };

  await open(false);
  await tap('Награды');
  await tap('Забрать подарок');
  const chrome = await read(browserKey);
  const incoming = { ...structuredClone(chrome), daily: '', gold: chrome.gold + 1000 };
  // Restore a copy from before the calendar shipped, with its old receipt format.
  delete incoming.saga.box['daily-gifts'];
  await putCloud(incoming);

  await open(true);
  await page.waitForFunction(key => !!localStorage.getItem(key), telegramKey);
  assert.equal((await read(telegramKey)).gold, incoming.gold, 'fresh Telegram profile restores the cloud copy');
  await tap('Награды');
  await tap('Забрать подарок');
  const local = await read(telegramKey);
  assert.ok(local.gold > incoming.gold);
  await checkpoint();
  await page.waitForFunction(() => window.mockCloud.writes > 0);

  await open(true);
  await waitForCloud();
  assert.equal((await read(telegramKey)).gold, local.gold);
  await tap('Награды');
  assert.equal(await page.getByRole('button', {name:'Сегодня уже получено',exact:true}).isDisabled(), true);
  await tap('Закрыть');
  assert.equal((await read(browserKey)).gold, chrome.gold, 'Chrome progress is independent');

  const other = { ...incoming, gold: local.gold + 777, savedAt: Date.now() + 30000 };
  await putCloud(other);
  await open(true);
  await waitForCloud();
  assert.equal((await read(telegramKey)).gold, local.gold, 'a newer cloud copy cannot replace local progress');
  await tap('Меню');
  await tap('Сохранение и восстановление');
  await tap('Открыть прежнее сохранение на устройстве');
  await tap('Отмена');
  await tap('Открыть копию из Telegram');
  await tap('Отмена');
  assert.equal((await read(telegramKey)).gold, local.gold, 'preview cancellation preserves the local copy');
  await checkpoint();
  assert.equal(await page.evaluate(() => window.mockCloud.writes), 0, 'a divergent cloud copy is protected from autosave');

  await open(true);
  await waitForCloud();
  await tap('Меню');
  await tap('Сохранение и восстановление');
  await tap('Открыть копию из Telegram');
  await tap('Восстановить этот прогресс');
  assert.equal((await read(telegramKey)).gold, other.gold);
  assert.equal((await read(telegramKey + ':before-import')).gold, local.gold);

  await page.evaluate(() => localStorage.setItem('mock:error', '1'));
  await open(true);
  await waitForCloud();
  await checkpoint();
  assert.equal(await page.evaluate(() => window.mockCloud.writes), 0, 'a cloud read failure never authorizes an upload');
  assert.equal((await read(telegramKey)).gold, other.gold);

  await page.evaluate(() => {
   localStorage.removeItem('mock:error');
   localStorage.setItem('mock:timeout', '1');
  });
  await open(true);
  await waitForCloud();
  await tap('Меню');
  await tap('Сохранение и восстановление');
  await tap('Открыть копию из Telegram');
  await page.getByText('Копия Telegram недоступна · попробуйте ещё раз', {exact:true}).first().waitFor();
  await checkpoint();
  assert.equal(await page.evaluate(() => window.mockCloud.writes), 0, 'a timeout cannot authorize an upload');
  assert.equal((await read(telegramKey)).gold, other.gold);
  await tap('Закрыть');
  const verifyInvite = async () => {
   await page.evaluate(() => {
    history.replaceState(null, '', location.pathname + location.search + '#tgWebAppData=synthetic');
    Object.defineProperty(navigator, 'clipboard', {
     configurable: true,
     value: { writeText: value => { window.copiedGameLink = value; return Promise.resolve(); } }
    });
   });
   await tap('Скопировать ссылку на игру');
   assert.equal(await page.evaluate(() => window.copiedGameLink), inviteUrl);
   await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('Denied')); });
   await tap('Скопировать ссылку на игру');
   assert.equal(await page.getByRole('textbox', {name:'Адрес для копирования'}).inputValue(), inviteUrl);
  };

  const beforeInvite = await read(telegramKey);
  await tap('Приглашение');
  await verifyInvite();
  const afterInvite = await read(telegramKey);
  for (const field of ['inventory','pendingLoot','gold','gems','stage','equipment','claimed','bought'])
   assert.deepEqual(afterInvite[field], beforeInvite[field], 'sharing preserves ' + field);

  await page.goto(base + '?hero=invite-alias-qa');
  await page.waitForFunction(() => window.__lootborn?.battle);
  await page.evaluate(() => window.__lootborn.useGame.getState().open('friends'));
  await page.getByRole('dialog', {name:'Поделиться игрой'}).waitFor();
  await verifyInvite();

  const acceptanceKey = browserKey + ':test:mail-acceptance';
  const ownerCopy = await read(telegramKey);
  const ownerBrowser = await read(browserKey);
  const ownerCloud = await page.evaluate(() => Object.entries(localStorage).filter(([key])=>key.startsWith('mock:save_')).sort());
  await page.goto(base + '?miniapp=1&mail-acceptance=1');
  await page.waitForFunction(() => window.__lootborn?.battle);
  await tap('Почта');
  const inbox = page.getByRole('dialog',{name:'Почта',exact:true});
  const letter = inbox.locator('.mail-letter');
  assert.equal(await letter.count(), 1);
  assert.equal(await letter.getAttribute('data-unread'), 'true');
  await letter.tap();
  const attachment = page.getByRole('dialog',{name:'Награды карнавала',exact:true});
  assert.ok(await attachment.locator('.reward-piece').count() >= 4, 'the archived carnival provides varied attachments');
  const beforeClaim = await read(acceptanceKey);
  await attachment.getByRole('button',{name:'Забрать',exact:true}).tap();
  await attachment.locator('.mail-delivered').waitFor();
  const afterClaim = await read(acceptanceKey);
  assert.ok(afterClaim.gold > beforeClaim.gold && afterClaim.gems > beforeClaim.gems);
  const noCloud = () => page.evaluate(() => window.mockCloud);
  assert.deepEqual(await noCloud(), {reads:0,writes:0}, 'the acceptance hero bypasses the production Telegram cloud');
  await page.reload();
  await page.waitForFunction(() => window.__lootborn?.battle);
  await tap('Почта');
  assert.equal(await inbox.getByRole('button',{name:'Забрать всё'}).isDisabled(), true);
  assert.deepEqual(await read(telegramKey), ownerCopy);
  assert.deepEqual(await read(browserKey), ownerBrowser);
  assert.deepEqual(await page.evaluate(() => Object.entries(localStorage).filter(([key])=>key.startsWith('mock:save_')).sort()), ownerCloud);
  assert.deepEqual(await noCloud(), {reads:0,writes:0});
  assert.deepEqual(errors, []);
  console.log('Telegram bridge: restore, backup, reload, conflict and offline protection, invitation routes and isolated mail acceptance');
 } finally {
  await browser.close();
 }
})().catch(error => { console.error(error); process.exitCode = 1; });
