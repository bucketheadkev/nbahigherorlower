import { BILLION_GOAL } from './billionDollar';

/** Short reaction headlines on the final roster-value screen. No trailing periods. */
export function resultPhrase(teamValue: number): string {
  if (teamValue < 750_000_000) return 'MARKET MISS';
  if (teamValue < 900_000_000) return 'KEEP BUILDING';
  if (teamValue < BILLION_GOAL) return 'SO CLOSE';
  if (teamValue < 1_100_000_000) return 'BILLION';
  return 'BILLION RUN';
}
