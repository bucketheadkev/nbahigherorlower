/**
 * Play-in tournament rules:
 * - 7th / 8th seed: win 1 game to clinch. After a loss, one more chance —
 *   win that and you're in; lose twice and you're out.
 * - 9th / 10th seed: must win two games in a row.
 */

export type PlayInSeed = 7 | 8 | 9 | 10;

export type PlayInGameResult = 'W' | 'L';

export type PlayInPhase = 'ready' | 'playing' | 'clinched' | 'eliminated';

export interface PlayInState {
  seed: PlayInSeed;
  lineupScore: number;
  games: PlayInGameResult[];
  phase: PlayInPhase;
  /** Human-readable status line. */
  status: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function simulatePlayInGame(lineupScore: number, gameIndex: number): PlayInGameResult {
  // Play-in opponents are mid-pack playoff-adjacent clubs.
  const opponent = 72 + Math.random() * 10 + gameIndex * 1.5;
  const variance = (Math.random() + Math.random() + Math.random() - 1.5) * 8;
  const margin = lineupScore + variance - opponent;
  return margin >= 0 ? 'W' : 'L';
}

export function createPlayInState(seed: PlayInSeed, lineupScore: number): PlayInState {
  const needsTwo = seed >= 9;
  return {
    seed,
    lineupScore: clamp(lineupScore, 40, 100),
    games: [],
    phase: 'ready',
    status: needsTwo
      ? 'Win two straight to punch your ticket'
      : 'Win one game to lock in your playoff spot',
  };
}

export function startPlayIn(state: PlayInState): PlayInState {
  return { ...state, phase: 'playing', status: 'Tip-off…' };
}

/**
 * Advance one play-in game and resolve clinch / elimination.
 */
export function advancePlayInGame(state: PlayInState): PlayInState {
  if (state.phase !== 'playing' && state.phase !== 'ready') return state;

  const result = simulatePlayInGame(state.lineupScore, state.games.length);
  const games = [...state.games, result];
  const wins = games.filter((g) => g === 'W').length;
  const losses = games.length - wins;
  const isLowSeed = state.seed >= 9;

  if (isLowSeed) {
    // 9/10: must win two in a row.
    if (result === 'L') {
      return {
        ...state,
        games,
        phase: 'eliminated',
        status: 'Play-in loss — season over',
      };
    }
    if (wins >= 2) {
      return {
        ...state,
        games,
        phase: 'clinched',
        status: 'Back-to-back wins — you\'re in the playoffs',
      };
    }
    return {
      ...state,
      games,
      phase: 'playing',
      status: 'One more win to clinch',
    };
  }

  // 7/8: win once to clinch; after a loss, one last chance.
  if (result === 'W') {
    return {
      ...state,
      games,
      phase: 'clinched',
      status: wins === 1 && losses === 0
        ? 'Play-in win — playoff berth locked'
        : 'Second-chance win — you\'re in the playoffs',
    };
  }

  if (losses >= 2) {
    return {
      ...state,
      games,
      phase: 'eliminated',
      status: 'Two play-in losses — eliminated',
    };
  }

  return {
    ...state,
    games,
    phase: 'playing',
    status: 'One more chance — win or go home',
  };
}

export function playInSeedLabel(seed: PlayInSeed): string {
  return seed === 7 || seed === 8 ? `${seed}th seed` : `${seed}th seed`;
}
