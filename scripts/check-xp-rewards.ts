/**
 * XP / leveling / coin reward math checks.
 * Run: node --experimental-strip-types --import ./scripts/ts-ext-loader.mjs scripts/check-xp-rewards.ts
 */
import assert from 'node:assert/strict';
import { BILLION_GOAL } from '../lib/tradeup/billionDollar';
import {
  calculateClassicRunRewards,
  progressFromTotalXp,
  xpToAdvance,
  XP_BILLION_BONUS,
  XP_COMPLETED_RUN,
  XP_PERFORMANCE_BONUS_MAX,
  COINS_COMPLETED_RUN,
  COINS_BILLION_BONUS,
  COINS_LEVEL_UP,
} from '../lib/tradeup/xp/config';

// Baseline completed run (near-zero value)
{
  const r = calculateClassicRunRewards(1);
  assert.equal(r.completed, XP_COMPLETED_RUN);
  assert.equal(r.performance, 0);
  assert.equal(r.billion, 0);
  assert.equal(r.total, 50);
  assert.equal(r.coins, COINS_COMPLETED_RUN);
}

// Mid performance (~50% of $1B → ~50 bonus)
{
  const r = calculateClassicRunRewards(BILLION_GOAL / 2);
  assert.equal(r.completed, 50);
  assert.equal(r.performance, Math.round(0.5 * XP_PERFORMANCE_BONUS_MAX));
  assert.equal(r.billion, 0);
  assert.equal(r.total, 50 + 50);
  assert.equal(r.coins, COINS_COMPLETED_RUN);
}

// Perfect billion run
{
  const r = calculateClassicRunRewards(BILLION_GOAL);
  assert.equal(r.completed, 50);
  assert.equal(r.performance, XP_PERFORMANCE_BONUS_MAX);
  assert.equal(r.billion, XP_BILLION_BONUS);
  assert.equal(r.total, 250);
  assert.equal(r.coins, COINS_COMPLETED_RUN + COINS_BILLION_BONUS);
}

// Progressive thresholds climb
assert.ok(xpToAdvance(2) > xpToAdvance(1));
assert.ok(xpToAdvance(10) > xpToAdvance(5));

// Level progress from total XP
{
  const need1 = xpToAdvance(1);
  const p0 = progressFromTotalXp(0);
  assert.equal(p0.level, 1);
  assert.equal(p0.xpIntoLevel, 0);
  assert.equal(p0.xpForNext, need1);

  const pAlmost = progressFromTotalXp(need1 - 1);
  assert.equal(pAlmost.level, 1);
  assert.equal(pAlmost.xpIntoLevel, need1 - 1);

  const p2 = progressFromTotalXp(need1);
  assert.equal(p2.level, 2);
  assert.equal(p2.xpIntoLevel, 0);
}

// Multi-level jump from a large bank of XP
{
  let xp = 0;
  for (let lvl = 1; lvl <= 5; lvl += 1) xp += xpToAdvance(lvl);
  const p = progressFromTotalXp(xp);
  assert.equal(p.level, 6);
  assert.equal(p.xpIntoLevel, 0);
}

// Idempotent award + level-up queue (mock localStorage)
{
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
    dispatchEvent: () => true,
  };
  const { awardClassicRunXp } = await import('../lib/tradeup/xp/award');
  const { getXpProfile, getPendingXpReveals } = await import('../lib/tradeup/xp/storage');

  const first = awardClassicRunXp('run_a', BILLION_GOAL);
  assert.equal(first.awarded, true);
  assert.equal(first.breakdown?.total, 250);
  const expectedCoins = COINS_COMPLETED_RUN + COINS_BILLION_BONUS;
  // Level-up bonus if this award crossed a level
  const levels = Math.max(0, (first.toLevel ?? 1) - (first.fromLevel ?? 1));
  const withLevel = expectedCoins + levels * COINS_LEVEL_UP;
  assert.equal(first.breakdown?.coins, withLevel);
  assert.equal(getXpProfile().coins, withLevel);
  // Rewards surface on the evaluation screen — no deferred hub XP reveal queue.
  assert.equal(first.pending, null);
  assert.equal(getPendingXpReveals().length, 0);

  const dup = awardClassicRunXp('run_a', BILLION_GOAL);
  assert.equal(dup.awarded, false);
  assert.equal(dup.reason, 'duplicate');
  assert.equal(getXpProfile().coins, withLevel);
  assert.equal(getPendingXpReveals().length, 0);

  const second = awardClassicRunXp('run_b', BILLION_GOAL);
  assert.equal(second.awarded, true);
  assert.equal(getPendingXpReveals().length, 0);
}

console.log('check-xp-rewards: ok');
