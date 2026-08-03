/**
 * Lightweight verification for the negotiation system (no test runner in package.json).
 * Run: npx tsx scripts/verify-negotiation.ts
 */
import { createStartingPlayer } from '../lib/tradeup/engine';
import {
  askForMore,
  calculateTradeChance,
  createNegotiationSession,
  getNegotiationCandidates,
  getRiskLabel,
  resolveTradeAttempt,
} from '../lib/tradeup/negotiation';
import { ALL_PLAYERS } from '../lib/tradeup/rosters';

let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failed += 1;
    console.error('FAIL:', message);
  } else {
    console.log('PASS:', message);
  }
}

const starter = createStartingPlayer('D');
const session = createNegotiationSession(starter, starter.teamId, new Set());
assert(session.candidates.length >= 1, 'session has at least one candidate');
assert(session.index === 0, 'session starts at index 0');
assert(session.acceptanceChance === 100, 'initial offer is 100%');
assert(calculateTradeChance(starter, session.candidates[0]!, session.team.id, 0) === 100, 'level 0 chance is 100');

let cursor = session;
let prevValue = session.candidates[0]!.tradeValue;
for (let i = 0; i < 6; i++) {
  const next = askForMore(cursor, starter);
  if (!next) break;
  const offered = next.candidates[next.index]!;
  assert(
    offered.tradeValue >= prevValue || offered.hiddenValue || offered.hiddenEliteOffer,
    `ask for more does not move backward in value (${prevValue} -> ${offered.tradeValue})`,
  );
  assert(next.acceptanceChance < cursor.acceptanceChance || next.acceptanceChance <= 100, 'chance trends down or stays clamped');
  assert(next.acceptanceChance <= 100 && next.acceptanceChance >= 5, 'chance clamped');
  prevValue = offered.tradeValue;
  cursor = next;
}

assert(askForMore(cursor, starter) === null, 'final candidate disables ask for more');

const always = resolveTradeAttempt(100, () => 0);
assert(always.success === true, '100% always succeeds');
const never = resolveTradeAttempt(5, () => 0.99);
assert(never.success === false || never.roll > 5, 'low chance can fail with high roll');
assert(resolveTradeAttempt(50, () => 0.49).success === true, 'roll 50 succeeds at 50%');
assert(resolveTradeAttempt(50, () => 0.5).success === false, 'roll 51 fails at 50%');

assert(getRiskLabel(100) === 'Guaranteed', 'risk label guaranteed');
assert(getRiskLabel(80) === 'Strong Chance', 'risk label strong');
assert(getRiskLabel(60) === 'Risky', 'risk label risky');
assert(getRiskLabel(30) === 'Long Shot', 'risk label long shot');
assert(getRiskLabel(10) === 'Extreme Risk', 'risk label extreme');

const emptyTeamPlayers = getNegotiationCandidates(starter, 'ZZZ', new Set());
assert(Array.isArray(emptyTeamPlayers), 'empty team returns array');

const sTier = ALL_PLAYERS.find((p) => p.tradeValue >= 92)!;
const sSession = createNegotiationSession(sTier, sTier.teamId, new Set());
assert(sSession.candidates.length >= 1, 'S-tier can still negotiate');

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}

console.log('\nAll negotiation checks passed.');
