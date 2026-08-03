export const TEAMS = [
  { id: 'ATL', name: 'Hawks', conference: 'East' as const },
  { id: 'BOS', name: 'Celtics', conference: 'East' as const },
  { id: 'BKN', name: 'Nets', conference: 'East' as const },
  { id: 'CHA', name: 'Hornets', conference: 'East' as const },
  { id: 'CHI', name: 'Bulls', conference: 'East' as const },
  { id: 'CLE', name: 'Cavaliers', conference: 'East' as const },
  { id: 'DET', name: 'Pistons', conference: 'East' as const },
  { id: 'IND', name: 'Pacers', conference: 'East' as const },
  { id: 'MIA', name: 'Heat', conference: 'East' as const },
  { id: 'MIL', name: 'Bucks', conference: 'East' as const },
  { id: 'NYK', name: 'Knicks', conference: 'East' as const },
  { id: 'ORL', name: 'Magic', conference: 'East' as const },
  { id: 'PHI', name: '76ers', conference: 'East' as const },
  { id: 'TOR', name: 'Raptors', conference: 'East' as const },
  { id: 'WAS', name: 'Wizards', conference: 'East' as const },
  { id: 'DAL', name: 'Mavericks', conference: 'West' as const },
  { id: 'DEN', name: 'Nuggets', conference: 'West' as const },
  { id: 'GSW', name: 'Warriors', conference: 'West' as const },
  { id: 'HOU', name: 'Rockets', conference: 'West' as const },
  { id: 'LAC', name: 'Clippers', conference: 'West' as const },
  { id: 'LAL', name: 'Lakers', conference: 'West' as const },
  { id: 'MEM', name: 'Grizzlies', conference: 'West' as const },
  { id: 'MIN', name: 'Timberwolves', conference: 'West' as const },
  { id: 'NOP', name: 'Pelicans', conference: 'West' as const },
  { id: 'OKC', name: 'Thunder', conference: 'West' as const },
  { id: 'PHX', name: 'Suns', conference: 'West' as const },
  { id: 'POR', name: 'Trail Blazers', conference: 'West' as const },
  { id: 'SAC', name: 'Kings', conference: 'West' as const },
  { id: 'SAS', name: 'Spurs', conference: 'West' as const },
  { id: 'UTA', name: 'Jazz', conference: 'West' as const },
] as const;

export type TeamId = (typeof TEAMS)[number]['id'];

export function getTeam(id: string) {
  return TEAMS.find((t) => t.id === id);
}

export function getConference(id: string): 'East' | 'West' | null {
  return getTeam(id)?.conference ?? null;
}

export const DECADES = [
  '1960s',
  '1970s',
  '1980s',
  '1990s',
  '2000s',
  '2010s',
  '2020s',
] as const;

export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

export const POSITION_LABELS: Record<string, string> = {
  PG: 'Point Guard',
  SG: 'Shooting Guard',
  SF: 'Small Forward',
  PF: 'Power Forward',
  C: 'Center',
};
