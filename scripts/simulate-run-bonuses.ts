/**
 * Run Bonus checks. Proves every bonus is achievable from the real player database (searches for
 * a lineup that meets it) and estimates how often each is completed with real spins, era
 * rosters, eligibility and seat prices — plus the Bank Cash a run is worth on average.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/simulate-run-bonuses.ts [runs]
 */

import { getEligiblePositions } from '../lib/tradeup/alternatePositions';
import { buildEraRoster, getDollarValueForSlot, listValidSpinPairs, type SpinPair } from '../lib/tradeup/billionDollar';
import { RUN_BONUSES, runBonusFacts, TIER_ODDS, type RunBonusFacts } from '../lib/tradeup/runBonuses';
import { LINEUP_POSITIONS } from '../lib/tradeup/startingLineup';
import type { Position } from '../lib/tradeup/types';

const RUNS = Number(process.argv[2] ?? 20000);

const pairs = listValidSpinPairs();
const teams = [...new Map(pairs.map((p) => [p.team.id, p.team])).values()];
const erasFor = (teamId: string) => [...new Set(pairs.filter((p) => p.team.id === teamId).map((p) => p.era))];
const rand = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]!;
const slugOf = (id: string) => id.replace(/^hist_\d{4}s_[A-Za-z]+_/, '');

function spin(): SpinPair {
  const team = rand(teams);
  return { team, era: rand(erasFor(team.id)) };
}

function reroll(pair: SpinPair, kind: 'team' | 'era'): SpinPair {
  if (kind === 'team') {
    const others = teams.filter((t) => t.id !== pair.team.id);
    const team = rand(others);
    const eras = erasFor(team.id);
    return { team, era: eras.includes(pair.era) ? pair.era : rand(eras) };
  }
  const eras = erasFor(pair.team.id).filter((e) => e !== pair.era);
  return eras.length ? { team: pair.team, era: rand(eras) } : pair;
}

type Seat = { playerId: string; slot: Position; primary: Position; value: number };

function bestSeat(pair: SpinPair, open: Set<Position>, taken: Set<string>, primaryOnly: boolean): Seat | null {
  let best: Seat | null = null;
  for (const player of buildEraRoster(pair.team, pair.era)) {
    if (taken.has(slugOf(player.id))) continue;
    for (const slot of getEligiblePositions(player)) {
      if (!open.has(slot) || (primaryOnly && slot !== player.primaryPosition)) continue;
      const value = getDollarValueForSlot(player, slot);
      if (!best || value > best.value) {
        best = { playerId: player.id, slot, primary: player.primaryPosition as Position, value };
      }
    }
  }
  return best;
}

/** Greedy best-available draft; optional rerolls below a threshold; optionally primary seats only. */
function simulate(rerollBelow: number, primaryOnly: boolean): RunBonusFacts {
  const open = new Set<Position>(LINEUP_POSITIONS);
  const taken = new Set<string>();
  const seats: Seat[] = [];
  const left = { team: rerollBelow > 0 ? 1 : 0, era: rerollBelow > 0 ? 1 : 0 };
  let rerollsUsed = false;
  let guard = 0;
  while (open.size > 0 && guard++ < 60) {
    let pair = spin();
    let pick = bestSeat(pair, open, taken, primaryOnly) ?? bestSeat(pair, open, taken, false);
    for (const kind of ['team', 'era'] as const) {
      if (left[kind] > 0 && (!pick || pick.value < rerollBelow)) {
        left[kind] = 0;
        rerollsUsed = true;
        pair = reroll(pair, kind);
        pick = bestSeat(pair, open, taken, primaryOnly) ?? bestSeat(pair, open, taken, false);
      }
    }
    if (!pick) continue;
    open.delete(pick.slot);
    taken.add(slugOf(pick.playerId));
    seats.push(pick);
  }
  return runBonusFacts(seats, rerollsUsed);
}

// ── Feasibility: search the whole database for a lineup that meets each bonus ──
const pool: Seat[] = [];
for (const pair of pairs) {
  for (const player of buildEraRoster(pair.team, pair.era)) {
    for (const slot of getEligiblePositions(player)) {
      pool.push({ playerId: player.id, slot, primary: player.primaryPosition as Position, value: getDollarValueForSlot(player, slot) });
    }
  }
}
const uniquePool = [...new Map(pool.map((s) => [`${s.playerId}:${s.slot}`, s])).values()];

