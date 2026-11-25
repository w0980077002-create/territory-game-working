const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {chromium}=require('playwright');

const site=process.env.BASE_URL||'http://127.0.0.1:18791/';
const endpoint=process.env.COMMUNITY_URL||'http://127.0.0.1:18792/functions/v1/vvr-community';
const campaign=endpoint.replace(/vvr-community\/?$/,'vvr-campaign');
const ticket='44444444-4444-8444-8444-444444444444';
const account=92031;
const initData='user='+encodeURIComponent(JSON.stringify({id:account,first_name:'Брат'}));
const key='lootborn-codex-v1:telegram:'+account;

(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox'],
  executablePath:process.env.CHROMIUM_PATH||chromium.executablePath()});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.route('https://telegram.org/**',route=>route.abort());
  const seed=JSON.parse(readFileSync('.tmp/qa/fixtures.json','utf8'))[0];
  seed.horn=require('../../config/test-balance.v1.json').horn_test_settings.maximum_charges;seed.wave=5;seed.sound=false;seed.reducedMotion=true;seed.gold=5000;seed.gems=321;
  await context.addInitScript(({initData,key,seed})=>{
   window.Telegram={WebApp:{initData,ready(){}}};
   if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));
  },{initData,key,seed});
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type, authorization'};
  await context.route(endpoint,async route=>{
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
   const {action,body}=route.request().postDataJSON();
   if(action==='referrals')return route.fulfill({json:{},headers});
   assert.equal(action,'login');
   assert.equal(body.initData,initData);
   await route.fulfill({json:{token:'campaign-browser-session'},headers});
  });
  let client,checks=0,opening,hornCharges=20,ackAttempts=0;
  const giftState=()=>({status:'ok',charges:hornCharges,pending:opening});
  await context.route(campaign,async route=>{
   const request=route.request();
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
   assert.equal(request.headers().authorization,'Bearer campaign-browser-session');
   const body=request.postDataJSON();
   if(body.action==='horn_state')return route.fulfill({json:giftState(),headers});
   if(body.action==='horn_open'){
    if(opening)assert.equal(body.operation,opening.id);
    else{
     hornCharges--;
     opening={id:body.operation,item:{...seed.equipment.weapon,id:'brotherhood-horn:'+body.operation,origin:'Рог Трофеев'}};
    }
    return route.fulfill({json:giftState(),headers});
   }
   if(body.action==='horn_ack'){
    assert.equal(body.operation,opening.id);
    ackAttempts++;
    if(ackAttempts===1)return route.fulfill({status:503,json:{},headers});
    opening=null;
    return route.fulfill({json:{status:'delivered'},headers});
   }
   if(body.action==='begin'){
    assert.equal(body.hero,'berserker');
    assert.match(body.client,/^[\da-f-]{36}$/);
    if(client)assert.equal(body.client,client);
    client=body.client;
    await route.fulfill({json:{status:'started',ticket},headers});
   }else{
    assert.equal(body.action,'replay');
    assert.equal(body.ticket,ticket);
    assert.ok(Array.isArray(body.commands));
    checks++;
    await route.fulfill({json:checks===1?{status:'retry',afterMs:6000}:{status:'verified'},headers});
   }
  });
  const page=await context.newPage();
  await page.goto(site);
  await page.getByRole('button',{name:'Скорость боя'}).click();
  const firstReplay=page.waitForRequest(request=>request.url()===campaign&&request.method()==='POST'&&request.postDataJSON().action==='replay',
   {timeout:45_000});
  await page.getByRole('button',{name:'Начать или продолжить бой'}).click();
  await firstReplay;
  const afterWin=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  assert.equal(afterWin.stage,2);
  assert.ok(afterWin.gold>=seed.gold);
  assert.ok(afterWin.gems>=seed.gems);
  await page.reload();
  await page.getByText('Победа над боссом кампании подтверждена',{exact:true}).waitFor();
  await page.waitForFunction(()=>!localStorage.getItem('vvr-first-boss-proof:92031'));
  const afterReconnect=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  assert.equal(afterReconnect.stage,afterWin.stage);
  assert.equal(afterReconnect.gems,afterWin.gems);
  assert.deepEqual(afterReconnect.equipment,afterWin.equipment);
  assert.equal(checks,2);
  const openHorn=()=>page.locator('.horn-counter').click();
  await openHorn();
  const firstAck=page.waitForResponse(response=>response.url()===campaign&&response.status()===503);
  await page.getByRole('button',{name:'Протрубить подарочным зарядом · 20'}).click();
  await firstAck;
  const itemId=opening.item.id;
  await page.reload();
  await openHorn();
  await page.getByRole('button',{name:'Протрубить подарочным зарядом · 19'}).waitFor();
  const afterGift=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  assert.equal(afterGift.horn,seed.horn);
  assert.equal(afterGift.inventory.filter(item=>item.id===itemId).length,1);
  assert.equal(afterGift.claimed.filter(id=>id===itemId).length,1);
  assert.equal(afterGift.gems,afterReconnect.gems);
  assert.equal(ackAttempts,2);
  assert.equal(hornCharges,19);
  console.log('Gift Horn: a lost acknowledgement and reload keep one item, one debit and all ordinary charges');
  console.log('Campaign boss in the normal PvE UI: Telegram session, actual victory, replay and retry after reload checked');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
