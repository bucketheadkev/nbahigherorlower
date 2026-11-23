import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => {
  try {
    localStorage.setItem('oneb_how_it_works_seen_v1', '1');
    localStorage.setItem('1brun_account_prompt_seen_v1', '1');
  } catch {}
});
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
// Splash + mount shop
await page.waitForFunction(() => document.querySelector('.shop-screen'), null, { timeout: 60000 });
await page.waitForTimeout(500);
await page.evaluate(() => document.querySelectorAll('.tut,.oneb-intro,.account-progress-prompt').forEach((e) => e.remove()));

const click = async (sel) => {
  await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    const key = Object.keys(el || {}).find((k) => k.startsWith('__reactProps$'));
    if (key && el[key]?.onClick) el[key].onClick({ preventDefault() {}, stopPropagation() {}, button: 0, type: 'click' });
    else el?.click();
  }, sel);
};

const measure = async (label, fn, check) => {
  await page.evaluate(() => {
    window.__longTasks = [];
    if (window.__ltObs) try { window.__ltObs.disconnect(); } catch {}
    try {
      window.__ltObs = new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__longTasks.push(e.duration); });
      window.__ltObs.observe({ type: 'longtask', buffered: false });
    } catch {}
  });
  const t0 = Date.now();
  await fn();
  await page.waitForFunction(check, null, { timeout: 8000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(30);
  const tasks = await page.evaluate(() => window.__longTasks || []);
  const row = { label, elapsedMs: Date.now() - t0, maxLongTaskMs: Math.round(tasks.reduce((m, d) => Math.max(m, d), 0)), longTaskCount: tasks.length };
  console.log(JSON.stringify(row));
  return row;
};

// warm once
await click('.oneb-tabbar__item--shop');
await page.waitForFunction(() => document.querySelector('.oneb-tabbar__item--shop.is-active'), null, { timeout: 8000 });
await click('.oneb-tabbar__item--home');
await page.waitForTimeout(350);

const results = [];
results.push(await measure('nav-shop', () => click('.oneb-tabbar__item--shop'), () => !!document.querySelector('.oneb-tabbar__item--shop.is-active')));

await page.evaluate(() => {
  const perks = [...document.querySelectorAll('.shop-tabs__btn')].find((b) => b.textContent?.trim() === 'Perks');
  const key = Object.keys(perks || {}).find((k) => k.startsWith('__reactProps$'));
  perks?.[key]?.onClick?.({ preventDefault() {}, button: 0, type: 'click' });
});
await page.waitForTimeout(120);

results.push(await measure('coins-tab', async () => {
  await page.evaluate(() => {
    const coins = [...document.querySelectorAll('.shop-tabs__btn')].find((b) => b.textContent?.trim() === 'Coins');
    const key = Object.keys(coins || {}).find((k) => k.startsWith('__reactProps$'));
    coins?.[key]?.onClick?.({ preventDefault() {}, button: 0, type: 'click' });
  });
}, () => !!document.querySelector('.shop-panel--coins.is-on')));

await click('.oneb-tabbar__item--home');
await page.waitForTimeout(250);
await page.evaluate(() => document.querySelector('.home-coin')?.setAttribute('data-hitch-plus', '1'));
results.push(await measure('coin-plus', () => click('[data-hitch-plus="1"]'), () => !!document.querySelector('.oneb-tabbar__item--shop.is-active')));

const bad = results.filter((r) => r.maxLongTaskMs > 80 || r.elapsedMs > 280);
console.log(JSON.stringify({ verdict: bad.length ? 'FAIL' : 'PASS', results, bad }));
await browser.close();
process.exit(bad.length ? 1 : 0);
