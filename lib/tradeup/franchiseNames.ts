/** Random franchise names for lock-in generation. */

import type { UserConference, UserTeamIdentity } from './userTeam';

const CITIES = [
  'Austin',
  'Brooklyn',
  'Chicago',
  'Denver',
  'Detroit',
  'Houston',
  'Memphis',
  'Miami',
  'Milwaukee',
  'Minneapolis',
  'Nashville',
  'Oakland',
  'Phoenix',
  'Portland',
  'Seattle',
  'Toronto',
  'Vegas',
];

const NAMES = [
  'Aces',
  'Blaze',
  'Cascades',
  'Comets',
  'Dynasty',
  'Empire',
  'Falcons',
  'Forge',
  'Kings',
  'Legion',
  'Riptide',
  'Royals',
  'Storm',
  'Titans',
  'Voltage',
  'Wolves',
];

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

export function generateFranchiseIdentity(
  preferredConference?: UserConference,
): UserTeamIdentity {
  return {
    city: pick(CITIES),
    name: pick(NAMES),
    conference: preferredConference ?? (Math.random() < 0.5 ? 'East' : 'West'),
  };
}

/** Fast “slot machine” candidates shown while generating. */
export function franchiseNameCandidates(count = 12): UserTeamIdentity[] {
  const out: UserTeamIdentity[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(generateFranchiseIdentity());
  }
  return out;
}
