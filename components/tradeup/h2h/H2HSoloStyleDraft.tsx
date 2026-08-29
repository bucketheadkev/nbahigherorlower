'use client';

import { type PointerEvent as ReactPointerEvent } from 'react';
import { getTeamColors, contrastOnPrimary } from '@/lib/tradeup/teamColors';
import { hapticLight } from '@/lib/tradeup/haptics';
import { H2H_POSITIONS, type H2HPosition } from '@/lib/multiplayer/h2hPenalty';
import type { H2HPickSelection } from '@/lib/multiplayer/h2hState';
import { H2HPositionPicker } from './H2HPositionPicker';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

interface H2HSoloStyleDraftProps {
  modeTitle: string;
  myName: string;
  opponentName: string;
  myPicks: Array<{ position: H2HPosition; selection: H2HPickSelection; raw_value: number }>;
  opponentPickCount: number;
  lockBusy: boolean;
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

/**
 * Solo-style H2H draft — spin freely, assign via bottom circles.
 * No per-position lock-in or opponent wait until all five are placed.
 */
export function H2HSoloStyleDraft({
  modeTitle,
  myName,
  opponentName,
  myPicks,
  opponentPickCount,
  lockBusy,
  error,
  onLock,
  onMove,
  onExit,
}: H2HSoloStyleDraftProps) {
  if (myPicks.length < 5) {
    return (
      <H2HPositionPicker
        myPicks={myPicks}
        opponentPickCount={opponentPickCount}
        busy={lockBusy}
        error={error}
        onLock={onLock}
        onMove={onMove}
        onExit={onExit}
      />
    );
  }

  const opponentDone = opponentPickCount >= 5;

  return (
    <div className="h2h-lobby h2h-lobby--match-wait" aria-label="Waiting for opponent">
      <header className="h2h-lobby__header">
        <p className="h2h-lobby__eyebrow">{modeTitle}</p>
        <h1 className="h2h-lobby__title">{opponentDone ? '…' : 'Locked'}</h1>
        <p className="h2h-lobby__subtitle">
          {Math.min(5, opponentPickCount)}/5
        </p>
      </header>
      <div className="h2h-wait-row" aria-label={`${myName} lineup`}>
        {H2H_POSITIONS.map((pos) => {
          const pick = myPicks.find((p) => p.position === pos);
          if (!pick) return null;
          const colors = getTeamColors(pick.selection.teamId);
          const ink = contrastOnPrimary(colors.primary);
          return (
            <div
              key={pos}
              className="h2h-wait-chip"
              style={{ background: colors.primary, color: ink }}
            >
              <span>{initials(pick.selection.name)}</span>
              <em>{pos}</em>
            </div>
          );
        })}
      </div>
      {error ? (
        <p className="h2h-lobby__error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="h2h-lobby__leave"
        onPointerDown={(e: ReactPointerEvent) => {
          e.preventDefault();
          hapticLight();
          onExit();
        }}
      >
        Leave
      </button>
    </div>
  );
}
