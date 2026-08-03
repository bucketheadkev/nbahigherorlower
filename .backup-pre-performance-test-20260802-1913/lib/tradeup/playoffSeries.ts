import type { SeasonRecord } from './lineupSeason';
import {
  nextPlayoffRound,
  pickHistoricalOpponent,
  type HistoricalPlayoffTeam,
  type PlayoffRoundId,
} from './historicalPlayoffTeams';

export type SeriesGameResult = 'W' | 'L';

export interface SeriesGameDetail {
  result: SeriesGameResult;
  userScore: number;
  opponentScore: number;
}

export interface PlayoffSeriesState {
  round: PlayoffRoundId;
  opponent: HistoricalPlayoffTeam;
  games: SeriesGameDetail[];
  userWins: number;
  opponentWins: number;
  complete: boolean;
  userWonSeries: boolean | null;
}

export interface PlayoffRunState {
  lineupScore: number;
  seasonWins: number;
  seasonLosses: number;
  usedOpponentIds: string[];
  /** Human-readable opponents faced this run. */
  pathLabels: string[];
  series: PlayoffSeriesState | null;
  /** Rounds already won this run. */
  wonRounds: PlayoffRoundId[];
  champion: boolean;
  eliminated: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Simulate one playoff game with a realistic final score.
 * Typical NBA playoff totals land roughly in the mid-90s to low-120s.
 */
function simulatePlayoffGame(
  lineupScore: number,
  opponentStrength: number,
  gameIndex: number,
): SeriesGameDetail {
  const homeBoost = gameIndex % 2 === 0 ? 2.6 : -2.6;
  const variance = (Math.random() + Math.random() + Math.random() - 1.5) * 8.2;
  const marginSignal = lineupScore + homeBoost + variance - opponentStrength;
  const userWon = marginSignal >= 0;

  const pace = randBetween(-4, 6);
  const userBase = 104 + (lineupScore - 72) * 0.28 + pace + (gameIndex % 2 === 0 ? 1.5 : -1);
  const oppBase =
    104 + (opponentStrength - 72) * 0.28 + pace * 0.85 + (gameIndex % 2 === 0 ? -1.2 : 1.2);

  let userScore = Math.round(userBase + randBetween(-7, 8));
  let opponentScore = Math.round(oppBase + randBetween(-7, 8));

  // Enforce the decided winner with a believable margin (1–18, weighted toward close).
  const closeRoll = Math.random();
  const targetMargin =
    closeRoll < 0.45
      ? 1 + Math.floor(Math.random() * 5)
      : closeRoll < 0.8
        ? 6 + Math.floor(Math.random() * 6)
        : 12 + Math.floor(Math.random() * 7);

  if (userWon) {
    if (userScore <= opponentScore) {
      userScore = opponentScore + targetMargin;
    } else if (userScore - opponentScore > 22) {
      opponentScore = userScore - targetMargin;
    }
  } else if (opponentScore <= userScore) {
    opponentScore = userScore + targetMargin;
  } else if (opponentScore - userScore > 22) {
    userScore = opponentScore - targetMargin;
  }

  userScore = clamp(userScore, 88, 132);
  opponentScore = clamp(opponentScore, 88, 132);

  // Re-assert winner after clamping.
  if (userWon && userScore <= opponentScore) userScore = opponentScore + Math.max(1, targetMargin);
  if (!userWon && opponentScore <= userScore) {
    opponentScore = userScore + Math.max(1, targetMargin);
  }

  return {
    result: userWon ? 'W' : 'L',
    userScore,
    opponentScore,
  };
}

export function createPlayoffRun(record: SeasonRecord): PlayoffRunState {
  return {
    lineupScore: record.analysis.lineupScore,
    seasonWins: record.wins,
    seasonLosses: record.losses,
    usedOpponentIds: [],
    pathLabels: [],
    series: null,
    wonRounds: [],
    champion: false,
    eliminated: false,
  };
}

export function startPlayoffSeries(
  run: PlayoffRunState,
  round: PlayoffRoundId,
  forcedOpponent?: HistoricalPlayoffTeam,
): PlayoffRunState {
  const used = new Set(run.usedOpponentIds);
  const opponent = forcedOpponent ?? pickHistoricalOpponent(round, used);
  return {
    ...run,
    usedOpponentIds: [...run.usedOpponentIds, opponent.id],
    pathLabels: [...run.pathLabels, opponent.label],
    series: {
      round,
      opponent,
      games: [],
      userWins: 0,
      opponentWins: 0,
      complete: false,
      userWonSeries: null,
    },
    eliminated: false,
  };
}

/** Simulate the next game in the active series (best of 7). */
export function advanceSeriesGame(run: PlayoffRunState): PlayoffRunState {
  const series = run.series;
  if (!series || series.complete) return run;

  const detail = simulatePlayoffGame(
    run.lineupScore,
    effectiveOpponentStrength(series.opponent, series.round),
    series.games.length,
  );
  const games = [...series.games, detail];
  const userWins = games.filter((g) => g.result === 'W').length;
  const opponentWins = games.length - userWins;
  const userWonSeries = userWins >= 4 ? true : opponentWins >= 4 ? false : null;
  const complete = userWonSeries !== null;

  let next: PlayoffRunState = {
    ...run,
    series: {
      ...series,
      games,
      userWins,
      opponentWins,
      complete,
      userWonSeries,
    },
  };

  if (complete && userWonSeries) {
    const wonRounds = [...next.wonRounds, series.round];
    const following = nextPlayoffRound(series.round);
    next = {
      ...next,
      wonRounds,
      champion: following === null,
      eliminated: false,
    };
  } else if (complete && userWonSeries === false) {
    next = { ...next, eliminated: true, champion: false };
  }

  return next;
}

/** Auto playoff berth after regular season (seeds 1–6). Play-in is separate. */
export function madePlayoffs(wins: number): boolean {
  return wins >= 45;
}

/** Soft strength nudge so deeper rounds feel harder vs same lineupScore. */
export function effectiveOpponentStrength(
  opponent: HistoricalPlayoffTeam,
  round: PlayoffRoundId,
): number {
  const bump =
    round === 'first_round'
      ? 0
      : round === 'second_round'
        ? 1.5
        : round === 'conference_finals'
          ? 3
          : 4.5;
  return clamp(opponent.strength + bump, 55, 99);
}
