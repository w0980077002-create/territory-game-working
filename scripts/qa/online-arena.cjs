const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {randomUUID} = require('node:crypto');
const {existsSync,mkdtempSync,mkdirSync,rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const {chromium} = require('playwright');

const port = process.env.ARENA_QA_PORT || '18787';
const base = 'http://127.0.0.1:'+port;
const out = '.tmp/window-qa/online-arena';
const stagingKey='lootborn-arena-staging-v1';
const soloKey='lootborn-codex-v1';
const viewportSizes = [[320,568],[360,780],[390,844],[430,932]];
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
const button = (page,name) => page.getByRole('button',{name,exact:true});
const section = page => page.getByRole('region',{name:'Сетевая Арена 1×1'});
const round = (page,n) => section(page).getByText(new RegExp('^Раунд '+n+' ·'));
const score = arena => arena.getByText(/тестовые очки/);

async function openArena(page) {
 await button(page,'Арена').tap();
 await button(page,'Сетевая Арена 1×1').tap();
}

async function actor(browser,user,viewport) {
 const {initData} = await (await fetch(base+'/arena-api/local?user='+user)).json();
 const context = await browser.newContext({viewport,isMobile:true,hasTouch:true});
 await context.route('https://telegram.org/js/telegram-web-app.js',route=>route.fulfill({body:'',contentType:'text/javascript'}));
 const player=require('./ui-fixture.cjs')(34);
 player.heroClass=user==='alice'?'ranger':'berserker';
 player.skills=[5,2,1];
 const stagedWeapon={...player.equipment.weapon,attack:user==='alice'?1e100:12,upgrade:user==='alice'?9000:0};
 player.equipment.weapon=stagedWeapon;
 const account=user==='alice'?'1001':'1002';
 const profileKey=soloKey+':telegram:'+account;
 const actorKey=stagingKey+':player:'+account;
 await context.addInitScript(({data,player,profileKey,stagingKey,actorKey,soloKey})=>{
  const cloudCall=()=>sessionStorage.setItem('qa-cloud-calls',String(Number(sessionStorage.getItem('qa-cloud-calls'))+1));
  window.Telegram={WebApp:{
   initData:sessionStorage.getItem('qa-launch-override')??data,ready(){},expand(){},isVersionAtLeast:()=>false,
   CloudStorage:{getItem:cloudCall,setItem:cloudCall},
  }};
  if(!sessionStorage.getItem('qa-save-initialized')){
   localStorage.setItem(soloKey,'original-save-sentinel');
   localStorage.setItem(profileKey,'telegram-save-sentinel');
   localStorage.setItem(stagingKey,'legacy-staging-sentinel');
   localStorage.setItem(actorKey,JSON.stringify(player));
   sessionStorage.setItem('qa-save-initialized','1');
  }
 },{data:initData,player,profileKey,stagingKey,actorKey,soloKey});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base);
 await openArena(page);
 await button(page,'Войти через Telegram').tap();
 await button(page,'Найти соперника').waitFor();
 return {context,page,errors,player,profileKey,actorKey};
}

async function pickMove(page,attack,first,second) {
 const arena=section(page);
 await button(arena.getByRole('group',{name:'Удар · 1 зона'}),attack).tap();
 const guards=arena.getByRole('group',{name:'Защита · 2 зоны'});
 await button(guards,first).tap();
 await button(guards,second).tap();
 await button(arena,'Подтвердить ход').tap();
}

async function chat(page,text) {
 const arena=section(page);
 await button(arena,'Боевой чат').tap();
 await arena.getByRole('textbox',{name:'Сообщение'}).fill(text);
 await button(arena,'Отправить').tap();
 await arena.getByText(text,{exact:false}).waitFor();
}

async function apiSave(page,data) {
 return page.evaluate(async payload=>{
  const launch=new URLSearchParams(window.Telegram.WebApp.initData);
  const {id}=JSON.parse(launch.get('user'));
  const token=sessionStorage.getItem('vvr-arena-session:'+id+':'+launch.get('hash'));
  const res=await fetch('/arena-api/save',{
   method:payload?'POST':'GET',
   headers:{Authorization:'Bearer '+token,'X-Arena-Tab':crypto.randomUUID(),...(payload?{'Content-Type':'application/json'}:{})},
   body:payload?JSON.stringify(payload):undefined,
  });
  return {status:res.status,value:await res.json()};
 },data);
}

