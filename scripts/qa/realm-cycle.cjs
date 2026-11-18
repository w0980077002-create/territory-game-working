/** Actual combat in an isolated local profile. Recording uses accelerated simulation, never HP/damage edits. */
const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const base=process.env.BASE_URL||'http://localhost:5173/';
const out='docs/qa/issue-32';fs.mkdirSync(out,{recursive:true});
const fixture=JSON.parse(fs.readFileSync('.tmp/qa/realm-player.json'));
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const report=[];
 try{
 for(const width of (process.env.WIDTH?[Number(process.env.WIDTH)]:[390,320,360,430])){
 const context=await browser.newContext({viewport:{width,height:width===430?600:844},locale:width===360?'en-US':'ru-RU',recordVideo:width===390?{dir:out,size:{width:390,height:844}}:undefined});
 await context.addInitScript(profile=>{const key='lootborn-codex-v1:test:issue32';if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(profile))},fixture);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'?testProfile=issue32');await page.waitForFunction(async()=>!!(await import('/src/game/Battle.ts')).battle);await page.waitForLoadState('networkidle');await page.waitForTimeout(300);
 await page.getByRole('button',{name:'приключение',exact:true}).click();await page.locator('.row').filter({hasText:'Царство тьмы'}).getByRole('button',{name:'Открыть',exact:true}).click();await page.screenshot({path:`${out}/${width}-entry.png`});await page.getByRole('button',{name:/Вызов/}).click();
 await page.waitForFunction(async()=>(await import('/src/game/Battle.ts')).battle?.realmScenery.ready());let choices=0,steps=0,bossCaptured=false;
 while(steps++<1500){
 const state=await page.evaluate(async captured=>{const {battle:b}=await import('/src/game/Battle.ts');const {useGame:g}=await import('/src/core/store.ts');const {realmRun,realmLast}=await import('/src/dark/realm.ts');const bossStage=realmRun(g.getState().p)?.stage==='FINAL_BOSS';for(let i=0;i<(bossStage?1:30)&&!b.realmWaiting()&&!g.getState().panel;i++){b.update(.05);if(bossStage&&!captured&&b.phase==='fight'){b.pause();break}}b.draw();return {run:realmRun(g.getState().p),last:realmLast(g.getState().p),phase:b.phase,hp:b.hp,mode:b.mode,running:b.running,panel:g.getState().panel,floor:g.getState().p.darkFloor,gold:g.getState().p.gold,gems:g.getState().p.gems}},bossCaptured);
 if(state.run){assert.equal(state.gold,fixture.gold,'no gold before claim');assert.equal(state.gems,fixture.gems,'no gems before claim')}
 if(state.run?.stage==='FINAL_BOSS'&&state.phase==='fight'&&!bossCaptured){bossCaptured=true;await page.screenshot({path:`${out}/${width}-boss.png`});await page.waitForTimeout(250);await page.evaluate(async()=>(await import('/src/game/Battle.ts')).battle.toggle());state.running=true}
 if(steps%100===0)console.log({width,steps,state});
 if(state.run?.stage.startsWith('CHOICE')){
  choices++;assert.equal(state.run.stage,`CHOICE_${choices}`);
  await page.screenshot({path:`${out}/${width}-choice-${choices}.png`});
  if(choices===1){
   const pair=state.run.pair;await page.reload();await page.waitForFunction(async()=>!!(await import('/src/game/Battle.ts')).battle);await page.waitForLoadState('networkidle');await page.waitForFunction(async()=>(await import('/src/game/Battle.ts')).battle?.realmScenery.ready());
   const restored=await page.evaluate(async()=>{const {battle:b}=await import('/src/game/Battle.ts');const {useGame:g}=await import('/src/core/store.ts');return {running:b.running,run:g.getState().p.saga.box.realm.run}});assert.equal(restored.running,false);assert.deepEqual(restored.run.pair,pair);
   await page.evaluate(async()=>{(await import('/src/game/Battle.ts')).battle.toggle()});
  }
  const rect=await page.locator('canvas').boundingBox();await page.mouse.click(rect.x+470/864*rect.width,rect.y+690/940*rect.height);await page.mouse.click(rect.x+470/864*rect.width,rect.y+690/940*rect.height);
  await page.waitForTimeout(120);continue;
 }
 if(state.last&&!state.last.ack){assert.equal(state.last.win,true,JSON.stringify(state));assert.equal(state.floor,1);await page.waitForTimeout(250);await page.screenshot({path:`${out}/${width}-win-pending.png`});break}
 if(!state.running)throw Error('Stopped unexpectedly: '+JSON.stringify(state));
 if(width===390)await page.waitForTimeout(30);
 }
 assert.ok(steps<1500);assert.equal(choices,4);
 await page.getByRole('button',{name:'Забрать',exact:true}).click();
 const claimed=await page.evaluate(async()=>{const {useGame:g}=await import('/src/core/store.ts');return g.getState().p});assert.equal(claimed.darkFloor,2);assert.equal(claimed.chaosite,fixture.chaosite-5);assert.equal(claimed.stage,fixture.stage);assert.equal(claimed.wave,fixture.wave);
 await page.reload();await page.waitForFunction(async()=>!!(await import('/src/game/Battle.ts')).battle);await page.waitForLoadState('networkidle');await page.evaluate(async()=>{(await import('/src/core/store.ts')).useGame.getState().open('realm')});await page.waitForTimeout(300);assert.equal(await page.getByRole('button',{name:'Забрать',exact:true}).count(),0);
 await page.screenshot({path:`${out}/${width}-claimed.png`});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight),false);
 assert.deepEqual(errors,[]);
 report.push({width,height:width===430?600:844,locale:width===360?'en-US':'ru-RU',choices,naturalCombat:true,reloadChoice:true,doubleTap:true,claim:true,errors});
 const video=page.video();await context.close();if(video)await video.saveAs(`${out}/victory.webm`);
 }
 // Natural defeat of the unmodified starter hero against an unlocked late floor.
 const context=await browser.newContext({viewport:{width:390,height:844},recordVideo:{dir:out,size:{width:390,height:844}}});const page=await context.newPage();await page.goto(base+'?testProfile=issue32-defeat');await page.waitForFunction(async()=>!!(await import('/src/game/Battle.ts')).battle);
 await page.evaluate(async()=>{const {useGame:g}=await import('/src/core/store.ts');g.getState().mutate(p=>{p.darkFloor=20;p.chaosite=100;p.sound=false});g.getState().open('realm')});await page.getByRole('button',{name:/Вызов/}).click();
 for(let i=0;i<300;i++){const done=await page.evaluate(async()=>{const {battle:b}=await import('/src/game/Battle.ts');for(let i=0;i<15&&b.running;i++)b.update(.05);b.draw();return b.phase==='defeat'});await page.waitForTimeout(35);if(done)break}
 await page.getByText('ПОРАЖЕНИЕ',{exact:true}).waitFor();await page.screenshot({path:out+'/defeat.png'});
 await page.getByRole('button',{name:'Забрать и к этажам',exact:true}).click();const video=page.video();await context.close();await video.saveAs(`${out}/defeat.webm`);
 }finally{await browser.close();const previous=process.env.WIDTH&&fs.existsSync(`${out}/results.json`)?JSON.parse(fs.readFileSync(`${out}/results.json`)):[];fs.writeFileSync(`${out}/results.json`,JSON.stringify([...previous.filter(r=>!report.some(n=>n.width===r.width)),...report],null,2))}
 console.log(report);
})().catch(e=>{console.error(e);process.exitCode=1});
