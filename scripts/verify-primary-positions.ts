/**
 * Verify strict primary-position generation for free cards and Trade Up.
 * Run: npx --yes tsx scripts/verify-primary-positions.ts
 */
import { ALL_PLAYERS, getPlayerById } from '../lib/tradeup/rosters';
import { getPlayersByPrimaryPosition } from '../lib/tradeup/lineupEligibility';
import {
  generateFreeLineup,
  generateMarketOffers,
  rollGuaranteedSSlot,
} from '../lib/tradeup/lineupOffers';
import { validateRosterPrimaryPositions } from '../lib/tradeup/primaryPositionValidation';
import { LINEUP_POSITIONS } from '../lib/tradeup/startingLineup';
import type { Position } from '../lib/tradeup/types';

const issues: string[] = [];

const rosterIssues = validateRosterPrimaryPositions();
for (const issue of rosterIssues) issues.push(issue.message);

const sga = getPlayerById('sga');
const jokic = getPlayerById('jokic');
if (!sga || sga.primaryPosition !== 'PG') {
  issues.push(`SGA must be PG, got ${sga?.primaryPosition}`);
}
if (!jokic || jokic.primaryPosition !== 'C') {
  issues.push(`Jokić must be C, got ${jokic?.primaryPosition}`);
}

const counts = Object.fromEntries(
  LINEUP_POSITIONS.map((pos) => [pos, getPlayersByPrimaryPosition(pos).length]),
) as Record<Position, number>;
for (const pos of LINEUP_POSITIONS) {
  if (counts[pos] < 3) issues.push(`Pool for ${pos} is too small: ${counts[pos]}`);
}

// Free lineup generations
for (let i = 0; i < 40; i += 1) {
  const lineup = generateFreeLineup(rollGuaranteedSSlot());
  for (const slot of LINEUP_POSITIONS) {
    const player = lineup[slot];
    if (player.primaryPosition !== slot) {
      issues.push(`Free gen ${i}: ${slot} got ${player.name} (${player.primaryPosition})`);
    }
    if (player.id === 'sga' && slot !== 'PG') {
      issues.push(`SGA appeared at ${slot}`);
    }
    if (player.id === 'jokic' && slot !== 'C') {
      issues.push(`Jokić appeared at ${slot}`);
    }
  }
}

// Market + rerolls per position
for (const slot of LINEUP_POSITIONS) {
  const used = new Set<string>();
  const free = generateFreeLineup(null)[slot];
  used.add(free.id);

  for (let r = 0; r < 20; r += 1) {
    const offers = generateMarketOffers({
      slot,
      credits: 1000,
      excludeIds: used,
      avoidFingerprint: null,
    });
    if (offers.length > 3) issues.push(`${slot} reroll ${r}: more than 3 offers`);
    for (const offer of offers) {
      if (offer.primaryPosition !== slot) {
        issues.push(`${slot} reroll ${r}: ${offer.name} is ${offer.primaryPosition}`);
      }
      if (offer.id === 'sga' && slot !== 'PG') issues.push(`SGA in ${slot} market`);
      if (offer.id === 'jokic' && slot !== 'C') issues.push(`Jokić in ${slot} market`);
    }
  }
}

// SGA / Jokić never leave their pools
const sgaOnlyPg = getPlayersByPrimaryPosition('PG').some((p) => p.id === 'sga');
const sgaElsewhere = LINEUP_POSITIONS.filter((p) => p !== 'PG').some((pos) =>
  getPlayersByPrimaryPosition(pos).some((p) => p.id === 'sga'),
);
const jokicOnlyC = getPlayersByPrimaryPosition('C').some((p) => p.id === 'jokic');
const jokicElsewhere = LINEUP_POSITIONS.filter((p) => p !== 'C').some((pos) =>
  getPlayersByPrimaryPosition(pos).some((p) => p.id === 'jokic'),
);
if (!sgaOnlyPg || sgaElsewhere) issues.push('SGA primary pool incorrect');
if (!jokicOnlyC || jokicElsewhere) issues.push('Jokić primary pool incorrect');

console.log(
  JSON.stringify(
    {
      ok: issues.length === 0,
      totalPlayers: ALL_PLAYERS.length,
      counts,
      issueCount: issues.length,
      issues: issues.slice(0, 40),
    },
    null,
    2,
  ),
);

if (issues.length > 0) process.exit(1);
