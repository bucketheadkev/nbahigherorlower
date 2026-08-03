'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createRound, evaluateTrade } from '@/lib/tradeup/engine';
import type { TradePlayer, TradeRound } from '@/lib/tradeup/types';

interface UseLineupTradeOptions {
  currentPlayer: TradePlayer | null;
  reservedPlayerIds: Set<string>;
  onTradeAccepted: (player: TradePlayer) => void;
}

interface TradeFeedback {
  type: 'accepted' | 'rejected';
  message: string;
  player?: TradePlayer;
}

export function useLineupTrade({
  currentPlayer,
  reservedPlayerIds,
  onTradeAccepted,
}: UseLineupTradeOptions) {
  const [round, setRound] = useState<TradeRound | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<TradeFeedback | null>(null);
  const usedTeamsRef = useRef<Set<string>>(new Set());
  const lockRef = useRef(false);

  const loadRound = useCallback(
    (player: TradePlayer) => {
      const next = createRound(player.teamId, usedTeamsRef.current, player);
      usedTeamsRef.current.add(next.team.id);

      const filtered = next.options.filter(
        (option) => !reservedPlayerIds.has(option.id) || option.id === player.id,
      );

      setRound({
        ...next,
        options: filtered.length > 0 ? filtered : next.options,
      });
      setFeedback(null);
    },
    [reservedPlayerIds],
  );

  useEffect(() => {
    if (!currentPlayer) {
      setRound(null);
      return;
    }
    loadRound(currentPlayer);
  }, [currentPlayer, loadRound]);

  const selectOption = useCallback(
    async (offered: TradePlayer) => {
      if (!currentPlayer || !round || lockRef.current || busy) return;

      lockRef.current = true;
      setBusy(true);
      setFeedback(null);

      const evaluation = evaluateTrade(offered, currentPlayer, round.team.id);
      const accepted = evaluation.outcome === 'accepted';

      if (accepted) {
        setFeedback({
          type: 'accepted',
          message: `Trade accepted — ${offered.name} is yours.`,
          player: offered,
        });
        onTradeAccepted(offered);
        window.setTimeout(() => {
          loadRound(offered);
          setBusy(false);
          lockRef.current = false;
        }, 450);
      } else {
        setFeedback({
          type: 'rejected',
          message: `The ${round.team.name} declined.`,
        });
        window.setTimeout(() => {
          setBusy(false);
          lockRef.current = false;
        }, 500);
      }
    },
    [currentPlayer, round, busy, onTradeAccepted, loadRound],
  );

  const refreshOffers = useCallback(() => {
    if (!currentPlayer || lockRef.current || busy) return;
    loadRound(currentPlayer);
  }, [currentPlayer, busy, loadRound]);

  return {
    round,
    busy,
    feedback,
    selectOption,
    refreshOffers,
  };
}
