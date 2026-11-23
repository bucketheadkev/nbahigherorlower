import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = path.resolve('design/home-v4/verify');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];

async function prep(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('1brun_onboarding_seen_v2', '1');
      localStorage.setItem('1brun_account_prompt_seen_v1', '1');
    } catch {}
  });
}

async function waitHome(page) {
  await page.waitForSelector('.home-screen--official', { timeout: 25000 });
  await page.waitForFunction(() => {
    const img = document.querySelector('.home-stage-art__img');
    return !!(img && img.complete && img.naturalWidth > 0);
  }, { timeout: 25000 }).catch(() => {});
  // Wait splash veil gone
  await page.waitForFunction(() => {
    const veil = document.querySelector('.oneb-intro');
    if (!veil) return true;
    const style = getComputedStyle(veil);
    return style.pointerEvents === 'none' || style.opacity === '0' || style.display === 'none';
  }, { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(900);
}

async function shot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  results.push({ name, ok: fs.existsSync(file), bytes: fs.statSync(file).size });
  return file;
}

const viewports = [
  { name: 'iphone14', width: 390, height: 844 },
  { name: 'iphone15pro', width: 430, height: 932 },
  { name: 'iphoneSE', width: 375, height: 667 },
];

const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
await prep(page);

const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !document.querySelector('.oneb-intro'), { timeout: 25000 }).catch(() => {});
await waitHome(page);
await shot(page, 'home-430x932.png');

const layout = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const stage = q('.home-stage-art__img');
  const arena = q('.home-scene__arena-img');
  const tabs = [...document.querySelectorAll('.oneb-tabbar__item')].map((el) => ({
    text: el.textContent?.trim(),
    box: box(el),
    active: el.classList.contains('is-active'),
  }));
  return {
    title: box(q('.home-title')),
    stageWrap: box(q('.home-stage-art')),
    stageNat: stage ? { w: stage.naturalWidth, h: stage.naturalHeight } : null,
    arenaNat: arena ? { w: arena.naturalWidth, h: arena.naturalHeight } : null,
    xp: box(q('.home-xp')),
    play: box(q('.home-play')),
    modes: box(q('.home-modes-btn')),
    coin: box(q('.home-coin')),
    profile: box(q('.home-profile')),
    tabbar: box(q('.oneb-tabbar')),
    tabs,
    hasAwaiting: !!q('.home-stage-art--awaiting'),
    hasPreview: !!document.querySelector('img[src*="ART_ONLY_PREVIEW"]'),
    arenaSrc: arena?.getAttribute('src'),
    stageSrc: stage?.getAttribute('src'),
    vw: window.innerWidth,
    vh: window.innerHeight,
  };
});
fs.writeFileSync(path.join(OUT, 'layout-430.json'), JSON.stringify(layout, null, 2));

async function clickTab(label) {
  await page.locator('.oneb-tabbar__item', { hasText: label }).click();
  await page.waitForTimeout(600);
}

await clickTab('Leaderboard');
const onBoard = await page.locator('.wb-head__title').first().isVisible().catch(() => false);
await shot(page, 'nav-leaderboard.png');
results.push({ test: 'nav-leaderboard', ok: onBoard });

await clickTab('Shop');
const onShop = await page.locator('.shop-screen').first().isVisible().catch(() => false);
await shot(page, 'nav-shop.png');
results.push({ test: 'nav-shop', ok: onShop });

await clickTab('Play');
await waitHome(page);
results.push({ test: 'nav-play-home', ok: await page.locator('.home-screen--official').isVisible() });

if (await page.locator('.home-coin__plus').count()) {
  await page.locator('.home-coin__plus').click();
  await page.waitForTimeout(500);
  results.push({
    test: 'coin-plus-shop',
    ok: await page.locator('.shop-screen').first().isVisible().catch(() => false),
  });
  await clickTab('Play');
  await waitHome(page);
}

await page.locator('.home-profile--btn, button.home-profile').first().click();
await page.waitForTimeout(700);
const profileOk = await page.evaluate(() => /Account|Sign|Log in|Guest|Create|SAVE YOUR PROGRESS/i.test(document.body.innerText));
await shot(page, 'profile-sheet.png');
results.push({ test: 'profile-opens', ok: profileOk });
await page.locator('.settings-name-modal__scrim').first().click({ timeout: 3000 }).catch(() => {});
await page.waitForFunction(() => !document.querySelector('.account-sheet, .settings-name-modal'), { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(400);

await page.locator('.home-modes-btn').click({ timeout: 10000 });
await page.waitForTimeout(500);
const modesOk = await page.evaluate(() => /Classic|1\s*v\s*1|Head|Modes/i.test(document.body.innerText));
await shot(page, 'modes-sheet.png');
results.push({ test: 'modes-opens', ok: modesOk });
await page.locator('button[aria-label="Close"], .home-modes-sheet__close, .modes-sheet button').first().click({ timeout: 2000 }).catch(() => {});
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(300);

await page.locator('.home-play').click();
await page.waitForTimeout(1400);
const engineOk = await page.evaluate(() => {
  return !!(
    document.querySelector('[class*="billion"], [class*="classic"], [class*="draft"], [class*="lineup"]') ||
    /Draft|Lineup|Trade|Pick your|STARTING/i.test(document.body.innerText)
  );
});
await shot(page, 'play-classic.png');
results.push({ test: 'play-opens-classic', ok: engineOk });

for (const vp of viewports) {
  await context.close();
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const p = await ctx.newPage();
  await prep(p);
  await p.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
  await waitHome(p);
  await p.screenshot({ path: path.join(OUT, `home-${vp.name}.png`), fullPage: false });
  results.push({ name: `home-${vp.name}.png`, ok: true });
  await ctx.close();
}

fs.writeFileSync(path.join(OUT, 'nav-results.json'), JSON.stringify({ results, layout, consoleErrors }, null, 2));
console.log(JSON.stringify({ results, layout, consoleErrors }, null, 2));
await browser.close();
