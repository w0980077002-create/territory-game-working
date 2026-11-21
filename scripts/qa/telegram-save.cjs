/* Chromium test of the Telegram WebApp bridge with an isolated browser and mocked CloudStorage. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.BASE_URL || 'http://localhost:4173/';
const browserKey = 'lootborn-codex-v1';
const telegramKey = browserKey + ':telegram:1234567';
const inviteUrl = 'https://t.me/VikingRomeGame';

(async () => {
 const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--no-sandbox']
 });
 try {
  const context = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  await context.route('https://telegram.org/**', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
  await context.addInitScript(() => {
   const params = new URLSearchParams(location.search);
   if (!params.has('miniapp')) return;
   const initData = new URLSearchParams({user:JSON.stringify({id:1234567})});
   if(params.has('mail-acceptance'))initData.set('start_param','mail_acceptance');
   window.mockCloud = { reads: 0, writes: 0 };
   window.Telegram = { WebApp: {
    initData: initData.toString(),
    ready() {}, expand() {},
    CloudStorage: {
     getItem(key, done) {
      window.mockCloud.reads++;
      if (localStorage.getItem('mock:timeout')) return;
      if (localStorage.getItem('mock:error')) { done(Error('Offline'), ''); return; }
      done(null, localStorage.getItem('mock:' + key) ?? '');
     },
     setItem(key, value, done) {
      window.mockCloud.writes++;
      localStorage.setItem('mock:' + key, value);
      done(null, true);
     }
    }
   } };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const tap = (name) => page.getByRole('button', { name, exact: true }).tap();
  const saveDialog = page.getByRole('dialog', { name: 'Сохранение и восстановление', exact: true });
  const preview = saveDialog.getByRole('heading', { name: 'Восстановить сохранение?', exact: true });
  const openSavePreview = async name => {
   // The menu button and the legacy-copy button can occupy the same screen point
   // after navigation. Tap a different point so Chromium sends a separate gesture.
   await saveDialog.getByRole('button', { name, exact: true }).tap({ position: { x: 24, y: 16 } });
   await preview.waitFor();
  };
  const cancelSavePreview = async () => {
   await saveDialog.getByRole('button', { name: 'Отмена', exact: true }).tap();
   await preview.waitFor({ state: 'hidden' });
  };
  const read = key => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  const open = mini => page.goto(base + (mini ? '?miniapp=1' : ''));
  const waitForCloud = () => page.waitForFunction(() => window.mockCloud?.reads > 0);
  const putCloud = value => page.evaluate(value => {
   const raw = JSON.stringify(value);
   const chunks = raw.match(/.{1,1000}/gu);
   localStorage.setItem('mock:save_meta', JSON.stringify({generation:'0',count:chunks.length}));
   chunks.forEach((part, i) => localStorage.setItem('mock:save_0_' + i, part));
  }, value);
  const checkpoint = async () => {
   await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
   });
   await page.waitForFunction(() => window.mockCloud.reads > 0);
  };

  await open(false);
  await tap('Награды');
  await tap('Забрать подарок');
  const chrome = await read(browserKey);
  const incoming = { ...structuredClone(chrome), daily: '', gold: chrome.gold + 1000 };
  // Restore a copy from before the calendar shipped, with its old receipt format.
  delete incoming.saga.box['daily-gifts'];
  await putCloud(incoming);

  await open(true);
  await page.waitForFunction(key => !!localStorage.getItem(key), telegramKey);
  assert.equal((await read(telegramKey)).gold, incoming.gold, 'fresh Telegram profile restores the cloud copy');
  await tap('Награды');
  await tap('Забрать подарок');
  const local = await read(telegramKey);
  assert.ok(local.gold > incoming.gold);
  await checkpoint();
  await page.waitForFunction(() => window.mockCloud.writes > 0);

  await open(true);
  await waitForCloud();
  assert.equal((await read(telegramKey)).gold, local.gold);
  await tap('Награды');
  assert.equal(await page.getByRole('button', {name:'Сегодня уже получено',exact:true}).isDisabled(), true);
  await tap('Закрыть');
  assert.equal((await read(browserKey)).gold, chrome.gold, 'Chrome progress is independent');

  const other = { ...incoming, gold: local.gold + 777, savedAt: Date.now() + 30000 };
  await putCloud(other);
  await open(true);
  await waitForCloud();
  assert.equal((await read(telegramKey)).gold, local.gold, 'a newer cloud copy cannot replace local progress');
  await tap('Меню');
  await tap('Сохранение и восстановление');
  await openSavePreview('Открыть прежнее сохранение на устройстве');
  await cancelSavePreview();
  await openSavePreview('Открыть копию из Telegram');
  await cancelSavePreview();
  assert.equal((await read(telegramKey)).gold, local.gold, 'preview cancellation preserves the local copy');
  await checkpoint();
  assert.equal(await page.evaluate(() => window.mockCloud.writes), 0, 'a divergent cloud copy is protected from autosave');

  await open(true);
  await waitForCloud();
  await tap('Меню');
  await tap('Сохранение и восстановление');
  await openSavePreview('Открыть копию из Telegram');
  await tap('Восстановить этот прогресс');
  assert.equal((await read(telegramKey)).gold, other.gold);
  assert.equal((await read(telegramKey + ':before-import')).gold, local.gold);

  await page.evaluate(() => localStorage.setItem('mock:error', '1'));
  await open(true);
  await waitForCloud();
  await checkpoint();
  assert.equal(await page.evaluate(() => window.mockCloud.writes), 0, 'a cloud read failure never authorizes an upload');
  assert.equal((await read(telegramKey)).gold, other.gold);

  await page.evaluate(() => {
   localStorage.removeItem('mock:error');
   localStorage.setItem('mock:timeout', '1');
  });
  await open(true);
  await waitForCloud();
  await tap('Меню');
  await tap('Сохранение и восстановление');
  await tap('Открыть копию из Telegram');
  await page.getByText('Копия Telegram недоступна · попробуйте ещё раз', {exact:true}).first().waitFor();
  await checkpoint();
  assert.equal(await page.evaluate(() => window.mockCloud.writes), 0, 'a timeout cannot authorize an upload');
  assert.equal((await read(telegramKey)).gold, other.gold);
  await tap('Закрыть');
  const verifyInvite = async () => {
   await page.evaluate(() => {
    history.replaceState(null, '', location.pathname + location.search + '#tgWebAppData=synthetic');
    Object.defineProperty(navigator, 'clipboard', {
     configurable: true,
     value: { writeText: value => { window.copiedGameLink = value; return Promise.resolve(); } }
    });
   });
   await tap('Скопировать ссылку на игру');
   assert.equal(await page.evaluate(() => window.copiedGameLink), inviteUrl);
   await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('Denied')); });
   await tap('Скопировать ссылку на игру');
   assert.equal(await page.getByRole('textbox', {name:'Адрес для копирования'}).inputValue(), inviteUrl);
  };

  const beforeInvite = await read(telegramKey);
  await tap('Приглашение');
  await verifyInvite();
  const afterInvite = await read(telegramKey);
  for (const field of ['inventory','pendingLoot','gold','gems','stage','equipment','claimed','bought'])
   assert.deepEqual(afterInvite[field], beforeInvite[field], 'sharing preserves ' + field);

  await page.goto(base + '?hero=invite-alias-qa');
  await page.waitForFunction(() => window.__lootborn?.battle);
  await page.evaluate(() => window.__lootborn.useGame.getState().open('friends'));
  await page.getByRole('dialog', {name:'Поделиться игрой'}).waitFor();
  await verifyInvite();

  const acceptanceKey = browserKey + ':test:mail-acceptance';
  const ownerCopy = await read(telegramKey);
  const ownerBrowser = await read(browserKey);
  const ownerCloud = await page.evaluate(() => Object.entries(localStorage).filter(([key])=>key.startsWith('mock:save_')).sort());
  await page.goto(base + '?miniapp=1&mail-acceptance=1');
  await page.waitForFunction(() => window.__lootborn?.battle);
  await tap('Почта');
  const inbox = page.getByRole('dialog',{name:'Почта',exact:true});
  const letter = inbox.locator('.mail-letter');
  assert.equal(await letter.count(), 1);
  assert.equal(await letter.getAttribute('data-unread'), 'true');
  await letter.tap();
  const attachment = page.getByRole('dialog',{name:'Награды карнавала',exact:true});
  assert.ok(await attachment.locator('.reward-piece').count() >= 4, 'the archived carnival provides varied attachments');
  const beforeClaim = await read(acceptanceKey);
  await attachment.getByRole('button',{name:'Забрать',exact:true}).tap();
  await attachment.locator('.mail-delivered').waitFor();
  const afterClaim = await read(acceptanceKey);
  assert.ok(afterClaim.gold > beforeClaim.gold && afterClaim.gems > beforeClaim.gems);
  const noCloud = () => page.evaluate(() => window.mockCloud);
  assert.deepEqual(await noCloud(), {reads:0,writes:0}, 'the acceptance hero bypasses the production Telegram cloud');
  await page.reload();
  await page.waitForFunction(() => window.__lootborn?.battle);
  await tap('Почта');
  assert.equal(await inbox.getByRole('button',{name:'Забрать всё'}).isDisabled(), true);
  assert.deepEqual(await read(telegramKey), ownerCopy);
  assert.deepEqual(await read(browserKey), ownerBrowser);
  assert.deepEqual(await page.evaluate(() => Object.entries(localStorage).filter(([key])=>key.startsWith('mock:save_')).sort()), ownerCloud);
  assert.deepEqual(await noCloud(), {reads:0,writes:0});
  assert.deepEqual(errors, []);
  console.log('Telegram bridge: restore, backup, reload, conflict and offline protection, invitation routes and isolated mail acceptance');
 } finally {
  await browser.close();
 }
})().catch(error => { console.error(error); process.exitCode = 1; });
