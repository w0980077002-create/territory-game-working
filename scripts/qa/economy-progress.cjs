const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fixture=require('./ui-fixture.cjs');

const base=process.env.BASE_URL||'http://localhost:5173/';
const profile='economy-progress';
const saveKey='lootborn-codex-v1:test:'+profile;

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
  for(const [width,height] of [[320,568],[360,780],[390,844],[430,932]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
   await context.route('https://telegram.org/**',route=>route.fulfill({body:'',contentType:'application/javascript'}));
   const p=fixture(34);
   p.forge=width===320?1575:300;p.relic=width===320?420:100;p.stage=71;p.runes[2]=2;p.gold=2_000_000;
   if(width===320)delete p.progression;
   else p.progression={v:1,anchors:{}};
   await context.addInitScript(({key,p})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(p));
   },{key:saveKey,p});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   const url=base+'?testProfile='+profile;
   const loaded=tab=>tab.waitForFunction(()=>window.__lootborn?.battle);
   await page.goto(url);await loaded(page);
   await page.waitForFunction(()=>window.__lootborn?.useGame.getState().persist());
   const open=name=>page.evaluate(name=>window.__lootborn.useGame.getState().open(name),name);
   const player=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),saveKey);
   await open('forge');
   await page.getByText(width===320?'Добыча +525 ур.':'Добыча +100 ур.',{exact:true}).waitFor();
   await page.getByText('До следующего +1 · 9 ур.',{exact:true}).waitFor();
   await page.getByRole('button',{name:/^Развить кузницу/}).tap();
   await page.getByText('До следующего +1 · 8 ур.',{exact:true}).waitFor();
   await open('relic');
   await page.getByRole('button',{name:/^Сердце ледника/}).tap();
   const info=page.getByRole('dialog',{name:'Сердце ледника'});
   await info.getByText(width===320?/[+]1[\s\u00a0\u202f]?260 п.п./:/\+300 п.п./).waitFor();
   await info.getByRole('button',{name:/^Развить/}).tap();
   assert.equal((await player()).relic,p.relic+1);
   await info.getByRole('button',{name:'Закрыть карточку'}).tap();
   await open('skills');
   await page.getByRole('button',{name:/Жадность/}).first().waitFor();
   const panel=page.locator('.saga-modal');
   assert.ok(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+2));
   await open(null);

   const before=(await player()).gold;
   await page.evaluate(()=>{
    const {battle:b}=window.__lootborn;
    cancelAnimationFrame(b.raf);
    b.phase='fight';b.running=true;b.cooldowns[2]=0;
    b.units[0].hp=1;
    b.units=[b.units[0],{...b.units[0],role:1,hp:10}];
    b.skill(2);b.skill(2);
   });
   assert.equal((await player()).gold,before);
   assert.equal((await player()).encounter.hammerKills,1);

   if(width===320){
    const other=await context.newPage();
    await other.goto(url);await loaded(other);
    const blocked=await other.evaluate(()=>{
     const {battle:b,useGame}=window.__lootborn;
     const g=useGame.getState();
     const importOk=g.importSave({...g.p,progression:undefined,forge:1700,relic:450});
     b.units.forEach(unit=>unit.hp=0);
     b.victory();
     return {importOk,gold:useGame.getState().p.gold};
    });
    assert.deepEqual(blocked,{importOk:false,gold:before});
    await other.close();
   }
   await page.reload();await loaded(page);
   await page.waitForFunction(()=>window.__lootborn?.useGame.getState().persist());
   const claimed=await page.evaluate(()=>{
    const {battle:b,useGame}=window.__lootborn;
    cancelAnimationFrame(b.raf);
    const kills=b.hammerKills,id=b.id;
    b.units.forEach(unit=>unit.hp=0);
    b.victory();b.victory();
    return {id,kills,receipt:useGame.getState().p.lastBattleReward};
   });
   assert.equal(claimed.kills,1);
   assert.equal(claimed.id,claimed.receipt);
   await page.getByRole('status').filter({hasText:/руна Молота/}).waitFor();
   assert.equal((await player()).gold,before+10563+2112);
   await page.reload();await loaded(page);
   assert.equal((await player()).gold,before+10563+2112);
   assert.deepEqual(errors,[]);
   await context.close();
   console.log(width+'×'+height+' economy, imported save and Hammer receipt passed');
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
