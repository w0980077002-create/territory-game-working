const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {existsSync,mkdtempSync,mkdirSync,rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const {chromium} = require('playwright');

const port = process.env.ARENA_QA_PORT || '18787';
const base = 'http://127.0.0.1:'+port;
const out = '.tmp/window-qa/online-arena';
const viewportSizes = [[320,568],[360,780],[390,844],[430,932]];
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
const button = (page,name) => page.getByRole('button',{name,exact:true});
const section = page => page.getByRole('region',{name:'Сетевая Арена 1×1'});
const round = (page,n) => section(page).getByText(new RegExp('^Раунд '+n+' ·'));

async function openArena(page) {
 await button(page,'Арена').tap();
 await button(page,'Сетевая Арена 1×1').tap();
}

async function actor(browser,user,viewport) {
 const {initData} = await (await fetch(base+'/arena-api/local?user='+user)).json();
 const context = await browser.newContext({viewport,isMobile:true,hasTouch:true});
 await context.route('https://telegram.org/js/telegram-web-app.js',route=>route.fulfill({body:'',contentType:'text/javascript'}));
 await context.addInitScript(data=>{
  window.__arenaCloudCalls=0;
  window.Telegram={WebApp:{
   initData:data,ready(){},expand(){},isVersionAtLeast:()=>false,
   CloudStorage:{getItem(){window.__arenaCloudCalls++},setItem(){window.__arenaCloudCalls++}},
  }};
  localStorage.setItem('lootborn-codex-v1','original-save-sentinel');
 },initData);
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base);
 await openArena(page);
 await button(page,'Войти через Telegram').tap();
 await button(page,'Найти соперника').waitFor();
 return {context,page,errors};
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
  env:{...process.env,PORT:port,ARENA_LOCAL:'1',ARENA_DB:join(root,'arena.sqlite')},
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
   const arenaOne=a.getByRole('combobox',{name:'Комплект'});
   await arenaOne.selectOption('offensive');
   await button(a,'Найти соперника').tap();
   await ar.getByText(/Поиск · уровни ±7/).waitFor();
   await button(b,'Найти соперника').tap();
   await Promise.all([round(a,1).waitFor(),round(b,1).waitFor()]);
   assert.match(await ar.getByText(/^Раунд 1/).innerText(),/· (?:[3-5]\d|60) с/);
   await ar.getByText('Игрок против игрока',{exact:true}).waitFor();
   await ar.getByText('Борис',{exact:true}).waitFor();
   await br.getByText('Алиса',{exact:true}).waitFor();

   await ar.getByText('Экипировка · 7 ячеек',{exact:true}).tap();
   assert.equal(await ar.locator('.online-gear-row').count(),7);
   assert.match(await ar.locator('.online-gear-row').first().innerText(),/\+8/);
   await ar.getByText('Экипировка · 7 ячеек',{exact:true}).tap();
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

   await button(b,'Покинуть поединок').tap();
   await button(b,'Подтвердить выход').tap();
   await ar.getByText('Победа',{exact:true}).waitFor();
   await br.getByText('Поражение',{exact:true}).waitFor();
   await ar.getByText(/тестовые очки 0/).waitFor();
   await chat(b,'Спасибо за бой');
   await button(ar,'Боевой чат').tap();
   await ar.getByText('Спасибо за бой',{exact:false}).waitFor();
   await ar.getByText(/До закрытия чата · (29:|30:00)/).waitFor();
   await a.screenshot({path:join(out,width+'-postfight.png')});
   for(const actor of [one,two]){
    const storage=await actor.page.evaluate(()=>({original:localStorage.getItem('lootborn-codex-v1'),cloud:window.__arenaCloudCalls}));
    assert.deepEqual(storage,{original:'original-save-sentinel',cloud:0});
    assert.deepEqual(actor.errors,[]);
    await actor.context.close();
   }
   console.log(width+' px: independent sessions, moves, elixir, chat, result and Solo isolation passed');
  }
 }finally{
  if(browser)await browser.close();
  if(server.exitCode===null&&server.signalCode===null){
   server.kill();
   await once(server,'exit');
  }
  rmSync(root,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
