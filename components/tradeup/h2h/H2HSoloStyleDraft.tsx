'use client';

import { BillionTradeEngine } from '../BillionTradeEngine';
import type { H2HPosition } from '@/lib/multiplayer/h2hPenalty';
import type { H2HPickSelection } from '@/lib/multiplayer/h2hState';

interface H2HSoloStyleDraftProps {
  modeTitle: string;
  myName: string;
  opponentName: string;
  myPicks: Array<{ position: H2HPosition; selection: H2HPickSelection; raw_value: number }>;
  opponentPickCount: number;
  error: string | null;
  onLock: (position: H2HPosition, selection: H2HPickSelection, rawValue: number) => Promise<void>;
  onMove: (
    from: H2HPosition,
    to: H2HPosition,
    selection: H2HPickSelection,
    rawValue: number,
  ) => Promise<void>;
  onExit: () => void;
}

/** 1v1 draft — same spin/pick flow as classic Billion run; syncs locks/moves to Supabase. */
export function H2HSoloStyleDraft({
  opponentName,
  myPicks,
  opponentPickCount,
  error,
  onLock,
  onMove,
  onExit,
}: H2HSoloStyleDraftProps) {
  return (
    <BillionTradeEngine
      challengeMode="online"
      onlineOpponentName={opponentName.trim() || 'Opponent'}
      onlineOpponentProgress={opponentPickCount}
      syncedPicks={myPicks}
      deferOnlineReveal
      onlineDraftError={error}
      onPickLock={onLock}
      onPickMove={onMove}
      onExit={onExit}
    />
  );
}
