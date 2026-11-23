/**
 * Fix E — Coin pill is one Shop click target (no nested + button).
 * Run: node --experimental-strip-types --import ./scripts/ts-ext-loader.mjs scripts/check-coin-pill.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const chip = readFileSync(resolve(root, 'components/tradeup/home/HomeCoinChip.tsx'), 'utf8');
const host = readFileSync(resolve(root, 'components/tradeup/home/HomeHubChromeHost.tsx'), 'utf8');
const chrome = readFileSync(resolve(root, 'components/tradeup/home/HomeHubTopChrome.tsx'), 'utf8');
const app = readFileSync(resolve(root, 'components/tradeup/TradeUpApp.tsx'), 'utf8');
const plate = readFileSync(resolve(root, 'app/home-plate.css'), 'utf8');
const v2 = readFileSync(resolve(root, 'app/home-v2.css'), 'utf8');

// Unified button when onPlus is set
assert.match(chip, /if \(onPlus\)/, 'clickable path gated on onPlus');
assert.match(
  chip,
  /<button\s+type="button"\s+className="home-coin ui-tap"/,
  'entire pill is a single button',
);
assert.match(chip, /onClick=\{onPlus\}/, 'Shop handler on the pill button');

// + is decorative only (span), never a nested button
assert.match(chip, /<span className="home-coin__plus"/, '+ mark is a span');
assert.doesNotMatch(
  chip,
  /<button[^>]*home-coin__plus/,
  'plus is not its own button',
);
assert.equal(
  (chip.match(/<button\b/g) ?? []).length,
  1,
  'exactly one <button> in HomeCoinChip (the pill)',
);

// Balance still animates while remaining inside the same click target
assert.match(chip, /animate\(mv, safe/, 'balance spring animation preserved');
assert.match(chip, /shown\.toLocaleString/, 'live balance number still rendered inside pill');

// Shared chrome: Home · Leaderboard · Shop use the same chip + Shop opener
assert.match(chrome, /<HomeCoinChip[\s\S]*onPlus=\{onCoinPlus\}/, 'top chrome wires onPlus');
assert.match(host, /onCoinPlus=\{onOpenShop \? go\(onOpenShop\)/, 'host opens Shop via go() lock');
assert.match(host, /lockRef\.current = true/, 'duplicate-nav lock still present');
assert.match(app, /HomeHubChromeHost onOpenShop=\{handleOpenShop\}/, 'shared host on hub screens');
assert.match(app, /onOpenShop=\{handleOpenShop\}/, 'home path also gets Shop opener');

// CSS: one hit target — decorative + ignores pointer events; active feedback on pill
assert.match(plate, /\.rh5-top \.home-coin__plus \{[\s\S]*?pointer-events:\s*none/, 'plate + not separately tappable');
assert.match(v2, /\.rh2 \.home-coin__plus,[\s\S]*?pointer-events:\s*none/, 'v2 + not separately tappable');
assert.match(
  plate,
  /button\.home-coin:active \.home-coin__plus/,
  'plate active feedback via parent button',
);
assert.match(
  v2,
  /button\.home-coin:active \.home-coin__plus/,
  'v2 active feedback via parent button',
);

console.log('check-coin-pill: all assertions passed');
