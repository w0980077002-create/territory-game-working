/* Chromium test of the Telegram WebApp bridge with an isolated browser and mocked CloudStorage. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.BASE_URL || 'http://localhost:4173/';
const browserKey = 'lootborn-codex-v1';
const telegramKey = browserKey + ':telegram:1234567';

(async () => {
 const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--no-sandbox']
 });
 try {
  const context = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  await context.route('https://telegram.org/**', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
  await context.addInitScript(() => {
   if (!new URLSearchParams(location.search).has('miniapp')) return;
   window.mockCloud = { reads: 0, writes: 0 };
   window.Telegram = { WebApp: {
    initData: new URLSearchParams({ user: JSON.stringify({id:1234567}) }).toString(),
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
  const incoming = { ...chrome, daily: '', gold: chrome.gold + 1000 };
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
  assert.equal((await read(browserKey)).gold, chrome.gold, 'Chrome progress is independent');

  const other = { ...incoming, gold: local.gold + 777, savedAt: Date.now() + 30000 };
  await putCloud(other);
  await open(true);
  await waitForCloud();
  assert.equal((await read(telegramKey)).gold, local.gold, 'a newer cloud copy cannot replace local progress');
  await tap('Меню');
  await tap('Открыть прежнее сохранение на устройстве');
  await tap('Отмена');
  await tap('Открыть копию из Telegram');
  await tap('Отмена');
  assert.equal((await read(telegramKey)).gold, local.gold, 'preview cancellation preserves the local copy');
  await checkpoint();
  assert.equal(await page.evaluate(() => window.mockCloud.writes), 0, 'a divergent cloud copy is protected from autosave');

  await open(true);
  await waitForCloud();
  await tap('Меню');
  await tap('Открыть копию из Telegram');
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
  await tap('Открыть копию из Telegram');
  await page.getByText('Копия Telegram недоступна · попробуйте ещё раз', {exact:true}).first().waitFor();
  await checkpoint();
  assert.equal(await page.evaluate(() => window.mockCloud.writes), 0, 'a timeout cannot authorize an upload');
  assert.equal((await read(telegramKey)).gold, other.gold);
  assert.deepEqual(errors, []);
  console.log('Telegram bridge: restore, backup, reload, isolated Chrome progress, conflict and offline protection');
 } finally {
  await browser.close();
 }
})().catch(error => { console.error(error); process.exitCode = 1; });
