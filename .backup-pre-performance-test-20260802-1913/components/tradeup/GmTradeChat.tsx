'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { formatRoundCredits, getPlayerPrice } from '@/lib/tradeup/lineupBudget';
import { POSITION_LABELS } from '@/lib/tradeup/startingLineup';
import { getTeam } from '@/lib/tradeup/teams';
import { isSTier } from '@/lib/tradeup/tiers';
import type { Position, TradePlayer } from '@/lib/tradeup/types';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { PlayerCardVisual } from './PlayerCardVisual';

interface GmTradeChatProps {
  position: Position;
  offers: TradePlayer[];
  freePlayer: TradePlayer | null;
  roundCredits: number;
  rerollCost: number;
  canReroll: boolean;
  rerolling: boolean;
  budgetMessage: string | null;
  getAffordable: (player: TradePlayer) => boolean;
  onClose: () => void;
  onReroll: () => void;
  onSign: (player: TradePlayer) => void;
}

type ChatStep = 'typing' | 'intro' | 'offers' | 'confirm';

export function GmTradeChat({
  position,
  offers,
  freePlayer,
  roundCredits,
  rerollCost,
  canReroll,
  rerolling,
  budgetMessage,
  getAffordable,
  onClose,
  onReroll,
  onSign,
}: GmTradeChatProps) {
  const reduceMotion = getPrefersReducedMotion();
  const [step, setStep] = useState<ChatStep>(reduceMotion ? 'offers' : 'typing');
  const [visibleOffers, setVisibleOffers] = useState(0);
  const [pendingSign, setPendingSign] = useState<TradePlayer | null>(null);

  const gmTeam = useMemo(() => {
    const first = offers[0];
    return first ? getTeam(first.teamId) : null;
  }, [offers]);

  useEffect(() => {
    if (reduceMotion) {
      setStep('offers');
      setVisibleOffers(offers.length);
      return;
    }

    setStep('typing');
    setVisibleOffers(0);
    const t1 = window.setTimeout(() => setStep('intro'), 520);
    const t2 = window.setTimeout(() => setStep('offers'), 1100);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [offers, reduceMotion, position]);

  useEffect(() => {
    if (step !== 'offers' || reduceMotion) return;
    if (visibleOffers >= offers.length) return;
    const timer = window.setTimeout(() => {
      setVisibleOffers((n) => Math.min(offers.length, n + 1));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [step, visibleOffers, offers.length, reduceMotion]);

  const gmName = gmTeam?.fullName ? `${gmTeam.name} GM` : 'Opposing GM';

  return (
    <div className="gm-chat" role="dialog" aria-modal="true" aria-label="Trade Up GM chat">
      <button type="button" className="gm-chat__backdrop" aria-label="Close" onClick={onClose} />

      <motion.section
        className="gm-chat__sheet"
        initial={reduceMotion ? false : { y: '100%' }}
        animate={{ y: 0 }}
        exit={reduceMotion ? undefined : { y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      >
        <header className="gm-chat__header">
          <div className="gm-chat__avatar" aria-hidden>
            GM
          </div>
          <div className="gm-chat__header-copy">
            <p className="gm-chat__eyebrow">{POSITION_LABELS[position]} Trade Up</p>
            <h2 className="gm-chat__title">{gmName}</h2>
          </div>
          <div className="gm-chat__credits" aria-label="Round credits">
            <span>Credits</span>
            <strong>{formatRoundCredits(roundCredits)}</strong>
          </div>
        </header>

        <div className="gm-chat__thread">
          <AnimatePresence mode="popLayout">
            {step === 'typing' ? (
              <motion.div
                key="typing"
                className="gm-bubble gm-bubble--gm gm-bubble--typing"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <span />
                <span />
                <span />
              </motion.div>
            ) : null}

            {step !== 'typing' ? (
              <motion.div
                key="intro"
                className="gm-bubble gm-bubble--gm"
                initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
              >
                Looking at your {POSITION_LABELS[position].toLowerCase()}. I can move a few names —
                tell me who you want to sign.
              </motion.div>
            ) : null}

            {freePlayer && step !== 'typing' ? (
              <motion.div
                key="protect"
                className="gm-bubble gm-bubble--system"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                Free player locked: <strong>{freePlayer.name}</strong>
              </motion.div>
            ) : null}

            {step === 'offers' || step === 'confirm'
              ? offers.slice(0, visibleOffers).map((player, index) => {
                  const price = getPlayerPrice(player);
                  const affordable = getAffordable(player);
                  const team = getTeam(player.teamId);
                  const elite = isSTier(player);
                  return (
                    <motion.article
                      key={player.id}
                      className={`gm-offer${elite ? ' is-elite' : ''}${
                        affordable ? '' : ' is-locked'
                      }`}
                      initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: index * 0.04, type: 'spring', stiffness: 420, damping: 28 }}
                    >
                      <div className="gm-offer__card">
                        <PlayerCardVisual
                          player={player}
                          slot={position}
                          variant="full"
                          size="md"
                          badge={`${price} cr`}
                        />
                      </div>
                      <div className="gm-offer__meta">
                        <p className="gm-offer__team">{team?.fullName ?? player.teamId}</p>
                        <p className="gm-offer__line">
                          {player.stats.ppg.toFixed(1)} PPG · Age {player.age}
                        </p>
                        <button
                          type="button"
                          className="gm-offer__sign"
                          disabled={!affordable || rerolling}
                          onClick={() => {
                            setPendingSign(player);
                            setStep('confirm');
                          }}
                        >
                          Sign {player.name.split(' ').slice(-1)[0]} for {price} credits
                        </button>
                        {!affordable ? (
                          <p className="gm-offer__need">Need more credits</p>
                        ) : null}
                      </div>
                    </motion.article>
                  );
                })
              : null}
          </AnimatePresence>
        </div>

        <footer className="gm-chat__footer">
          {budgetMessage ? (
            <p className="gm-chat__status" role="status">
              {budgetMessage}
            </p>
          ) : (
            <p className="gm-chat__status gm-chat__status--soft">
              Keep your free player for +100 credits anytime.
            </p>
          )}

          <div className="gm-chat__actions">
            <button
              type="button"
              className="tu-btn tu-btn--secondary gm-chat__btn"
              onClick={onReroll}
              disabled={!canReroll || rerolling}
            >
              New names · {rerollCost}
            </button>
            <button
              type="button"
              className="tu-btn tu-btn--secondary gm-chat__btn"
              onClick={onClose}
              disabled={rerolling}
            >
              Hang up
            </button>
          </div>
        </footer>

        <AnimatePresence>
          {step === 'confirm' && pendingSign ? (
            <motion.div
              className="gm-confirm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="gm-confirm__card"
                initial={reduceMotion ? false : { y: 24, scale: 0.96 }}
                animate={{ y: 0, scale: 1 }}
                exit={reduceMotion ? undefined : { y: 16, opacity: 0 }}
              >
                <p className="gm-confirm__eyebrow">Confirm signing</p>
                <h3 className="gm-confirm__title">
                  Sign {pendingSign.name} for {getPlayerPrice(pendingSign)} credits?
                </h3>
                <p className="gm-confirm__sub">
                  This replaces your {POSITION_LABELS[position].toLowerCase()} for the run.
                </p>
                <div className="gm-confirm__actions">
                  <button
                    type="button"
                    className="tu-btn tu-btn--primary"
                    onClick={() => {
                      onSign(pendingSign);
                      setPendingSign(null);
                    }}
                  >
                    Sign for {getPlayerPrice(pendingSign)}
                  </button>
                  <button
                    type="button"
                    className="tu-btn tu-btn--secondary"
                    onClick={() => {
                      setPendingSign(null);
                      setStep('offers');
                    }}
                  >
                    Keep talking
                  </button>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.section>
    </div>
  );
}
