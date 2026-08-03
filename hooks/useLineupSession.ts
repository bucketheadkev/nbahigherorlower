'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LINEUP_POSITIONS } from '@/lib/tradeup/startingLineup';
import {
  clearLineupSession,
  createFreshLineupSession,
  loadLineupSession,
  saveLineupSession,
  type LineupSession,
} from '@/lib/tradeup/lineupStorage';
import { simulateLineupSeason } from '@/lib/tradeup/lineupSeason';
import {
  generateOpponentLineup,
  hydrateOpponentFromIds,
  opponentIdsFromLineup,
  resolveHeadToHead,
  type LineupSlotPlayer,
} from '@/lib/tradeup/headToHead';
import type { LineupMatchPhase, LineupMatchState } from '@/lib/tradeup/lineupStorage';
import { getPlayerById } from '@/lib/tradeup/rosters';
import {
  REROLL_COST,
  KEEP_BONUS,
  canAffordPurchase,
  canAffordReroll,
  getPlayerPrice,
} from '@/lib/tradeup/lineupBudget';
import {
  generateMarketOffers,
  offersFingerprint,
} from '@/lib/tradeup/lineupOffers';
import { isSTier } from '@/lib/tradeup/tiers';
import type { Position, TradePlayer } from '@/lib/tradeup/types';

function usedPlayerIds(session: LineupSession): Set<string> {
  const ids = new Set<string>();
  for (const pos of LINEUP_POSITIONS) {
    const state = session.players[pos];
    if (state.playerId) ids.add(state.playerId);
    if (state.freePlayerId) ids.add(state.freePlayerId);
  }
  return ids;
}

function finalizedCount(session: LineupSession): number {
  return LINEUP_POSITIONS.filter((pos) => session.players[pos].finalized).length;
}

function finalizeSlot(
  session: LineupSession,
  pos: Position,
  playerId: string,
  options: {
    purchasePrice: number | null;
    source: 'free' | 'market';
    keepBonusClaimed: boolean;
    creditDelta?: number;
  },
): LineupSession {
  const { purchasePrice, source, keepBonusClaimed, creditDelta = 0 } = options;
  const nextPlayers = {
    ...Object.fromEntries(
      LINEUP_POSITIONS.map((position) => [
        position,
        { ...session.players[position], marketOpen: false },
      ]),
    ) as Record<Position, LineupSession['players'][Position]>,
    [pos]: {
      ...session.players[pos],
      playerId,
      freePlayerId: session.players[pos].freePlayerId ?? playerId,
      revealed: true,
      finalized: true,
      purchasePrice,
      marketOpen: false,
      source,
      keepBonusClaimed,
    },
  };
  const completed = LINEUP_POSITIONS.every((position) => nextPlayers[position].finalized);
  return {
    ...session,
    activePosition: null,
    roundCredits: Math.max(0, session.roundCredits + creditDelta),
    players: nextPlayers,
    runCompleted: completed,
  };
}

