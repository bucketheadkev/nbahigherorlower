'use client';

import { useGameReducedMotion } from '@/hooks/useGameReducedMotion';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import type { TradePlayer, TeamInfo } from '@/lib/tradeup/types';
import { getPrimaryStrength } from '@/lib/tradeup/engine';
import { getPlayerTier } from '@/lib/tradeup/tiers';
import { getTeam } from '@/lib/tradeup/teams';
import { TierBadge } from '../TierBadge';
import { PlayerHeadshot } from '../PlayerHeadshot';
import { TeamLogo } from '../TeamLogo';

interface TradeActionPanelProps {
  offering: TradePlayer;
  requesting: TradePlayer;
  team: TeamInfo;
  needs: string[];
  disabled: boolean;
  onPropose: () => void;
  onCancel: () => void;
}

function TradePlayerColumn({
  label,
  player,
  showTier,
}: {
  label: string;
  player: TradePlayer;
  showTier?: boolean;
}) {
  const team = getTeam(player.teamId);
  const teamName = team?.fullName ?? player.teamId;
  const specialty = getPrimaryStrength(player);
  const tier = getPlayerTier(player);

  return (
    <div className="game-trade-modal__column">
      <span className="game-trade-modal__column-label">{label}</span>
      <PlayerHeadshot
        name={player.name}
        teamId={player.teamId}
        playerId={player.id}
        headshotUrl={player.headshotUrl}
        size="modal"
      />
      <h3 className="game-trade-modal__player-name">{player.name}</h3>
      <div className="game-trade-modal__player-meta">
        <TeamLogo teamId={player.teamId} abbreviation={player.teamId} size="xs" />
        <span>{teamName}</span>
      </div>
      <div className="game-trade-modal__player-stats">
        <div className="game-stat">
          <span className="game-stat__value">{player.stats.ppg.toFixed(1)}</span>
          <span className="game-stat__label">PPG</span>
        </div>
        <span className="game-trade-modal__pos">{player.position}</span>
      </div>
      {showTier ? <TierBadge tier={tier} size="subtle" /> : null}
      <span className="game-trade-modal__specialty">{specialty}</span>
    </div>
  );
}

export function TradeActionPanel({
  offering,
  requesting,
  team,
  needs,
  disabled,
  onPropose,
  onCancel,
}: TradeActionPanelProps) {
  const reduceMotion = useGameReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !disabled && !submitting) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, submitting, onCancel]);

  const handlePropose = () => {
    if (disabled || submitting) return;
    setSubmitting(true);
    onPropose();
  };

  if (!mounted) return null;

  return createPortal(
    <div className="game-trade-overlay" role="presentation">
      <motion.button
        type="button"
        className="game-trade-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onCancel}
        aria-label="Close trade proposal"
        tabIndex={-1}
      />
      <motion.div
        ref={modalRef}
        className="game-trade-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-trade-modal-title"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          className="game-trade-modal__close"
          onClick={onCancel}
          aria-label="Cancel trade proposal"
        >
          ×
        </button>

        <header className="game-trade-modal__header">
          <p className="game-trade-modal__eyebrow">Proposed trade</p>
          <h2 id="game-trade-modal-title" className="game-trade-modal__title">
            Offer {offering.name.split(' ').pop()} for {requesting.name.split(' ').pop()}
          </h2>
          <div className="game-trade-modal__team-row">
            <TeamLogo teamId={team.id} abbreviation={team.id} size="sm" />
            <span>{team.fullName}</span>
          </div>
        </header>

        <div className="game-trade-modal__exchange">
          <TradePlayerColumn label="Your player" player={offering} showTier />
          <div className="game-trade-modal__divider" aria-hidden>
            <span className="game-trade-modal__for">FOR</span>
          </div>
          <TradePlayerColumn label="Requested player" player={requesting} />
        </div>

        {needs.length > 0 ? (
          <div className="game-trade-modal__needs">
            <span className="game-trade-modal__needs-label">Team needs</span>
            <ul className="game-trade-modal__needs-list">
              {needs.map((need) => (
                <li key={need}>{need}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="game-trade-modal__actions">
          <button
            type="button"
            className="game-trade-modal__cancel"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="game-action-btn game-action-btn--collect game-trade-modal__submit"
            disabled={disabled || submitting}
            onClick={handlePropose}
          >
            {submitting ? 'Submitting…' : 'Propose Trade'}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
