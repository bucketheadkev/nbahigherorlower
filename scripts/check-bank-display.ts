/**
 * Fix F — Bank display stability (auth loading / cache / guest gating).
 * Run: node --experimental-strip-types --import ./scripts/ts-ext-loader.mjs scripts/check-bank-display.ts
 */
import assert from 'node:assert/strict';
import {
  balanceFromCacheForUser,
  isBankAuthLoading,
  isBankPermanent,
  shouldUseGuestBank,
  type BankAuthStatus,
} from '../lib/tradeup/bankDisplay';

function displayBalance(
  status: BankAuthStatus,
  opts: {
    server: number | null;
    local: number | null;
    preview?: number | null;
  },
): number | null {
  if (opts.preview != null) return opts.preview;
  if (isBankAuthLoading(status)) return null;
  if (isBankPermanent(status)) return opts.server;
  if (shouldUseGuestBank(status)) return opts.local;
  return null;
}

// --- Cold signed-in launch: loading must never use guest local ---
{
  const localGuest = 12_500;
  const shown = displayBalance('loading', { server: null, local: localGuest });
  assert.equal(shown, null, 'cold launch while loading → pending, not guest');
  assert.notEqual(shown, 0, 'must not coerce to $0');
  assert.notEqual(shown, localGuest, 'must not flash guest bank while loading');
}

// --- Slow authentication: still pending until permanent resolves ---
{
  const shown = displayBalance('loading', {
    server: 999_999, // leftover in module store from a prior session
    local: 0,
  });
  assert.equal(shown, null, 'slow auth → ignore leftover server until status is permanent');
}

// --- After permanent resolves with matching cache ---
{
  const userId = 'user-a';
  const cached = balanceFromCacheForUser(
    { userId: 'user-a', balance: 250_000 },
    userId,
  );
  assert.equal(cached, 250_000);
  const shown = displayBalance('permanent', { server: cached, local: 0 });
  assert.equal(shown, 250_000, 'permanent + matching cache shows that balance');
}

// --- Cache for a different account must never apply ---
{
  const cached = balanceFromCacheForUser(
    { userId: 'user-a', balance: 888_000 },
    'user-b',
  );
  assert.equal(cached, null, 'wrong-account cache rejected');
  const shown = displayBalance('permanent', { server: cached, local: 50 });
  assert.equal(shown, null, 'no matching cache → pending, not guest/local');
}

// --- Missing / corrupt cache ---
{
  assert.equal(balanceFromCacheForUser(null, 'user-a'), null);
  assert.equal(balanceFromCacheForUser({ userId: 'user-a', balance: -1 }, 'user-a'), null);
  assert.equal(balanceFromCacheForUser({ userId: 'user-a', balance: Number.NaN }, 'user-a'), null);
  assert.equal(balanceFromCacheForUser({ userId: 'user-a', balance: 10 }, null), null);
}

// --- Guest sessions (auth resolved): may use local bank ---
{
  assert.equal(shouldUseGuestBank('guest'), true);
  assert.equal(shouldUseGuestBank('anonymous'), true);
  assert.equal(shouldUseGuestBank('needs_username'), true);
  assert.equal(shouldUseGuestBank('loading'), false);
  assert.equal(shouldUseGuestBank('unavailable'), false);
  assert.equal(shouldUseGuestBank('permanent'), false);

  const shown = displayBalance('guest', { server: 777, local: 3_000 });
  assert.equal(shown, 3_000, 'resolved guest uses device bank');
  // Legitimate zero for a fresh guest device is fine once auth resolved:
  assert.equal(displayBalance('guest', { server: null, local: 0 }), 0);
}

// --- Account switching: loading clears display; new user rejects old cache ---
{
  assert.equal(
    displayBalance('loading', { server: 500_000, local: 0 }),
    null,
    'switch → loading hides previous account bank',
  );
  const oldCache = balanceFromCacheForUser(
    { userId: 'user-a', balance: 500_000 },
    'user-b',
  );
  assert.equal(oldCache, null);
  assert.equal(
    displayBalance('permanent', { server: oldCache, local: 0 }),
    null,
    'new account with no cache → pending until pull, not $0 and not A’s bank',
  );
  const newCache = balanceFromCacheForUser(
    { userId: 'user-b', balance: 42_000 },
    'user-b',
  );
  assert.equal(
    displayBalance('permanent', { server: newCache, local: 0 }),
    42_000,
  );
}

// --- Never convert unknown/null into $0 at the display-gating layer ---
{
  const pending = displayBalance('permanent', { server: null, local: null });
  assert.equal(pending, null);
  // Call sites must use `balance == null ? '—' : formatCash(balance)`, not `?? 0`.
  const coerced = pending ?? 0;
  assert.equal(coerced, 0, 'documents the anti-pattern: ?? 0 would invent $0');
  assert.notEqual(pending, 0, 'Fix F forbids treating null as $0 in UI');
}

console.log('check-bank-display: all assertions passed');
