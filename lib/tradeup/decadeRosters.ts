/**
 * Historical decade roster DB — preloaded once from generated JSON.
 * Source: data/decades/*.txt → scripts/build-decade-rosters.mjs
 */

import decadeData from './data/decadeRosters.json';
import { TEAMS } from './teams';
import type { Position, TeamInfo, TradePlayer } from './types';

export type DecadeEra =
  | '1960s'
  | '1970s'
  | '1980s'
  | '1990s'
  | '2000s'
  | '2010s'
  | '2020s';

export const DECADE_ERAS: DecadeEra[] = [
  '1960s',
  '1970s',
  '1980s',
  '1990s',
  '2000s',
  '2010s',
  '2020s',
];

export interface DecadeRosterPlayer {
  name: string;
  pos: Position;
  ppg: number;
  rpg: number;
  apg: number;
  bpg: number;
}

type DecadeDb = Record<string, Record<string, DecadeRosterPlayer[]>>;

/** Module-level cache — parsed once at import. */
const DB = decadeData as DecadeDb;

const ERA_MIDPOINT_AGE: Record<DecadeEra, number> = {
  '1960s': 28,
  '1970s': 28,
  '1980s': 28,
  '1990s': 28,
  '2000s': 27,
  '2010s': 27,
  '2020s': 26,
};

function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
}

/**
 * Trade-value 22–99 from box averages so tiers match the dollar curve.
 * ~15 PPG → C/B · ~22 all-star → A · ~27 prime → S · extreme peaks → GOAT (97+).
 */
export function estimateDecadeTradeValue(player: DecadeRosterPlayer): number {
  const idx =
    Math.max(0, player.ppg) * 1.15 +
    Math.max(0, player.rpg) * 0.5 +
    Math.max(0, player.apg) * 0.7 +
    Math.max(0, player.bpg) * 0.95;

  // idx → TV: keep GOAT (97–99) extremely rare
  const anchors: Array<[number, number]> = [
    [8, 26],
    [14, 42],
    [18, 55],
    [22, 70],
    [26, 82],
    [30, 90],
    [33, 93],
    [36, 95],
    [40, 97],
    [46, 98],
    [52, 99],
  ];

  if (idx <= anchors[0]![0]) {
    return Math.max(22, Math.round(anchors[0]![1] * (idx / anchors[0]![0])));
  }
  for (let i = 1; i < anchors.length; i += 1) {
    const [x1, y1] = anchors[i - 1]!;
    const [x0, y0] = anchors[i]!;
    if (idx <= x0) {
      const t = (idx - x1) / Math.max(0.001, x0 - x1);
      return Math.max(22, Math.min(99, Math.round(y1 + (y0 - y1) * t)));
    }
  }
  return 99;
}

/**
 * Hand-tuned GOAT / S placements by era + franchise.
 * Key: `${era}|${teamId}|${exact player name}` → forced tradeValue.
 * GOAT = 97–99 · high S ≈ 95–96 · low S ≈ 92.
 *
 * The box-score estimator overweight raw PPG/RPG/BPG peaks (Wilt, Oscar) and
 * under-ranks all-around primes (LeBron, Magic, Bird, Curry). Overrides restore
 * an intuitive hierarchy without inflating ordinary roster players.
 */
