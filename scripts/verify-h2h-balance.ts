/**
 * Quick verification for trophy constants + rank difficulty progression.
 * Run: npx tsx scripts/verify-h2h-balance.ts
 */
import { ALL_PLAYERS } from '../lib/tradeup/rosters';
import {
  generateOpponentLineup,
  resolveHeadToHead,
  type LineupSlotPlayer,
} from '../lib/tradeup/headToHead';
import {
  RANK_LADDER,
  RANK_TARGET_WIN_RATE,
  TROPHY_LOSS_PENALTY,
  TROPHY_WIN_REWARD,
  type RankId,
} from '../lib/tradeup/ranks';
import { analyzeLineup, getPlayerSimulationStrength } from '../lib/tradeup/lineupSeason';
import { LINEUP_POSITIONS } from '../lib/tradeup/startingLineup';
import { clampTrophies } from '../lib/tradeup/ranks';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function pickUserLineup(seedQuality: 'weak' | 'average' | 'strong'): LineupSlotPlayer[] {
  const lineup: LineupSlotPlayer[] = [];
  const used = new Set<string>();
  for (const slot of LINEUP_POSITIONS) {
    const pool = ALL_PLAYERS.filter(
      (player) => player.primaryPosition === slot && !used.has(player.id),
    ).sort((a, b) => getPlayerSimulationStrength(b) - getPlayerSimulationStrength(a));
    const pick =
      seedQuality === 'strong'
        ? pool[Math.floor(pool.length * 0.12)]!
        : seedQuality === 'weak'
          ? pool[Math.floor(pool.length * 0.72)]!
          : pool[Math.floor(pool.length * 0.48)]!;
    used.add(pick.id);
    lineup.push({ slot, player: pick });
  }
  return lineup;
}

assert(TROPHY_WIN_REWARD === 50, `Win reward should be 50, got ${TROPHY_WIN_REWARD}`);
assert(TROPHY_LOSS_PENALTY === 35, `Loss penalty should be 35, got ${TROPHY_LOSS_PENALTY}`);
assert(clampTrophies(10 - 35) === 0, 'Trophies must floor at 0');
assert(clampTrophies(400 + 50) === 450, 'Win trophies add correctly');

const ranks = RANK_LADDER.map((rank) => rank.id);
const user = pickUserLineup('average');
const userPower = analyzeLineup(user.map((e) => e.player)).lineupScore;

const RUNS = 200;
const summary: Array<{
  rank: RankId;
  target: number;
  winRate: number;
  avgOppPower: number;
  powerGap: number;
}> = [];

for (const rank of ranks) {
  let wins = 0;
  let oppPowerSum = 0;
  for (let i = 0; i < RUNS; i += 1) {
    const opponent = generateOpponentLineup(user, rank);
    const result = resolveHeadToHead(user, opponent, rank);
    if (result.won) wins += 1;
    oppPowerSum += result.opponentPower;
  }
  const winRate = wins / RUNS;
  const avgOppPower = oppPowerSum / RUNS;
  summary.push({
    rank,
    target: RANK_TARGET_WIN_RATE[rank],
    winRate: +winRate.toFixed(3),
    avgOppPower: +avgOppPower.toFixed(2),
    powerGap: +(userPower - avgOppPower).toFixed(2),
  });
}

console.log(
  JSON.stringify(
    {
      trophyConstants: { TROPHY_WIN_REWARD, TROPHY_LOSS_PENALTY },
      userPower: +userPower.toFixed(2),
      summary,
    },
    null,
    2,
  ),
);

// Opponent quality should generally rise with rank (power gap shrinks / goes negative).
for (let i = 1; i < summary.length; i += 1) {
  assert(
    summary[i]!.avgOppPower + 1.5 >= summary[i - 1]!.avgOppPower,
    `Opponent power should not drop sharply from ${summary[i - 1]!.rank} to ${summary[i]!.rank}`,
  );
}

// Iron should be easiest (highest win rate among samples).
const iron = summary.find((row) => row.rank === 'iron')!;
const ace = summary.find((row) => row.rank === 'ace')!;
assert(iron.winRate > ace.winRate, 'Iron win rate should beat Ace');
assert(iron.winRate > 0.55, `Iron win rate too low: ${iron.winRate}`);
assert(iron.winRate < 0.88, `Iron win rate too high (auto-wins): ${iron.winRate}`);
assert(ace.winRate >= 0.2, `Ace win rate unrealistically low: ${ace.winRate}`);
assert(ace.winRate < 0.58, `Ace win rate too high: ${ace.winRate}`);
// Soft check vs targets — allow sample noise, require progressive difficulty.
assert(
  Math.abs(iron.winRate - iron.target) < 0.22,
  `Iron win rate far from target: ${iron.winRate} vs ${iron.target}`,
);

console.log('verify-h2h-balance: OK');
