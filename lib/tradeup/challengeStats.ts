import { getBillionRuns, type BillionRun } from './billionRuns';

export interface RunChallengeStats {
  bestSinglePlayer: number;
  bestTopThreeSum: number;
  runsAtLeast1_1b: number;
  runsAtLeast1_25b: number;
}

export function statsFromBillionRuns(runs: BillionRun[] = getBillionRuns()): RunChallengeStats {
  let bestSinglePlayer = 0;
  let bestTopThreeSum = 0;
  let runsAtLeast1_1b = 0;
  let runsAtLeast1_25b = 0;

  for (const run of runs) {
    if (run.teamValue >= 1_100_000_000) runsAtLeast1_1b += 1;
    if (run.teamValue >= 1_250_000_000) runsAtLeast1_25b += 1;

    const values = run.players
      .map((p) => p.dollarValue)
      .filter((v) => v > 0)
      .sort((a, b) => b - a);

    if (values.length > 0) {
      bestSinglePlayer = Math.max(bestSinglePlayer, values[0] ?? 0);
    }
    if (values.length >= 3) {
      bestTopThreeSum = Math.max(bestTopThreeSum, values[0]! + values[1]! + values[2]!);
    }
  }

  return {
    bestSinglePlayer,
    bestTopThreeSum,
    runsAtLeast1_1b,
    runsAtLeast1_25b,
  };
}
