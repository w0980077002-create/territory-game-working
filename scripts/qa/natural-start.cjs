/* Natural new-player acceptance: a fresh isolated hero (?hero=natural-*) plays with real taps only.
 * No state is injected: every victory, level, coin, material and item comes from the game itself.
 * npm run dev; node scripts/qa/natural-start.cjs   (WIDTHS=320,360,390,430 STAGES=3 OUT=.tmp/natural)
 * Path: start → 4 encounters + boss ×STAGES → trophy → compare → equip (double tap) → salvage → forge
 * upgrade (double tap) → skill + level-up + quest + daily gift → summon → panel close never starts a
 * paused fight → Dark Realm 7 → 4 portal pairs → boss → «Забрать» → floor list → reload keeps everything.
 */
const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
const base=process.env.BASE_URL||'http://localhost:5173/',out=process.env.OUT||'.tmp/natural';fs.mkdirSync(out,{recursive:true});
const widths=(process.env.WIDTHS||'390').split(',').map(Number),stages=+(process.env.STAGES||3);
const heights={320:568,360:740,390:844,430:932};
(async()=>{
 const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 for(const W of widths){
  const c=await b.newContext({viewport:{width:W,height:heights[W]||844},isMobile:true,hasTouch:true});
  const page=await c.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const log=(...a)=>console.log(`[${W}]`,...a);
  const boot=async()=>{await page.waitForFunction(()=>window.__lootborn);await page.waitForTimeout(600)};
  const st=()=>page.evaluate(()=>{const g=window.__lootborn.useGame.getState(),p=g.p;return {darkFloor:p.darkFloor,stage:p.stage,wave:p.wave,level:p.level,xp:p.xp,gold:p.gold,gems:p.gems,tokens:p.tokens,horn:p.horn,mission:p.mission,bosses:p.bosses,
   inv:p.inventory.map(i=>i.id),eq:Object.fromEntries(Object.entries(p.equipment).map(([k,v])=>[k,v?v.id+'+'+v.upgrade:null])),skills:[...p.skills],companions:[...p.companions],
   offer:p.rewardOffer,panel:g.panel,phase:g.battle.phase,running:g.battle.running,toast:g.toast,seals:p.saga?.sum?.seals??p.saga?.seals,saga:p.saga}});
  const cp=()=>page.evaluate(()=>{const t=document.body.innerText.match(/♨\s*(\d[\d   ]*)/);return t?+t[1].replace(/\D/g,''):0});
  const until=async(fn,ms,what)=>{for(let t=0;t<ms;t+=500){const s=await st();if(fn(s))return s;await page.waitForTimeout(500)}throw Error(`[${W}] timeout: ${what}`)};
  const tap=async(name,opt={})=>{const l=page.getByRole('button',{name,exact:opt.exact??true}).first();await l.waitFor({state:'visible',timeout:8000});await l.tap();await page.waitForTimeout(opt.wait??450)};
  const closeAll=async()=>{for(let i=0;i<5&&(await st()).panel;i++){const card=page.getByRole('button',{name:'Закрыть карточку',exact:true});const x=await card.count()?card.last():page.getByRole('button',{name:'Закрыть',exact:true}).last();if(await x.count())await x.tap();await page.waitForTimeout(350)}};
  await page.goto(base+'?hero=natural-'+W+'-'+Date.now().toString(36));await boot();
  let s=await st();assert.equal(s.stage,1);assert.equal(s.level,1);assert.deepEqual(s.inv,[],'a new hero starts with an empty backpack');
  assert.equal(s.running,false,'nothing runs before the first tap');
  // 1. First tap: the axes start the march; x2 through the real speed button.
  await tap('Скорость боя');await page.locator('button.central').tap();
  s=await until(s=>s.running,5000,'axes start');
  const first=await until(s=>s.stage===2,240000,'boss 1-1');log('boss 1-1 down · level',first.level,'gold',first.gold,'backpack',first.inv.length);
  assert.ok(first.bosses===1&&first.level>1&&first.offer,'boss victory pays XP and a trophy');
  // 2. The trophy is kept (auto-continue) and the weapon slot shows a real upgrade marker.
  s=await until(s=>s.offer?.resolved,15000,'trophy kept');assert.ok(s.inv.includes(s.offer.itemId),'trophy stored in the backpack');
  const trophy=s.offer.itemId;
  // 3. Open the weapon slot mid-march: the card pauses the fight and compares stats.
  await page.getByRole('button',{name:/^Оружие уровень .*сильнее/}).tap();await page.waitForTimeout(500);
  s=await st();assert.equal(s.panel,'gear:weapon');assert.equal(s.running,false,'a window pauses the march');
  assert.match(await page.locator('body').innerText(),/ЛУЧШАЯ ЗАМЕНА/);
  const cp0=await cp(),oldWeapon=s.eq.weapon.split('+')[0];
  await page.getByRole('button',{name:'Надеть',exact:true}).first().dblclick();await page.waitForTimeout(500);
  s=await st();assert.equal(s.eq.weapon.split('+')[0],trophy,'the stronger trophy is worn');
  assert.equal(s.inv.filter(i=>i===oldWeapon).length,1,'old weapon back in the backpack once');assert.equal(s.inv.includes(trophy),false);
  const cp1=await cp();assert.ok(cp1>cp0,`power grows ${cp0} → ${cp1}`);log('equip trophy · power',cp0,'→',cp1);
  // 4. Forge upgrade from the slot card: a double tap pays once.
  await closeAll();await page.getByRole('button',{name:/^Оружие уровень/}).tap();await page.waitForTimeout(400);
  const before=await st(),up=page.getByRole('button',{name:/^Усилить \+1 ·/}).first();
  const cost=+(await up.innerText()).replace(/\s/g,'').match(/·(\d+)золота/)[1];
  await up.dblclick();await page.waitForTimeout(500);s=await st();
  assert.equal(s.eq.weapon,trophy+'+1','one upgrade level');assert.equal(s.gold,before.gold-cost,'one payment');log('forge +1 for',cost);
  // 5. Salvage a weaker piece through the backpack selection (gold and XP arrive, item leaves once).
  await closeAll();await tap('Карта');await tap('Рюкзак');await tap('☑ Выбрать');
  const pick=page.getByRole('button',{name:/· отметить$/}).first();
  if(await pick.count()){
   const g0=(await st()).gold,n0=(await st()).inv.length;await pick.tap();await page.waitForTimeout(250);
   const gain=+((await page.locator('body').innerText()).match(/\+(\d+) золота · \+\d+ опыта/)||[0,0])[1];
   await page.getByRole('button',{name:'Распылить выбранное'}).dblclick();await page.waitForTimeout(500);
   const confirm=page.getByRole('button',{name:/^Распылить/}).last();if((await st()).inv.length===n0&&await confirm.count()){await confirm.tap();await page.waitForTimeout(500)}
   s=await st();assert.equal(s.inv.length,n0-1,'exactly one item salvaged');assert.equal(s.gold,g0+gain,'salvage gold paid once');log('salvage +',gain,'gold');
  }else log('no unprotected weak item to salvage yet');
  // 6. Hero growth with earned gold: skill upgrade, quest reward (double tap), daily gift, summon.
  await closeAll();await tap('Навыки');const sk0=(await st()).skills,g1=(await st()).gold;
  await page.getByRole('button',{name:/^Улучшить · \d+ золота/}).first().tap();await page.waitForTimeout(400);
  s=await st();assert.ok(s.skills[0]===sk0[0]+1&&s.gold<g1,'skill level paid with gold');
  await closeAll();await tap('Задания');const q0=await st();
  await page.getByRole('button',{name:'Получить награду',exact:true}).first().dblclick();await page.waitForTimeout(500);
  s=await st();assert.equal(s.mission,q0.mission+1,'chapter quest claimed once');assert.equal(s.gems,q0.gems+15);
  await closeAll();await tap('Награды');const d0=await st();
  await page.getByRole('button',{name:'Забрать подарок',exact:true}).dblclick();await page.waitForTimeout(500);
  s=await st();assert.ok(s.gold>d0.gold&&s.horn>=d0.horn,'daily gift paid');log('daily gift',d0.gold,'→',s.gold);await page.screenshot({path:`${out}/gift-${W}.png`});
  await closeAll();await tap('Спутники');const c0=await st();
  const seals=async()=>+((await page.locator('body').innerText()).match(/(\d+)\s*Печати/)||[0,0])[1];
  const sl0=await seals();await tap('Призыв');const one=page.getByRole('button',{name:'Призыв · 1 печать',exact:true});
  if(sl0>0){await one.dblclick();await page.waitForTimeout(700);assert.match(await page.locator('.summon-results').innerText(),/Новый спутник|оск\./,'summon shows what arrived');
   await closeAll();await tap('Спутники');assert.equal(await seals(),sl0-1,'a double tap spends one seal');log('summon spent 1 seal')}
  else{assert.equal(await one.isDisabled(),true,'summon without seals is disabled');log('no seals yet')}
  assert.equal(c0.panel,'companions');
  // 7. Closing a window resumes only what the window paused; a paused fight stays paused.
  await closeAll();s=await until(s=>s.running,4000,'march resumes after the windows closed');
  await page.locator('button.central').tap();await page.waitForTimeout(400);assert.equal((await st()).running,false,'axes pause');
  await tap('Задания');await closeAll();await page.waitForTimeout(1200);assert.equal((await st()).running,false,'closing a window never starts a paused fight');
  await page.locator('button.central').tap();
  // 8. Remaining stages, naturally.
  for(let n=3;n<=stages+1;n++){const r=await until(s=>s.stage>=n||s.phase==='defeat',300000,'stage '+n);log('stage',r.stage,'level',r.level,'gold',r.gold,'backpack',r.inv.length,'phase',r.phase);if(r.phase==='defeat')break}
  // 9. Dark Realm with the hero grown above: 7 → four portal pairs (real canvas taps) → boss → one result → «Забрать».
  if(process.env.REALM!=='0'){
   await until(s=>!s.offer||s.offer.resolved,20000,'boss trophy kept before the realm');// the realm honestly waits for an open trophy
   if((await st()).running){await page.locator('button.central').tap();await page.waitForTimeout(400)}
   const realm=()=>page.evaluate(()=>{const p=window.__lootborn.useGame.getState().p,b=p.saga?.box?.realm;return {floor:p.darkFloor,chaosite:p.chaosite,gold:p.gold,run:b?.run&&{stage:b.run.stage},last:b?.last&&{win:b.last.win,ack:b.last.ack}}});
   await tap('приключение');await page.getByRole('button',{name:/^Царство тьмы Этаж/}).first().tap();await page.waitForTimeout(500);
   const r0=await realm();await page.getByRole('button',{name:/Вызов/}).first().dblclick();await page.waitForTimeout(600);
   let r=await realm();assert.equal(r.chaosite,r0.chaosite-5,'entry paid once · '+(await st()).toast);assert.equal(r.run.stage,'INTRO_7');
   const picks=new Set();
   for(let t=0;t<600000&&!(r.last&&!r.last.ack);t+=600){await page.waitForTimeout(600);r=await realm();
    if(r.run?.stage?.startsWith('CHOICE')&&!picks.has(r.run.stage)){picks.add(r.run.stage);await page.waitForTimeout(700);const box=await page.locator('canvas').boundingBox();await page.touchscreen.tap(box.x+470/864*box.width,box.y+690/940*box.height)}}
   assert.deepEqual([...picks],['CHOICE_1','CHOICE_2','CHOICE_3','CHOICE_4'],'four portal choices');
   assert.equal(r.gold,r0.gold,'nothing is paid before «Забрать»');await page.waitForTimeout(800);
   assert.equal(await page.getByRole('button',{name:'Забрать',exact:true}).count(),1,'exactly one result window');
   await page.getByRole('button',{name:'Забрать',exact:true}).dblclick();await page.waitForTimeout(700);const after=await realm();
   assert.equal(after.last.ack,true);if(after.last.win){assert.equal(after.floor,r0.floor+1);assert.ok(after.gold>r0.gold,'victory pays on claim')}
   log('realm floor',r0.floor,after.last.win?'won':'lost','gold',r0.gold,'→',after.gold);
   assert.equal((await st()).panel,'realm','claim returns to the floor list');await closeAll();
   // A gem from the realm: a double tap on «Вставить» must not hit the «Извлечь» that replaces it.
   await tap('Карта');await tap('Камни');const insert=page.getByRole('button',{name:'Вставить',exact:true}).first();
   if(await insert.count()){await insert.dblclick();await page.waitForTimeout(500);assert.match((await st()).toast,/Камень вставлен/,'gem stays socketed after a double tap');log('gem socketed')}
   await closeAll();
  }
  // 10. Reload keeps everything earned and does not restart the fight on its own.
  if((await st()).running){await page.locator('button.central').tap();await page.waitForTimeout(500)}const keep=await st();
  await page.reload();await boot();s=await st();
  for(const k of ['stage','level','gold','gems','mission','bosses','darkFloor'])assert.equal(s[k],keep[k],'reload keeps '+k);
  assert.deepEqual(s.eq,keep.eq,'reload keeps the worn gear');assert.equal(s.running,false,'reload waits for the player');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal scroll');
  await page.screenshot({path:`${out}/natural-${W}.png`});
  assert.deepEqual(errors,[],'no page errors');log('OK');await c.close();
 }
 await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
