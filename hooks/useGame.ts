'use client';

import {
  GAME_OVER_ANSWER_SECONDS,
  getCategoryForStreak,
  getNextCategoryAfterCorrect,
  ROUND_TIME_SECONDS,
} from '@/lib/categoryCycle';
import {
  buildNextRoundAfterCorrect,
  checkGuess,
  createRoundForCategory,
  getMatchupKey,
} from '@/lib/gameEngine';
import { FULL_RUN_MODE } from '@/lib/gameModes';
import { getBestStreak, updateBestStreaks } from '@/lib/storage';
import type { GamePhase, GameState, Guess } from '@/types/game';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

const CORRECT_DELAY_MS = 1200;
const REVEAL_BEFORE_GAME_OVER_MS = 600;

type Action =
  | { type: 'INIT'; bestStreak: number }
  | { type: 'GUESS'; guess: Guess }
  | { type: 'TIMEOUT' }
  | { type: 'ADVANCE_ROUND' }
  | { type: 'SHOW_GAME_OVER'; bestStreak: number }
  | { type: 'TICK_ROUND' }
  | { type: 'CLEAR_STREAK_POP' }
  | { type: 'RESTART' };

function createInitialState(bestStreak: number): GameState {
  const category = getCategoryForStreak(0);
  const round = createRoundForCategory(category, []);

  return {
    phase: 'playing',
    streak: 0,
    bestStreak,
    round,
    lastGuess: null,
    wasCorrect: null,
    loseReason: null,
    recentMatchups: [
      getMatchupKey(round.revealedPlayer.id, round.hiddenPlayer.id, round.category),
    ],
    streakPop: false,
    secondsLeft: ROUND_TIME_SECONDS,
    gameOverSecondsLeft: GAME_OVER_ANSWER_SECONDS,
  };
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'INIT':
      return createInitialState(action.bestStreak);

    case 'GUESS': {
      if (state.phase !== 'playing' || !state.round) return state;

      const { revealedPlayer, hiddenPlayer, category } = state.round;
      const correct = checkGuess(action.guess, revealedPlayer, hiddenPlayer, category);

      return {
        ...state,
        phase: 'revealing',
        lastGuess: action.guess,
        wasCorrect: correct,
        loseReason: correct ? null : 'wrong',
      };
    }

    case 'TIMEOUT': {
      if (state.phase !== 'playing' || !state.round) return state;

      return {
        ...state,
        phase: 'revealing',
        lastGuess: null,
        wasCorrect: false,
        loseReason: 'timeout',
        secondsLeft: 0,
      };
    }

    case 'ADVANCE_ROUND': {
      if (!state.round || state.wasCorrect !== true) return state;

      const newStreak = state.streak + 1;
      const nextCategory = getNextCategoryAfterCorrect(state.streak);
      const { round, recentMatchups } = buildNextRoundAfterCorrect(
        nextCategory,
        state.round,
        state.recentMatchups,
      );

      return {
        ...state,
        phase: 'playing',
        streak: newStreak,
        bestStreak: Math.max(state.bestStreak, newStreak),
        round,
        recentMatchups,
        lastGuess: null,
        wasCorrect: null,
        loseReason: null,
        streakPop: true,
        secondsLeft: ROUND_TIME_SECONDS,
      };
    }

    case 'SHOW_GAME_OVER':
      return {
        ...state,
        phase: 'gameOver',
        bestStreak: action.bestStreak,
      };

    case 'TICK_ROUND':
      if (state.phase !== 'playing' || state.secondsLeft <= 0) return state;
      return {
        ...state,
        secondsLeft: state.secondsLeft - 1,
      };

    case 'CLEAR_STREAK_POP':
      return { ...state, streakPop: false };

    case 'RESTART':
      return createInitialState(getBestStreak());

    default:
      return state;
  }
}

export function useGame(onAutoHome: () => void) {
  const [state, dispatch] = useReducer(reducer, null as unknown as GameState, () =>
    createInitialState(0),
  );
  const [gameOverSecondsLeft, setGameOverSecondsLeft] = useState(GAME_OVER_ANSWER_SECONDS);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAutoHomeRef = useRef(onAutoHome);

  useEffect(() => {
    onAutoHomeRef.current = onAutoHome;
  }, [onAutoHome]);

  useEffect(() => {
    dispatch({ type: 'INIT', bestStreak: getBestStreak() });
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (state.phase !== 'playing') return;

    const interval = setInterval(() => {
      dispatch({ type: 'TICK_ROUND' });
    }, 1000);

    return () => clearInterval(interval);
  }, [state.phase, state.streak, state.round?.hiddenPlayer.id, state.round?.revealedPlayer.id]);

  useEffect(() => {
    if (state.phase !== 'playing' || state.secondsLeft > 0) return;
    dispatch({ type: 'TIMEOUT' });
  }, [state.phase, state.secondsLeft]);

  useEffect(() => {
    if (state.phase !== 'revealing' || state.wasCorrect === null) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (state.wasCorrect) {
      timeoutRef.current = setTimeout(() => {
        dispatch({ type: 'ADVANCE_ROUND' });
      }, CORRECT_DELAY_MS);
    } else {
      timeoutRef.current = setTimeout(() => {
        const newBest = updateBestStreaks(FULL_RUN_MODE, state.streak);
        dispatch({ type: 'SHOW_GAME_OVER', bestStreak: newBest });
      }, REVEAL_BEFORE_GAME_OVER_MS);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [state.phase, state.wasCorrect, state.streak]);

  useEffect(() => {
    if (state.phase !== 'gameOver') return;

    setGameOverSecondsLeft(GAME_OVER_ANSWER_SECONDS);

    const tick = setInterval(() => {
      setGameOverSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    const redirect = setTimeout(() => {
      onAutoHomeRef.current();
    }, GAME_OVER_ANSWER_SECONDS * 1000);

    return () => {
      clearInterval(tick);
      clearTimeout(redirect);
    };
  }, [state.phase, state.streak, state.round?.hiddenPlayer.id]);

  const guess = useCallback((g: Guess) => {
    dispatch({ type: 'GUESS', guess: g });
  }, []);

  const clearStreakPop = useCallback(() => {
    dispatch({ type: 'CLEAR_STREAK_POP' });
  }, []);

  const restart = useCallback(() => {
    dispatch({ type: 'RESTART' });
  }, []);

  const feedback: GamePhase =
    state.phase === 'revealing'
      ? state.wasCorrect
        ? 'correct'
        : 'wrong'
      : state.phase;

  const isGameOver = state.phase === 'gameOver';
  const isRevealing = state.phase === 'revealing';
  const canGuess = state.phase === 'playing' && state.secondsLeft > 0;

  return {
    state,
    feedback,
    isGameOver,
    isRevealing,
    canGuess,
    guess,
    restart,
    clearStreakPop,
    finalStreak: state.streak,
    loseReason: state.loseReason,
    gameOverSecondsLeft,
  };
}