function search(meets: (f: RunBonusFacts) => boolean, prefer: (s: Seat) => boolean): Seat[] | null {
  const byPos = new Map<Position, Seat[]>();
  for (const pos of LINEUP_POSITIONS) {
    byPos.set(
      pos,
      uniquePool
        .filter((s) => s.slot === pos)
        .sort((a, b) => Number(prefer(b)) - Number(prefer(a)) || b.value - a.value)
        .slice(0, 60),
    );
  }
  const chosen: Seat[] = [];
  let steps = 0;
  const dfs = (i: number): boolean => {
    if (steps++ > 400_000) return false;
    if (i === LINEUP_POSITIONS.length) return meets(runBonusFacts(chosen, false));
    for (const seat of byPos.get(LINEUP_POSITIONS[i]!)!) {
      if (chosen.some((c) => slugOf(c.playerId) === slugOf(seat.playerId))) continue;
      chosen.push(seat);
      if (dfs(i + 1)) return true;
      chosen.pop();
    }
    return false;
  };
  return dfs(0) ? [...chosen] : null;
}

console.log('Feasibility (a real lineup that meets each bonus):');
let allFeasible = true;
for (const bonus of RUN_BONUSES) {
  const prefer =
    bonus.id === 'goat_combination'
      ? (s: Seat) => ['michael_jordan', 'lebron_james'].includes(slugOf(s.playerId))
      : bonus.id === 'perfect_fit' || bonus.id === 'untouchable'
        ? (s: Seat) => s.slot === s.primary
        : () => false;
  const lineup = search(bonus.met, prefer);
  if (!lineup) allFeasible = false;
  const facts = lineup ? runBonusFacts(lineup, false) : null;
  console.log(
    `  ${lineup ? 'ok  ' : 'FAIL'} ${bonus.name.en.padEnd(22)} ${
      facts ? `$${facts.total.toLocaleString('en-US')} · ${lineup!.map((s) => `${s.slot} ${slugOf(s.playerId)}`).join(', ')}` : 'no lineup found'
    }`,
  );
}

// ── Completion rates: best of a few honest strategies per bonus ──
const strategies = [
  { label: 'steady', rerollBelow: 0, primaryOnly: false },
  { label: 'reroll<185M', rerollBelow: 185_000_000, primaryOnly: false },
  { label: 'reroll<195M', rerollBelow: 195_000_000, primaryOnly: false },
  { label: 'primary-only', rerollBelow: 0, primaryOnly: true },
];
const best = new Map<string, { p: number; label: string }>();
for (const s of strategies) {
  const wins = new Map<string, number>();
  for (let i = 0; i < RUNS; i += 1) {
    const facts = simulate(s.rerollBelow, s.primaryOnly);
    for (const b of RUN_BONUSES) if (b.met(facts)) wins.set(b.id, (wins.get(b.id) ?? 0) + 1);
  }
  for (const b of RUN_BONUSES) {
    const p = (wins.get(b.id) ?? 0) / RUNS;
    if (!best.has(b.id) || p > best.get(b.id)!.p) best.set(b.id, { p, label: s.label });
  }
}

console.log(`\nCompletion (${RUNS} simulated runs per strategy, best strategy shown):`);
let ev = 0;
for (const tier of [1, 2, 3, 4] as const) {
  const inTier = RUN_BONUSES.filter((b) => b.tier === tier);
  console.log(`  Tier ${tier} (${TIER_ODDS[tier]}% of runs)`);
  for (const b of inTier) {
    const { p, label } = best.get(b.id)!;
    ev += (TIER_ODDS[tier] / 100 / inTier.length) * p * b.reward;
    console.log(
      `    ${b.name.en.padEnd(22)} ${(p * 100).toFixed(2).padStart(6)}%  ${label.padEnd(13)} reward $${b.reward.toLocaleString('en-US')}`,
    );
  }
}
console.log(`\nAverage Run Bonus Cash per run: $${Math.round(ev).toLocaleString('en-US')}`);
console.log(`Runs to $1,000,000,000 from Run Bonuses alone: ~${Math.round(1e9 / ev).toLocaleString('en-US')}`);
console.log(allFeasible ? 'ALL 20 BONUSES ACHIEVABLE' : 'SOME BONUSES NOT ACHIEVABLE');
process.exit(allFeasible ? 0 : 1);
