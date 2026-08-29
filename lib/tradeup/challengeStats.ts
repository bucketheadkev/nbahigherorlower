import { getBillionRuns, type BillionRun } from './billionRuns';

export interface RunChallengeStats {
  runsAtLeast1_1b: number;
  runsAtLeast1_25b: number;
}

export function statsFromBillionRuns(runs: BillionRun[] = getBillionRuns()): RunChallengeStats {
  let runsAtLeast1_1b = 0;
  let runsAtLeast1_25b = 0;

  for (const run of runs) {
    if (run.teamValue >= 1_100_000_000) runsAtLeast1_1b += 1;
    if (run.teamValue >= 1_250_000_000) runsAtLeast1_25b += 1;
  }

  return {
    runsAtLeast1_1b,
    runsAtLeast1_25b,
  };
}
