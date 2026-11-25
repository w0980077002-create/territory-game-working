const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {existsSync,mkdtempSync,mkdirSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {chromium}=require('playwright');

const port=process.env.ARENA_QA_PORT||'18787';
const base='http://127.0.0.1:'+port;
const screenshots='.tmp/window-qa/online-arena/';
const key='lootborn-arena-staging-v1';
const widths=[[320,568],[360,780],[390,844],[430,932]];
const modes=[['Дуэль','1×1'],['Отряд','3×3'],['Хаос','20×20']];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const button=(page,name)=>page.getByRole('button',{name,exact:typeof name==='string'});
const duel=page=>page.locator('.vvr-battle');

async function actor(browser,viewport,user,level=1,attack){
 const context=await browser.newContext({viewport,isMobile:true,hasTouch:true});
 await context.route('https://telegram.org/**',route=>route.fulfill({body:'',contentType:'text/javascript'}));
 const player=require('./ui-fixture.cjs')(1,true);
 player.heroClass=user==='boris'?'berserker':'ranger';
 player.level=level;
 if(attack)player.equipment.weapon={id:'fixture',slot:'weapon',name:'Меч',attack,hp:0,defense:0,upgrade:0,rarity:1,level};
 await context.addInitScript(({key,player})=>{
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(player));
 },{key,player});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+(user?'/?arenaLocal='+user:'/'));
 await button(page,'Арена').tap();
 await page.getByRole('heading',{name:'ТОП-50 Арены'}).waitFor();
 return {page,context,errors};
}

async function move(page){
 const guards=duel(page).getByRole('group',{name:'Защита · 2 зоны'});
 await button(guards,'Грудь').tap();
 await button(guards,'Ноги').tap();
 await button(duel(page),'Ударить').tap();
}

async function layout(page,size,terminal=false){
 const metrics=await page.evaluate(()=>{
  const scene=document.querySelector('.vvr-battle-stage').getBoundingClientRect();
  const belt=document.querySelector('.vvr-dock-panel summary')?.getBoundingClientRect();
  const feed=document.querySelector('.vvr-feed-box').getBoundingClientRect();
  const visible=document.querySelector('[data-panel="arena"] .modal-body').getBoundingClientRect();
  return {width:innerWidth,left:scene.left,right:scene.right,viewTop:visible.top,viewBottom:visible.bottom,
   sceneTop:scene.top,sceneBottom:scene.bottom,beltTop:belt?.top,beltBottom:belt?.bottom,feedTop:feed.top};
 });
 assert.ok(metrics.left>=0&&metrics.right<=metrics.width,JSON.stringify(metrics));
 assert.ok(metrics.feedTop<metrics.viewBottom&&metrics.sceneBottom<=metrics.viewBottom,JSON.stringify(metrics));
 if(!terminal)assert.ok(metrics.beltBottom<=metrics.viewBottom,JSON.stringify(metrics));
 for(const label of ['Тренировочная экипировка','Умение героя','‹ Арена'])
  assert.equal(await page.getByText(label,{exact:true}).count(),0);
 await page.screenshot({path:screenshots+size+'.png'});
}

async function bots(browser,width,height,name,size){
 const {page,context,errors}=await actor(browser,{width,height});
 try{
  await page.clock.install({time:new Date()});
  await button(page,new RegExp('^'+name+' ')).tap();
  await page.getByText(/Поиск ·/).waitFor();
  await page.clock.fastForward(20_500);
  await duel(page).waitFor();
  await duel(page).getByText(size+' · Бой с ботами',{exact:true}).waitFor();
  await layout(page,'local-'+name+'-'+width);
  await button(duel(page),'Автобой').tap();
  if(name==='Дуэль'){
   // Move the browser clock in small steps to exercise the real automatic turn scheduler.
   for(let i=0;i<25&&!await duel(page).locator('.vvr-result').count();i++)await page.clock.fastForward(1100);
   await duel(page).locator('.vvr-result').waitFor();
   await layout(page,'result-'+width,true);
   const before=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).arenaWins,key);
   await page.reload();
   await button(page,'Арена').tap();
   await duel(page).locator('.vvr-result').waitFor();
   assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).arenaWins,key),before);
   assert.equal(await page.getByText(/Подключение ·/).count(),0);
  }
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
}

async function humans(browser,viewport){
 const a=await actor(browser,viewport,'alice',6,80);
 const b=await actor(browser,viewport,'boris',13,25);
 try{
  await button(a.page,/^Дуэль/).tap();
  await a.page.getByText(/Поиск ·/).waitFor();
  await button(b.page,/^Дуэль/).tap();
  await Promise.all([duel(a.page).waitFor(),duel(b.page).waitFor()]);
  assert.match(await duel(a.page).innerText(),/ур\. 6/);
  assert.match(await duel(a.page).innerText(),/ур\. 13/);
  await Promise.all([move(a.page),move(b.page)]);
  await duel(a.page).getByText(/Раунд 2 ·/).waitFor();
  await layout(a.page,'network-duel-'+viewport.width);
  await a.page.reload();
  await button(a.page,'Арена').tap();
  await button(a.page,'Продолжить в этой вкладке').tap();
  await button(a.page,'Покинуть бой').tap();
  await button(a.page,'Подтвердить выход').tap();
  await duel(b.page).getByText('Победа',{exact:true}).waitFor();
  const chat=duel(b.page).getByRole('textbox',{name:'Сообщение'});
  await chat.fill('Увидимся на Арене!');
  await button(duel(b.page),'Отправить').tap();
  await duel(a.page).getByText(/Увидимся на Арене!/).waitFor();
  await layout(b.page,'after-duel-'+viewport.width,true);
  assert.deepEqual([...a.errors,...b.errors],[]);
 }finally{await Promise.all([a.context.close(),b.context.close()]);}
}

(async()=>{
 const root=mkdtempSync(join(tmpdir(),'vvr-arena-mobile-'));
 const server=spawn(process.execPath,['.tmp/arena/server.mjs'],{
  env:{...process.env,PORT:port,ARENA_LOCAL:'1',ARENA_DB:join(root,'arena.sqlite')},stdio:'inherit',
 });
 let browser;
 try{
  for(let i=0;i<50;i++){
   if(await fetch(base+'/health').then(r=>r.ok,()=>false))break;
   await wait(100);
  }
  assert.ok((await fetch(base+'/health')).ok);
  mkdirSync(screenshots,{recursive:true});
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||
   (existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),args:['--no-sandbox']});
  for(const [width,height] of widths){
   for(const [name,size] of modes)await bots(browser,width,height,name,size);
   console.log(width+' px: all three local modes and post-battle layout');
  }
  await humans(browser,{width:390,height:844});
  console.log('Two signed players: real levels, manual turn, reconnection, result and chat');
 }finally{
  await browser?.close();
  if(server.exitCode===null){server.kill();await once(server,'exit');}
  rmSync(root,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
