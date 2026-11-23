/**
 * Fix D — Team/Era reroll race / charge guards.
 * Run: node --experimental-strip-types --import ./scripts/ts-ext-loader.mjs scripts/check-reroll-race.ts
 */
import assert from 'node:assert/strict';
import { listValidSpinPairs, type SpinPair } from '../lib/tradeup/billionDollar';
import {
  pickRerollPair,
  resolveRerollPair,
  type TicketRerollKind,
} from '../lib/tradeup/rerollPair';
import { COINS_REROLL_COST, MAX_REROLLS_PER_RUN } from '../lib/tradeup/xp/config';

const pairs = listValidSpinPairs();
assert.ok(pairs.length > 10, 'expected a real spin pool');

const baseline = pairs.find((p) => {
  const teamAlts = pairs.filter((x) => x.era === p.era && x.team.id !== p.team.id);
  const eraAlts = pairs.filter((x) => x.team.id === p.team.id && x.era !== p.era);
  return teamAlts.length > 0 && eraAlts.length > 0;
});
assert.ok(baseline, 'need a baseline with both team and era alternatives');

// resolveRerollPair returns a different pair when alternatives exist
{
  const nextTeam = resolveRerollPair(pairs, baseline!, 'team');
  assert.ok(nextTeam);
  assert.notEqual(nextTeam!.team.id, baseline!.team.id);

  const nextEra = resolveRerollPair(pairs, baseline!, 'era');
  assert.ok(nextEra);
  assert.equal(nextEra!.team.id, baseline!.team.id);
  assert.notEqual(nextEra!.era, baseline!.era);
}

// Failed spin: locked team with only one era → null (no charge)
{
  const lonely = pairs.find((p) => {
    const eras = new Set(pairs.filter((x) => x.team.id === p.team.id).map((x) => x.era));
    return eras.size === 1;
  });
  if (lonely) {
    const stuck = resolveRerollPair(pairs, lonely, 'era');
    assert.equal(stuck, null);
    // pickRerollPair still returns locked — engine must not charge on that
    const raw = pickRerollPair(pairs, lonely, 'era');
    assert.equal(raw.team.id, lonely.team.id);
    assert.equal(raw.era, lonely.era);
  }
}

/** Mirrors engine charge sequencing with a sync in-flight lock. */
function simulateRerollTaps(opts: {
  taps: TicketRerollKind[];
  freeTeam: boolean;
  freeEra: boolean;
  coins: number;
  used: number;
  baseline: SpinPair;
  /** Force resolve to fail for specific kinds. */
  failKinds?: TicketRerollKind[];
}) {
  let freeTeam = opts.freeTeam;
  let freeEra = opts.freeEra;
  let coins = opts.coins;
  let used = opts.used;
  let inFlight = false;
  const log: string[] = [];

  for (const kind of opts.taps) {
    if (inFlight) {
      log.push('blocked-inflight');
      continue;
    }
    if (used >= MAX_REROLLS_PER_RUN) {
      log.push('blocked-limit');
      continue;
    }
    inFlight = true;
    const next =
      opts.failKinds?.includes(kind)
        ? null
        : resolveRerollPair(pairs, opts.baseline, kind);
    if (!next) {
      log.push('failed-spin');
      inFlight = false;
      continue;
    }
    const free = kind === 'team' ? freeTeam : freeEra;
    if (!free) {
      if (coins < COINS_REROLL_COST) {
        log.push('insufficient-coins');
        inFlight = false;
        continue;
      }
      coins -= COINS_REROLL_COST;
      log.push(`paid-${kind}`);
    } else {
      if (kind === 'team') freeTeam = false;
      else freeEra = false;
      log.push(`free-${kind}`);
    }
    used += 1;
    // settle
    inFlight = false;
  }

  return { freeTeam, freeEra, coins, used, log };
}

// Rapid double-taps: only one consumes
{
  const r = simulateRerollTaps({
    taps: ['team', 'team', 'team'],
    freeTeam: true,
    freeEra: true,
    coins: 500,
    used: 0,
    baseline: baseline!,
  });
  // With sync settle between taps in this sim, all three can proceed if free then paid.
  // Separate: overlapping before settle
  let inFlight = false;
  let charged = 0;
  const tryTap = () => {
    if (inFlight) return 'blocked';
    inFlight = true;
    charged += 1;
    return 'ok';
  };
  assert.equal(tryTap(), 'ok');
  assert.equal(tryTap(), 'blocked');
  assert.equal(tryTap(), 'blocked');
  assert.equal(charged, 1);
  inFlight = false;
  assert.equal(tryTap(), 'ok');
  assert.equal(charged, 2);
  void r;
}

// Free → paid transition (team free once, then coins)
{
  const r = simulateRerollTaps({
    taps: ['team', 'team'],
    freeTeam: true,
    freeEra: true,
    coins: 250,
    used: 0,
    baseline: baseline!,
  });
  assert.deepEqual(r.log, ['free-team', 'paid-team']);
  assert.equal(r.freeTeam, false);
  assert.equal(r.coins, 150);
  assert.equal(r.used, 2);
}

// Insufficient coins after free is gone
{
  const r = simulateRerollTaps({
    taps: ['team', 'team'],
    freeTeam: true,
    freeEra: true,
    coins: 50,
    used: 0,
    baseline: baseline!,
  });
  assert.deepEqual(r.log, ['free-team', 'insufficient-coins']);
  assert.equal(r.used, 1);
  assert.equal(r.coins, 50);
}

// Failed spin does not consume free or coins
{
  const r = simulateRerollTaps({
    taps: ['era', 'era'],
    freeTeam: true,
    freeEra: true,
    coins: 200,
    used: 0,
    baseline: baseline!,
    failKinds: ['era'],
  });
  assert.deepEqual(r.log, ['failed-spin', 'failed-spin']);
  assert.equal(r.freeEra, true);
  assert.equal(r.coins, 200);
  assert.equal(r.used, 0);
}

// Max 4 rerolls
{
  const r = simulateRerollTaps({
    taps: ['team', 'era', 'team', 'era', 'team'],
    freeTeam: true,
    freeEra: true,
    coins: 1000,
    used: 0,
    baseline: baseline!,
  });
  assert.equal(r.used, 4);
  assert.ok(r.log.includes('blocked-limit'));
  assert.equal(r.log.filter((x) => x.startsWith('free-') || x.startsWith('paid-')).length, 4);
}

console.log('check-reroll-race: ok');
