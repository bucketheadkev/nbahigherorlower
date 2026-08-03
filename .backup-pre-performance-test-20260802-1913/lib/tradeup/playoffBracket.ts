/**
 * Full East / West playoff bracket that stays in sync with the user's series.
 */

import { TEAMS } from './teams';
import type { PlayoffRoundId } from './historicalPlayoffTeams';
import type { UserConference, UserTeamIdentity } from './userTeam';
import { formatUserTeamLabel } from './userTeam';

export type BracketRoundId = PlayoffRoundId | 'nba_finals';

export interface BracketTeam {
  id: string;
  label: string;
  short: string;
  /** 3-letter style code for bracket bars (e.g. LAL). */
  abbr: string;
  /** Key into TEAM_COLORS; user teams use a custom fallback. */
  colorKey: string;
  seed: number;
  conference: UserConference | 'Finals';
  isUser: boolean;
  strength: number;
  /** Regular-season wins for display next to abbr. */
  wins: number;
  /** Regular-season losses for display next to abbr. */
  losses: number;
}

export interface BracketSeriesState {
  id: string;
  round: BracketRoundId;
  conference: UserConference | 'Finals';
  high: BracketTeam;
  low: BracketTeam;
  highWins: number;
  lowWins: number;
  winnerId: string | null;
  status: 'pending' | 'active' | 'complete';
}

export interface PlayoffBracketState {
  userConference: UserConference;
  userSeed: number;
  east: BracketTeam[];
  west: BracketTeam[];
  series: BracketSeriesState[];
  /** Forecast labels for UI chips. */
  userNextOpponentId: string | null;
  otherConfFavoriteId: string | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
}

function strengthForSeed(seed: number, noise = true): number {
  const base = 96 - (seed - 1) * 3.4;
  return clamp(base + (noise ? (Math.random() - 0.5) * 4 : 0), 68, 98);
}

function makeAbbr(identity: UserTeamIdentity): string {
  const fromName = identity.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const fromCity = identity.city.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const merged = (fromName + fromCity).padEnd(3, 'X');
  return merged.slice(0, 3);
}

function recordForSeed(seed: number): { wins: number; losses: number } {
  const wins = clamp(64 - (seed - 1) * 3 + Math.round((Math.random() - 0.5) * 2), 38, 68);
  return { wins, losses: 82 - wins };
}

function makeUserTeam(
  conference: UserConference,
  seed: number,
  identity: UserTeamIdentity,
  lineupScore: number,
  wins: number,
  losses: number,
): BracketTeam {
  return {
    id: 'user',
    label: formatUserTeamLabel(identity),
    short: identity.name.slice(0, 10),
    abbr: makeAbbr(identity),
    colorKey: 'USER',
    seed,
    conference,
    isUser: true,
    strength: clamp(lineupScore, 70, 99),
    wins,
    losses,
  };
}

function pickConferenceField(
  conference: UserConference,
  userSeed: number,
  identity: UserTeamIdentity,
  lineupScore: number,
  userWins: number,
  userLosses: number,
): BracketTeam[] {
  const pool = shuffle(TEAMS.filter((team) => team.conference === conference));
  const field: BracketTeam[] = [];
  let poolIndex = 0;

  for (let seed = 1; seed <= 8; seed += 1) {
    if (seed === userSeed) {
      field.push(makeUserTeam(conference, seed, identity, lineupScore, userWins, userLosses));
      continue;
    }
    const source = pool[poolIndex++]!;
    const record = recordForSeed(seed);
    field.push({
      id: `${conference.toLowerCase()}-${source.id}-${seed}`,
      label: source.fullName,
      short: source.name,
      abbr: source.id,
      colorKey: source.id,
      seed,
      conference,
      isUser: false,
      strength: strengthForSeed(seed),
      wins: record.wins,
      losses: record.losses,
    });
  }
  return field;
}

function pickOtherConference(conference: UserConference): BracketTeam[] {
  const other: UserConference = conference === 'East' ? 'West' : 'East';
  const pool = shuffle(TEAMS.filter((team) => team.conference === other));
  return Array.from({ length: 8 }, (_, index) => {
    const seed = index + 1;
    const source = pool[index]!;
    const record = recordForSeed(seed);
    return {
      id: `${other.toLowerCase()}-${source.id}-${seed}`,
      label: source.fullName,
      short: source.name,
      abbr: source.id,
      colorKey: source.id,
      seed,
      conference: other,
      isUser: false,
      strength: strengthForSeed(seed),
      wins: record.wins,
      losses: record.losses,
    };
  });
}