async function verifySaves(one,two,width) {
 const ar=section(one.page),br=section(two.page);
 await ar.getByText('Облачная копия Solo',{exact:true}).tap();
 await button(ar,'Проверить копии').tap();
 await button(ar,'Сохранить копию').waitFor();
 await br.getByText('Облачная копия Solo',{exact:true}).tap();
 await button(br,'Проверить копии').tap();
 await br.getByText('Облачных копий пока нет',{exact:true}).waitFor();
 const matchSaveRequest=request=>request.url().endsWith('/arena-api/save')&&request.method()==='POST';
 const before=await apiSave(one.page);
 const upload=one.page.waitForRequest(matchSaveRequest);
 if(width===390){
  // The write reaches PostgreSQL, but this tab loses the acknowledgment.
  const loseAck=async route=>{
   if(route.request().method()!=='POST'){await route.continue();return}
   assert.equal((await route.fetch()).status(),200);
   await route.abort('connectionreset');
  };
  await one.page.route('**/arena-api/save',loseAck);
  await button(ar,'Сохранить копию').tap();
  await ar.getByText('Нет связи с хранилищем. Локальная копия сохранена.',{exact:true}).waitFor();
  await one.page.unroute('**/arena-api/save',loseAck);
  const retry=one.page.waitForRequest(matchSaveRequest);
  await button(ar,'Повторить отправку').tap();
  assert.deepEqual((await retry).postDataJSON(),(await upload).postDataJSON());
 }else await button(ar,'Сохранить копию').tap();

 const revision=before.value.revision+1;
 await ar.getByText('Копия записана · версия '+revision,{exact:true}).waitFor();
 const [read,other]=await Promise.all([apiSave(one.page),apiSave(two.page)]);
 assert.equal(read.value.revision,revision);
 assert.equal(read.value.snapshot.raw,(await upload).postDataJSON().raw);
 assert.notEqual(other.value.playerId,read.value.playerId);
 assert.equal(other.value.snapshot,null);
 await noHorizontalOverflow(one.page);

 if(width===390){
  await button(ar,'Проверить копии').tap();
  await button(ar,'Восстановить версию '+revision).waitFor();
  const updated=JSON.parse(read.value.snapshot.raw);
  updated.gold+=42;
  const another=await apiSave(one.page,{expected:revision,raw:JSON.stringify(updated),requestId:randomUUID()});
  assert.equal(another.status,200,'the other device advances the cloud revision');
  await button(ar,'Сохранить копию').tap();
  await ar.getByText(/Есть более свежая версия/).waitFor();
  assert.equal(await button(ar,'Сохранить копию').count(),0);
  await button(ar,'Проверить копии').tap();
  await button(ar,'Восстановить версию '+(revision+1)).tap();
  await button(ar,'Подтвердить восстановление').tap();
  await ar.getByText('Версия '+(revision+1)+' восстановлена на устройстве.',{exact:true}).waitFor();
  const local=await one.page.evaluate(key=>({
   current:JSON.parse(localStorage.getItem(key)),backup:JSON.parse(localStorage.getItem(key+':before-import')),
  }),one.actorKey);
  assert.equal(local.current.gold,updated.gold);
  assert.equal(local.backup.gold,one.player.gold);
  one.player.gold=updated.gold;
 }
 await ar.getByText('Облачная копия Solo',{exact:true}).tap();
 await br.getByText('Облачная копия Solo',{exact:true}).tap();
}

async function verifyAccountSwitch(actor) {
 const {initData}=await (await fetch(base+'/arena-api/local?user=boris')).json();
 await actor.page.evaluate(value=>sessionStorage.setItem('qa-launch-override',value),initData);
 await actor.page.reload();
 await openArena(actor.page);
 await button(actor.page,'Войти через Telegram').waitFor();
 const ar=section(actor.page);
 assert.equal(await ar.getByText(/Тренировочный уровень 6 ·/).count(),0);
 await button(actor.page,'Войти через Telegram').tap();
 await ar.getByText(/Тренировочный уровень 13 ·/).waitFor();
 if(process.env.VVR_DB_URL){
  await ar.getByText('Облачная копия Solo',{exact:true}).tap();
  await button(ar,'Проверить копии').tap();
  await ar.getByText('Облачных копий пока нет',{exact:true}).waitFor();
 }
 const retained=await actor.page.evaluate(key=>JSON.parse(localStorage.getItem(key)),actor.actorKey);
 assert.equal(retained.gold,actor.player.gold,'switching Telegram identity leaves the first staged save intact');
}

