/* Run against the normal Vite app. Each browser context has an isolated hero and calendar. */
const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const base=process.env.BASE_URL||'http://127.0.0.1:5173/';
const out=process.env.OUT;
const utc=(month,day)=>Date.UTC(2026,month-1,day,12);
const saveKey='lootborn-codex-v1:test:carnival-ui';
const read=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),saveKey);

async function carnival(page){
  await page.getByRole('button',{name:'События',exact:true}).tap();
  await page.getByRole('button',{name:/^Великий карнавал/}).tap();
  return page.getByRole('dialog',{name:'Великий карнавал'});
}

async function scenario(browser,width,height){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  try{
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.clock.setFixedTime(utc(12,1));
    await page.goto(base+'?hero=carnival-ui');
    let dlg=await carnival(page);
    const taskReward=dlg.getByRole('button',{name:'Забрать · Зайти в игру',exact:true});
    assert.match(await dlg.getByRole('timer').innerText(),/Осталось/);
    assert.equal(await dlg.getByRole('tab').count(),7);
    assert.equal(await dlg.getByRole('group',{name:'Награды за очки карнавала'}).getByRole('button').count(),6);
    const before=(await read(page)).gold;
    await taskReward.dblclick();
    const saved=await read(page);
    assert.equal(saved.gold,before+38);
    assert.equal(saved.carnival.latest.claims['task:1:1'],-1);
    assert.equal(await dlg.getByLabel('Очки карнавала: 20',{exact:true}).count(),1);
    await dlg.getByRole('tab',{name:/День 7/}).tap();
    assert.match(await dlg.locator('.carnival-day-head').innerText(),/Откроется через/);
    assert.equal(await dlg.locator('.carnival-tasks button').count(),0);
    await dlg.getByRole('tab',{name:/День 1/}).tap();
    await dlg.getByRole('button',{name:'Перейти · Открыть Рог Трофеев'}).tap();
    await page.getByRole('button',{name:/Протрубить/}).tap();
    await page.getByRole('button',{name:'К бою',exact:true}).tap();
    await page.reload();
    dlg=await carnival(page);
    assert.equal(await taskReward.count(),0);
    const horn=dlg.locator('.carnival-task').filter({hasText:'Открыть Рог Трофеев'});
    assert.match(await horn.innerText(),/1 \/ 3/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(out){fs.mkdirSync(out,{recursive:true});await dlg.screenshot({path:`${out}/${width}-live.png`});}
    await dlg.getByRole('button',{name:'Закрыть',exact:true}).tap();
    await page.getByRole('dialog',{name:'События'}).waitFor();

    if(width===390){
      // Real game mutations publish wins, inventory changes and Horn results to the same profile.
      // Running the existing endpoints avoids waiting through dozens of repeat combat animations.
      const dailyWins=[0,11,12,12,13,16,16];
      for(let day=2;day<=7;day++){
        await page.clock.setFixedTime(utc(12,day));
        await page.evaluate(({day,wins})=>{
          const g=window.__lootborn.useGame.getState;
          for(let i=0;i<wins;i++)g().win('farm','carnival-farm-'+day+'-'+i);
          for(let i=0;i<6;i++)g().win('campaign','carnival-chapter-'+day+'-'+i);
          for(let i=0;i<7;i++){
            g().open(null);g().hornLoot();
            const id=g().selected;
            if(id&&i===0)g().equip(id);
            else if(id)g().salvage(id,true);
          }
          g().open(null);
        },{day,wins:dailyWins[day-1]});
      }
      dlg=await carnival(page);
      const final=dlg.getByRole('region',{name:'Главный приз карнавала'});
      await final.getByRole('button',{name:/Место экипировки:/}).tap();
      await dlg.getByRole('option',{name:'Кольцо I',exact:true}).tap();
      const gems=(await read(page)).gems;
      await final.getByRole('button',{name:'Забрать главный приз'}).dblclick();
      assert.match(await final.innerText(),/Приз получен/);
      const reward=await read(page);
      assert.equal(reward.gems,gems+30);
      assert.equal([...reward.inventory,...(reward.pendingLoot??[])].filter(item=>item.slot==='ring1'&&item.origin==='Награда карнавала · 2026-12').length,1);
      await page.clock.setFixedTime(utc(12,8));
      await page.reload();
      dlg=await carnival(page);
      assert.match(await dlg.getByRole('timer').innerText(),/До начала/);
      assert.match(await dlg.getByRole('region',{name:'Главный приз карнавала'}).innerText(),/Приз получен/);
      await page.clock.setFixedTime(Date.UTC(2027,0,1,12));
      await page.reload();
      dlg=await carnival(page);
      await dlg.getByRole('button',{name:/^Период:/}).tap();await dlg.getByRole('option',{name:/2026-12/}).tap();
      assert.match(await dlg.getByRole('timer').innerText(),/Награды прошлых карнавалов/);
      await dlg.getByRole('button',{name:/Порог 200/}).tap();
      await dlg.locator('.carnival-tier').getByRole('button',{name:'Забрать',exact:true}).tap();
      assert.equal((await read(page)).carnival.past[0].claims['tier:200'],-1);
    }
    assert.deepEqual(errors,[]);
    console.log(`${width}×${height}: carnival UI, calendar, Horn and durable claim`);
  }finally{await context.close();}
}

(async()=>{
  const executablePath=process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
  const browser=await chromium.launch({executablePath,args:['--no-sandbox']});
  try{
    for(const [width,height] of [[320,568],[360,780],[390,844],[430,932]])await scenario(browser,width,height);
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await page.clock.setFixedTime(utc(11,19));
    await page.goto(base+'?hero=carnival-acceptance&carnivalDay=7');
    const dlg=await carnival(page);
    assert.match(await dlg.getByRole('timer').innerText(),/Осталось/);
    assert.equal(await dlg.getByRole('tab',{name:/День 7/}).getAttribute('aria-selected'),'true');
    assert.equal(await page.evaluate(()=>localStorage.getItem('lootborn-codex-v1')),null);
    await page.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
