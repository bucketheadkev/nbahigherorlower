/**
 * Fix B — Trivia timer safety (no finish inside setState; once-only settle).
 * Run: node --experimental-strip-types --import ./scripts/ts-ext-loader.mjs scripts/check-trivia-timer.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TIMER_SECONDS } from '../lib/tradeup/trivia/index';
import {
  createTriviaSettleGuard,
  tickTriviaCountdown,
} from '../lib/tradeup/trivia/timerSafety';

const root = resolve(import.meta.dirname, '..');
const sheet = readFileSync(
  resolve(root, 'components/tradeup/trivia/ClassicTriviaSheet.tsx'),
  'utf8',
);

// --- Pure countdown: normal ticks + expiration ---
{
  let s = TIMER_SECONDS;
  let expired = false;
  const seen: number[] = [];
  while (!expired) {
    const tick = tickTriviaCountdown(s);
    s = tick.next;
    expired = tick.expired;
    seen.push(s);
  }
  assert.equal(seen[seen.length - 1], 0, 'normal expiration lands on 0');
  assert.equal(seen.length, TIMER_SECONDS, 'exactly TIMER_SECONDS ticks to expire');
  assert.deepEqual(tickTriviaCountdown(1), { next: 0, expired: true });
  assert.deepEqual(tickTriviaCountdown(0), { next: 0, expired: true });
  assert.deepEqual(tickTriviaCountdown(5), { next: 4, expired: false });
}

// --- Once-only settle guard (rapid answer taps / repeated timer callbacks) ---
{
  const guard = createTriviaSettleGuard();
  let finishes = 0;
  const finish = (choice: number | null) => {
    if (!guard.claim()) return;
    finishes += 1;
    void choice;
  };

  // Rapid answer taps
  finish(0);
  finish(1);
  finish(2);
  assert.equal(finishes, 1, 'rapid answer taps → finish once');

  guard.reset();
  finishes = 0;

  // Repeated timer callbacks at 0
  finish(null);
  finish(null);
  finish(null);
  assert.equal(finishes, 1, 'repeated timer callbacks → finish(null) once');

  guard.reset();
  finishes = 0;

  // Expiration during submission: answer wins, timeout no-ops
  finish(1);
  finish(null);
  assert.equal(finishes, 1, 'expiration during submission ignored');
}

// --- Simulated interval: expiration handled outside setState updater ---
{
  const guard = createTriviaSettleGuard();
  let display = TIMER_SECONDS;
  let remaining = TIMER_SECONDS;
  let finishCalls: Array<number | null> = [];
  const finish = (choice: number | null) => {
    if (!guard.claim()) return;
    finishCalls.push(choice);
  };

  // Mimic ClassicTriviaSheet interval body (not inside setSeconds updater)
  const onInterval = () => {
    const { next, expired } = tickTriviaCountdown(remaining);
    remaining = next;
    display = next; // setSeconds(next) equivalent
    if (!expired) return;
    finish(null); // outside updater
  };

  for (let i = 0; i < TIMER_SECONDS + 5; i += 1) onInterval();
  assert.equal(display, 0, 'display shows 0 after expiration');
  assert.deepEqual(finishCalls, [null], 'auto timeout result once after extra ticks');
}

// --- Skip / Continue remain independent of settle (doneRef pattern in sheet) ---
{
  let doneCalls = 0;
  let settled = false;
  let done = false;
  const closeSafe = () => {
    if (done) return;
    done = true;
    doneCalls += 1;
  };
  const finish = (_choice: number | null) => {
    if (settled || done) return;
    settled = true;
  };

  // Skip at pick (before play) — always responsive
  closeSafe();
  closeSafe();
  assert.equal(doneCalls, 1, 'Skip once');

  done = false;
  doneCalls = 0;
  settled = true; // timed out → result showing
  // Continue after timeout at 0s
  closeSafe();
  finish(null); // stray timer must not reopen settle path into pay
  assert.equal(doneCalls, 1, 'Continue after timeout works');
  assert.equal(settled, true);
}

// --- Source: finish must not be scheduled/called inside setSeconds updater ---
{
  assert.match(sheet, /tickTriviaCountdown\(remaining\)/, 'uses external remaining countdown');
  assert.match(sheet, /settledRef/, 'sync settle ref present');
  assert.match(sheet, /if \(settledRef\.current \|\| doneRef\.current\) return/, 'finish once-guard');
  assert.match(sheet, /finishRef\.current\(null\)/, 'timeout calls finish(null)');
  assert.doesNotMatch(
    sheet,
    /setSeconds\(\([^)]*\)\s*=>\s*\{[\s\S]*finish/,
    'never call finish inside a setSeconds updater',
  );
  assert.doesNotMatch(
    sheet,
    /setSeconds\(\([^)]*\)\s*=>\s*\{[\s\S]*finishRef/,
    'never touch finishRef inside a setSeconds updater',
  );
  assert.match(sheet, /onClick=\{closeSafe\}/, 'Skip/Continue stay wired');
  assert.match(
    sheet,
    /picked == null\s*\?\s*'Time ran out — no trivia bonus\.'/,
    'timeout still shows the timed-out result copy',
  );
}

console.log('check-trivia-timer: all assertions passed');
