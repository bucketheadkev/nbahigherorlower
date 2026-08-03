import type { TeamInfo, TeamPreferences } from './types';
import { getTeamLogoUrl } from './teamLogos';

export const TEAMS: TeamInfo[] = [
  { id: 'ATL', city: 'Atlanta', name: 'Hawks', fullName: 'Atlanta Hawks', conference: 'East' },
  { id: 'BOS', city: 'Boston', name: 'Celtics', fullName: 'Boston Celtics', conference: 'East' },
  { id: 'BKN', city: 'Brooklyn', name: 'Nets', fullName: 'Brooklyn Nets', conference: 'East' },
  { id: 'CHA', city: 'Charlotte', name: 'Hornets', fullName: 'Charlotte Hornets', conference: 'East' },
  { id: 'CHI', city: 'Chicago', name: 'Bulls', fullName: 'Chicago Bulls', conference: 'East' },
  { id: 'CLE', city: 'Cleveland', name: 'Cavaliers', fullName: 'Cleveland Cavaliers', conference: 'East' },
  { id: 'DET', city: 'Detroit', name: 'Pistons', fullName: 'Detroit Pistons', conference: 'East' },
  { id: 'IND', city: 'Indiana', name: 'Pacers', fullName: 'Indiana Pacers', conference: 'East' },
  { id: 'MIA', city: 'Miami', name: 'Heat', fullName: 'Miami Heat', conference: 'East' },
  { id: 'MIL', city: 'Milwaukee', name: 'Bucks', fullName: 'Milwaukee Bucks', conference: 'East' },
  { id: 'NYK', city: 'New York', name: 'Knicks', fullName: 'New York Knicks', conference: 'East' },
  { id: 'ORL', city: 'Orlando', name: 'Magic', fullName: 'Orlando Magic', conference: 'East' },
  { id: 'PHI', city: 'Philadelphia', name: '76ers', fullName: 'Philadelphia 76ers', conference: 'East' },
  { id: 'TOR', city: 'Toronto', name: 'Raptors', fullName: 'Toronto Raptors', conference: 'East' },
  { id: 'WAS', city: 'Washington', name: 'Wizards', fullName: 'Washington Wizards', conference: 'East' },
  { id: 'DAL', city: 'Dallas', name: 'Mavericks', fullName: 'Dallas Mavericks', conference: 'West' },
  { id: 'DEN', city: 'Denver', name: 'Nuggets', fullName: 'Denver Nuggets', conference: 'West' },
  { id: 'GSW', city: 'Golden State', name: 'Warriors', fullName: 'Golden State Warriors', conference: 'West' },
  { id: 'HOU', city: 'Houston', name: 'Rockets', fullName: 'Houston Rockets', conference: 'West' },
  { id: 'LAC', city: 'LA', name: 'Clippers', fullName: 'LA Clippers', conference: 'West' },
  { id: 'LAL', city: 'Los Angeles', name: 'Lakers', fullName: 'Los Angeles Lakers', conference: 'West' },
  { id: 'MEM', city: 'Memphis', name: 'Grizzlies', fullName: 'Memphis Grizzlies', conference: 'West' },
  { id: 'MIN', city: 'Minnesota', name: 'Timberwolves', fullName: 'Minnesota Timberwolves', conference: 'West' },
  { id: 'NOP', city: 'New Orleans', name: 'Pelicans', fullName: 'New Orleans Pelicans', conference: 'West' },
  { id: 'OKC', city: 'Oklahoma City', name: 'Thunder', fullName: 'Oklahoma City Thunder', conference: 'West' },
  { id: 'PHX', city: 'Phoenix', name: 'Suns', fullName: 'Phoenix Suns', conference: 'West' },
  { id: 'POR', city: 'Portland', name: 'Trail Blazers', fullName: 'Portland Trail Blazers', conference: 'West' },
  { id: 'SAC', city: 'Sacramento', name: 'Kings', fullName: 'Sacramento Kings', conference: 'West' },
  { id: 'SAS', city: 'San Antonio', name: 'Spurs', fullName: 'San Antonio Spurs', conference: 'West' },
  { id: 'UTA', city: 'Utah', name: 'Jazz', fullName: 'Utah Jazz', conference: 'West' },
];

