/** User-created franchise identity for season / playoff displays. */

export type UserConference = 'East' | 'West';

export interface UserTeamIdentity {
  city: string;
  name: string;
  conference: UserConference;
}

const KEY = 'tradeup_user_team_v1';

function cleanPart(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function isConference(value: unknown): value is UserConference {
  return value === 'East' || value === 'West';
}

export function formatUserTeamLabel(team: UserTeamIdentity | null | undefined): string {
  if (!team) return 'Your Team';
  const city = cleanPart(team.city, 24);
  const name = cleanPart(team.name, 24);
  if (!city && !name) return 'Your Team';
  if (!city) return name;
  if (!name) return city;
  return `${city} ${name}`;
}

export function getUserTeam(): UserTeamIdentity | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserTeamIdentity>;
    const city = typeof parsed.city === 'string' ? cleanPart(parsed.city, 24) : '';
    const name = typeof parsed.name === 'string' ? cleanPart(parsed.name, 24) : '';
    const conference = isConference(parsed.conference) ? parsed.conference : null;
    if (!city || !name || !conference) return null;
    return { city, name, conference };
  } catch {
    return null;
  }
}

export function saveUserTeam(input: {
  city: string;
  name: string;
  conference: UserConference;
}): UserTeamIdentity | null {
  if (typeof window === 'undefined') return null;
  const city = cleanPart(input.city, 24);
  const name = cleanPart(input.name, 24);
  if (!city || !name || !isConference(input.conference)) return null;
  const team = { city, name, conference: input.conference };
  localStorage.setItem(KEY, JSON.stringify(team));
  return team;
}
