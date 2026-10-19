/**
 * Bet on Yourself odds simulator. Uses the real spin pairs, era rosters, position eligibility
 * and seat pricing to estimate how often each wager wins, then suggests multipliers.
 *
 *   npx -y tsx scripts/simulate-wagers.ts [runs]
 *
 * Strategy "reroll": take the best-priced open seat each spin; use the team then era reroll
 * when the best seat on offer is weak. Strategy "steady": never reroll. A wager's odds are the
 * better of the two (players pick the strategy that suits their slip).
 */

import { buildEraRoster, getDollarValueForSlot, listValidSpinPairs, type SpinPair } from '../lib/tradeup/billionDollar';
import { getEligiblePositions } from '../lib/tradeup/alternatePositions';
import { LINEUP_POSITIONS } from '../lib/tradeup/startingLineup';
import type { Position } from '../lib/tradeup/types';
import { WAGERS, WAGER_MAX_TEAM_TARGET, type WagerRunFacts } from '../lib/tradeup/wagers';

const RUNS = Number(process.argv[2] ?? 20000);
const REROLL_BELOW = 185_000_000;
const HOUSE_RETURN = 0.9;

const pairs = listValidSpinPairs();
const teams = [...new Map(pairs.map((p) => [p.team.id, p.team])).values()];
const erasFor = (teamId: string) => [...new Set(pairs.filter((p) => p.team.id === teamId).map((p) => p.era))];
const rand = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]!;

function fairSpin(): SpinPair {
  const team = rand(teams);
  return { team, era: rand(erasFor(team.id)) };
}

function reroll(pair: SpinPair, kind: 'team' | 'era'): SpinPair {
  if (kind === 'team') {
    const others = teams.filter((t) => t.id !== pair.team.id);
    const same = others.filter((t) => erasFor(t.id).includes(pair.era));
    const team = rand(same.length ? same : others);
    const eras = erasFor(team.id);
    return { team, era: eras.includes(pair.era) ? pair.era : rand(eras) };
  }
  const eras = erasFor(pair.team.id).filter((e) => e !== pair.era);
  return eras.length ? { team: pair.team, era: rand(eras) } : pair;
}

const norm = (name: string) =>
  name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function bestSeat(pair: SpinPair, open: Set<Position>, taken: Set<string>) {
  let best: { value: number; slot: Position; name: string } | null = null;
  for (const player of buildEraRoster(pair.team, pair.era)) {
    if (taken.has(norm(player.name))) continue;
    for (const slot of getEligiblePositions(player)) {
      if (!open.has(slot)) continue;
      const value = getDollarValueForSlot(player, slot);
      if (!best || value > best.value) best = { value, slot, name: player.name };
    }
  }
  return best;
}

function simulate(useRerolls: boolean, rerollBelow = REROLL_BELOW): WagerRunFacts {
  const open = new Set<Position>(LINEUP_POSITIONS);
  const taken = new Set<string>();
  const draftValues: number[] = [];
  const left = { team: useRerolls ? 1 : 0, era: useRerolls ? 1 : 0 };
  let rerollsUsed = false;
  let guard = 0;
  while (open.size > 0 && guard++ < 50) {
    let pair = fairSpin();
    let pick = bestSeat(pair, open, taken);
    for (const kind of ['team', 'era'] as const) {
      if (left[kind] > 0 && (!pick || pick.value < rerollBelow)) {
        left[kind] = 0;
        rerollsUsed = true;
        pair = reroll(pair, kind);
        pick = bestSeat(pair, open, taken);
      }
    }
    if (!pick) continue; // no eligible player — spin again
    open.delete(pick.slot);
    taken.add(norm(pick.name));
    draftValues.push(pick.value);
  }
  return { total: draftValues.reduce((s, v) => s + v, 0), draftValues, rerollsUsed };
}

const THRESHOLDS = [0, 175_000_000, 185_000_000, 195_000_000, 205_000_000, 215_000_000];
const ROLLER_TARGETS = [1_005_000_000, 1_010_000_000, 1_015_000_000, 1_020_000_000, WAGER_MAX_TEAM_TARGET];

const best = new Map<string, { p: number; strategy: string }>();
const roller = new Map<number, number>();
let maxTotal = 0;
for (const threshold of THRESHOLDS) {
  const wins = new Map<string, number>();
  const rollerHere = new Map<number, number>();
  for (let i = 0; i < RUNS; i += 1) {
    const facts = simulate(threshold > 0, threshold);
    maxTotal = Math.max(maxTotal, facts.total);
    for (const w of WAGERS) if (w.wins(facts)) wins.set(w.id, (wins.get(w.id) ?? 0) + 1);
    for (const t of ROLLER_TARGETS) if (facts.total >= t) rollerHere.set(t, (rollerHere.get(t) ?? 0) + 1);
  }
  const label = threshold > 0 ? `reroll<${threshold / 1e6}M` : 'steady';
  for (const w of WAGERS) {
    const p = (wins.get(w.id) ?? 0) / RUNS;
    if (!best.has(w.id) || p > best.get(w.id)!.p) best.set(w.id, { p, strategy: label });
  }
  for (const t of ROLLER_TARGETS) roller.set(t, Math.max(roller.get(t) ?? 0, (rollerHere.get(t) ?? 0) / RUNS));
}

console.log(`runs per strategy: ${RUNS} · best total seen: $${maxTotal.toLocaleString('en-US')}`);
console.log('wager             best p   strategy        fair@90%   set     return');
for (const w of WAGERS) {
  const { p, strategy } = best.get(w.id)!;
  console.log(
    `${w.id.padEnd(16)}  ${(p * 100).toFixed(2).padStart(6)}%  ${strategy.padEnd(14)}  ${(p > 0 ? HOUSE_RETURN / p : Infinity).toFixed(2).padStart(7)}×  ${(w.multiplierX100 / 100).toFixed(2)}×  ${(p * w.multiplierX100 / 100).toFixed(3)}`,
  );
}
console.log('team-total targets (best strategy):');
for (const t of ROLLER_TARGETS) console.log(`  $${t.toLocaleString('en-US')}: ${((roller.get(t) ?? 0) * 100).toFixed(2)}%`);