/** Standard NBA first-round pairings: 1-8, 4-5, 2-7, 3-6 */
const R1_PAIRS: Array<[number, number]> = [
  [1, 8],
  [4, 5],
  [2, 7],
  [3, 6],
];

function seriesId(round: BracketRoundId, conference: string, a: number, b: number): string {
  return `${round}-${conference}-${a}v${b}`;
}

function buildRoundOne(
  conference: UserConference,
  field: BracketTeam[],
): BracketSeriesState[] {
  return R1_PAIRS.map(([hi, lo]) => {
    const high = field.find((t) => t.seed === hi)!;
    const low = field.find((t) => t.seed === lo)!;
    const hasUser = high.isUser || low.isUser;
    return {
      id: seriesId('first_round', conference, hi, lo),
      round: 'first_round' as const,
      conference,
      high,
      low,
      highWins: 0,
      lowWins: 0,
      winnerId: null,
      status: hasUser ? ('active' as const) : ('pending' as const),
    };
  });
}

export function createPlayoffBracket(input: {
  identity: UserTeamIdentity;
  userSeed: number;
  lineupScore: number;
  userWins?: number;
  userLosses?: number;
}): PlayoffBracketState {
  const seed = clamp(Math.round(input.userSeed), 1, 8);
  const userConference = input.identity.conference;
  const userWins = input.userWins ?? recordForSeed(seed).wins;
  const userLosses = input.userLosses ?? 82 - userWins;
  const east =
    userConference === 'East'
      ? pickConferenceField('East', seed, input.identity, input.lineupScore, userWins, userLosses)
      : pickOtherConference('East');
  const west =
    userConference === 'West'
      ? pickConferenceField('West', seed, input.identity, input.lineupScore, userWins, userLosses)
      : pickOtherConference('West');

  const series = [
    ...buildRoundOne('East', east),
    ...buildRoundOne('West', west),
  ];

  // Activate all R1 series so the board feels alive immediately.
  for (const entry of series) {
    entry.status = 'active';
  }

  const userSeries = series.find(
    (s) => s.conference === userConference && (s.high.isUser || s.low.isUser),
  );

  return {
    userConference,
    userSeed: seed,
    east,
    west,
    series,
    userNextOpponentId: userSeries
      ? userSeries.high.isUser
        ? userSeries.low.id
        : userSeries.high.id
      : null,
    otherConfFavoriteId: (userConference === 'East' ? west : east)[0]?.id ?? null,
  };
}

function simAiGame(
  high: BracketTeam,
  low: BracketTeam,
  gameIndex: number,
): 'high' | 'low' {
  const homeBoost = gameIndex % 2 === 0 ? 2.2 : -2.2;
  const variance = (Math.random() + Math.random() + Math.random() - 1.5) * 7.5;
  const margin = high.strength + homeBoost + variance - low.strength;
  return margin >= 0 ? 'high' : 'low';
}

function advanceAiSeries(series: BracketSeriesState): BracketSeriesState {
  if (series.status === 'complete' || series.winnerId) return series;
  let highWins = series.highWins;
  let lowWins = series.lowWins;
  const gameIndex = highWins + lowWins;
  const winner = simAiGame(series.high, series.low, gameIndex);
  if (winner === 'high') highWins += 1;
  else lowWins += 1;

  const complete = highWins >= 4 || lowWins >= 4;
  return {
    ...series,
    highWins,
    lowWins,
    status: complete ? 'complete' : 'active',
    winnerId: complete ? (highWins >= 4 ? series.high.id : series.low.id) : null,
  };
}

function teamById(bracket: PlayoffBracketState, id: string): BracketTeam | null {
  return (
    bracket.east.find((t) => t.id === id) ??
    bracket.west.find((t) => t.id === id) ??
    null
  );
}

function winnerTeam(series: BracketSeriesState): BracketTeam | null {
  if (!series.winnerId) return null;
  if (series.high.id === series.winnerId) return series.high;
  if (series.low.id === series.winnerId) return series.low;
  return null;
}

