'use client';

import { useGameReducedMotion } from '@/hooks/useGameReducedMotion';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { NegotiationOfferView } from '@/lib/tradeup/negotiation';
import { getPrimaryStrength } from '@/lib/tradeup/engine';
import { getTeam } from '@/lib/tradeup/teams';
import { PlayerHeadshot } from '../PlayerHeadshot';
import { TeamLogo } from '../TeamLogo';

interface NegotiationOfferPanelProps {
  offer: NegotiationOfferView;
  transitioning: boolean;
  resolving: boolean;
  declined?: boolean;
  disabled: boolean;
  onAttempt: () => void;
  onAskForMore: () => void;
  onWalkAway: () => void;
}

function riskClass(label: NegotiationOfferView['riskLabel']): string {
  switch (label) {
    case 'Guaranteed':
      return 'hub-chance--guaranteed';
    case 'Strong Chance':
      return 'hub-chance--strong';
    case 'Risky':
      return 'hub-chance--risky';
    case 'Long Shot':
      return 'hub-chance--longshot';
    default:
      return 'hub-chance--extreme';
  }
}

function useChanceCount(target: number, enabled: boolean) {
  const [display, setDisplay] = useState(target);
  const previousRef = useRef(target);

  useEffect(() => {
    const from = previousRef.current;
    previousRef.current = target;
    if (!enabled || from === target) {
      setDisplay(target);
      return;
    }

    const start = performance.now();
    const duration = 420;
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(Math.round(from + (target - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled]);

  return display;
}

export function NegotiationOfferPanel({
  offer,
  transitioning,
  resolving,
  declined = false,
  disabled,
  onAttempt,
  onAskForMore,
  onWalkAway,
}: NegotiationOfferPanelProps) {
  const reduceMotion = useGameReducedMotion();
  const player = offer.offered;
  const specialty = getPrimaryStrength(player);
  const team = getTeam(player.teamId);
  const busy = disabled || transitioning || resolving;
  const chance = useChanceCount(offer.acceptanceChance, !reduceMotion);

  const hover = reduceMotion ? undefined : { y: -2, scale: 1.01, transition: { duration: 0.16 } };
  const tap = reduceMotion ? undefined : { scale: 0.98, y: 1, transition: { duration: 0.08 } };

  return (
    <section className="hub-offer" aria-label="Trade negotiation">
      <div className="hub-offer__team">
        <TeamLogo teamId={offer.team.id} abbreviation={offer.team.id} size="xs" />
        <span>{offer.team.fullName}</span>
      </div>

      <div className="hub-offer__stage">
        <AnimatePresence mode="wait">
          <motion.article
            key={player.id}
            className={`hub-offer-card${transitioning ? ' hub-offer-card--shimmer' : ''}${
              declined ? ' hub-offer-card--shake' : ''
            }`}
            initial={
              reduceMotion ? false : { opacity: 0, rotateY: -10, y: 14, scale: 0.97 }
            }
            animate={
              declined && !reduceMotion
                ? { opacity: 1, rotateY: 0, y: 0, scale: 1, x: [0, -7, 7, -4, 4, 0] }
                : { opacity: 1, rotateY: 0, y: 0, scale: 1, x: 0 }
            }
            exit={
              reduceMotion ? undefined : { opacity: 0, rotateY: 8, y: -12, scale: 0.97 }
            }
            transition={{ duration: declined ? 0.42 : 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="hub-offer-card__photo">
              <PlayerHeadshot
                name={player.name}
                teamId={player.teamId}
                playerId={player.id}
                headshotUrl={player.headshotUrl}
                size="fill"
                priority
              />
            </div>
            <div className="hub-offer-card__info">
              <p className="hub-offer-card__label">They offer</p>
              <h3 className="hub-offer-card__name">{player.name}</h3>
              <div className="hub-offer-card__meta">
                <TeamLogo teamId={player.teamId} abbreviation={player.teamId} size="xs" />
                <span>
                  {team?.name ?? player.teamId} · {player.stats.ppg.toFixed(1)} PPG
                </span>
              </div>
              <p className="hub-offer-card__specialty">{specialty}</p>
            </div>
          </motion.article>
        </AnimatePresence>
      </div>

      <div className={`hub-chance ${riskClass(offer.riskLabel)}`} aria-live="polite">
        <span className="hub-chance__label">Trade Chance</span>
        <span className="hub-chance__value">{chance}%</span>
        <span className="hub-chance__risk">{offer.riskLabel}</span>
        {!offer.canAskForMore ? (
          <p className="hub-chance__cap">Best available offer</p>
        ) : (
          <p className="hub-chance__message">{offer.riskMessage}</p>
        )}
      </div>

      <div className="hub-actions">
        <motion.button
          type="button"
          className="tu-btn tu-btn--primary hub-btn hub-btn--attempt"
          disabled={busy}
          onClick={onAttempt}
          whileHover={busy ? undefined : hover}
          whileTap={busy ? undefined : tap}
        >
          {resolving ? 'Reviewing…' : 'Attempt Trade'}
        </motion.button>
        <motion.button
          type="button"
          className="tu-btn tu-btn--secondary hub-btn"
          disabled={busy || !offer.canAskForMore}
          onClick={onAskForMore}
          whileHover={busy || !offer.canAskForMore ? undefined : hover}
          whileTap={busy || !offer.canAskForMore ? undefined : tap}
        >
          {offer.canAskForMore ? 'Ask for More' : 'Best Available Offer'}
        </motion.button>
        <motion.button
          type="button"
          className="tu-btn tu-btn--ghost hub-btn hub-btn--walk"
          disabled={busy}
          onClick={onWalkAway}
          whileHover={busy ? undefined : hover}
          whileTap={busy ? undefined : tap}
        >
          Keep Current Player
        </motion.button>
      </div>
    </section>
  );
}
