'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  MAX_LIVES,
  type GamePhase,
  type ResultType,
  type StartingTier,
  type TradePlayer,
} from '@/lib/tradeup/types';
import { createStartingPlayer } from '@/lib/tradeup/engine';
import {
  askForMore as advanceNegotiation,
  createNegotiationSession,
  getNegotiationOfferView,
  pushRecentId,
  resolveTradeAttempt,
  RECENT_PLAYER_LIMIT,
  RECENT_TEAM_LIMIT,
  type NegotiationOfferView,
  type NegotiationSession,
} from '@/lib/tradeup/negotiation';
import { getSellValue } from '@/lib/tradeup/credits';
import { getBestChain, saveBestChain } from '@/lib/tradeup/storage';

export interface TradeResult {
  type: ResultType;
  message: string;
  selected: TradePlayer;
  previous: TradePlayer;
  chance: number;
  roll?: number;
}

export interface UseTradeUpGameOptions {
  startingTier: StartingTier;
  onAccept: () => void;
  onReject: () => void;
  onTap: () => void;
}

type ExtendedPhase = GamePhase | 'resolving' | 'transitioning';

interface GameBootstrap {
  currentPlayer: TradePlayer | null;
  session: NegotiationSession | null;
  offer: NegotiationOfferView | null;
  tradePath: TradePlayer[];
  initError: string | null;
  usedTeams: Set<string>;
  recentTeams: string[];
  recentOfferedIds: string[];
}

function buildOffer(
  session: NegotiationSession,
  player: TradePlayer,
): NegotiationOfferView {
  return getNegotiationOfferView(session, player);
}

