/** Isolated Chromium WebView scenarios for the Telegram 8.x (and older) viewport contract. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.BASE_URL||'http://localhost:5173/';

async function scenario(browser,{width,height,mode,platform}){
 const context=await browser.newContext({viewport:{width,height},screen:{width,height},isMobile:true,hasTouch:true});
 try{
  await context.route('https://telegram.org/**',route=>route.fulfill({body:'',contentType:'application/javascript'}));
  await context.addInitScript(({mode,platform})=>{
   const state=window.fullscreenQA={ready:0,expanded:0,requested:0,locked:0,unlocked:0,events:{}};
   const deliver=(id,event)=>{for(const listener of state.events[id]??[])listener(event)};
   const bridge=(window.Telegram={WebApp:{
    platform,initData:'',ready(){state.ready++},expand(){state.expanded++},
    isVersionAtLeast(v){return mode!=='old'||Number(v)<8},
    viewportStableHeight:innerHeight,isFullscreen:mode==='already',isOrientationLocked:false,
    safeAreaInset:{top:21,right:0,bottom:18,left:0},
    contentSafeAreaInset:{top:17,right:0,bottom:10,left:0},
    onEvent(id,handler){(state.events[id]??=[]).push(handler)},
    offEvent(id,handler){state.events[id]=state.events[id].filter(item=>item!==handler)},
    lockOrientation(){state.locked++;this.isOrientationLocked=true},
    unlockOrientation(){state.unlocked++;this.isOrientationLocked=false},
   }}).WebApp;
   if(mode!=='old')bridge.requestFullscreen=function(){
    state.requested++;
    if(mode==='reject'){deliver('fullscreenFailed',{error:'UNSUPPORTED'});return}
    if(mode==='silent')return;
    this.isFullscreen=true;
    deliver('fullscreenChanged');
   };
   state.emit=deliver;
  },{mode,platform});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'?hero=fullscreen-qa');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.viewport')).paddingTop==='38px');
  const status=()=>page.evaluate(()=>{
   const s=fullscreenQA;
   return [s.ready,s.expanded,s.requested,s.locked,s.unlocked];
  });
  if(mode==='silent')await page.waitForFunction(()=>fullscreenQA.expanded===1);
  const full=mode==='success'||mode==='already';
  const locked=full&&height>width?1:0;
  assert.deepEqual(await status(),[1,full?0:1,mode==='already'||mode==='old'?0:1,locked,0]);
  const checked=await page.locator('.equipment .gear').evaluateAll(tiles=>{
   const screen=document.querySelector('.viewport').getBoundingClientRect();
   return tiles.map(tile=>{
    const r=tile.getBoundingClientRect();
    return r.left>=screen.left&&r.right<=screen.right&&r.top>=screen.top+38&&r.bottom<=screen.bottom-28;
   });
  });
  assert.equal(checked.length,13);
  assert.ok(checked.every(Boolean),'all 13 equipment targets stay inside the usable area');

  const initial=await page.locator('.game').evaluate(el=>el.getBoundingClientRect().height);
  await page.evaluate(()=>{
   const mock=Telegram.WebApp;
   mock.viewportStableHeight=innerHeight-80;
   fullscreenQA.emit('viewportChanged',{isStateStable:false});
   dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(130);
  assert.equal(await page.locator('.game').evaluate(el=>el.getBoundingClientRect().height),initial);
  await page.evaluate(()=>{
   Telegram.WebApp.contentSafeAreaInset.top=23;
   fullscreenQA.emit('contentSafeAreaChanged');
   fullscreenQA.emit('viewportChanged',{isStateStable:true});
  });
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.viewport')).paddingTop==='44px');
  assert.equal(await page.locator('.viewport').evaluate(el=>el.clientHeight),height-80);

  await page.locator('.gear-armor').tap();
  await page.locator('[data-panel="gear:armor"]').waitFor();
  await page.getByRole('button',{name:'Закрыть',exact:true}).tap();
  await page.getByRole('button',{name:'Лавка',exact:true}).tap();
  const dialog=page.getByRole('dialog',{name:'Лавка сокровищ'});
  await dialog.waitFor();
  assert.ok((await dialog.boundingBox()).y>=44);
  await page.getByRole('button',{name:'Закрыть',exact:true}).tap();

  if(mode==='success'&&height>width){
   await page.getByRole('button',{name:'Начать или продолжить бой',exact:true}).tap();
   await page.getByRole('button',{name:'Остановить бой',exact:true}).waitFor();
   const setHidden=hidden=>page.evaluate(value=>{
    Object.defineProperty(document,'hidden',{value,configurable:true});
    document.dispatchEvent(new Event('visibilitychange'));
   },hidden);
   await setHidden(true);
   await page.getByRole('button',{name:'Начать или продолжить бой',exact:true}).waitFor();
   await setHidden(false);
   await page.getByRole('button',{name:'Остановить бой',exact:true}).waitFor();
   await page.evaluate(()=>{
    Telegram.WebApp.isFullscreen=false;
    fullscreenQA.emit('fullscreenChanged');
   });
   assert.deepEqual(await status(),[1,1,1,1,1],'exit unlocks portrait and never requests fullscreen again');
  }else if(mode==='old'||mode==='reject'||mode==='silent'){
   await page.evaluate(()=>fullscreenQA.emit('fullscreenFailed',{error:'UNSUPPORTED'}));
   assert.equal((await status())[1],1,'fallback only expands once');
  }
  assert.deepEqual(errors,[]);
  return {width,height,mode,platform,slots:checked.length};
 }finally{await context.close()}
}

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),args:['--no-sandbox']});
 try{
  const result=[];
  for(const fixture of [
   {width:320,height:568,mode:'old',platform:'android'},
   {width:360,height:780,mode:'reject',platform:'android'},
   {width:390,height:844,mode:'success',platform:'android'},
   {width:430,height:932,mode:'success',platform:'ios'},
   {width:390,height:844,mode:'silent',platform:'ios'},
   {width:390,height:844,mode:'already',platform:'ios'},
   {width:844,height:390,mode:'success',platform:'android'},
  ])result.push(await scenario(browser,fixture));
  console.log(JSON.stringify(result,null,2));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