const DECADE_TV_OVERRIDES: Record<string, number> = {
  // 1960s — Wilt stays absolute peak; Russell rises above scoring-only formula
  '1960s|ATL|Bob Pettit': 95,
  '1960s|GSW|Rick Barry': 95,
  '1960s|HOU|Elvin Hayes': 95,
  '1960s|LAL|Elgin Baylor': 95,
  '1960s|WAS|Walt Bellamy': 95,
  // Below GOAT dollar floor — priced via decade dollar-band override ($190–199M)
  '1960s|BOS|Bill Russell': 96,
  '1960s|GSW|Wilt Chamberlain': 99,
  '1960s|PHI|Wilt Chamberlain': 98,
  '1960s|SAC|Oscar Robertson': 98,

  // 1970s — Bucks Kareem peak GOAT; Lakers Kareem high S
  '1970s|MIL|Kareem Abdul-Jabbar': 98,
  '1970s|LAL|Kareem Abdul-Jabbar': 96,
  '1970s|HOU|Elvin Hayes': 95,
  '1970s|LAC|Bob McAdoo': 95,
  '1970s|NYK|Bob McAdoo': 95,

  // 1980s — Peak MJ absolute top; Magic + Bird elite GOAT (not mid-S)
  '1980s|CHI|Michael Jordan': 99,
  '1980s|LAL|Magic Johnson': 98,
  // Low GOAT — priced via decade dollar-band override ($200–205M)
  '1980s|BOS|Larry Bird': 97,
  '1980s|HOU|Moses Malone': 94,
  '1980s|UTA|Adrian Dantley': 92,

  // 1990s — Second Jordan peak absolute top; Shaq/Hakeem high GOAT
  '1990s|CHI|Michael Jordan': 99,
  '1990s|ORL|Shaquille O\'Neal': 98,
  '1990s|LAL|Shaquille O\'Neal': 98,
  '1990s|HOU|Hakeem Olajuwon': 97,

  // 2000s — AI + T-Mac high S; prime CLE LeBron absolute top; Shaq/Kobe GOAT
  '2000s|ORL|Tracy McGrady': 96,
  '2000s|PHI|Allen Iverson': 96,
  '2000s|CLE|LeBron James': 99,
  '2000s|LAL|Shaquille O\'Neal': 98,
  '2000s|MIA|Shaquille O\'Neal': 98,
  '2000s|LAL|Kobe Bryant': 97,

  // 2010s — Peak CLE/MIA LeBron absolute top; Curry MVP decade GOAT; KD high S/GOAT
  '2010s|CLE|LeBron James': 99,
  '2010s|MIA|LeBron James': 99,
  '2010s|LAL|LeBron James': 97,
  '2010s|GSW|Stephen Curry': 97,
  '2010s|OKC|Kevin Durant': 97,
  '2010s|GSW|Kevin Durant': 97,
  '2010s|OKC|James Harden': 94,
  '2010s|OKC|Russell Westbrook': 94,
  '2010s|HOU|James Harden': 96,

  // 2020s — Jokic/Giannis/Wemby high GOAT; Curry GOAT; late-career LAL LeBron still GOAT
  '2020s|DEN|Nikola Jokić': 99,
  '2020s|SAS|Victor Wembanyama': 98,
  '2020s|MIL|Giannis Antetokounmpo': 98,
  '2020s|GSW|Stephen Curry': 97,
  '2020s|LAL|LeBron James': 97,
  '2020s|PHI|LeBron James': 99,
  '2020s|POR|Damian Lillard': 96,
  '2020s|HOU|James Harden': 96,
};

function overrideKey(era: DecadeEra, teamId: string, name: string): string {
  return `${era}|${teamId}|${name.trim()}`;
}

/** Box-score estimate, then authored era/franchise overrides. */
export function resolveDecadeTradeValue(
  player: DecadeRosterPlayer,
  teamId: string,
  era: DecadeEra,
): number {
  const forced = DECADE_TV_OVERRIDES[overrideKey(era, teamId, player.name)];
  if (typeof forced === 'number') {
    return Math.max(22, Math.min(99, Math.round(forced)));
  }
  return estimateDecadeTradeValue(player);
}

export function isDecadeEra(value: string): value is DecadeEra {
  return (DECADE_ERAS as string[]).includes(value);
}

export function getDecadeRoster(
  teamId: string,
  era: DecadeEra,
): DecadeRosterPlayer[] {
  try {
    const eraMap = DB[era];
    if (!eraMap) return [];
    const roster = eraMap[teamId];
    return Array.isArray(roster) ? roster : [];
  } catch (err) {
    console.warn('[decadeRosters] lookup failed', { teamId, era, err });
    return [];
  }
}

