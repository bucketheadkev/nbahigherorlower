'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TradePlayer } from '@/lib/tradeup/types';
import {
  assignToLineup,
  dropPlayer,
  moveToBench,
  moveToStartingFive,
  removeFromLineup,
  removePlayerFromFranchise,
  swapLineupPlayers,
  unlockPlayer,
} from '@/lib/tradeup/franchise/operations';
import { loadFranchise, saveFranchise } from '@/lib/tradeup/franchise/storage';
import { calculateFranchiseTier, getCollectionIds } from '@/lib/tradeup/franchise/tier';
import type { FranchiseData, FranchiseDropTarget, UnlockResult } from '@/lib/tradeup/franchise/types';

export interface FranchiseUnlockEvent {
  result: UnlockResult;
  player: TradePlayer;
}

export function useFranchise() {
  const [data, setData] = useState<FranchiseData | null>(null);
  const [ready, setReady] = useState(false);
  const prevTierRef = useRef<string | null>(null);
  const [tierImproved, setTierImproved] = useState(false);

  const refresh = useCallback(() => {
    const loaded = loadFranchise();
    setData(loaded);
    return loaded;
  }, []);

  useEffect(() => {
    try {
      refresh();
    } catch (error) {
      console.error('Failed to load franchise', error);
      setData(loadFranchise());
    } finally {
      // Always leave the boot loading screen, even if storage throws.
      setReady(true);
    }
  }, [refresh]);

  const persist = useCallback((next: FranchiseData) => {
    saveFranchise(next);
    setData(next);

    const newTier = calculateFranchiseTier(next);
    const prev = prevTierRef.current;
    if (newTier && prev && tierRank(newTier) > tierRank(prev)) {
      setTierImproved(true);
      setTimeout(() => setTierImproved(false), 1200);
    }
    prevTierRef.current = newTier;
  }, []);

  const franchiseTier = useMemo(
    () => (data ? calculateFranchiseTier(data) : null),
    [data],
  );

  const collectionIds = useMemo(() => (data ? getCollectionIds(data) : []), [data]);

  const collectionSize = data?.unlockedIds.length ?? 0;

  useEffect(() => {
    if (franchiseTier) prevTierRef.current = franchiseTier;
  }, [franchiseTier]);

  const unlockFromTrade = useCallback(
    (player: TradePlayer): FranchiseUnlockEvent => {
      const current = data ?? loadFranchise();
      const { data: next, result } = unlockPlayer(current, player.id);
      persist(next);
      return { result, player };
    },
    [data, persist],
  );

  const sellFranchisePlayer = useCallback(
    (playerId: string) => {
      const current = loadFranchise();
      persist(removePlayerFromFranchise(current, playerId));
    },
    [persist],
  );

  const handleAssignToStarting = useCallback(
    (playerId: string, replacePlayerId?: string) => {
      if (!data) return;
      persist(assignToLineup(data, playerId, 'starting', replacePlayerId));
    },
    [data, persist],
  );

  const handleAssignToBench = useCallback(
    (playerId: string, replacePlayerId?: string) => {
      if (!data) return;
      persist(assignToLineup(data, playerId, 'bench', replacePlayerId));
    },
    [data, persist],
  );

  const handleSwapPlayers = useCallback(
    (playerA: string, playerB: string) => {
      if (!data) return;
      persist(swapLineupPlayers(data, playerA, playerB));
    },
    [data, persist],
  );

  const handleMoveToStarting = useCallback(
    (playerId: string) => {
      if (!data) return;
      persist(moveToStartingFive(data, playerId));
    },
    [data, persist],
  );

  const handleMoveToBench = useCallback(
    (playerId: string) => {
      if (!data) return;
      persist(moveToBench(data, playerId));
    },
    [data, persist],
  );

  const handleRemoveFromLineup = useCallback(
    (playerId: string) => {
      if (!data) return;
      persist(removeFromLineup(data, playerId));
    },
    [data, persist],
  );

  const handleDrop = useCallback(
    (playerId: string, target: FranchiseDropTarget) => {
      if (!data) return;
      persist(dropPlayer(data, playerId, target));
    },
    [data, persist],
  );

  return {
    data,
    ready,
    franchiseTier,
    tierImproved,
    collectionIds,
    collectionSize,
    refresh,
    unlockFromTrade,
    sellFranchisePlayer,
    handleAssignToStarting,
    handleAssignToBench,
    handleSwapPlayers,
    handleMoveToStarting,
    handleMoveToBench,
    handleRemoveFromLineup,
    handleDrop,
  };
}

function tierRank(tier: string): number {
  const order = ['F', 'D', 'C', 'B', 'A', 'S'];
  return order.indexOf(tier);
}
