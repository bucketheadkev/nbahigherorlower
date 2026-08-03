'use client';

import type { TradePlayer } from '@/lib/tradeup/types';
import { getPlayerTier } from '@/lib/tradeup/tiers';
import { formatCredits } from '@/lib/tradeup/credits';
import { LivesIndicator } from '../LivesIndicator';
import { MuteButton } from '../MuteButton';

interface GameStatusBarProps {
  currentPlayer: TradePlayer;
  chainLength: number;
  lives: number;
  maxLives: number;
  credits: number;
  muted: boolean;
  onToggleMute: () => void;
  onExit: () => void;
}

export function GameStatusBar({
  currentPlayer,
  chainLength,
  lives,
  maxLives,
  credits,
  muted,
  onToggleMute,
  onExit,
}: GameStatusBarProps) {
  const currentTier = getPlayerTier(currentPlayer);

  return (
    <header className="game-status-bar">
      <button type="button" className="tu-back" onClick={onExit}>
        ← Home
      </button>

      <div className="game-status-bar__center">
        <span className="game-status-bar__tier" aria-label={`Current tier ${currentTier}`}>
          {currentTier}
        </span>
        <span className="game-status-bar__sep" aria-hidden>
          ·
        </span>
        <span className="game-status-bar__chain">
          Chain <strong>{chainLength}</strong>
        </span>
      </div>

      <div className="game-status-bar__meta">
        <div className="tu-credits" aria-label={`${credits} credits`}>
          <span className="tu-credits__icon" aria-hidden>
            ◆
          </span>
          <span className="tu-credits__value">{formatCredits(credits)}</span>
        </div>
        <LivesIndicator lives={lives} max={maxLives} />
        <MuteButton muted={muted} onToggle={onToggleMute} />
      </div>
    </header>
  );
}
