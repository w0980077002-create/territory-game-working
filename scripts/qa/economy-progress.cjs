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
   p.level=39;p.inventory.pop();
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
   // The legacy anchor gives 525 raw steps, while the modern forge gives 100.
   // Both spend five steps on item level and convert the remaining steps into capped mastery.
   const forgeStepBonus=width===320?525:100;
   const expectedMastery=25*(1-Math.exp(-(forgeStepBonus-5)/35));
   const lootLead='Добыча +5 ур.';
   const masteryLabel='Мастерство кузницы: +'+expectedMastery.toFixed(1)+'% к характеристикам новой добычи и ковки.';
   await page.getByText(lootLead,{exact:true}).waitFor();
   await page.getByText(masteryLabel,{exact:true}).waitFor();
   const original=await player();
   await page.getByRole('button',{name:/^Развить кузницу/}).tap();
   assert.equal((await player()).forge,p.forge+1);
   assert.equal((await player()).gold,original.gold-100*p.forge);
   await page.getByText(lootLead,{exact:true}).waitFor();
   await page.getByText(masteryLabel,{exact:true}).waitFor();
   await open('loot');
   await page.getByRole('button',{name:/^Протрубить ·/}).tap();
   const afterLoot=await player();
   const beforeIds=new Set([...original.inventory,...original.pendingLoot].map(item=>item.id));
   const newItems=[...afterLoot.inventory,...afterLoot.pendingLoot].filter(item=>!beforeIds.has(item.id));
   assert.equal(newItems.length,1,'one blast grants exactly one item');
   const [drop]=newItems;
   assert.ok(drop.level>=39&&drop.level<=44,'new loot is within levels 39 to 44');
   assert.equal(drop.level,44,'a forge beyond the level cap issues hero +5 gear');
   assert.deepEqual(afterLoot.equipment,original.equipment,'forge development leaves worn gear and wings intact');
   assert.deepEqual(afterLoot.inventory.filter(item=>beforeIds.has(item.id)),original.inventory);
   assert.deepEqual(afterLoot.pendingLoot.filter(item=>beforeIds.has(item.id)),original.pendingLoot);
   console.log(width+'×'+height+' hero 39 · forge '+p.forge+' · new loot '+drop.level+' · mastery '+expectedMastery.toFixed(3)+'%');
   await open('relic');
   await page.getByRole('button',{name:/^Сердце ледника/}).tap();
   const info=page.getByRole('dialog',{name:'Сердце ледника'});
   await info.getByText(width===320?/[+]1[\s\u00a0\u202f]?260 п.п./:/\+300 п.п./).waitFor();
   await info.getByRole('button',{name:/^Развить/}).tap();
   assert.equal((await player()).relic,p.relic+1);
   await info.getByRole('button',{name:'Закрыть карточку'}).tap();
   await open('skills');
   await page.getByRole('button',{name:/Жадность/}).first().waitFor();
   // Verify all nine names stay readable as a whole word in the actual compact skill overview.
   const runeLabels=await page.locator('.saga-modal[data-panel="skills"] .rune-options button > small').evaluateAll(els=>els.map(el=>{
    const range=document.createRange();
    range.selectNodeContents(el);
    return {name:el.textContent,lines:range.getClientRects().length,
     overflow:el.scrollWidth>el.clientWidth+2,font:parseFloat(getComputedStyle(el).fontSize)};
   }));
   assert.equal(runeLabels.length,9,'all skill-rune choices remain present');
   assert.ok(runeLabels.every(label=>label.lines===1&&!label.overflow&&label.font>=10),
    width+' unreadable rune name: '+JSON.stringify(runeLabels));
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
