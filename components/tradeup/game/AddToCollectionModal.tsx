'use client';

import { useGameReducedMotion } from '@/hooks/useGameReducedMotion';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import type { TradePlayer } from '@/lib/tradeup/types';
import { formatCredits } from '@/lib/tradeup/credits';
import { getPlayerTier } from '@/lib/tradeup/tiers';
import { getTeam } from '@/lib/tradeup/teams';
import { TierBadge } from '../TierBadge';
import { PlayerHeadshot } from '../PlayerHeadshot';
import { TeamLogo } from '../TeamLogo';

interface AddToCollectionModalProps {
  player: TradePlayer;
  sellValue: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AddToCollectionModal({
  player,
  sellValue,
  onConfirm,
  onCancel,
}: AddToCollectionModalProps) {
  const reduceMotion = useGameReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const tier = getPlayerTier(player);
  const team = getTeam(player.teamId);
  const teamName = team?.fullName ?? player.teamId;

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
      if (event.key === 'Escape' && !submitting) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [submitting, onCancel]);

  const handleConfirm = () => {
    if (submitting) return;
    setSubmitting(true);
    onConfirm();
  };

  if (!mounted) return null;

  return createPortal(
    <div className="game-trade-overlay game-collection-overlay" role="presentation">
      <motion.button
        type="button"
        className="game-trade-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onCancel}
        aria-label="Keep trading"
        tabIndex={-1}
      />
      <motion.div
        className="game-trade-modal game-collection-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-collection-modal-title"
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
            disabled={submitting}
            aria-label="Keep trading"
          >
            ×
          </button>

          <header className="game-collection-modal__header">
            <h2 id="game-collection-modal-title" className="game-collection-modal__title">
              Add Player to Collection?
            </h2>
          </header>

          <div className="game-collection-modal__player">
            <PlayerHeadshot
              name={player.name}
              teamId={player.teamId}
              playerId={player.id}
              headshotUrl={player.headshotUrl}
              size="modal"
            />
            <div className="game-collection-modal__player-info">
              <h3 className="game-collection-modal__player-name">{player.name}</h3>
              <div className="game-collection-modal__player-meta">
                <TeamLogo teamId={player.teamId} abbreviation={player.teamId} size="xs" />
                <span>{teamName}</span>
              </div>
              <TierBadge tier={tier} size="subtle" />
              <span className="game-collection-modal__sell">
                Sell value: {formatCredits(sellValue)} credits
              </span>
            </div>
          </div>

          <p className="game-collection-modal__body">
            This will end your current trading run and add <strong>{player.name}</strong> to My
            Collection. You can later sell this player for credits or move them into your Starting
            Five or Bench from the My Franchise page.
          </p>
          <p className="game-collection-modal__note">
            You will leave the trading screen after confirming.
          </p>

          <div className="game-collection-modal__actions">
            <button
              type="button"
              className="game-trade-modal__cancel"
              onClick={onCancel}
              disabled={submitting}
            >
              Keep Trading
            </button>
            <button
              type="button"
              className="game-action-btn game-action-btn--collect game-collection-modal__confirm"
              onClick={handleConfirm}
              disabled={submitting}
            >
              {submitting ? 'Adding…' : 'Add to Collection'}
            </button>
          </div>
      </motion.div>
    </div>,
    document.body,
  );
}
