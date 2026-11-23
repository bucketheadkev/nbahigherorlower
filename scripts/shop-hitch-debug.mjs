import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => {
  try { localStorage.setItem('oneb_how_it_works_seen_v1', '1'); localStorage.setItem('1brun_account_prompt_seen_v1', '1'); } catch {}
});
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('.shop-screen'), null, { timeout: 60000 });
await page.waitForTimeout(800);
await page.evaluate(() => document.querySelectorAll('.tut,.oneb-intro,.account-progress-prompt').forEach((e) => e.remove()));

const before = await page.evaluate(() => ({
  shopBtn: !!document.querySelector('.oneb-tabbar__item--shop'),
  props: (() => {
    const el = document.querySelector('.oneb-tabbar__item--shop');
    const key = Object.keys(el || {}).find((k) => k.startsWith('__reactProps$'));
    return { key, hasOnClick: typeof el?.[key]?.onClick === 'function' };
  })(),
}));
console.log('before', before);

// Try native click
await page.locator('.oneb-tabbar__item--shop').click({ force: true });
await page.waitForTimeout(400);
console.log('after force', await page.evaluate(() => ({
  shopActive: document.querySelector('.oneb-tabbar__item--shop')?.classList.contains('is-active'),
  homeActive: document.querySelector('.oneb-tabbar__item--home')?.classList.contains('is-active'),
  panes: [...document.querySelectorAll('.hub-pane')].map((p) => p.classList.contains('is-active')),
})));

// Try props click
await page.evaluate(() => {
  const el = document.querySelector('.oneb-tabbar__item--shop');
  const key = Object.keys(el || {}).find((k) => k.startsWith('__reactProps$'));
  console.log('calling onClick', !!el?.[key]?.onClick);
  el?.[key]?.onClick?.({ preventDefault() {}, stopPropagation() {}, button: 0, type: 'click' });
});
await page.waitForTimeout(400);
console.log('after props', await page.evaluate(() => ({
  shopActive: document.querySelector('.oneb-tabbar__item--shop')?.classList.contains('is-active'),
  panes: [...document.querySelectorAll('.hub-pane')].map((p) => ({ a: p.classList.contains('is-active'), op: getComputedStyle(p).opacity, c: p.firstElementChild?.className?.toString?.().slice(0,50) })),
})));

await browser.close();
