/**
 * Local XP / Bank isolation checks (no network).
 *   npm run check:xp-isolation
 */
import assert from 'node:assert/strict';

const store = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  },
  dispatchEvent: () => true,
};
(globalThis as { localStorage?: unknown }).localStorage = (
  globalThis as { window: { localStorage: Storage } }
).window.localStorage;

const xp = await import('../lib/tradeup/xp/storage');
const bank = await import('../lib/tradeup/bank');

store.clear();
xp.saveXpProfile({
  version: 1,
  totalXp: 5000,
  coins: 80,
  awardedRunRefs: ['guest-run'],
  welcomeGranted: true,
});
assert.ok(xp.getXpProgress().level > 1, 'guest has elevated level');

xp.prepareLocalXpForAccountBind();
xp.bindXpProfileOwner('user-a');
assert.equal(xp.getXpProfile().totalXp, 0, 'new account A starts at 0 XP');
assert.equal(xp.getXpProgress().level, 1, 'new account A starts at level 1');
assert.equal(xp.getXpProfile().coins, 0, 'new account A starts at 0 coins');

xp.saveXpProfile({
  version: 1,
  totalXp: 1200,
  coins: 40,
  awardedRunRefs: ['a-run'],
  welcomeGranted: true,
});
const levelA = xp.getXpProgress().level;

xp.bindXpProfileOwner('user-b');
assert.equal(xp.getXpProfile().totalXp, 0, 'account B does not inherit A');
assert.equal(xp.getXpProgress().level, 1, 'account B starts at level 1');

xp.bindXpProfileOwner('user-a');
assert.equal(xp.getXpProfile().totalXp, 1200, 'returning to A restores XP');
assert.equal(xp.getXpProgress().level, levelA, 'returning to A restores level');

xp.detachXpProfileToGuest();
assert.equal(xp.getActiveXpOwner(), 'guest');
assert.equal(xp.getXpProfile().totalXp, 5000, 'guest bucket preserved');

assert.equal(bank.challengeReward('elite-company'), 0, 'achievement cash disabled');
assert.equal(bank.challengeReward('hit-1b'), 0, 'hit-1b cash disabled');
assert.equal(bank.getBankBalance(), 0, 'guest bank ignores achievements');
bank.appendLocalLedger({ ref: 'trivia-1', amount: 25_000, kind: 'trivia_bonus' });
assert.equal(bank.getBankBalance(), 25_000, 'guest bank still counts ledger');

console.log('xp-account-isolation: ALL PASS');
