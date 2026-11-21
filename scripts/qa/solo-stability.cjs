const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fixture=require('./ui-fixture.cjs');

const base=process.env.BASE_URL||'http://localhost:5173/';
const key='lootborn-codex-v1:test:stability';
const url=base+'?testProfile=stability';

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
  for(const [width,height] of [[320,568],[360,780],[390,844],[430,932],[360,540]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
   await context.route('https://telegram.org/**',route=>route.fulfill({body:'',contentType:'application/javascript'}));
   const p=fixture(34);
   p.bosses=3;p.mission=0;p.blessing=129;p.reducedMotion=true;
   await context.addInitScript(({p,key})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(p));
    const set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){
     if(k===key&&window.refuseWrites)throw new DOMException('Full','QuotaExceededError');
     set.call(this,k,v);
    };
    if(innerHeight<=568)window.Telegram={WebApp:{initData:'',platform:'android',
     viewportStableHeight:innerHeight,safeAreaInset:{top:16,bottom:14,left:0,right:0}}};
   },{p,key});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   const loaded=tab=>tab.waitForFunction(()=>window.__lootborn?.battle);
   await page.goto(url);
   await loaded(page);
   await page.waitForFunction(()=>window.__lootborn?.useGame.getState().persist());
   const open=panel=>page.evaluate(panel=>window.__lootborn.useGame.getState().open(panel),panel);
   const refuse=value=>page.evaluate(value=>{window.refuseWrites=value},value);
   const state=()=>page.evaluate(key=>{
    const {battle,useGame}=window.__lootborn,p=useGame.getState().p;
    return {hp:battle.hp,max:battle.maxHp,cd:battle.potionCd,cost:battle.potionCost(),gold:p.gold,gems:p.gems,mission:p.mission,
     blessing:p.blessing,saved:JSON.parse(localStorage.getItem(key))};
   },key);
   const prepare=tab=>tab.evaluate(()=>{
    const b=window.__lootborn.battle;
    cancelAnimationFrame(b.raf);
    b.hp=b.maxHp*.2;b.running=true;b.potionCd=0;b.publish();
   });
   const potion=tab=>tab.getByRole('button',{name:/^Зелье здоровья/});
   await prepare(page);
   assert.equal(await potion(page).locator('.potion-cost .icon').count(),1);
   const initial=await state();
   await refuse(true);
   await potion(page).tap();
   const failed=await state();
   for(const key of ['hp','cd','gold','saved'])assert.deepEqual(failed[key],initial[key],width+' failed heal '+key);
   await refuse(false);
   await potion(page).tap();
   await potion(page).tap();
   const healed=await state();
   assert.equal(healed.hp,initial.hp+initial.max*.45);
   assert.equal(healed.gold,initial.gold-initial.cost);
   assert.equal(healed.saved.encounter.hp,healed.hp);
   assert.equal(healed.saved.encounter.potionCd,4);
   assert.match(await potion(page).innerText(),/4 с/);

   if(width===320){
    const blocked=await context.newPage();
    await blocked.goto(url);await loaded(blocked);await prepare(blocked);
    await potion(blocked).tap();
    await blocked.getByRole('status').filter({hasText:'другой вкладке'}).waitFor();
    assert.equal(await blocked.evaluate(()=>window.__lootborn.battle.potionCd),0);
    assert.equal((await state()).gold,healed.gold);
    await blocked.close();
   }
   await page.reload();await loaded(page);
   assert.equal((await state()).hp,healed.hp);
   assert.equal((await state()).cd,4);
   await page.waitForFunction(()=>window.__lootborn?.useGame.getState().persist());

   await open('quests');
   const chapter=page.locator('.chapter-claim');
   const claim=chapter.getByRole('button',{name:'Получить награду',exact:true});
   assert.deepEqual(await chapter.locator('.reward-piece strong').allTextContents(),['200','15']);
   await refuse(true);await claim.tap();
   await page.locator('.dialog-error').waitFor();
   assert.equal((await state()).mission,0);
   assert.equal(await page.locator('.dialog-notice .reward-piece').count(),0);
   await refuse(false);await claim.tap();
   const notice=page.locator('.dialog-notice');
   assert.deepEqual(await notice.locator('.reward-piece strong').allTextContents(),['200','15']);
   assert.equal((await state()).mission,1);
   assert.equal((await state()).gems,healed.gems+15);
   assert.equal((await state()).gold,healed.gold+200);
   const fits=await notice.evaluate(e=>e.clientWidth+2>=e.scrollWidth&&e.getBoundingClientRect().bottom<document.querySelector('.modal-footer').getBoundingClientRect().top);
   assert.ok(fits,width+' short claim notice');

   await open('blessing');
   await page.getByText('Шансы добычи и ковки',{exact:true}).tap();
   await page.getByText(/Комплект из Рога · 59,6% → 60%/).waitFor();
   await page.getByRole('button',{name:/^Получить благословение/}).tap();
   const max=page.getByRole('button',{name:'Максимум бонусов',exact:true});
   assert.equal(await max.isDisabled(),true);
   assert.equal((await state()).blessing,130);
   await page.reload();await loaded(page);await open('blessing');
   assert.equal(await max.isDisabled(),true);
   assert.deepEqual(errors,[]);
   await context.close();
   console.log(width+'×'+height+' healing, chapter receipt and Blessing passed');
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