export function useLineupSession() {
  const [session, setSession] = useState<LineupSession | null>(null);
  const hydratedRef = useRef(false);
  const actionLockRef = useRef(false);
  const rerollLockRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const stored = loadLineupSession();
    if (stored) {
      setSession(stored);
      return;
    }

    const fresh = createFreshLineupSession();
    setSession(fresh);
    saveLineupSession(fresh);
  }, []);

  const persist = useCallback((next: LineupSession) => {
    setSession(next);
    saveLineupSession(next);
  }, []);

  const currentPosition: Position | null = session?.activePosition ?? null;

  const slots = useMemo(() => {
    if (!session) return [];
    return LINEUP_POSITIONS.map((slot, index) => {
      const state = session.players[slot];
      const player = state.playerId ? getPlayerById(state.playerId) ?? null : null;
      const freePlayer = state.freePlayerId ? getPlayerById(state.freePlayerId) ?? null : null;
      return {
        slot,
        index,
        state,
        player,
        freePlayer,
        isFreePlayerSTier: Boolean(freePlayer && isSTier(freePlayer)),
        isHiddenSTier: !state.revealed && Boolean(freePlayer && isSTier(freePlayer)),
        isCurrent: state.revealed && !state.finalized,
        isLocked: state.finalized,
        isUpcoming: !state.revealed && !state.finalized,
      };
    });
  }, [session]);

  const currentOffers = useMemo(() => {
    if (!session || !currentPosition) return [] as TradePlayer[];
    if (!session.players[currentPosition]?.marketOpen) return [];
    const ids = session.offers[currentPosition];
    if (!ids) return [];
    return ids
      .map((id) => getPlayerById(id))
      .filter((player): player is TradePlayer => player !== undefined);
  }, [session, currentPosition]);

  const currentFreePlayer = useMemo(() => {
    if (!session || !currentPosition) return null;
    const id = session.players[currentPosition]?.freePlayerId;
    return id ? getPlayerById(id) ?? null : null;
  }, [session, currentPosition]);

  const marketOpen = Boolean(
    session && currentPosition && session.players[currentPosition]?.marketOpen,
  );

  const allFinalized = useMemo(
    () =>
      session !== null &&
      (session.runCompleted ||
        LINEUP_POSITIONS.every((pos) => session.players[pos].finalized && session.players[pos].playerId)),
    [session],
  );

  const revealCard = useCallback((pos: Position) => {
    setSession((current) => {
      if (!current || current.runCompleted) return current;
      const slot = current.players[pos];
      if (slot.finalized || slot.revealed) return current;

      const free = slot.freePlayerId ? getPlayerById(slot.freePlayerId) : undefined;
      if (!free) return current;

      const next: LineupSession = {
        ...current,
        players: {
          ...current.players,
          [pos]: {
            ...current.players[pos],
            playerId: free.id,
            freePlayerId: free.id,
            revealed: true,
            finalized: false,
            purchasePrice: null,
            marketOpen: false,
            source: null,
            keepBonusClaimed: false,
          },
        },
      };
      saveLineupSession(next);
      return next;
    });
  }, []);

  const keepFreePlayer = useCallback((pos: Position): {
    ok: boolean;
    reason?: string;
    keepBonusAwarded?: boolean;
    creditsAdded?: number;
  } => {
    if (actionLockRef.current || !session || session.runCompleted) {
      return { ok: false, reason: 'busy' };
    }

    const slot = session.players[pos];
    if (!slot.revealed || slot.finalized) return { ok: false, reason: 'locked' };

    const freeId = slot.freePlayerId;
    if (!freeId) return { ok: false, reason: 'missing' };

    // Atomic Keep: lock the original free player and claim the bonus at most once.
    const awardBonus = !slot.keepBonusClaimed;
    actionLockRef.current = true;
    const next = finalizeSlot(session, pos, freeId, {
      purchasePrice: null,
      source: 'free',
      keepBonusClaimed: true,
      creditDelta: awardBonus ? KEEP_BONUS : 0,
    });
    persist(next);
    window.setTimeout(() => {
      actionLockRef.current = false;
    }, 280);
    return {
      ok: true,
      keepBonusAwarded: awardBonus,
      creditsAdded: awardBonus ? KEEP_BONUS : 0,
    };
  }, [persist, session]);

  /** Keep every remaining free player once, then lock the five for battle. */
  const lockInAndBattle = useCallback((): {
    ok: boolean;
    reason?: string;
    creditsAdded?: number;
    keepBonusCount?: number;
  } => {
    if (actionLockRef.current || !session || session.runCompleted) {
      return { ok: false, reason: 'busy' };
    }

    for (const pos of LINEUP_POSITIONS) {
      if (!session.players[pos].revealed) {
        return { ok: false, reason: 'unrevealed' };
      }
    }

    actionLockRef.current = true;
    let next: LineupSession = {
      ...session,
      activePosition: null,
    };
    let creditsAdded = 0;
    let keepBonusCount = 0;

    const nextPlayers = { ...next.players };
    for (const pos of LINEUP_POSITIONS) {
      const slot = nextPlayers[pos];
      if (slot.finalized) {
        nextPlayers[pos] = { ...slot, marketOpen: false };
        continue;
      }

      const freeId = slot.freePlayerId ?? slot.playerId;
      if (!freeId) {
        actionLockRef.current = false;
        return { ok: false, reason: 'missing' };
      }

      const awardBonus = !slot.keepBonusClaimed;
      if (awardBonus) {
        creditsAdded += KEEP_BONUS;
        keepBonusCount += 1;
      }

      nextPlayers[pos] = {
        ...slot,
        playerId: freeId,
        freePlayerId: freeId,
        revealed: true,
        finalized: true,
        purchasePrice: null,
        marketOpen: false,
        source: 'free',
        keepBonusClaimed: true,
      };
    }

    next = {
      ...next,
      roundCredits: Math.max(0, next.roundCredits + creditsAdded),
      players: nextPlayers,
      activePosition: null,
      runCompleted: true,
    };

    persist(next);
    window.setTimeout(() => {
      actionLockRef.current = false;
    }, 400);

    return { ok: true, creditsAdded, keepBonusCount };
  }, [persist, session]);

  const openMarket = useCallback((pos: Position): { ok: boolean; reason?: string } => {
    if (actionLockRef.current || !session || session.runCompleted) {
      return { ok: false, reason: 'busy' };
    }

    const slot = session.players[pos];
    if (!slot.revealed || slot.finalized) return { ok: false, reason: 'locked' };

    const freeId = slot.freePlayerId ?? slot.playerId;
    if (!freeId) return { ok: false, reason: 'missing' };

    let offers = session.offers[pos];
    let nextOffers = { ...session.offers };
    let nextFingerprints = { ...session.offerFingerprint };
    const exclude = usedPlayerIds(session);
    exclude.add(freeId);
    const offersAreFresh =
      Boolean(offers?.length) && (offers ?? []).every((playerId) => !exclude.has(playerId));

    if (!offersAreFresh) {
      const generated = generateMarketOffers({
        slot: pos,
        credits: session.roundCredits,
        excludeIds: exclude,
        avoidFingerprint: session.offerFingerprint[pos],
      });
      offers = generated.map((player) => player.id);
      nextOffers[pos] = offers;
      nextFingerprints[pos] = offersFingerprint(offers);
    }

    const next: LineupSession = {
      ...session,
      activePosition: pos,
      offers: nextOffers,
      offerFingerprint: nextFingerprints,
      players: {
        ...Object.fromEntries(
          LINEUP_POSITIONS.map((position) => [
            position,
            position === pos
              ? session.players[position]
              : { ...session.players[position], marketOpen: false },
          ]),
        ) as Record<Position, LineupSession['players'][Position]>,
        [pos]: {
          ...slot,
          playerId: freeId,
          freePlayerId: freeId,
          marketOpen: true,
        },
      },
    };
    persist(next);
    return { ok: true };
  }, [persist, session]);

  const closeMarket = useCallback((pos: Position): { ok: boolean; reason?: string } => {
    if (!session || session.runCompleted) return { ok: false, reason: 'busy' };
    const slot = session.players[pos];
    if (!slot.revealed || slot.finalized || !slot.marketOpen) {
      return { ok: false, reason: 'locked' };
    }

    const freeId = slot.freePlayerId ?? slot.playerId;
    persist({
      ...session,
      activePosition: null,
      players: {
        ...session.players,
        [pos]: {
          ...slot,
          playerId: freeId,
          freePlayerId: freeId,
          marketOpen: false,
        },
      },
    });
    return { ok: true };
  }, [persist, session]);

  const purchaseMarketPlayer = useCallback((pos: Position, playerId: string): { ok: boolean; reason?: string } => {
    if (actionLockRef.current || !session || session.runCompleted) {
      return { ok: false, reason: 'busy' };
    }

    const slot = session.players[pos];
    if (!slot.revealed || slot.finalized || !slot.marketOpen || session.activePosition !== pos) {
      return { ok: false, reason: 'locked' };
    }

    const offerIds = session.offers[pos] ?? [];
    if (!offerIds.includes(playerId)) return { ok: false, reason: 'not-offer' };

    const player = getPlayerById(playerId);
    if (!player) return { ok: false, reason: 'missing' };
    if (player.primaryPosition !== pos) return { ok: false, reason: 'position' };

    const freeId = slot.freePlayerId;
    if (freeId && playerId === freeId) return { ok: false, reason: 'free' };

    const used = usedPlayerIds(session);
    if (used.has(playerId)) return { ok: false, reason: 'duplicate' };

    const price = getPlayerPrice(player);
    if (!canAffordPurchase(session.roundCredits, price)) {
      return { ok: false, reason: 'credits' };
    }

    actionLockRef.current = true;
    const finalized = finalizeSlot(session, pos, playerId, {
      purchasePrice: price,
      source: 'market',
      keepBonusClaimed: false,
      creditDelta: -price,
    });
    const next: LineupSession = {
      ...finalized,
      creditsSpent: session.creditsSpent + price,
    };
    persist(next);
    window.setTimeout(() => {
      actionLockRef.current = false;
    }, 280);
    return { ok: true };
  }, [persist, session]);

  const rerollOffers = useCallback((): { ok: boolean; reason?: string } => {
    if (rerollLockRef.current || !session || session.runCompleted) {
      return { ok: false, reason: 'busy' };
    }

    const pos = session.activePosition;
    if (!pos) return { ok: false, reason: 'unavailable' };
    const slot = session.players[pos];
    if (!slot.revealed || slot.finalized || !slot.marketOpen) {
      return { ok: false, reason: 'locked' };
    }

    if (!canAffordReroll(session.roundCredits)) {
      return { ok: false, reason: 'credits' };
    }

    const freeId = slot.freePlayerId ?? slot.playerId;
    const exclude = usedPlayerIds(session);
    if (freeId) exclude.add(freeId);

    rerollLockRef.current = true;
    const generated = generateMarketOffers({
      slot: pos,
      credits: session.roundCredits - REROLL_COST,
      excludeIds: exclude,
      avoidFingerprint: session.offerFingerprint[pos],
    });
    const ids = generated.map((player) => player.id);
    const next: LineupSession = {
      ...session,
      roundCredits: session.roundCredits - REROLL_COST,
      creditsSpent: session.creditsSpent + REROLL_COST,
      offers: {
        ...session.offers,
        [pos]: ids,
      },
      offerFingerprint: {
        ...session.offerFingerprint,
        [pos]: offersFingerprint(ids),
      },
      players: {
        ...session.players,
        [pos]: {
          ...slot,
          playerId: freeId,
          freePlayerId: freeId,
          marketOpen: true,
        },
      },
    };
    persist(next);
    window.setTimeout(() => {
      rerollLockRef.current = false;
    }, 500);
    return { ok: true };
  }, [persist, session]);

  const beginSeasonSimulation = useCallback(() => {
    setSession((current) => {
      if (!current) return current;
      const isComplete =
        current.runCompleted ||
        LINEUP_POSITIONS.every((pos) => current.players[pos].finalized && current.players[pos].playerId);
      if (!isComplete || current.seasonRecord) return current;

      const players = LINEUP_POSITIONS.map((pos) => {
        const id = current.players[pos].playerId;
        return id ? getPlayerById(id) : undefined;
      }).filter((player): player is TradePlayer => player !== undefined);

      if (players.length !== LINEUP_POSITIONS.length) return current;

      const next: LineupSession = {
        ...current,
        runCompleted: true,
        seasonRecord: simulateLineupSeason(players),
        seasonSimulationComplete: false,
      };
      saveLineupSession(next);
      return next;
    });
  }, []);

  const completeSeasonSimulation = useCallback(() => {
    setSession((current) => {
      if (!current?.seasonRecord || current.seasonSimulationComplete) return current;
      const next: LineupSession = {
        ...current,
        seasonSimulationComplete: true,
      };
      saveLineupSession(next);
      return next;
    });
  }, []);

  const getFinalizedLineup = useCallback((): LineupSlotPlayer[] | null => {
    if (!session) return null;
    const lineup: LineupSlotPlayer[] = [];
    for (const slot of LINEUP_POSITIONS) {
      const id = session.players[slot].playerId;
      const player = id ? getPlayerById(id) : undefined;
      if (!player || !session.players[slot].finalized) return null;
      lineup.push({ slot, player });
    }
    return lineup;
  }, [session]);

  const beginMatch = useCallback(() => {
    setSession((current) => {
      if (!current) return current;
      if (current.match) return current;
      const isComplete =
        current.runCompleted ||
        LINEUP_POSITIONS.every((pos) => current.players[pos].finalized && current.players[pos].playerId);
      if (!isComplete) return current;

      const lineup: LineupSlotPlayer[] = [];
      for (const slot of LINEUP_POSITIONS) {
        const id = current.players[slot].playerId;
        const player = id ? getPlayerById(id) : undefined;
        if (!player) return current;
        lineup.push({ slot, player });
      }

      const opponent = generateOpponentLineup(lineup, 'gold');
      const match: LineupMatchState = {
        matchId: `match_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        opponentIds: opponentIdsFromLineup(opponent),
        result: null,
        phase: 'matchmaking',
        trophiesApplied: false,
      };

      const next: LineupSession = {
        ...current,
        runCompleted: true,
        match,
      };
      saveLineupSession(next);
      return next;
    });
  }, []);

  const resolveMatch = useCallback(() => {
    setSession((current) => {
      if (!current?.match || current.match.result) return current;

      const lineup: LineupSlotPlayer[] = [];
      for (const slot of LINEUP_POSITIONS) {
        const id = current.players[slot].playerId;
        const player = id ? getPlayerById(id) : undefined;
        if (!player) return current;
        lineup.push({ slot, player });
      }

      const opponent = hydrateOpponentFromIds(current.match.opponentIds);
      if (!opponent) return current;

      const resolved = resolveHeadToHead(lineup, opponent, 'gold');
      const next: LineupSession = {
        ...current,
        match: {
          ...current.match,
          result: {
            won: resolved.won,
            playerScore: resolved.score.playerScore,
            opponentScore: resolved.score.opponentScore,
            playerPower: resolved.playerPower,
            opponentPower: resolved.opponentPower,
            slotResults: resolved.slotResults,
            userSurviving: resolved.userSurviving,
            opponentSurviving: resolved.opponentSurviving,
            sweep: resolved.sweep,
          },
          phase: 'battle',
        },
      };
      saveLineupSession(next);
      return next;
    });
  }, []);

  const setMatchPhase = useCallback((phase: LineupMatchPhase) => {
    setSession((current) => {
      if (!current?.match || current.match.phase === phase) return current;
      const next: LineupSession = {
        ...current,
        match: { ...current.match, phase },
      };
      saveLineupSession(next);
      return next;
    });
  }, []);

  const markMatchTrophiesApplied = useCallback(() => {
    setSession((current) => {
      if (!current?.match || current.match.trophiesApplied) return current;
      const next: LineupSession = {
        ...current,
        match: { ...current.match, trophiesApplied: true, phase: 'result' },
      };
      saveLineupSession(next);
      return next;
    });
  }, []);

  const newLineup = useCallback(() => {
    actionLockRef.current = false;
    rerollLockRef.current = false;
    clearLineupSession();
    const fresh = createFreshLineupSession();
    persist(fresh);
  }, [persist]);

  const getOfferAffordability = useCallback(
    (player: TradePlayer) => {
      if (!session) return false;
      return canAffordPurchase(session.roundCredits, getPlayerPrice(player));
    },
    [session],
  );

  const canReroll = Boolean(
    session &&
      currentPosition &&
      session.players[currentPosition]?.marketOpen &&
      !session.players[currentPosition]?.finalized &&
      canAffordReroll(session.roundCredits),
  );

  return {
    session,
    slots,
    currentPosition,
    currentOffers,
    currentFreePlayer,
    marketOpen,
    finalizedCount: session ? finalizedCount(session) : 0,
    playerProgress: Math.min(5, (session ? finalizedCount(session) : 0) + 1),
    roundCredits: session?.roundCredits ?? 0,
    creditsSpent: session?.creditsSpent ?? 0,
    allFinalized,
    runCompleted: session?.runCompleted ?? false,
    seasonRecord: session?.seasonRecord ?? null,
    match: session?.match ?? null,
    revealCard,
    keepFreePlayer,
    lockInAndBattle,
    openMarket,
    closeMarket,
    purchaseMarketPlayer,
    rerollOffers,
    canReroll,
    getOfferAffordability,
    getPlayerPrice,
    beginSeasonSimulation,
    completeSeasonSimulation,
    beginMatch,
    resolveMatch,
    setMatchPhase,
    markMatchTrophiesApplied,
    getFinalizedLineup,
    newLineup,
  };
}