function bootstrapGame(startingTier: StartingTier): GameBootstrap {
  try {
    const starter = createStartingPlayer(startingTier);
    const usedTeams = new Set<string>();
    const session = createNegotiationSession(starter, starter.teamId, usedTeams);
    usedTeams.add(session.team.id);

    return {
      currentPlayer: starter,
      session,
      offer: buildOffer(session, starter),
      tradePath: [starter],
      initError: null,
      usedTeams,
      recentTeams: [session.team.id],
      recentOfferedIds: [session.candidates[0]!.id],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start the game.';
    return {
      currentPlayer: null,
      session: null,
      offer: null,
      tradePath: [],
      initError: message,
      usedTeams: new Set(),
      recentTeams: [],
      recentOfferedIds: [],
    };
  }
}

function startSessionForPlayer(
  player: TradePlayer,
  usedTeams: Set<string>,
  recentTeams: string[],
  recentOfferedIds: string[],
): { session: NegotiationSession; recentTeams: string[]; recentOfferedIds: string[] } {
  const session = createNegotiationSession(
    player,
    player.teamId,
    usedTeams,
    recentTeams,
    new Set(recentOfferedIds),
  );
  usedTeams.add(session.team.id);
  return {
    session,
    recentTeams: pushRecentId(recentTeams, session.team.id, RECENT_TEAM_LIMIT),
    recentOfferedIds: pushRecentId(
      recentOfferedIds,
      session.candidates[0]!.id,
      RECENT_PLAYER_LIMIT,
    ),
  };
}

export function useTradeUpGame({
  startingTier,
  onAccept,
  onReject,
  onTap,
}: UseTradeUpGameOptions) {
  const [phase, setPhase] = useState<ExtendedPhase>('playing');
  const [boot, setBoot] = useState(() => bootstrapGame(startingTier));
  const [lives, setLives] = useState(MAX_LIVES);
  const [tradesCompleted, setTradesCompleted] = useState(0);
  const [rejectionsUsed, setRejectionsUsed] = useState(0);
  const [result, setResult] = useState<TradeResult | null>(null);
  const [bestChain, setBestChain] = useState(0);
  const [locked, setLocked] = useState(false);
  const usedTeamsRef = useRef(boot.usedTeams);
  const recentTeamsRef = useRef(boot.recentTeams);
  const recentOfferedRef = useRef(boot.recentOfferedIds);
  const pendingRef = useRef<'accepted' | 'rejected' | null>(null);
  const resolveLockRef = useRef(false);

  const { currentPlayer, session, offer, tradePath, initError } = boot;

  const applyBootstrap = useCallback((next: GameBootstrap) => {
    usedTeamsRef.current = next.usedTeams;
    recentTeamsRef.current = next.recentTeams;
    recentOfferedRef.current = next.recentOfferedIds;
    setBoot(next);
    setTradesCompleted(0);
    setRejectionsUsed(0);
    setLives(MAX_LIVES);
    setPhase('playing');
    setResult(null);
    setLocked(false);
    pendingRef.current = null;
    resolveLockRef.current = false;
    setBestChain(getBestChain());
  }, []);

  const applySession = useCallback(
    (player: TradePlayer, nextSession: NegotiationSession, recentTeams: string[], recentOfferedIds: string[]) => {
      setBoot((prev) => ({
        ...prev,
        currentPlayer: player,
        session: nextSession,
        offer: buildOffer(nextSession, player),
        recentTeams,
        recentOfferedIds,
      }));
      setPhase('playing');
      setResult(null);
      setLocked(false);
      pendingRef.current = null;
      resolveLockRef.current = false;
    },
    [],
  );

  const advanceRound = useCallback((player: TradePlayer) => {
    const next = startSessionForPlayer(
      player,
      usedTeamsRef.current,
      recentTeamsRef.current,
      recentOfferedRef.current,
    );
    recentTeamsRef.current = next.recentTeams;
    recentOfferedRef.current = next.recentOfferedIds;
    applySession(player, next.session, next.recentTeams, next.recentOfferedIds);
  }, [applySession]);

  const initGame = useCallback(() => {
    applyBootstrap(bootstrapGame(startingTier));
  }, [applyBootstrap, startingTier]);

  useLayoutEffect(() => {
    applyBootstrap(bootstrapGame(startingTier));
  }, [applyBootstrap, startingTier]);

  const askForMore = useCallback(() => {
    if (locked || phase !== 'playing' || !currentPlayer || !session || !offer) return false;
    if (!offer.canAskForMore) return false;

    onTap();
    setLocked(true);
    setPhase('transitioning');

    const next = advanceNegotiation(session, currentPlayer);
    if (!next) {
      setPhase('playing');
      setLocked(false);
      return false;
    }

    recentOfferedRef.current = pushRecentId(
      recentOfferedRef.current,
      next.candidates[next.index]!.id,
      RECENT_PLAYER_LIMIT,
    );

    setBoot((prev) => ({
      ...prev,
      session: next,
      offer: buildOffer(next, currentPlayer),
      recentOfferedIds: recentOfferedRef.current,
    }));

    window.setTimeout(() => {
      setPhase('playing');
      setLocked(false);
    }, 700);

    return true;
  }, [locked, phase, currentPlayer, session, offer, onTap]);

  const attemptTrade = useCallback(() => {
    if (
      locked ||
      phase !== 'playing' ||
      !currentPlayer ||
      !session ||
      !offer ||
      resolveLockRef.current
    ) {
      return;
    }

    resolveLockRef.current = true;
    onTap();
    setLocked(true);
    setPhase('resolving');

    const chance = offer.acceptanceChance;
    const offered = offer.offered;
    const previous = currentPlayer;
    const teamName = offer.team.name;

    window.setTimeout(() => {
      const { success, roll } = resolveTradeAttempt(chance);

      if (success) {
        onAccept();
        pendingRef.current = 'accepted';
        setResult({
          type: 'accepted',
          message: `The ${teamName} agreed to the deal.`,
          selected: offered,
          previous,
          chance,
          roll,
        });
        setPhase('result');
      } else {
        onReject();
        pendingRef.current = 'rejected';
        setResult({
          type: 'rejected',
          message: `The ${teamName} rejected the pushed offer.`,
          selected: offered,
          previous,
          chance,
          roll,
        });
        setPhase('result');
      }
    }, 900);
  }, [locked, phase, currentPlayer, session, offer, onTap, onAccept, onReject]);

  const walkAway = useCallback(() => {
    if (locked || phase !== 'playing' || !currentPlayer) return;

    onTap();
    setLocked(true);
    setPhase('transitioning');

    const next = startSessionForPlayer(
      currentPlayer,
      usedTeamsRef.current,
      recentTeamsRef.current,
      recentOfferedRef.current,
    );
    recentTeamsRef.current = next.recentTeams;
    recentOfferedRef.current = next.recentOfferedIds;

    setBoot((prev) => ({
      ...prev,
      currentPlayer,
      session: next.session,
      offer: buildOffer(next.session, currentPlayer),
      recentTeams: next.recentTeams,
      recentOfferedIds: next.recentOfferedIds,
    }));

    window.setTimeout(() => {
      setPhase('playing');
      setLocked(false);
      pendingRef.current = null;
      resolveLockRef.current = false;
      setResult(null);
    }, 700);
  }, [locked, phase, currentPlayer, onTap]);

  const continueAfterAccept = useCallback(() => {
    if (!result || phase !== 'result' || pendingRef.current !== 'accepted') return null;

    const player = result.selected;
    setBoot((prev) => {
      const newPath = [...prev.tradePath, player];
      setBestChain(saveBestChain(newPath.length - 1));
      return { ...prev, tradePath: newPath };
    });
    setTradesCompleted((n) => n + 1);
    setLives((prev) => Math.min(MAX_LIVES, prev + 1));
    advanceRound(player);
    return player;
  }, [result, phase, advanceRound]);

  const dismissResult = useCallback(() => {
    if (!result || phase !== 'result' || pendingRef.current !== 'rejected') return;

    setRejectionsUsed((n) => n + 1);
    setLives((prevLives) => {
      const nextLives = prevLives - 1;
      if (nextLives <= 0) {
        setBoot((prev) => {
          setBestChain(saveBestChain(prev.tradePath.length - 1));
          return prev;
        });
        setPhase('gameover');
        setResult(null);
        pendingRef.current = null;
        resolveLockRef.current = false;
        setLocked(false);
      } else if (currentPlayer) {
        const next = startSessionForPlayer(
          currentPlayer,
          usedTeamsRef.current,
          recentTeamsRef.current,
          recentOfferedRef.current,
        );
        recentTeamsRef.current = next.recentTeams;
        recentOfferedRef.current = next.recentOfferedIds;
        applySession(currentPlayer, next.session, next.recentTeams, next.recentOfferedIds);
      }
      return nextLives;
    });
  }, [result, phase, currentPlayer, applySession]);

  const sellPlayer = useCallback((): number | null => {
    if (locked || !currentPlayer || phase === 'result' || phase === 'gameover' || phase === 'resolving') {
      return null;
    }

    const value = getSellValue(currentPlayer);
    setBoot((prev) => {
      saveBestChain(prev.tradePath.length - 1);
      return prev;
    });
    return value;
  }, [locked, currentPlayer, phase]);

  return {
    phase,
    currentPlayer,
    offer,
    lives,
    tradePath,
    tradesCompleted,
    rejectionsUsed,
    result,
    bestChain,
    locked,
    initError,
    askForMore,
    attemptTrade,
    walkAway,
    sellPlayer,
    dismissResult,
    continueAfterAccept,
    restart: initGame,
  };
}
