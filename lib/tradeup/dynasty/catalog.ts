/**
 * Dynasty Road — the permanent collection ladder.
 *
 * Each real collection is the starting five from that team's title-clinching Finals game
 * (verified against the basketball-reference box scores). A collectible is a Classic player id,
 * `hist_{era}_{team}_{slug}`, so eligibility is tied to the championship team and era: 2010s Heat
 * LeBron and 2010s Cavaliers LeBron are different collectibles.
 *
 * Mirrored by supabase/migrations/20261107_1_dynasty_road.sql — the server validates every signing
 * against its own copy, never this file. scripts/check-dynasty-catalog.ts keeps the two in step.
 *
 * Collection progress is deliberately independent of a player's Classic dollar value.
 */

import { getHistPlayerById } from '@/lib/tradeup/decadeRosters';

export type DynastyPosition = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export interface DynastySlot {
  playerId: string;
  name: string;
  position: DynastyPosition;
}

export interface DynastyColors {
  primary: string;
  accent: string;
  /** Darkest shade, for the card's lit wash. */
  deep: string;
  /** Initials color on the primary. */
  ink: string;
}

export interface DynastyCollection {
  id: string;
  order: number;
  kind: 'championship' | 'final';
  season: number | null;
  teamId: string | null;
  era: string | null;
  team: string;
  /** "2011 Finals · Game 6" — which game the five comes from. */
  clincher: string | null;
  colors: DynastyColors;
  /** Five starters for a championship; empty for the sealed final collection. */
  slots: DynastySlot[];
}

const slot = (era: string, team: string, slug: string, name: string, position: DynastyPosition): DynastySlot => ({
  playerId: `hist_${era}_${team}_${slug}`,
  name,
  position,
});

