const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mkdirSync}=require('node:fs');

const site=process.env.BASE_URL||'http://127.0.0.1:18791/';
const endpoint=process.env.COMMUNITY_URL||'http://127.0.0.1:18792/functions/v1/vvr-community';
const campaign=endpoint.replace(/vvr-community\/?$/,'vvr-campaign');
const arenaOrigin=process.env.ARENA_ORIGIN||'http://127.0.0.1:18793';
const initData='user='+encodeURIComponent(JSON.stringify({id:92001,first_name:'Алиса'}))+'&start_param=ref_11111111-1111-1111-1111-111111111111';
const saveKey='lootborn-codex-v1:telegram:92001';
const listing='11111111-1111-1111-1111-111111111111';
const welcomeAward='22222222-2222-4222-8222-222222222222';
const oathAward='33333333-3333-4333-8333-333333333333';
const invitee='44444444-4444-4444-8444-444444444444';
const worldBoss='http://127.0.0.1:18794/functions/v1/vvr-world-boss';
const fullHorn=require('../../config/test-balance.v1.json').horn_test_settings.maximum_charges;
const rewards={
 welcome:{invitee:{gold:2000,gems:100,horn:20,chaosite:30,rune_scrolls:40,summon_seals:3},inviter:{gems:25}},
 level:{10:{gems:50,chaosite:20}},oath:{1:{gems:10},3:{chaosite:30},5:{summon_seals:3},7:{gems:50,relic_shards:5}},
 legend:{1:{title:'comrade',resources:{gems:50,summon_seals:5}}},
};

