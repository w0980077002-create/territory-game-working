/* Mobile acceptance of the new Solo systems. Run against the local game with isolated profiles. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const base=process.env.BASE_URL||'http://localhost:5173/',output=process.env.OUT;
if(output)fs.mkdirSync(output,{recursive:true});
async function checkHud(page){
 assert.equal(await page.evaluate(()=>{
  const enter=document.querySelector('.stage .enter').getBoundingClientRect();
  const title=document.querySelector('.stage h1').getBoundingClientRect();
  return title.right<=enter.left||title.top>=enter.bottom;
 }),true,'chapter title does not overlap the enter button');
}
const fixed=(day,month=0)=>new Date(Date.UTC(2027,month,day,12));
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
  for(const width of (process.env.WIDTHS||'320,360,390,430').split(',').map(Number)){
   const context=await browser.newContext({viewport:{width,height:width===320?568:width*2},isMobile:true,hasTouch:true,timezoneId:'Pacific/Honolulu'});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   page.setDefaultTimeout(12000);
   const button=(name,root=page)=>root.getByRole('button',{name,exact:typeof name==='string'});
   const tap=async(name,root)=>button(name,root).first().tap();
   const card=()=>page.locator('dialog[open]');
   const panel=name=>page.locator('[data-panel="'+name+'"]');
   const open=async name=>{await page.evaluate(name=>window.__lootborn.useGame.getState().open(name),name);await panel(name).waitFor()};
   const closeCard=async()=>{await tap('Закрыть карточку');await card().waitFor({state:'detached'});await page.waitForTimeout(360)};
   const check=async()=>assert.equal(await page.evaluate(()=>{
    const dialog=document.querySelector('dialog[open],.saga-modal');
    const box=dialog?.getBoundingClientRect();
    return document.documentElement.scrollWidth<=innerWidth&&!!box&&box.x>=0&&box.right<=innerWidth+1&&box.top>=0&&box.bottom<=innerHeight+1&&dialog.scrollWidth<=dialog.clientWidth+1;
   }),true,'dialog fits '+width);
   const capture=async section=>{if(output)await page.screenshot({path:output+'/'+width+'-'+section+'.png'})};
   const state=()=>page.evaluate(()=>window.__lootborn.useGame.getState().p);
   const boot=()=>page.waitForFunction(()=>window.__lootborn?.battle);
   // Exercise the shortest mobile view with the Telegram safe-area variables supplied by the host.
   await page.addInitScript(()=>{
    window.addEventListener('DOMContentLoaded',()=>{
     document.documentElement.style.setProperty('--tg-content-safe-area-inset-top','26px');
     document.documentElement.style.setProperty('--tg-safe-area-inset-bottom','24px');
     window.dispatchEvent(new Event('resize'));
    });
   });
   await page.clock.setFixedTime(fixed(9));
   await page.goto(base+'?hero=solo-ui-'+width);await boot();
   await page.evaluate(()=>{
    const g=window.__lootborn.useGame.getState();
    g.mutate(p=>{
     p.gold=50000;p.chaosite=300;p.level=8;p.stage=3;
     p.companions[0]=20;
     p.saga={v:1,n:{'res:seal':10,'solo:soul':500,'solo:scroll':200,'solo:awake':5,'solo:monopoly':3,'solo:fortune':3,'solo:wing':5,'lair:clear:capybara_bruiser':1},flags:[],seen:[],trophies:[],box:{}};
     p.saga.box.followerMarket={v:1,revision:1,nextId:0,offers:[{species:'goose_aviator'},{species:'goose_aviator'},{species:'moss_eater'}]};
    });
   });
   await tap('Спутники');await tap('Призыв');await check();
   await tap('Обменять печать');await tap('Получить 10 Душ за 1 печать');
   await tap('300 Душ');
   assert.equal((await state()).saga.n['solo:soul'],210);
   const saved=(await state()).saga.box.followerMarket;
   await page.reload();await boot();
   assert.deepEqual((await state()).saga.box.followerMarket,saved);
   if(width===320){
    const other=await context.newPage();
    await other.goto(page.url());await other.waitForFunction(()=>window.__lootborn?.battle);
    assert.equal(await other.evaluate(()=>window.__lootborn.useGame.getState().mutate(p=>{p.gold=0})),false);
    assert.notEqual((await state()).gold,0);
    await other.close();
   }
   await tap('Спутники');await page.locator('.squad-grid button').first().tap();
   await tap('Таланты');assert.equal(await card().locator('.game-tile').count(),8);await capture('talents');await card().locator('.game-tile').nth(3).tap();await tap(/Изучить Мастерство 4/);
   assert.equal((await state()).saga.box.squad.instances['follower:goose_aviator'].talents[3].rank,1);
   await tap('Звёзды');await tap('Выбрать донора');await tap(/^Материал:/);await card().getByRole('option',{name:/^№2/}).tap();
   await tap('Объединить');await tap('Подтвердить расход');
   assert.equal((await state()).saga.box.squad.instances['follower:goose_aviator'].st,1);
   assert.equal((await state()).saga.box.squad.instances['follower:copy:1'],undefined);
   await closeCard();
   await open('skills');await tap('Руны');assert.equal(await panel('skills').locator('.game-tile').count(),9);assert.equal(await panel('skills').locator('.game-tile').last().evaluate(tile=>tile.getBoundingClientRect().bottom<=tile.closest('.modal-body').getBoundingClientRect().bottom+2),true,'all nine runes are in view');await capture('runes');await tap('Призвать руну');await tap(/Призвать руну ·/);await closeCard();
   assert.equal((await state()).saga.n['solo:scroll'],180);
   await tap('Пассивы');await tap(/^Стойкость/);await tap('Выбрать');await check();await tap('Подтвердить');
   await tap('Резонанс');assert.match(await panel('skills').innerText(),/Резонанс · 1/);
   await open('events');await tap(/^Спринт последователей/);await check();
   assert.match(await card().innerText(),/Потрачено · 300/);
   await tap('Забрать');assert.equal((await state()).saga.box.soloEvents['followers:2027-01'].claims,1);
   await closeCard();
   await page.clock.setFixedTime(fixed(14));await page.waitForTimeout(1100);
   await tap(/^Морская монополия/);await check();await capture('monopoly');
   assert.equal(await card().locator('.board-cell .icon').count(),20);
   await card().locator('.board-cell').nth(2).tap();assert.match(await card().locator('.board-inspect').innerText(),/Самоцветы/);
   await tap('Правила',card());
   await card().getByRole('checkbox').check();await tap('Правила',card());
   await button(/Бросить кубик/,card()).dblclick();
   assert.equal((await state()).saga.n['solo:monopoly'],2);
   const roll=(await state()).saga.box.soloEvents['monopoly:2027-01'];
   assert.ok(roll.last>=1&&roll.last<=6);
   await page.reload();await boot();
   assert.deepEqual((await state()).saga.box.soloEvents['monopoly:2027-01'],roll);
   await open('events');
   await page.clock.setFixedTime(fixed(19));await page.waitForTimeout(1100);
   await tap(/^СчастТайна/);await check();await capture('fortune');assert.equal(await card().locator('.board-cell .icon').count(),12);await tap(/Разыграть приз/);
   assert.equal((await state()).saga.n['solo:fortune'],2);
   await closeCard();
   await page.clock.setFixedTime(fixed(22));await page.waitForTimeout(1100);
   await tap(/^Рунный спринт/);await check();await closeCard();
   await page.clock.setFixedTime(fixed(1,1));
   await open('mail');await check();await tap(/Спринт последователей/);
   await tap('Забрать',card());await closeCard();
   assert.equal((await state()).saga.box.soloEvents['followers:2027-01'].claims,127);
   assert.equal(await page.locator('select').count(),0);
   await open('wings');await tap('Получить первые крылья бесплатно',panel('wings'));
   await page.waitForFunction(()=>!!window.__lootborn.useGame.getState().p.equipment.wings);
   await tap('Рост',panel('wings'));
   await button('Рост',panel('wings')).and(page.locator('[aria-pressed=true]')).waitFor();
   await tap(/Усилить · 4 перьев/,panel('wings'));
   assert.equal((await state()).saga.box.wings.rank,1);
   await open('hero-path');await check();
   await tap(/^Трактат опыта/);await tap('Забрать');await closeCard();
   assert.ok((await state()).saga.flags.includes('solo:track:xp:0'));
   await open('adventure');await tap(/Логово мини-босса/);await panel('lair').waitFor();await check();
   await tap(/^Капибара-Громила/);await card().locator('summary').first().tap();await tap('Совершить рейд');
   assert.equal((await state()).saga.box.raidDay.total,1);
   await tap('Выбрать бой');await page.locator('button.central').tap();
   assert.equal((await state()).encounter.mode,'dungeon');
   assert.equal((await state()).encounter.units[0].id,'capybara_bruiser');
   await page.evaluate(()=>{const b=window.__lootborn.battle;b.hp=0;b.defeat()});
   await page.reload();await boot();
   await tap(/Возродиться/);await tap('Отмена');
   await page.waitForTimeout(360);
   assert.equal((await state()).encounter.lairRevives,0);
   await tap(/Возродиться/);await tap(/Подтвердить ·/);
   assert.equal((await state()).encounter.lairRevives,1);
   if(width===320)await page.evaluate(()=>{
    const g=window.__lootborn.useGame.getState();
    g.mutate(p=>{p.stage=70});
   });
   await checkHud(page);
   if(width===320){
    await page.evaluate(()=>{
     const game=window.__lootborn.useGame.getState();
     game.mutate(p=>{p.rewardOffer={encounterId:p.encounter.id,itemId:p.inventory[0].id,resolved:false}});
     game.notice('Трофей ожидает выбора');
    });
    const trophy=button('Трофей босса · открыть добычу');
    assert.ok((await trophy.boundingBox()).height>=43.9);
    assert.equal(await page.locator('.game .toast').count(),0);
    await trophy.tap();
    await panel('item').waitFor();
   }
   assert.deepEqual(errors,[]);
   await context.close();
   console.log(width+' px: followers, runes, sprints, boards, mail, wings, tracks, lair and reload OK');
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
