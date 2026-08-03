'use client';

import { useCallback, useRef } from 'react';
import { POSITION_LABELS } from '@/lib/tradeup/startingLineup';
import { isSTier } from '@/lib/tradeup/tiers';
import type { Position, TradePlayer } from '@/lib/tradeup/types';
import { PlayerCardVisual } from './PlayerCardVisual';

interface LineupRevealCardProps {
  slot: Position;
  player: TradePlayer | null;
  isFreePlayerSTier: boolean;
  isHiddenSTier: boolean;
  suppressHiddenJiggle: boolean;
  revealed: boolean;
  finalized: boolean;
  revealing: boolean;
  muted: boolean;
  flipDisabled: boolean;
  marketOpen: boolean;
  purchasePrice: number | null;
  locking?: boolean;
  tradeStamped?: boolean;
  onReveal: (slot: Position) => void;
  onKeep: (origin?: HTMLElement | null) => void;
  onViewMarket: () => void;
  onCloseMarket: () => void;
}

export function LineupRevealCard({
  slot,
  player,
  isFreePlayerSTier,
  isHiddenSTier,
  suppressHiddenJiggle,
  revealed,
  finalized,
  revealing,
  muted,
  flipDisabled,
  marketOpen,
  purchasePrice,
  locking = false,
  tradeStamped = false,
  onReveal,
  onKeep,
  onViewMarket,
  onCloseMarket,
}: LineupRevealCardProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const keepBtnRef = useRef<HTMLButtonElement>(null);
  const costLabel =
    finalized && purchasePrice != null && purchasePrice > 0
      ? `${purchasePrice} cr`
      : revealed
        ? 'FREE'
        : null;

  const actionsEnabled = revealed && !finalized && !revealing;
  const keepLabel = finalized ? 'LOCKED' : 'KEEP';
  const tradeLabel = marketOpen ? 'CLOSE' : 'TRADE';
  const keepAria = finalized ? 'Locked in' : 'Keep';
  const tradeAria = marketOpen ? 'Close Trade Up' : 'Trade Up';

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (revealed || revealing || event.pointerType === 'touch') return;
      const node = wrapRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      node.style.setProperty('--card-tilt-x', `${(0.5 - y) * 15}deg`);
      node.style.setProperty('--card-tilt-y', `${(x - 0.5) * 18}deg`);
      node.style.setProperty('--foil-x', `${x * 100}%`);
      node.style.setProperty('--foil-y', `${y * 100}%`);
    },
    [revealed, revealing],
  );

  const resetPointerTilt = useCallback(() => {
    const node = wrapRef.current;
    if (!node) return;
    node.style.setProperty('--card-tilt-x', '0deg');
    node.style.setProperty('--card-tilt-y', '0deg');
    node.style.setProperty('--foil-x', '50%');
    node.style.setProperty('--foil-y', '50%');
  }, []);

  const setPressing = useCallback(
    (active: boolean) => {
      const node = wrapRef.current;
      if (!node || revealed) return;
      node.classList.toggle('lineup-card-wrap--pressing', active);
    },
    [revealed],
  );

  const handleFlip = useCallback(() => {
    if (revealed || flipDisabled) return;
    onReveal(slot);
  }, [revealed, flipDisabled, onReveal, slot]);

  const hiddenJiggleActive =
    isHiddenSTier && !revealed && !revealing && !suppressHiddenJiggle;

  return (
    <div
      className={`lineup-card-slot${
        finalized ? ' lineup-card-slot--finalized' : ''
      }${revealed ? ' lineup-card-slot--revealed' : ''}`}
    >
      <button
        type="button"
        className={`tu-btn tu-btn--secondary lineup-slot-action lineup-slot-action--trade${
          actionsEnabled ? '' : ' is-disabled'
        }`}
        disabled={!actionsEnabled}
        onClick={() => {
          if (!actionsEnabled) return;
          if (marketOpen) onCloseMarket();
          else onViewMarket();
        }}
        aria-label={`${POSITION_LABELS[slot]} ${tradeAria}`}
      >
        {tradeLabel}
      </button>

      <div
        className={`lineup-card-motion${
          hiddenJiggleActive ? ' lineup-card-motion--hidden-s' : ''
        }`}
      >
        <div
          ref={wrapRef}
          className={[
            'lineup-card-wrap',
            revealed ? 'lineup-card-wrap--revealed' : '',
            revealing ? 'lineup-card-wrap--revealing' : '',
            muted ? 'lineup-card-wrap--muted' : '',
            finalized ? 'lineup-card-wrap--finalized' : '',
            locking ? 'lineup-card-wrap--locking' : '',
            !revealed && !finalized ? 'lineup-card-wrap--current' : '',
            revealing && isFreePlayerSTier ? 'lineup-card-wrap--elite-release' : '',
            player && isSTier(player)
              ? 'lineup-card-wrap--front-s'
              : 'lineup-card-wrap--front-standard',
            'lineup-card-wrap--red',
            revealed && player ? 'lineup-card-wrap--player-card' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => {
            resetPointerTilt();
            setPressing(false);
          }}
          onPointerDown={() => {
            if (!revealed) setPressing(true);
          }}
          onPointerUp={() => setPressing(false)}
        >
          <div className={`lineup-card${revealed ? ' lineup-card--revealed' : ''}`}>
            <div className="lineup-card__inner">
              <div className="lineup-card__face lineup-card__back" aria-hidden={revealed}>
                <span className="lineup-card__back-glow" />
                <span className="lineup-card__back-shine" />
                <span className="lineup-card__back-pattern" />
                <span className="lineup-card__back-frame" />
                <span className="lineup-card__pos">{slot}</span>
                <span className="lineup-card__pos-full">{POSITION_LABELS[slot]}</span>
              </div>

              <div className="lineup-card__face lineup-card__front lineup-card__front--player">
                {player ? (
                  <PlayerCardVisual
                    player={player}
                    slot={slot}
                    variant="full"
                    size="fill"
                    badge={costLabel}
                  />
                ) : (
                  <div className="lineup-card__info lineup-card__info--pending">
                    <span className="lineup-card__pos lineup-card__pos--small">{slot}</span>
                    <h3 className="lineup-card__name">Reveal player</h3>
                    <div className="lineup-card__team">
                      <span>Tap to flip</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <span className="lineup-card__sweep" aria-hidden />

            {!revealed ? (
              <button
                type="button"
                className="lineup-card__reveal-hitbox"
                onClick={handleFlip}
                disabled={flipDisabled}
                aria-label={`Reveal ${POSITION_LABELS[slot]}`}
              />
            ) : null}

            {tradeStamped ? (
              <span className="lineup-trade-stamp" aria-hidden>
                TRADED
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <button
        ref={keepBtnRef}
        type="button"
        className={`tu-btn tu-btn--primary lineup-slot-action lineup-slot-action--keep${
          finalized ? ' is-locked' : ''
        }${actionsEnabled || finalized ? '' : ' is-disabled'}`}
        disabled={!actionsEnabled}
        onClick={() => {
          if (!actionsEnabled) return;
          onKeep(keepBtnRef.current);
        }}
        aria-label={`${POSITION_LABELS[slot]} ${keepAria}`}
      >
        {keepLabel}
      </button>
    </div>
  );
}