export const DYNASTY_COLLECTIONS: DynastyCollection[] = [
  {
    id: 'dal-2011',
    order: 1,
    kind: 'championship',
    season: 2011,
    teamId: 'DAL',
    era: '2010s',
    team: 'Dallas Mavericks',
    clincher: '2011 Finals · Game 6',
    colors: { primary: '#0064B1', accent: '#C4CED4', deep: '#002B5E', ink: '#FFFFFF' },
    slots: [
      slot('2010s', 'DAL', 'jason_kidd', 'Jason Kidd', 'PG'),
      slot('2010s', 'DAL', 'j_j_barea', 'J.J. Barea', 'SG'),
      slot('2010s', 'DAL', 'shawn_marion', 'Shawn Marion', 'SF'),
      slot('2010s', 'DAL', 'dirk_nowitzki', 'Dirk Nowitzki', 'PF'),
      slot('2010s', 'DAL', 'tyson_chandler', 'Tyson Chandler', 'C'),
    ],
  },
  {
    id: 'det-2004',
    order: 2,
    kind: 'championship',
    season: 2004,
    teamId: 'DET',
    era: '2000s',
    team: 'Detroit Pistons',
    clincher: '2004 Finals · Game 5',
    colors: { primary: '#C8102E', accent: '#1D42BA', deep: '#3A0610', ink: '#FFFFFF' },
    slots: [
      slot('2000s', 'DET', 'chauncey_billups', 'Chauncey Billups', 'PG'),
      slot('2000s', 'DET', 'richard_hamilton', 'Richard Hamilton', 'SG'),
      slot('2000s', 'DET', 'tayshaun_prince', 'Tayshaun Prince', 'SF'),
      slot('2000s', 'DET', 'rasheed_wallace', 'Rasheed Wallace', 'PF'),
      slot('2000s', 'DET', 'ben_wallace', 'Ben Wallace', 'C'),
    ],
  },
  {
    id: 'mia-2013',
    order: 3,
    kind: 'championship',
    season: 2013,
    teamId: 'MIA',
    era: '2010s',
    team: 'Miami Heat',
    clincher: '2013 Finals · Game 7',
    colors: { primary: '#98002E', accent: '#F9A01B', deep: '#2A000D', ink: '#FFFFFF' },
    slots: [
      slot('2010s', 'MIA', 'mario_chalmers', 'Mario Chalmers', 'PG'),
      slot('2010s', 'MIA', 'dwyane_wade', 'Dwyane Wade', 'SG'),
      slot('2010s', 'MIA', 'mike_miller', 'Mike Miller', 'SF'),
      slot('2010s', 'MIA', 'lebron_james', 'LeBron James', 'PF'),
      slot('2010s', 'MIA', 'chris_bosh', 'Chris Bosh', 'C'),
    ],
  },
  {
    id: 'cle-2016',
    order: 4,
    kind: 'championship',
    season: 2016,
    teamId: 'CLE',
    era: '2010s',
    team: 'Cleveland Cavaliers',
    clincher: '2016 Finals · Game 7',
    colors: { primary: '#860038', accent: '#FDBB30', deep: '#26000F', ink: '#FFFFFF' },
    slots: [
      slot('2010s', 'CLE', 'kyrie_irving', 'Kyrie Irving', 'PG'),
      slot('2010s', 'CLE', 'j_r_smith', 'J.R. Smith', 'SG'),
      slot('2010s', 'CLE', 'lebron_james', 'LeBron James', 'SF'),
      slot('2010s', 'CLE', 'kevin_love', 'Kevin Love', 'PF'),
      slot('2010s', 'CLE', 'tristan_thompson', 'Tristan Thompson', 'C'),
    ],
  },
  {
    id: 'gsw-2017',
    order: 5,
    kind: 'championship',
    season: 2017,
    teamId: 'GSW',
    era: '2010s',
    team: 'Golden State Warriors',
    clincher: '2017 Finals · Game 5',
    colors: { primary: '#1D428A', accent: '#FFC72C', deep: '#08183A', ink: '#FFFFFF' },
    slots: [
      slot('2010s', 'GSW', 'stephen_curry', 'Stephen Curry', 'PG'),
      slot('2010s', 'GSW', 'klay_thompson', 'Klay Thompson', 'SG'),
      slot('2010s', 'GSW', 'kevin_durant', 'Kevin Durant', 'SF'),
      slot('2010s', 'GSW', 'draymond_green', 'Draymond Green', 'PF'),
      slot('2010s', 'GSW', 'zaza_pachulia', 'Zaza Pachulia', 'C'),
    ],
  },
  {
    id: 'chi-1996',
    order: 6,
    kind: 'championship',
    season: 1996,
    teamId: 'CHI',
    era: '1990s',
    team: 'Chicago Bulls',
    clincher: '1996 Finals · Game 6',
    colors: { primary: '#CE1141', accent: '#000000', deep: '#33040F', ink: '#FFFFFF' },
    slots: [
      slot('1990s', 'CHI', 'ron_harper', 'Ron Harper', 'PG'),
      slot('1990s', 'CHI', 'michael_jordan', 'Michael Jordan', 'SG'),
      slot('1990s', 'CHI', 'scottie_pippen', 'Scottie Pippen', 'SF'),
      slot('1990s', 'CHI', 'dennis_rodman', 'Dennis Rodman', 'PF'),
      slot('1990s', 'CHI', 'luc_longley', 'Luc Longley', 'C'),
    ],
  },
  {
    id: 'billion-five',
    order: 7,
    kind: 'final',
    season: null,
    teamId: null,
    era: null,
    team: 'The Billion Five',
    clincher: null,
    colors: { primary: '#1F6BFF', accent: '#3CF08F', deep: '#061436', ink: '#FFFFFF' },
    slots: [],
  },
];

export const DYNASTY_SLOT_COUNT = 5;

const byId = new Map(DYNASTY_COLLECTIONS.map((c) => [c.id, c]));

export function collectionById(id: string): DynastyCollection | undefined {
  return byId.get(id);
}

export interface DynastyMatch {
  collection: DynastyCollection;
  slot: DynastySlot;
}

/** Every collection this exact player (team + era) belongs to. Empty when he isn't collectible. */
export function collectiblesFor(playerId: string): DynastyMatch[] {
  const out: DynastyMatch[] = [];
  for (const collection of DYNASTY_COLLECTIONS) {
    const hit = collection.slots.find((s) => s.playerId === playerId);
    if (hit) out.push({ collection, slot: hit });
  }
  return out;
}

/** Collectible slots a lineup could sign from, in ladder order. */
export function collectiblesInLineup(playerIds: string[]): DynastyMatch[] {
  return playerIds.flatMap((id) => collectiblesFor(id)).sort(
    (a, b) => a.collection.order - b.collection.order || a.collection.slots.indexOf(a.slot) - b.collection.slots.indexOf(b.slot),
  );
}

/** False for a starter Classic never deals (he can't be signed from a run yet). */
export function inClassicPool(playerId: string): boolean {
  return getHistPlayerById(playerId) != null;
}

/** First and last initials, letters only: J.J. Barea → JB, Dirk Nowitzki → DN. */
export function initialsOf(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean);
  return (parts.length > 1 ? `${parts[0]![0]}${parts[parts.length - 1]![0]}` : (parts[0] ?? '?').slice(0, 2)).toUpperCase();
}

export const collectibleKey = (collectionId: string, playerId: string) => `${collectionId}:${playerId}`;