async function noHorizontalOverflow(page) {
 const sizes=await page.evaluate(()=>{
  const arena=document.querySelector('.online-arena');
  const bounds=arena.getBoundingClientRect();
  const spilling=[...arena.querySelectorAll('*')].filter(child=>{
   const rect=child.getBoundingClientRect();
   return rect.width>0&&(rect.left<bounds.left-1||rect.right>bounds.right+1);
  }).map(child=>child.className||child.tagName);
  return {width:innerWidth,document:document.documentElement.scrollWidth,left:bounds.left,right:bounds.right,
   scroll:arena.scrollWidth,client:arena.clientWidth,spilling};
 });
 assert.ok(sizes.document<=sizes.width&&sizes.left>=0&&sizes.right<=sizes.width&&sizes.scroll<=sizes.client+1,
  'Arena fits its mobile viewport: '+JSON.stringify(sizes));
}

(async()=>{
 const root=mkdtempSync(join(tmpdir(),'vvr-mobile-arena-'));
 const server=spawn(process.execPath,['.tmp/arena/server.mjs'],{
  env:{...process.env,PORT:port,ARENA_LOCAL:'1',ARENA_TEST_LEVELS:'{"1001":6,"1002":13}',ARENA_DB:join(root,'arena.sqlite')},
  stdio:'inherit',
 });
 let browser;
 try{
  let ready=false;
  for(let attempt=0;attempt<50&&!ready;attempt++){
   ready=await fetch(base+'/arena-api/health').then(result=>result.ok,()=>false);
   if(!ready)await wait(100);
  }
  assert.ok(ready,'Compiled local Arena backend is available');
  mkdirSync(out,{recursive:true});
  browser=await chromium.launch({
   executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),
   args:['--no-sandbox'],
  });
  for(const [width,height] of viewportSizes){
   const one=await actor(browser,'alice',{width,height});
   const two=await actor(browser,'boris',{width,height});
   const a=one.page,b=two.page,ar=section(a),br=section(b);
   if(process.env.VVR_DB_URL)await verifySaves(one,two,width);
   const beforeScore=await score(ar).innerText();
   await ar.getByText(/Тренировочный уровень 6 ·/).waitFor();
   await br.getByText(/Тренировочный уровень 13 ·/).waitFor();
   const arenaOne=a.getByRole('combobox',{name:'Тренировочный комплект'});
   assert.equal(await a.getByRole('combobox',{name:'Класс бойца'}).inputValue(),'ranger');
   assert.equal(await b.getByRole('combobox',{name:'Класс бойца'}).inputValue(),'berserker');
   await ar.getByText('Предпросмотр героя Solo',{exact:true}).tap();
   await br.getByText('Предпросмотр героя Solo',{exact:true}).tap();
   await ar.getByText('Оружие · атака · 8 из 8',{exact:true}).waitFor();
   await br.getByText('Оружие · атака · 3 из 8',{exact:true}).waitFor();
   assert.equal(await ar.getByRole('list',{name:'Предпросмотр вклада 7 предметов'}).getByRole('listitem').count(),7);
   await noHorizontalOverflow(a);
   await a.screenshot({path:join(out,width+'-solo-preview.png')});
   await ar.getByText('Предпросмотр героя Solo',{exact:true}).tap();
   await br.getByText('Предпросмотр героя Solo',{exact:true}).tap();
   await arenaOne.selectOption('offensive');
   const joinRequest=a.waitForRequest(request=>request.url().endsWith('/arena-api/join'));
   await button(a,'Найти соперника').tap();
   assert.deepEqual((await joinRequest).postDataJSON(),{hero:'ranger',kit:'offensive'});
   await ar.getByText(/Поиск · уровни ±7/).waitFor();
   await button(b,'Найти соперника').tap();
   await Promise.all([round(a,1).waitFor(),round(b,1).waitFor()]);
   assert.match(await ar.getByText(/^Раунд 1/).innerText(),/· (?:[3-5]\d|60) с/);
   await ar.getByText('Игрок против игрока',{exact:true}).waitFor();
   await ar.getByText('Борис',{exact:true}).waitFor();
   await br.getByText('Алиса',{exact:true}).waitFor();
   await ar.getByText('Соперник · ур. 13',{exact:true}).waitFor();
   await br.getByText('Соперник · ур. 6',{exact:true}).waitFor();

   await ar.getByText('Тренировочная экипировка · 7 ячеек',{exact:true}).tap();
   assert.equal(await ar.locator('.online-gear-row').count(),7);
   assert.match(await ar.locator('.online-gear-row').first().innerText(),/\+8/);
   await ar.getByText('Тренировочная экипировка · 7 ячеек',{exact:true}).tap();
   await ar.getByText('Пояс эликсиров',{exact:true}).tap();
   await button(ar,'Сила 1').tap();
   await ar.getByRole('button',{name:/^Сила 0 · /}).waitFor();
   assert.equal(await button(ar,'Защита 1').isEnabled(),true);
   await noHorizontalOverflow(a);
   await a.screenshot({path:join(out,width+'-duel.png')});
   await ar.getByText('Пояс эликсиров',{exact:true}).tap();
   await chat(a,'Удачи в бою');
   await button(br,'Боевой чат').tap();
   await br.getByText('Удачи в бою',{exact:false}).waitFor();
   await noHorizontalOverflow(b);

   await pickMove(a,'Голова','Живот','Ноги');
   await button(ar,'Ход принят').waitFor();
   if(width===390){
    await two.context.setOffline(true);
    await ar.getByText(/HP · без связи/).waitFor({timeout:15_000});
    await two.context.setOffline(false);
    await b.reload();
    await openArena(b);
    await button(b,'Продолжить в этой вкладке').tap();
    await round(b,1).waitFor();
   }
   await pickMove(b,'Ноги','Грудь','Живот');
   await Promise.all([round(a,2).waitFor(),round(b,2).waitFor()]);
   await button(ar,'Автобой выкл.').tap();
   await button(ar,'Автобой вкл.').waitFor();
   await button(ar,'Автобой вкл.').tap();
   await button(ar,'Автобой выкл.').waitFor();

   if(width===390){
    await Promise.all([button(ar,'Автобой выкл.').tap(),button(br,'Автобой выкл.').tap()]);
    const reason=/Решило здоровье|Лимит раундов/;
    await Promise.all([ar.getByText(reason).waitFor({timeout:250_000}),br.getByText(reason).waitFor({timeout:250_000})]);
    const outcome=/^(Победа|Поражение|Ничья)$/;
    const decisions=await Promise.all([ar.getByText(outcome).innerText(),br.getByText(outcome).innerText()]);
    assert.ok(decisions.every(result=>result==='Ничья')||decisions.includes('Победа')&&decisions.includes('Поражение'));
   }else{
    await button(b,'Покинуть поединок').tap();
    await button(b,'Подтвердить выход').tap();
    await ar.getByText('Победа',{exact:true}).waitFor();
    await br.getByText('Поражение',{exact:true}).waitFor();
    assert.equal(await score(ar).innerText(),beforeScore,'leaving grants no points');
   }
   await chat(b,'Спасибо за бой');
   await button(ar,'Боевой чат').tap();
   await ar.getByText('Спасибо за бой',{exact:false}).waitFor();
   await ar.getByText(/До закрытия чата · (29:|30:00)/).waitFor();
   await a.screenshot({path:join(out,width+'-postfight.png')});
   for(const actor of [one,two]){
    const storage=await actor.page.evaluate(({soloKey,profileKey,stagingKey,actorKey})=>({
     original:localStorage.getItem(soloKey),telegram:localStorage.getItem(profileKey),
     legacy:localStorage.getItem(stagingKey),player:JSON.parse(localStorage.getItem(actorKey)),cloud:Number(sessionStorage.getItem('qa-cloud-calls')),
    }),{soloKey,profileKey:actor.profileKey,actorKey:actor.actorKey,stagingKey});
    assert.equal(storage.original,'original-save-sentinel');
    assert.equal(storage.telegram,'telegram-save-sentinel');
    assert.equal(storage.cloud,0);
    assert.equal(storage.legacy,'legacy-staging-sentinel');
    for(const field of ['equipment','inventory','gold','gems','chaosite','tokens','stage','skills'])
     assert.deepEqual(storage.player[field],actor.player[field],'Arena never mutates Solo '+field);
    assert.deepEqual(actor.errors,[]);
   }
   if(width===390)await verifyAccountSwitch(one);
   await Promise.all([one.context.close(),two.context.close()]);
   console.log(width+' px: independent sessions, levels 6/13, moves, elixir, chat, result, Solo isolation'+
    (process.env.VVR_DB_URL?', PostgreSQL save and isolation':'')+' passed');
  }
  const fallback=await actor(browser,'alice',{width:430,height:932});
  const {page}=fallback;
  await button(page,'Найти соперника').tap();
  const queuedAt=Date.now();
  await section(page).getByText(/Поиск · уровни ±7/).waitFor();
  await section(page).getByText('Тренировочный бот',{exact:true}).first().waitFor({timeout:25_000});
  assert.ok(Date.now()-queuedAt>=19_500,'bot fallback waits twenty seconds');
  assert.match(await round(page,1).innerText(),/· (?:5\d|60) с/);
  await fallback.context.close();
  console.log('430 px: 20-second queue fallback and fresh 60-second duel passed');
 }finally{
  if(browser)await browser.close();
  if(server.exitCode===null&&server.signalCode===null){
   server.kill();
   await once(server,'exit');
  }
  rmSync(root,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