(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox'],
  executablePath:process.env.CHROMIUM_PATH||chromium.executablePath()});
 try{
  for(const [width,height] of [[320,568],[360,780],[390,844],[430,932]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
   try{
    await context.route('https://telegram.org/**',route=>route.abort());
    const seed=require('./ui-fixture.cjs')(1,true);
    seed.horn=fullHorn;
    await context.addInitScript(({initData,saveKey,seed})=>{
     window.Telegram={WebApp:{initData,ready(){},openTelegramLink(link){window.sharedBrotherhood=link;}}};
     if(!localStorage.getItem(saveKey))localStorage.setItem(saveKey,JSON.stringify(seed));
    },{initData,saveKey,seed});
    await context.route(worldBoss,async route=>{
     const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type'};
     if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
     assert.equal(route.request().postDataJSON().initData,initData);
     await route.fulfill({json:{serverNow:new Date().toISOString(),event:null,history:[],mail:[],isAdmin:true},headers});
    });
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
    let loginCalls=0,referrals=[],referralReads=0,attempts=0,sentEnabled;
    let enabled=true,days=0,awards=[],wallet={};
    let pendingGift,soloDebits=0,soloAcks=0;
    await context.route(campaign,async route=>{
     const request=route.request();
     const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,authorization'};
     if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
     assert.equal(request.headers().authorization,'Bearer isolated-session');
     const {action,operation}=request.postDataJSON();
     if(action==='solo_open'&&!pendingGift&&soloDebits===0){
      soloDebits++;
      const {horn,...resources}=wallet;
      wallet={horn};
      pendingGift={id:operation,item:{id:'brotherhood-solo:'+operation,resources}};
     }
     if(action==='solo_ack'){
      assert.equal(operation,pendingGift.id);
      soloAcks++;
      if(soloAcks===1)return route.fulfill({status:503,headers,json:{}});
      pendingGift=null;
      return route.fulfill({headers,json:{status:'delivered'}});
     }
     if(action==='solo_state'||action==='solo_open'){
      const {horn:_,...available}=wallet;
      return route.fulfill({headers,json:{status:'ok',available,wallet,pending:pendingGift??null}});
     }
     return route.fulfill({headers,json:{status:'ineligible'}});
    });
    let balance=100,posted='',trade,chatPost,guild=null,claimed=false,equipped=null,enhanced=false;
    await context.route(endpoint,async route=>{
     const request=route.request();
     const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,authorization'};
     if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
     const {action,body}=request.postDataJSON();
     assert.equal(request.headers().authorization,action==='login'?undefined:'Bearer isolated-session');
     let data;
     if(action==='login'){loginCalls++;assert.deepEqual(body,{initData});data={token:'isolated-session'};}
     if(action==='referrals'){
      referralReads++;
      assert.deepEqual(body,{});
      data={startParam:'ref_'+listing,rows:referrals,next:null,brotherhood:{
       enabled,rewards,invited:referrals.length,active:referrals.length,wallet,
       incoming:{id:invitee,inviterId:listing,name:'Пригласивший игрок',days,active:days>0,awards},
       outgoing:referrals.map(row=>({id:row.id,inviterId:listing,name:row.name,active:true,days:3,awards:[]})),
      }};
     }
     if(action==='brotherhood_claim'){
      assert.deepEqual(body,{award:welcomeAward});
      attempts++;
      wallet={...rewards.welcome.invitee};
      awards=awards.map(award=>award.id===welcomeAward?{...award,received:true}:award);
      if(attempts===1){await route.fulfill({status:503,json:{},headers});return;}
      data={status:'received',wallet};
     }
     if(action==='brotherhood_admin'){
      if(body.enabled!==undefined){sentEnabled=body.enabled;enabled=body.enabled;}
      data={enabled,invited:2,active:2,tiers:{'oath:1':1},issued:{gems:125},rejections:{self_referral:1}};
     }
     if(action==='auction')data={gold:balance,
      equipment:{attack:equipped?enhanced?111:110:100,equipped,enhancements:{[listing]:{rank:enhanced?1:0,cost:enhanced?130:100}}},
      items:balance!==100?[{id:listing,catalogId:'world-boss-trophy'}]:[],history:[],
      listings:balance===100?[{id:listing,catalogId:'world-boss-trophy',price:60,mine:false}]:[]};
     if(action==='trade'){trade=body;balance=40;data={};}
     if(action==='equip'){
      assert.deepEqual(body,{item:listing});
      equipped=body.item;balance=140;data={attack:110,equipped};
     }
     if(action==='enhance'){
      assert.equal(body.item,listing);assert.equal(body.expectedRank,0);
      assert.match(body.operationId,/^[a-f\d-]{36}$/);
      enhanced=true;balance-=100;data={rank:1};
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
    await context.route(endpoint+'/backup',async route=>{
     const req=route.request();
     const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,authorization'};
     if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
     assert.equal(req.headers().authorization,'Bearer isolated-session');
     assert.deepEqual(req.postDataJSON(),{previous:false});
     await route.fulfill({json:null,headers});
    });
    let roomPolls=0, battleCalls=0, arenaMode='team', teamChat='', conflictCommand;
    await context.route(endpoint.replace(/vvr-community$/,'vvr-arena'),async route=>{
     const req=route.request();
     const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,authorization'};
     if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
     assert.equal(req.headers().authorization,'Bearer isolated-session');
     const data=req.postDataJSON();
     const players=Array.from({length:arenaMode==='team'?6:40},(_,i)=>({
      id:i?'fighter-'+i:listing,hero:i?'berserker':'ranger',name:i?'Боец '+i:'Алиса',side:i%2,hp:100,maxHp:100,damage:0,kills:0,
     }));
     if(data.action==='join'){arenaMode=data.mode;roomPolls=0;}
     if(data.action==='command'){
      if(data.command.kind==='strike'&&battleCalls===0){
       if(!conflictCommand){
        conflictCommand=data.command;
        await route.fulfill({status:409,json:{error:'arena_room_changed'},headers});return;
       }
       assert.deepEqual(data.command,conflictCommand);
      }
      battleCalls++;
      if(data.command.kind==='chat')teamChat=data.command.text;
     }
     const view=data.action==='join'||data.action==='room'&&++roomPolls<2?
      {id:listing,mode:arenaMode,closesAt:new Date(Date.now()+20_000).toISOString(),queued:1,roster:[{id:listing,name:'Алиса'}]}:
      {id:listing,mode:arenaMode,training:false,sideDeadline:[Date.now()+60_000,Date.now()+60_000],chatDeadline:null,
       players,log:[],chat:teamChat?[{id:1,text:teamChat,author:'Алиса'}]:[],you:{
        id:listing,side:0,auto:false,belt:{heal_small:2,heal_large:1,attack:1,defense:1,crit:1,time:1,adrenaline:0},
        itemReadyAt:{},nextStrikeAt:0,nextSequence:battleCalls+1,
       }};
     const result=data.action==='podium'?{points:10,wins:10,teamLosses:2,rows:[
      {rank:1,name:'Алиса',points:10,mine:true},{rank:2,name:'Бьёрн',points:2},{rank:3,name:'Ивар',points:1},
     ]}:data.action==='current'?null:{accepted:true,view};
     await route.fulfill({json:result,headers});
    });
    const page=await context.newPage();
    page.setDefaultTimeout(10000);
    await page.goto(site);
    const button=name=>page.getByRole('button',{name,exact:true});
    // Inside Telegram the community windows join the existing session on their own: no manual sign-in tap.
    const signedIn=()=>page.getByRole('region',{name:'Вход в сообщество'}).waitFor({state:'detached',timeout:8000});
    const openMenu=async()=>{
     await button('Меню').click();
     await page.getByRole('dialog',{name:'Меню',exact:true}).waitFor();
    };
    await page.waitForFunction(()=>document.querySelector('.viewport'));
    await page.evaluate(()=>{
     Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{
      window.copiedReferral=value;
     }}});
    });
    const invite=page.getByRole('dialog',{name:'Приглашение'});
    const chest=invite.getByRole('region',{name:'Дар братства'});
    await chest.getByRole('heading',{name:'Дар братства'}).waitFor();
    await chest.getByText('Вас пригласил игрок · Пригласивший игрок',{exact:true}).waitFor();
    await chest.getByText('2000',{exact:true}).waitFor();
    await chest.getByText('Сундук открывается после подтверждённой победы над первым боссом кампании.').waitFor();
    assert.equal(await chest.getByRole('button',{name:'Получить',exact:true}).count(),0);
    const expectedLink='https://t.me/VikingRomeGame?startapp=ref_'+listing;
    await invite.getByRole('button',{name:'Пригласить друга'}).click();
    const shared=new URL(await (await page.waitForFunction(()=>window.sharedBrotherhood)).jsonValue());
    assert.equal(shared.searchParams.get('url'),expectedLink);
    assert.match(shared.searchParams.get('text'),/бои Арены.*задания гильдии.*оба получим награды/);
    const beforeCopy=referralReads;
    await invite.getByRole('button',{name:'Скопировать личную ссылку'}).click();
    assert.equal(await page.evaluate(()=>window.copiedReferral),expectedLink);
    assert.equal(loginCalls,1);
    assert.equal(referralReads,beforeCopy,'copying does not change referral state');
    await page.evaluate(()=>{navigator.clipboard.writeText=()=>Promise.reject(new Error('Clipboard disabled'));});
    await invite.getByRole('button',{name:'Скопировать личную ссылку'}).click();
    assert.equal(await invite.getByRole('textbox',{name:'Адрес для копирования'}).inputValue(),expectedLink);
    const fits=dialog=>dialog.locator('.modal-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1);
    assert.equal(await fits(invite),true);
    days=1;
    awards=[
     {id:welcomeAward,kind:'welcome',tier:1,payload:rewards.welcome.invitee,received:false},
     {id:oathAward,kind:'oath',tier:1,payload:rewards.oath[1],received:false},
    ];
    const storedSave=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),saveKey);
    const beforeReward=await storedSave();
    assert.equal(beforeReward.horn,fullHorn);
    await page.reload();
    await button('Приглашение').click();
    const claimChest=chest.getByRole('button',{name:'Получить',exact:true});
    await claimChest.click();
    await invite.getByText('Не удалось получить награду · попробуйте ещё раз',{exact:true}).waitFor();
    await claimChest.click();
    await chest.getByText('Получено',{exact:true}).waitFor();
    assert.equal(attempts,2);
    for(const field of ['gold','gems','chaosite','horn','level','inventory'])
     assert.deepEqual((await storedSave())[field],beforeReward[field],'Solo ' + field + ' is independent of W066 claims');
    await invite.getByText('Сетевой кошелёк',{exact:true}).click();
    await invite.getByText('Подарочные заряды хранятся в сетевом кошельке даже при полном Роге. Подарочным зарядом можно протрубить в Роге Трофеев.').waitFor();
    await invite.getByRole('button',{name:'Перенести подарки в Solo'}).click();
    await invite.getByRole('button',{name:'Проверить перенос подарков'}).waitFor();
    const receipt=pendingGift.item.id;
    await page.reload();
    await button('Приглашение').click();
    await chest.getByText('Получено',{exact:true}).waitFor();
    await invite.getByText('Сетевой кошелёк',{exact:true}).click();
    await page.waitForFunction(key=>localStorage.getItem(key)===null,'vvr-gift-solo:92001');
    const afterGift=await storedSave();
    assert.equal(soloDebits,1);
    assert.equal(soloAcks,2);
    assert.equal(afterGift.claimed.filter(id=>id===receipt).length,1);
    assert.equal(afterGift.gold-beforeReward.gold,rewards.welcome.invitee.gold);
    assert.equal(afterGift.gems-beforeReward.gems,rewards.welcome.invitee.gems);
    assert.equal(afterGift.chaosite-beforeReward.chaosite,rewards.welcome.invitee.chaosite);
    assert.equal((afterGift.saga?.n['solo:scroll']??0)-(beforeReward.saga?.n['solo:scroll']??0),40);
    assert.equal((afterGift.saga?.n['res:seal']??0)-(beforeReward.saga?.n['res:seal']??0),3);
    assert.equal(afterGift.horn,fullHorn);
    for(const field of ['level','xp','stage','wave','inventory','equipment']){
     assert.deepEqual(afterGift[field],beforeReward[field],'Solo '+field+' survives the gift transfer');
    }
    await invite.getByRole('button',{name:'Друзья'}).click();
    const friends=page.getByRole('dialog',{name:'Друзья'});
    await friends.getByText('Подтверждённых приглашений пока нет.',{exact:true}).waitFor();
    referrals=[
     {id:'friend-a',name:'Новый игрок',status:'confirmed'},
     {id:'friend-b',name:'ДругИзTelegram'.repeat(5),status:'rewarded'},
    ];
    await friends.getByRole('button',{name:'Обновить'}).click();
    await friends.getByText('Приглашение подтверждено',{exact:true}).waitFor();
    await friends.getByText('Награда начислена',{exact:true}).waitFor();
    await friends.getByText('Приглашено · 2 · Активных друзей · 2',{exact:true}).waitFor();
    await friends.getByText('Совместных дней · 3 / 7',{exact:true}).first().click();
    await friends.getByText('Ближайшая награда · Совместных дней · 5',{exact:true}).filter({visible:true}).waitFor();
    assert.equal(await fits(friends),true);
    await friends.getByRole('button',{name:'Закрыть'}).click();
    await openMenu();
    await button('Сохранение и восстановление').click();
    const backup=page.getByRole('dialog',{name:'Сохранение и восстановление'});
    await backup.getByRole('button',{name:'Открыть облачную копию'}).click();
    await backup.getByText('Облачной копии пока нет',{exact:true}).waitFor();
    await backup.getByRole('button',{name:'Сохранить в облаке'}).waitFor();
    assert.equal(await fits(backup),true);
    await backup.getByRole('button',{name:'Закрыть'}).click();
    if(width===430){
     await button('Приключения').click();
     await page.getByRole('button',{name:/^Мировой босс/}).click();
     await button('Админ').click();
     await button('Обновить статистику братства').click();
     await page.getByText('Начисленные ресурсы',{exact:true}).waitFor();
     await button('Приостановить выдачу').click();
     await page.getByText('Выдача приостановлена',{exact:true}).waitFor();
     assert.equal(sentEnabled,false);
     await button('Возобновить выдачу').click();
     await page.getByText('Выдача включена',{exact:true}).waitFor();
     assert.equal(sentEnabled,true);
     await button('Закрыть').click();
    }

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
    await signedIn();
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
    await button('Усилить · 100 золота').tap();
    await page.getByText('Сила атаки героя · 111',{exact:true}).waitFor();
    await button('Торговый чат').tap();
    await page.getByRole('textbox',{name:'Сообщение'}).fill('К бою!');
    await button('Отправить').tap();
    await page.getByText(/Алиса · К бою!/).waitFor();
    assert.equal(chatPost.text,'К бою!');
    await previous().click();
    await button('Рейтинги').tap();
    await signedIn();
    await page.getByRole('heading',{name:'Северный сезон'}).waitFor();
    await page.getByText('Алиса · Вы · 70').waitFor();
    await previous().click();
    await button('Гильдии').tap();
    await signedIn();
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
    const hub=page.getByRole('region',{name:'Арена',exact:true});
    await hub.getByRole('heading',{name:'ТОП-50 Арены'}).waitFor();
    await hub.getByText('Бьёрн',{exact:true}).waitFor();
    await button('Правила Арены').tap();
    await hub.getByText(/Сетевые бои не расходуют энергию/).waitFor();
    await button('Правила Арены').tap();
    const screenshots='.tmp/window-qa/online-arena/';
    mkdirSync(screenshots,{recursive:true});
    await hub.screenshot({path:screenshots+'lobby-'+width+'.png'});
    await button(/Отряд.*3×3/).tap();
    await hub.getByText('Участники · 1/6',{exact:true}).waitFor();
    const battle=hub.getByRole('region',{name:'Арена 3×3'});
    await battle.getByText('Бой игроков · 3×3',{exact:true}).waitFor();
    const guards=battle.getByRole('group',{name:'Защита · 2 зоны'});
    await guards.getByRole('button',{name:'Грудь'}).tap();
    await guards.getByRole('button',{name:'Ноги'}).tap();
    await battle.getByRole('button',{name:'Ударить'}).tap();
    await battle.getByRole('button',{name:'Ударить'}).waitFor();
    await battle.getByRole('button',{name:'Только чат'}).tap();
    const chatInput=battle.getByRole('textbox',{name:'Сообщение'});
    assert.ok((await chatInput.boundingBox()).width>=70,'chat input must remain usable on a compact phone');
    await chatInput.fill('Держим строй!');
    await battle.getByRole('button',{name:'Отправить'}).tap();
    await battle.getByText(/Держим строй!/).waitFor();
    assert.equal(await battle.locator('.vvr-arena-belt button').count(),7);
    const widthFits=await battle.evaluate(node=>node.scrollWidth<=node.clientWidth+2);
    assert.ok(widthFits,'compact battle controls fit the mobile viewport');
    await battle.locator('.vvr-battle-stage').scrollIntoViewIfNeeded();
    await page.screenshot({path:screenshots+'team-'+width+'.png'});
    await button('‹ Арена').tap();
    await button(/Хаос.*20×20/).tap();
    await hub.getByText('Участники · 1/40',{exact:true}).waitFor();
    await hub.getByText('Бой игроков · 20×20',{exact:true}).waitFor();
    await button('‹ Арена').tap();
    await button(/Дуэль.*1×1/).tap();
    await button('Войти через Telegram').click();
    await button('Найти соперника').waitFor();
    await page.reload();
    await button('Арена').tap();
    await button(/Дуэль.*1×1/).tap();
    await button('Найти соперника').waitFor();
    if(width===430){
     await page.evaluate(()=>localStorage.setItem('vvr-lang','en'));
     await page.reload();
     await button('Invite').tap();
     await button('Copy personal link').waitFor();
     await button('Invite a friend').waitFor();
     await page.getByRole('heading',{name:'Gift of Brotherhood',exact:true}).waitFor();
     await page.getByRole('heading',{name:'Oath of Brotherhood',exact:true}).waitFor();
     await button('Friends').tap();
     await page.getByText('Invitation confirmed',{exact:true}).waitFor();
     await page.getByText('Reward credited',{exact:true}).waitFor();
     await button('Close').tap();
     await button('Menu').click();
     await button('Save & Restore').click();
     await button('Open cloud backup').tap();
     await page.getByText('There is no cloud backup yet',{exact:true}).waitFor();
     await button('Save to cloud').waitFor();
    }
    console.log(width+' px: verified invitations, cloud copies, Arena, Solo save, trade chat, rankings and guilds');
   }finally{await context.close();}
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