function openCompletedRounds(series: BracketSeriesState[]): BracketSeriesState[] {
  let next = series;

  const openNext = (conference: UserConference, from: PlayoffRoundId, to: PlayoffRoundId) => {
    const roundSeries = next.filter((s) => s.conference === conference && s.round === from);
    if (roundSeries.length === 0) return;
    if (!roundSeries.every((s) => s.status === 'complete' && s.winnerId)) return;
    if (next.some((s) => s.conference === conference && s.round === to)) return;

    const winners = roundSeries
      .map((s) => winnerTeam(s))
      .filter((t): t is BracketTeam => Boolean(t))
      .sort((a, b) => a.seed - b.seed);

    if (to === 'second_round' && winners.length === 4) {
      const ordered = roundSeries.map((s) => winnerTeam(s)!);
      next = [
        ...next,
        {
          id: seriesId('second_round', conference, ordered[0]!.seed, ordered[1]!.seed),
          round: 'second_round',
          conference,
          high: ordered[0]!.seed <= ordered[1]!.seed ? ordered[0]! : ordered[1]!,
          low: ordered[0]!.seed <= ordered[1]!.seed ? ordered[1]! : ordered[0]!,
          highWins: 0,
          lowWins: 0,
          winnerId: null,
          status: 'active',
        },
        {
          id: seriesId('second_round', conference, ordered[2]!.seed, ordered[3]!.seed),
          round: 'second_round',
          conference,
          high: ordered[2]!.seed <= ordered[3]!.seed ? ordered[2]! : ordered[3]!,
          low: ordered[2]!.seed <= ordered[3]!.seed ? ordered[3]! : ordered[2]!,
          highWins: 0,
          lowWins: 0,
          winnerId: null,
          status: 'active',
        },
      ];
    }

    if (to === 'conference_finals' && winners.length === 2) {
      const a = winners[0]!;
      const b = winners[1]!;
      next = [
        ...next,
        {
          id: seriesId('conference_finals', conference, a.seed, b.seed),
          round: 'conference_finals',
          conference,
          high: a.seed <= b.seed ? a : b,
          low: a.seed <= b.seed ? b : a,
          highWins: 0,
          lowWins: 0,
          winnerId: null,
          status: 'active',
        },
      ];
    }
  };

  openNext('East', 'first_round', 'second_round');
  openNext('West', 'first_round', 'second_round');
  openNext('East', 'second_round', 'conference_finals');
  openNext('West', 'second_round', 'conference_finals');

  const eastCf = next.find((s) => s.conference === 'East' && s.round === 'conference_finals');
  const westCf = next.find((s) => s.conference === 'West' && s.round === 'conference_finals');
  if (
    eastCf?.winnerId &&
    westCf?.winnerId &&
    !next.some((s) => s.round === 'nba_finals')
  ) {
    const eastChamp = winnerTeam(eastCf)!;
    const westChamp = winnerTeam(westCf)!;
    next = [
      ...next,
      {
        id: 'nba_finals',
        round: 'nba_finals',
        conference: 'Finals',
        high: eastChamp,
        low: westChamp,
        highWins: 0,
        lowWins: 0,
        winnerId: null,
        status: 'active',
      },
    ];
  }

  return next;
}

function forceCompleteAiSeries(series: BracketSeriesState): BracketSeriesState {
  if (series.status === 'complete' || series.high.isUser || series.low.isUser) return series;
  let current = { ...series };
  let guard = 0;
  while (current.status !== 'complete' && guard < 8) {
    current = advanceAiSeries(current);
    guard += 1;
  }
  return current;
}

function forecastsFromSeries(
  bracket: PlayoffBracketState,
  series: BracketSeriesState[],
): Pick<PlayoffBracketState, 'userNextOpponentId' | 'otherConfFavoriteId'> {
  const userActive =
    series.find(
      (s) =>
        (s.high.isUser || s.low.isUser) &&
        s.status !== 'complete' &&
        s.round !== 'nba_finals',
    ) ?? series.find((s) => (s.high.isUser || s.low.isUser) && s.status !== 'complete');

  const otherConf: UserConference = bracket.userConference === 'East' ? 'West' : 'East';
  const otherActive = series.filter((s) => s.conference === otherConf && s.status === 'active');
  const otherFavorite =
    otherActive[0] &&
    otherActive[0].high.strength >= otherActive[0].low.strength
      ? otherActive[0].high
      : otherActive[0]?.low;

  return {
    userNextOpponentId: userActive
      ? userActive.high.isUser
        ? userActive.low.id
        : userActive.high.id
      : null,
    otherConfFavoriteId: otherFavorite?.id ?? bracket.otherConfFavoriteId,
  };
}

/**
 * After each user game (or series win), advance other bracket series and open new rounds.
 */
