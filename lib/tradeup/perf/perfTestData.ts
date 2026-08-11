/**
 * Fixed tiny dataset for optional Performance Test Build (stripped loop).
 * Not used when PERFORMANCE_TEST_BUILD is false.
 */

export interface PerfTeam {
  id: string;
  name: string;
  primary: string;
  ink: string;
}

export interface PerfPlayer {
  id: string;
  name: string;
  pos: string;
  value: number;
}

export const PERF_TEAMS: PerfTeam[] = [
  { id: 'LAL', name: 'Los Angeles Lakers', primary: '#552583', ink: '#ffffff' },
  { id: 'BOS', name: 'Boston Celtics', primary: '#007A33', ink: '#ffffff' },
  { id: 'CHI', name: 'Chicago Bulls', primary: '#CE1141', ink: '#ffffff' },
  { id: 'GSW', name: 'Golden State Warriors', primary: '#1D428A', ink: '#ffffff' },
  { id: 'MIA', name: 'Miami Heat', primary: '#98002E', ink: '#ffffff' },
  { id: 'NYK', name: 'New York Knicks', primary: '#006BB6', ink: '#ffffff' },
  { id: 'DAL', name: 'Dallas Mavericks', primary: '#00538C', ink: '#ffffff' },
  { id: 'DEN', name: 'Denver Nuggets', primary: '#0E2240', ink: '#ffffff' },
];

export const PERF_DECADES = ['1980s', '1990s', '2000s', '2010s'] as const;
export type PerfDecade = (typeof PERF_DECADES)[number];

export const PERF_PLAYERS: PerfPlayer[] = [
  { id: 'p1', name: 'Magic Johnson', pos: 'PG', value: 220_000_000 },
  { id: 'p2', name: 'Michael Jordan', pos: 'SG', value: 250_000_000 },
  { id: 'p3', name: 'Larry Bird', pos: 'SF', value: 210_000_000 },
  { id: 'p4', name: 'Karl Malone', pos: 'PF', value: 180_000_000 },
  { id: 'p5', name: 'Hakeem Olajuwon', pos: 'C', value: 200_000_000 },
  { id: 'p6', name: 'Steve Nash', pos: 'PG', value: 160_000_000 },
  { id: 'p7', name: 'Kobe Bryant', pos: 'SG', value: 230_000_000 },
  { id: 'p8', name: 'Tim Duncan', pos: 'PF', value: 215_000_000 },
];

export interface PerfSpinResult {
  team: PerfTeam;
  decade: PerfDecade;
  player: PerfPlayer;
}

export function pickPerfResult(): PerfSpinResult {
  const team = PERF_TEAMS[Math.floor(Math.random() * PERF_TEAMS.length)]!;
  const decade = PERF_DECADES[Math.floor(Math.random() * PERF_DECADES.length)]!;
  const player = PERF_PLAYERS[Math.floor(Math.random() * PERF_PLAYERS.length)]!;
  return { team, decade, player };
}

export function formatPerfDollars(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`;
  return `$${n.toLocaleString('en-US')}`;
}