export function hasDecadeRoster(teamId: string, era: DecadeEra): boolean {
  return getDecadeRoster(teamId, era).length > 0;
}

export function teamsForEra(era: DecadeEra): TeamInfo[] {
  try {
    const eraMap = DB[era];
    if (!eraMap) return [];
    const ids = new Set(Object.keys(eraMap).filter((id) => (eraMap[id]?.length ?? 0) > 0));
    return TEAMS.filter((t) => ids.has(t.id));
  } catch (err) {
    console.warn('[decadeRosters] teamsForEra failed', { era, err });
    return [];
  }
}

export function erasForTeam(teamId: string): DecadeEra[] {
  return DECADE_ERAS.filter((era) => hasDecadeRoster(teamId, era));
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

/**
 * If team+era has no roster (franchise didn't exist yet, missing paste, etc.),
 * silently pick another valid franchise and/or decade.
 */
export function resolveValidTeamEra(
  team: TeamInfo,
  era: DecadeEra,
  prefer: 'team' | 'era' | 'either' = 'either',
): { team: TeamInfo; era: DecadeEra } {
  try {
    if (hasDecadeRoster(team.id, era)) {
      return { team, era };
    }

    console.warn(
      `[decadeRosters] Invalid pair ${team.id} · ${era} — resolving behind the scenes`,
    );

    const tryKeepEra = () => {
      const altTeam = pickRandom(teamsForEra(era));
      return altTeam ? { team: altTeam, era } : null;
    };
    const tryKeepTeam = () => {
      const altEra = pickRandom(erasForTeam(team.id));
      return altEra ? { team, era: altEra } : null;
    };

    if (prefer === 'era') {
      return tryKeepEra() ?? tryKeepTeam() ?? lastResortPair(team, era);
    }
    if (prefer === 'team') {
      return tryKeepTeam() ?? tryKeepEra() ?? lastResortPair(team, era);
    }
    // either — prefer swapping franchise first (common expansion miss)
    return tryKeepEra() ?? tryKeepTeam() ?? lastResortPair(team, era);
  } catch (err) {
    console.warn('[decadeRosters] resolveValidTeamEra failed', err);
    return { team, era };
  }
}

function lastResortPair(
  team: TeamInfo,
  era: DecadeEra,
): { team: TeamInfo; era: DecadeEra } {
  for (const fallbackEra of DECADE_ERAS) {
    const pool = teamsForEra(fallbackEra);
    const fallbackTeam = pickRandom(pool);
    if (fallbackTeam) {
      return { team: fallbackTeam, era: fallbackEra };
    }
  }
  console.warn('[decadeRosters] No valid pairs in DB — returning original');
  return { team, era };
}

export function spinRandomTeamForEra(era: DecadeEra): TeamInfo {
  const pool = teamsForEra(era);
  return pickRandom(pool) ?? TEAMS[Math.floor(Math.random() * TEAMS.length)]!;
}

export function spinRandomEraForTeam(teamId: string): DecadeEra {
  const pool = erasForTeam(teamId);
  return pickRandom(pool) ?? DECADE_ERAS[Math.floor(Math.random() * DECADE_ERAS.length)]!;
}

/** Convert a historical row into a TradePlayer for the draft board. */
export function decadePlayerToTradePlayer(
  player: DecadeRosterPlayer,
  teamId: string,
  era: DecadeEra,
): TradePlayer {
  const cleanName = player.name.trim();
  const id = `hist_${era}_${teamId}_${slugify(cleanName)}`;
  const pos = player.pos;
  const tradeValue = resolveDecadeTradeValue(player, teamId, era);
  return {
    id,
    name: cleanName,
    teamId,
    primaryPosition: pos,
    position: pos,
    age: ERA_MIDPOINT_AGE[era],
    stats: {
      ppg: player.ppg,
      rpg: player.rpg,
      apg: player.apg,
      spg: 0,
      bpg: player.bpg,
    },
    tradeValue,
    isStarter: tradeValue >= 62,
    isFranchise: tradeValue >= 88,
  };
}
