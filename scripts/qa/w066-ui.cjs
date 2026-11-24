const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const site=process.env.BASE_URL||'http://127.0.0.1:18791/';
const endpoint=process.env.COMMUNITY_URL||'http://127.0.0.1:18792/functions/v1/vvr-community';
const listing='11111111-1111-1111-1111-111111111111';

(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox'],
  executablePath:process.env.CHROMIUM_PATH||chromium.executablePath()});
 try{
  for(const [width,height] of [[320,568],[360,780],[390,844],[430,932]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
   try{
    await context.route('https://telegram.org/**',route=>route.abort());
    await context.addInitScript(()=>{window.Telegram={WebApp:{initData:'isolated-fixture',ready(){}}};});
    let balance=100,posted='',trade,chatPost,guild=null;
    await context.route(endpoint,async route=>{
     const request=route.request();
     const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,authorization'};
     if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
     const {action,body}=request.postDataJSON();
     assert.equal(request.headers().authorization,action==='login'?undefined:'Bearer isolated-session');
     let data;
     if(action==='login'){assert.deepEqual(body,{initData:'isolated-fixture'});data={token:'isolated-session'};}
     if(action==='auction')data={gold:balance,items:[],history:[],
      listings:balance===100?[{id:listing,catalogId:'shield',price:60,mine:false}]:[]};
     if(action==='trade'){trade=body;balance=40;data={};}
     if(action==='chat')data={moderator:false,messages:posted?[{id:1,name:'Алиса',text:posted,at:new Date().toISOString()}]:[]};
     if(action==='post'){chatPost=body;posted=body.text;data={};}
     if(action==='guild')data={directory:[],guild};
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
    await button('Меню').tap();
    await button('Сообщество').tap();
    await button('Войти через Telegram').tap();
    await button('Купить').tap();
    await button('Подтвердить покупку').tap();
    await page.getByText('Золото для торговли · 40').waitFor();
    assert.equal(trade.kind,'buy');
    assert.equal(trade.listingId,listing);
    assert.equal(Object.keys(trade).length,3);
    assert.match(trade.operationId,/^[a-f\d-]{36}$/);
    await button('Общий чат').tap();
    await page.getByRole('textbox',{name:'Сообщение'}).fill('К бою!');
    await button('Отправить').tap();
    await page.getByText(/Алиса · К бою!/).waitFor();
    assert.equal(chatPost.text,'К бою!');
    await button('Рейтинги').tap();
    await page.getByRole('heading',{name:'Северный сезон'}).waitFor();
    await page.getByText('Алиса · Вы · 70').waitFor();
    await button('Гильдии').tap();
    await page.getByRole('textbox',{name:'Название гильдии'}).fill('Северный дозор');
    await button('Создать гильдию').tap();
    await page.getByRole('heading',{name:'Северный дозор'}).waitFor();
    await page.getByText('Покинуть гильдию',{exact:true}).tap();
    await button('Подтвердить выход').tap();
    await page.getByRole('heading',{name:'Список гильдий'}).waitFor();
    assert.equal(await page.locator('.vvr-community').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
    console.log(width+' px: verified login, purchase, chat, rankings and guild UI');
   }finally{await context.close();}
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