export function syncBracketWithUserSeries(
  bracket: PlayoffBracketState,
  input: {
    userRound: PlayoffRoundId;
    userWins: number;
    opponentWins: number;
    userSeriesComplete: boolean;
    userWonSeries: boolean | null;
    opponentLabel: string;
  },
): PlayoffBracketState {
  let series = bracket.series.map((entry) => ({ ...entry }));

  // Mirror user's series score onto their bracket matchup.
  const userSeriesIndex = series.findIndex(
    (s) =>
      s.round === input.userRound &&
      (s.conference === bracket.userConference || s.round === 'nba_finals') &&
      (s.high.isUser || s.low.isUser),
  );

  if (userSeriesIndex >= 0) {
    const current = series[userSeriesIndex]!;
    const userIsHigh = current.high.isUser;
    series[userSeriesIndex] = {
      ...current,
      highWins: userIsHigh ? input.userWins : input.opponentWins,
      lowWins: userIsHigh ? input.opponentWins : input.userWins,
      status: input.userSeriesComplete ? 'complete' : 'active',
      winnerId: input.userSeriesComplete
        ? input.userWonSeries
          ? 'user'
          : current.high.isUser
            ? current.low.id
            : current.high.id
        : null,
    };
  }

  // Advance every other active series by one game (live feel).
  series = series.map((entry) => {
    if (entry.high.isUser || entry.low.isUser) return entry;
    if (entry.status !== 'active') return entry;
    return advanceAiSeries(entry);
  });

  series = openCompletedRounds(series);

  // If the user just won, hurry unfinished AI series in that round so their next matchup opens.
  if (input.userSeriesComplete && input.userWonSeries) {
    const nextRound = (() => {
      if (input.userRound === 'first_round') return 'second_round' as const;
      if (input.userRound === 'second_round') return 'conference_finals' as const;
      if (input.userRound === 'conference_finals') return 'nba_finals' as const;
      return null;
    })();

    if (nextRound) {
      let guard = 0;
      while (
        guard < 24 &&
        !series.some(
          (s) =>
            s.round === nextRound &&
            (s.high.isUser || s.low.isUser) &&
            s.status !== 'complete',
        )
      ) {
        series = series.map((entry) => {
          if (entry.high.isUser || entry.low.isUser) return entry;
          if (entry.status === 'complete') return entry;
          if (nextRound === 'nba_finals') {
            if (entry.round === 'conference_finals' && entry.conference !== bracket.userConference) {
              return forceCompleteAiSeries(entry);
            }
            return entry;
          }
          if (
            entry.conference === bracket.userConference &&
            entry.round === input.userRound
          ) {
            return forceCompleteAiSeries(entry);
          }
          return entry;
        });
        series = openCompletedRounds(series);
        guard += 1;
      }
    }
  }

  const chips = forecastsFromSeries(bracket, series);
  return {
    ...bracket,
    series,
    ...chips,
  };
}

/** Ensure the user's matchup for a round exists before starting that series. */
export function ensureUserRoundReady(
  bracket: PlayoffBracketState,
  round: PlayoffRoundId,
): PlayoffBracketState {
  let series = bracket.series.map((entry) => ({ ...entry }));
  let guard = 0;

  while (
    guard < 32 &&
    !series.some(
      (s) =>
        s.round === round &&
        (s.high.isUser || s.low.isUser) &&
        s.status !== 'complete',
    )
  ) {
    series = series.map((entry) => {
      if (entry.high.isUser || entry.low.isUser) return entry;
      if (entry.status === 'complete') return entry;
      if (round === 'nba_finals') {
        if (entry.round === 'conference_finals') return forceCompleteAiSeries(entry);
        if (entry.round === 'second_round' || entry.round === 'first_round') {
          return forceCompleteAiSeries(entry);
        }
        return entry;
      }
      // Complete prior rounds everywhere so both conferences stay live.
      if (round === 'second_round' && entry.round === 'first_round') {
        return forceCompleteAiSeries(entry);
      }
      if (round === 'conference_finals' && (entry.round === 'first_round' || entry.round === 'second_round')) {
        return forceCompleteAiSeries(entry);
      }
      return entry;
    });
    series = openCompletedRounds(series);
    guard += 1;
  }

  const chips = forecastsFromSeries(bracket, series);
  return { ...bracket, series, ...chips };
}

export function bracketTeamLabel(bracket: PlayoffBracketState, id: string | null): string {
  if (!id) return 'TBD';
  const team = teamById(bracket, id);
  return team ? `${team.seed}. ${team.short}` : 'TBD';
}

export function seriesForRound(
  bracket: PlayoffBracketState,
  conference: UserConference | 'Finals',
  round: BracketRoundId,
): BracketSeriesState[] {
  return bracket.series.filter((s) => s.conference === conference && s.round === round);
}
