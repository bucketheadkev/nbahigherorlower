/**
 * Fix C — Trivia gate uses settled evaluation total only.
 * Run: node --experimental-strip-types --import ./scripts/ts-ext-loader.mjs scripts/check-trivia-gate.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROLLOVER_GOAL, rolloverFor } from '../lib/tradeup/rollover';
import {
  decideTriviaGate,
  isTriviaEligibleFromSettledTotal,
  lockSettledTriviaTotal,
  type TriviaEligibility,
} from '../lib/tradeup/trivia/triviaGate';

const root = resolve(import.meta.dirname, '..');
const engine = readFileSync(resolve(root, 'components/tradeup/BillionTradeEngine.tsx'), 'utf8');
const results = readFileSync(
  resolve(root, 'components/tradeup/run/ClassicRunResults.tsx'),
  'utf8',
);

const pending = {
  evaluationSettled: false,
  settledTotal: 0,
  eligibility: 'pending' as TriviaEligibility,
};

// --- Winning run (above $1B): eligible once settled ---
{
  const win = ROLLOVER_GOAL + 50_000_000;
  assert.equal(isTriviaEligibleFromSettledTotal(win), true);
  assert.ok(rolloverFor(win) > 0);
  const locked = lockSettledTriviaTotal(pending, win);
  assert.equal(locked.lockedNow, true);
  assert.equal(locked.eligibility, 'eligible');
  assert.equal(locked.settledTotal, win);

  const open = decideTriviaGate({
    isClassicRun: true,
    evaluationSettled: locked.evaluationSettled,
    settledTotal: locked.settledTotal,
    eligibility: locked.eligibility,
    runRef: 'run-win',
    triviaOpened: false,
    triviaOpen: false,
  });
  assert.deepEqual(open, { action: 'open', runRef: 'run-win', settledTotal: win });
}

// --- Losing run (at or under $1B): skip Trivia ---
{
  const loss = ROLLOVER_GOAL - 1;
  assert.equal(isTriviaEligibleFromSettledTotal(loss), false);
  const locked = lockSettledTriviaTotal(pending, loss);
  assert.equal(locked.eligibility, 'ineligible');
  const decision = decideTriviaGate({
    isClassicRun: true,
    evaluationSettled: true,
    settledTotal: loss,
    eligibility: 'ineligible',
    runRef: 'run-loss',
    triviaOpened: false,
    triviaOpen: false,
  });
  assert.equal(decision.action, 'skip');
}

// --- Exact eligibility threshold: $1B exactly → no rollover → skip ---
{
  assert.equal(rolloverFor(ROLLOVER_GOAL), 0);
  assert.equal(isTriviaEligibleFromSettledTotal(ROLLOVER_GOAL), false);
  assert.equal(isTriviaEligibleFromSettledTotal(ROLLOVER_GOAL + 1), true);
}

// --- Delayed evaluation: not settled → wait (never open on partial/animated) ---
{
  const decision = decideTriviaGate({
    isClassicRun: true,
    evaluationSettled: false,
    settledTotal: 0,
    eligibility: 'pending',
    runRef: 'run-early',
    triviaOpened: false,
    triviaOpen: false,
  });
  assert.equal(decision.action, 'wait');
}

// --- Intermediate animated total must not be used: lock ignores later smaller/partial ---
{
  const full = ROLLOVER_GOAL + 120_000_000;
  const partial = Math.floor(full * 0.4); // mid-count
  let state = { ...pending };
  state = lockSettledTriviaTotal(state, full);
  assert.equal(state.settledTotal, full);
  const dup = lockSettledTriviaTotal(state, partial);
  assert.equal(dup.lockedNow, false);
  assert.equal(dup.settledTotal, full, 'duplicate/partial callback cannot replace settled total');
  assert.equal(dup.eligibility, 'eligible');
}

// --- Duplicate completion callbacks: eligibility resolved once ---
{
  const total = ROLLOVER_GOAL + 10;
  let state = { ...pending };
  const first = lockSettledTriviaTotal(state, total);
  state = first;
  const second = lockSettledTriviaTotal(state, total + 999);
  assert.equal(second.lockedNow, false);
  assert.equal(second.settledTotal, total);
  assert.equal(first.eligibility, second.eligibility);
}

// --- Rapid Build Another taps: open once, then ignore ---
{
  const total = ROLLOVER_GOAL + 1;
  const base = {
    isClassicRun: true,
    evaluationSettled: true,
    settledTotal: total,
    eligibility: 'eligible' as const,
    runRef: 'run-rapid',
  };
  const first = decideTriviaGate({ ...base, triviaOpened: false, triviaOpen: false });
  assert.equal(first.action, 'open');
  const second = decideTriviaGate({ ...base, triviaOpened: true, triviaOpen: true });
  assert.equal(second.action, 'ignore');
  const whileOpen = decideTriviaGate({ ...base, triviaOpened: false, triviaOpen: true });
  assert.equal(whileOpen.action, 'ignore');
}

// --- Source: gate must not fall back to live priced/sumTeamValue for Trivia ---
{
  assert.match(engine, /decideTriviaGate/, 'engine uses trivia gate helper');
  assert.match(engine, /lockSettledTriviaTotal|markTriviaEvaluationSettled/, 'locks settled total');
  assert.match(engine, /triviaOpenedRef/, 'once-open guard');
  assert.match(engine, /evaluationSettledRef/, 'settled flag');
  // requestPlayAgain body must not re-sum for the gate
  const gateSection = engine.slice(
    engine.indexOf('const requestPlayAgain'),
    engine.indexOf('const finishTrivia'),
  );
  assert.doesNotMatch(
    gateSection,
    /pricedLineup\(slots\)\.reduce|sumTeamValue\(rosterList/,
    'requestPlayAgain must not use live re-sum for Trivia',
  );
  assert.doesNotMatch(
    gateSection,
    /rolloverFor\(/,
    'eligibility precomputed at settle — not rechecked via live total',
  );
  // Results UI unchanged for Build Another wiring
  assert.match(results, /onPlayAgain\(\)/, 'Build Another still calls onPlayAgain');
  assert.match(results, /BUILD ANOTHER/, 'results CTA label preserved');
}

console.log('check-trivia-gate: all assertions passed');