export const TEAM_PREFERENCES: Record<string, TeamPreferences> = {
  ATL: { winNow: 0.4, youth: 0.8, defense: 0.5, shooting: 0.6, upside: 0.85 },
  BOS: { winNow: 0.9, youth: 0.3, defense: 0.85, shooting: 0.7, upside: 0.4 },
  BKN: { winNow: 0.5, youth: 0.7, defense: 0.4, shooting: 0.6, upside: 0.75 },
  CHA: { winNow: 0.2, youth: 0.95, defense: 0.5, shooting: 0.5, upside: 0.95 },
  CHI: { winNow: 0.6, youth: 0.75, defense: 0.6, shooting: 0.5, upside: 0.8 },
  CLE: { winNow: 0.85, youth: 0.5, defense: 0.7, shooting: 0.65, upside: 0.55 },
  DET: { winNow: 0.15, youth: 0.95, defense: 0.55, shooting: 0.45, upside: 0.95 },
  IND: { winNow: 0.55, youth: 0.7, defense: 0.5, shooting: 0.75, upside: 0.8 },
  MIA: { winNow: 0.85, youth: 0.35, defense: 0.95, shooting: 0.55, upside: 0.45 },
  MIL: { winNow: 0.9, youth: 0.35, defense: 0.75, shooting: 0.6, upside: 0.4 },
  NYK: { winNow: 0.9, youth: 0.4, defense: 0.8, shooting: 0.55, upside: 0.45 },
  ORL: { winNow: 0.5, youth: 0.85, defense: 0.75, shooting: 0.5, upside: 0.9 },
  PHI: { winNow: 0.85, youth: 0.45, defense: 0.7, shooting: 0.6, upside: 0.5 },
  TOR: { winNow: 0.4, youth: 0.8, defense: 0.65, shooting: 0.55, upside: 0.85 },
  WAS: { winNow: 0.25, youth: 0.9, defense: 0.4, shooting: 0.5, upside: 0.9 },
  DAL: { winNow: 0.8, youth: 0.5, defense: 0.45, shooting: 0.7, upside: 0.55 },
  DEN: { winNow: 0.85, youth: 0.45, defense: 0.55, shooting: 0.65, upside: 0.5 },
  GSW: { winNow: 0.75, youth: 0.5, defense: 0.5, shooting: 0.95, upside: 0.6 },
  HOU: { winNow: 0.3, youth: 0.95, defense: 0.55, shooting: 0.6, upside: 0.95 },
  LAC: { winNow: 0.9, youth: 0.35, defense: 0.7, shooting: 0.65, upside: 0.4 },
  LAL: { winNow: 0.95, youth: 0.25, defense: 0.55, shooting: 0.6, upside: 0.35 },
  MEM: { winNow: 0.55, youth: 0.75, defense: 0.85, shooting: 0.5, upside: 0.8 },
  MIN: { winNow: 0.75, youth: 0.55, defense: 0.7, shooting: 0.6, upside: 0.6 },
  NOP: { winNow: 0.5, youth: 0.7, defense: 0.6, shooting: 0.55, upside: 0.75 },
  OKC: { winNow: 0.6, youth: 0.95, defense: 0.75, shooting: 0.55, upside: 0.95 },
  PHX: { winNow: 0.9, youth: 0.3, defense: 0.5, shooting: 0.7, upside: 0.35 },
  POR: { winNow: 0.25, youth: 0.95, defense: 0.45, shooting: 0.55, upside: 0.95 },
  SAC: { winNow: 0.55, youth: 0.7, defense: 0.45, shooting: 0.7, upside: 0.75 },
  SAS: { winNow: 0.2, youth: 0.95, defense: 0.55, shooting: 0.5, upside: 0.95 },
  UTA: { winNow: 0.35, youth: 0.85, defense: 0.5, shooting: 0.55, upside: 0.9 },
};

export function getTeam(id: string): TeamInfo | undefined {
  const team = TEAMS.find((t) => t.id === id);
  if (!team) return undefined;
  const logoUrl = getTeamLogoUrl(id);
  return logoUrl ? { ...team, logoUrl } : team;
}

export function getTeamPreferences(id: string): TeamPreferences {
  return TEAM_PREFERENCES[id] ?? { winNow: 0.5, youth: 0.5, defense: 0.5, shooting: 0.5, upside: 0.5 };
}
