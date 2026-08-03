'use client';

import { useGameReducedMotion } from '@/hooks/useGameReducedMotion';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { TradeResult } from '@/hooks/useTradeUpGame';
import { getPlayerTier } from '@/lib/tradeup/tiers';
import { PlayerHeadshot } from './PlayerHeadshot';

const ACCEPT_AUTO_ADVANCE_MS = 1300;
const REJECT_AUTO_ADVANCE_MS = 1050;

interface TradeResultOverlayProps {
  result: TradeResult | null;
  lives: number;
  maxLives: number;
  onRejectDismiss: () => void;
  onAcceptDismiss: () => void;
}

export function TradeResultOverlay({
  result,
  lives,
  maxLives,
  onRejectDismiss,
  onAcceptDismiss,
}: TradeResultOverlayProps) {
  const reduceMotion = useGameReducedMotion();
  const [mounted, setMounted] = useState(false);

  const isAccept = result?.type === 'accepted';

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!result) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [result]);

  useEffect(() => {
    if (!result) return;
    const delay = isAccept ? ACCEPT_AUTO_ADVANCE_MS : REJECT_AUTO_ADVANCE_MS;
    const timer = window.setTimeout(
      isAccept ? onAcceptDismiss : onRejectDismiss,
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [result, isAccept, onAcceptDismiss, onRejectDismiss]);

  if (!mounted) return null;

  const newTier = result ? getPlayerTier(result.selected) : null;
  const livesAfterReject = Math.max(0, lives - 1);
  const willRestoreLife = isAccept && lives < maxLives;

  return createPortal(
    <AnimatePresence>
      {result ? (
        <div
          className={`hub-result${isAccept ? ' hub-result--accept' : ' hub-result--reject'}`}
          role="presentation"
        >
          <motion.button
            type="button"
            className="hub-result__backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={isAccept ? onAcceptDismiss : onRejectDismiss}
            aria-label="Dismiss"
            tabIndex={-1}
          />
          <motion.div
            className="hub-result__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hub-result-title"
            initial={
              reduceMotion
                ? false
                : isAccept
                  ? { opacity: 0, scale: 0.94 }
                  : { opacity: 0, scale: 0.98 }
            }
            animate={
              isAccept
                ? { opacity: 1, scale: 1 }
                : reduceMotion
                  ? { opacity: 1 }
                  : { opacity: 1, x: [0, -8, 8, -5, 5, 0] }
            }
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: isAccept ? 0.3 : 0.4, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <p
              id="hub-result-title"
              className={`hub-result__title${isAccept ? '' : ' hub-result__title--decline'}`}
            >
              {isAccept ? 'Trade Accepted' : 'Trade Declined'}
            </p>

            {isAccept ? (
              <>
                <div className="hub-result__player">
                  <PlayerHeadshot
                    name={result.selected.name}
                    teamId={result.selected.teamId}
                    playerId={result.selected.id}
                    headshotUrl={result.selected.headshotUrl}
                    size="modal"
                  />
                  <h2 className="hub-result__name">{result.selected.name}</h2>
                  {newTier ? <p className="hub-result__tier">{newTier} Tier</p> : null}
                </div>
                {willRestoreLife ? (
                  <p className="hub-result__lives hub-result__lives--gain">Life restored</p>
                ) : null}
                <button type="button" className="tu-btn tu-btn--primary" onClick={onAcceptDismiss}>
                  Continue
                </button>
              </>
            ) : (
              <>
                <p className="hub-result__message">{result.message}</p>
                <p className="hub-result__lives">
                  Lives · {livesAfterReject}/{maxLives}
                </p>
                <button
                  type="button"
                  className="tu-btn tu-btn--secondary"
                  onClick={onRejectDismiss}
                >
                  Continue
                </button>
              </>
            )}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
