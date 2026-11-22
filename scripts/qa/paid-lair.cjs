/* Generate fixtures with `node --import tsx scripts/qa/fixtures.ts` first.
 * All player actions use real touch input; accelerated ticks only shorten fixture combat.
 */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fixtures=JSON.parse(fs.readFileSync('.tmp/qa/fixtures.json','utf8'));
const base=process.env.BASE_URL||'http://127.0.0.1:5173/';
const output=process.env.OUT||'.tmp/window-qa/paid-lair';
fs.mkdirSync(output,{recursive:true});

async function profile(browser,width,height,id,fixture,run){
 const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
 const key='lootborn-codex-v1:test:'+id;
 const url=base+'?testProfile='+id;
 const errors=[];
 await context.route('https://telegram.org/**',route=>route.abort());
 await context.addInitScript(({key,fixture})=>{
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(fixture));
 },{key,fixture});
 const page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message));
 const boot=()=>page.waitForFunction(()=>window.__lootborn?.battle);
 const state=()=>page.evaluate(()=>window.__lootborn.useGame.getState().p);
 const button=(name,root=page)=>root.getByRole('button',{name,exact:typeof name==='string'});
 const tap=async(name,root)=>{await button(name,root).tap();await page.waitForTimeout(380)};
 const axes=()=>page.locator('button.central').tap();
 const route=async name=>{await tap('Приключения');await tap(name)};
 const lair=()=>route(/^Логово мини-босса/);
 const selectFight=async()=>{await tap(/^Капибара-Громила/);await tap('Выбрать бой')};
 const reload=async()=>{await page.reload();await boot()};
 const screenshot=tag=>page.screenshot({path:output+'/'+width+'-'+id+'-'+tag+'.png'});
 const until=async predicate=>{
  for(let i=0;i<250;i++){
   const p=await state();
   if(predicate(p))return p;
   await page.evaluate(()=>{
    const b=window.__lootborn.battle;
    for(let j=0;j<16&&b.running;j++)b.update(.05);
   });
   await page.waitForTimeout(40);
  }
  throw new Error('Combat did not reach the expected state');
 };
 try{
  await page.goto(url);await boot();
  await run({context,page,url,key,button,tap,axes,state,route,lair,selectFight,reload,screenshot,until});
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
}

async function loss(api){
 const {page,button,tap,axes,state,lair,selectFight,reload,screenshot,until}=api;
 await lair();await selectFight();await axes();
 const loss=await until(p=>p.lairAttempt?.phase==='defeat');
 const id=loss.lairAttempt.id;
 assert.equal(loss.chaosite,15);
 await axes();
 assert.equal((await state()).encounter.id,id);
 await tap('Продолжить');
 await tap(/^Возродиться/);
 await tap('Отмена',page.locator('[data-panel="lair-revive"]'));
 assert.equal((await state()).gold,4000);
 await tap(/^Возродиться/);
 await button(/^Подтвердить ·/).dblclick();
 assert.equal((await state()).gold,2800);
 const defeatedAgain=await until(p=>p.lairAttempt?.phase==='defeat');
 assert.equal(defeatedAgain.lairAttempt.lairRevives,1);
 await reload();await axes();await tap('Продолжить');
 const restored=(await state()).lairAttempt;
 assert.deepEqual(restored,defeatedAgain.lairAttempt);
 await tap(/^Возродиться/);await tap(/^Подтвердить ·/);
 await until(p=>p.lairAttempt?.phase==='defeat');
 assert.equal(await button(/^Возродиться/).isDisabled(),true);
 assert.equal((await state()).chaosite,15);
 assert.equal((await state()).lairAttempt.id,id);
 await screenshot('revive-limit');
 console.log(JSON.stringify({scenario:'defeat',width:page.viewportSize().width,chaosite:[20,15,15],sameId:id,revives:2}));
}

async function departure(api){
 const {context,page,url,key,button,tap,axes,state,route,lair,selectFight,reload,screenshot,until}=api;
 await lair();await selectFight();await axes();await page.waitForTimeout(400);await axes();
 const paid=await state();
 assert.equal(paid.chaosite,40);
 await route(/^Основная глава/);await axes();await reload();
 assert.deepEqual((await state()).lairAttempt,paid.lairAttempt);
 for(const mode of [/^Бесконечный фарм/,/^Основная глава/]){
  await route(mode);await axes();await reload();
  assert.deepEqual((await state()).lairAttempt,paid.lairAttempt);
 }
 await lair();await tap('Продолжить');
 assert.equal((await state()).encounter.id,paid.lairAttempt.id);
 assert.equal((await state()).chaosite,40);
 await axes();await lair();
 if(page.viewportSize().width===390){
  const second=await context.newPage();
  await second.goto(url);
  await second.waitForFunction(()=>window.__lootborn?.battle);
  await second.getByRole('button',{name:'Приключения',exact:true}).tap();
  await second.getByRole('button',{name:/^Логово мини-босса/}).tap();
  await second.getByRole('button',{name:'Завершить попытку',exact:true}).tap();
  await second.getByRole('button',{name:'Подтвердить завершение',exact:true}).tap();
  assert.equal(await second.evaluate(key=>JSON.parse(localStorage.getItem(key)).lairAttempt.id,key),paid.lairAttempt.id);
  await second.close();
 }
 await tap('Завершить попытку');
 await tap('Отмена',page.locator('dialog[open]'));
 assert.equal((await state()).lairAttempt.id,paid.lairAttempt.id);
 await tap('Завершить попытку');await tap('Подтвердить завершение');
 assert.equal((await state()).lairAttempt,undefined);
 assert.equal((await state()).chaosite,40);
 await selectFight();await axes();await page.waitForTimeout(200);
 const newAttempt=await state();
 assert.equal(newAttempt.chaosite,35);
 assert.notEqual(newAttempt.lairAttempt.id,paid.lairAttempt.id);
 const win=await until(p=>p.rewardOffer&&!p.rewardOffer.resolved);
 assert.equal(win.lastBattleReward,newAttempt.lairAttempt.id);
 assert.equal(win.lairAttempt,undefined);
 await screenshot('trophy');
 await reload();
 assert.equal((await state()).gold,win.gold);
 assert.equal((await state()).lastBattleReward,win.lastBattleReward);
 assert.equal((await state()).lairAttempt,undefined);
 console.log(JSON.stringify({scenario:'departure',width:page.viewportSize().width,chaosite:[45,40,40,35],sameId:paid.lairAttempt.id,win:win.lastBattleReward}));
}

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
  for(const [width,height] of [[320,568],[360,780],[390,844],[430,932]]){
   const options={sound:false,preferences:{auto:true,speed:2,continueOnVictory:true,stopOnDeath:true}};
   await profile(browser,width,height,'lair-loss',{...fixtures.find(p=>p.stage===1),...options,stage:50,wave:1,chaosite:20,gold:4000},loss);
   await profile(browser,width,height,'lair-exit',{...fixtures.find(p=>p.stage===13),...options,stage:3,wave:1,chaosite:45},departure);
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
