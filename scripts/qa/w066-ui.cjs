const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const site=process.env.BASE_URL||'http://127.0.0.1:18791/';
const endpoint=process.env.COMMUNITY_URL||'http://127.0.0.1:18792/functions/v1/vvr-community';
const arenaOrigin=process.env.ARENA_ORIGIN||'http://127.0.0.1:18793';
const initData='user='+encodeURIComponent(JSON.stringify({id:92001,first_name:'Алиса'}));
const saveKey='lootborn-codex-v1:telegram:92001';
const listing='11111111-1111-1111-1111-111111111111';

(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox'],
  executablePath:process.env.CHROMIUM_PATH||chromium.executablePath()});
 try{
  for(const [width,height] of [[320,568],[360,780],[390,844],[430,932]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
   try{
    await context.route('https://telegram.org/**',route=>route.abort());
    await context.addInitScript(initData=>{window.Telegram={WebApp:{initData,ready(){}}};},initData);
    await context.route(arenaOrigin+'/arena-api/**',async route=>{
     const request=route.request();
     const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,authorization,x-arena-tab'};
     if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
     if(request.url().endsWith('/auth')){
      assert.deepEqual(request.postDataJSON(),{initData});
      await route.fulfill({json:{token:'arena-fixture-session'},headers});return;
     }
     assert.equal(request.headers().authorization,'Bearer arena-fixture-session');
     await route.fulfill({json:{now:Date.now(),points:0,level:1},headers});
    });
    let balance=100,posted='',trade,chatPost,guild=null,claimed=false,equipped=null;
    await context.route(endpoint,async route=>{
     const request=route.request();
     const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,authorization'};
     if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
     const {action,body}=request.postDataJSON();
     assert.equal(request.headers().authorization,action==='login'?undefined:'Bearer isolated-session');
     let data;
     if(action==='login'){assert.deepEqual(body,{initData});data={token:'isolated-session'};}
     if(action==='auction')data={gold:balance,
      equipment:{attack:equipped?110:100,equipped},
      items:balance===40?[{id:listing,catalogId:'world-boss-trophy'}]:[],history:[],
      listings:balance===100?[{id:listing,catalogId:'world-boss-trophy',price:60,mine:false}]:[]};
     if(action==='trade'){trade=body;balance=40;data={};}
     if(action==='equip'){
      assert.deepEqual(body,{item:listing});
      equipped=body.item;data={attack:110,equipped};
     }
     if(action==='chat')data={moderator:false,messages:posted?[{id:1,name:'Алиса',text:posted,at:new Date().toISOString()}]:[]};
     if(action==='post'){chatPost=body;posted=body.text;data={};}
     if(action==='guild')data={directory:[],guild,quests:guild?[{
      id:listing,name:'Общая битва',damage:200,target:200,gold:50,canClaim:!claimed,claimed,
     }]:[]};
     if(action==='guild_boss_claim'){
      assert.deepEqual(body,{eventId:listing});
      claimed=true;data={firstClaim:true};
     }
     if(action==='guild_roster'){
      if(body.kind==='create')guild={id:listing,name:body.name,role:'leader',members:[{name:'Алиса',role:'leader'}],applications:[]};
      if(body.kind==='leave')guild=null;
      data={directory:[],guild};
     }
     if(action==='ranking')data={season:{name:'Северный сезон'},seasons:[],rows:[{rank:1,name:'Алиса',points:70,mine:true}]};
     await route.fulfill({json:data,headers});
    });
    const page=await context.newPage();
    page.setDefaultTimeout(10000);
    await page.goto(site);
    const button=name=>page.getByRole('button',{name,exact:true});
    const openMenu=async()=>{await button('Меню').tap();};
    const previous=()=>page.getByRole('button',{name:/Назад/}).first();
    await openMenu();
    await page.getByRole('button',{name:/^Звук:/}).tap();
    const readSave=()=>page.evaluate(key=>{
     const raw=localStorage.getItem(key);
     return raw&&JSON.parse(raw);
    },saveKey);
    const saved=await readSave();
    assert.ok(saved,'public Arena still uses the Telegram Solo save slot');
    await button('Аукцион').tap();
    await button('Войти через Telegram').click();
    await button('Купить').tap();
    await button('Подтвердить покупку').tap();
    await page.getByText('Золото для торговли · 40').waitFor();
    assert.equal(trade.kind,'buy');
    assert.equal(trade.listingId,listing);
    assert.equal(Object.keys(trade).length,3);
    assert.match(trade.operationId,/^[a-f\d-]{36}$/);
    await page.getByText('Серверная экипировка',{exact:true}).tap();
    await button('Надеть').tap();
    await page.getByText('Сила атаки героя · 110',{exact:true}).waitFor();
    await button('Торговый чат').tap();
    await page.getByRole('textbox',{name:'Сообщение'}).fill('К бою!');
    await button('Отправить').tap();
    await page.getByText(/Алиса · К бою!/).waitFor();
    assert.equal(chatPost.text,'К бою!');
    await previous().click();
    await button('Рейтинги').tap();
    await button('Войти через Telegram').click();
    await page.getByRole('heading',{name:'Северный сезон'}).waitFor();
    await page.getByText('Алиса · Вы · 70').waitFor();
    await previous().click();
    await button('Гильдии').tap();
    await button('Войти через Telegram').click();
    assert.equal(await button('Торговый чат').count(),0);
    await page.getByRole('textbox',{name:'Название гильдии'}).fill('Северный дозор');
    await button('Создать гильдию').click();
    await page.getByRole('heading',{name:'Северный дозор'}).waitFor();
    await page.getByRole('heading',{name:'Задания гильдии'}).waitFor();
    await button('Получить награду').tap();
    await page.getByText('Награда получена',{exact:true}).waitFor();
    await page.getByText('Покинуть гильдию',{exact:true}).tap();
    await button('Подтвердить выход').tap();
    await page.getByRole('heading',{name:'Список гильдий'}).waitFor();
    assert.equal(await page.locator('.vvr-community').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
    await page.reload();
    const reopened=await readSave();
    for(const key of ['level','stage','gold','sound'])assert.equal(reopened[key],saved[key],key);
    assert.equal(await page.evaluate(()=>localStorage.getItem('lootborn-arena-staging-v1')),null);
    await button('Магазин').tap();
    await button('Аукцион').tap();
    await page.getByRole('dialog',{name:'Аукцион'}).waitFor();
    await page.reload();
    await button('Приключения').tap();
    await page.getByRole('button',{name:/^Гильдии/}).tap();
    await page.getByRole('dialog',{name:'Гильдии'}).waitFor();
    await previous().click();
    await page.getByRole('dialog',{name:'Приключения'}).getByRole('button',{name:/^Арена/}).tap();
    assert.equal(await page.locator('details:has-text("Одиночный поединок")').getAttribute('open'),null);
    await button('Войти через Telegram').click();
    await button('Найти соперника').waitFor();
    await page.reload();
    await button('Арена').tap();
    await button('Найти соперника').waitFor();
    console.log(width+' px: verified Pages Arena connection, Solo save, auction, trade chat, rankings and guilds');
   }finally{await context.close();}
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
