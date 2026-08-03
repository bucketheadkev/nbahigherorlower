'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Position, TradePlayer } from '@/lib/tradeup/types';
import { getTeam } from '@/lib/tradeup/teams';
import { useLineupTrade } from '@/hooks/useLineupTrade';
import { useSound } from '@/hooks/useSound';
import { PlayerOption } from './PlayerOption';
import { PlayerHeadshot } from './PlayerHeadshot';
import { TeamLogo } from './TeamLogo';
import { GameBackground } from './game/GameBackground';
import { getPrimaryStrength } from '@/lib/tradeup/engine';

interface LineupTradeScreenProps {
  activePosition: Position;
  currentPlayer: TradePlayer;
  reservedPlayerIds: Set<string>;
  onKeep: (player: TradePlayer) => void;
  onBack: () => void;
  onPlayerUpgraded: (player: TradePlayer) => void;
}

export function LineupTradeScreen({
  activePosition,
  currentPlayer,
  reservedPlayerIds,
  onKeep,
  onBack,
  onPlayerUpgraded,
}: LineupTradeScreenProps) {
  const { playAccept, playReject, playTap, playTradeComplete, playTradeOpen, resume } = useSound();
  const keepLockRef = useRef(false);
  const [offersOpen, setOffersOpen] = useState(false);
  const [passedOfferIds, setPassedOfferIds] = useState<Set<string>>(() => new Set());

  const handleAccepted = useCallback(
    (player: TradePlayer) => {
      playAccept();
      onPlayerUpgraded(player);
    },
    [playAccept, onPlayerUpgraded],
  );

  const { round, busy, feedback, selectOption, refreshOffers } = useLineupTrade({
    currentPlayer,
    reservedPlayerIds,
    onTradeAccepted: handleAccepted,
  });

  useEffect(() => {
    if (feedback?.type === 'rejected') {
      playReject();
    }
  }, [feedback, playReject]);

  const offers = useMemo(() => round?.options ?? [], [round]);

  const handleSelect = useCallback(
    (player: TradePlayer) => {
      resume();
      playTap();
      playTradeComplete();
      void selectOption(player);
      setOffersOpen(false);
    },
    [selectOption, playTap, playTradeComplete, resume],
  );

  const handleKeep = useCallback(() => {
    if (keepLockRef.current || busy) return;
    keepLockRef.current = true;
    playTap();
    onKeep(currentPlayer);
  }, [busy, currentPlayer, onKeep, playTap]);

  const handleTradeUp = useCallback(() => {
    if (busy) return;
    resume();
    playTap();
    playTradeOpen();
    setPassedOfferIds(new Set());
    setOffersOpen(true);
    refreshOffers();
  }, [busy, refreshOffers, playTap, playTradeOpen, resume]);

  const handlePass = useCallback(
    (player: TradePlayer) => {
      if (busy) return;
      if (passedOfferIds.has(player.id)) return;
      playReject();
      playTap();
      setPassedOfferIds((prev) => {
        const next = new Set(prev);
        next.add(player.id);
        return next;
      });
    },
    [busy, passedOfferIds, playReject, playTap],
  );

  const team = getTeam(currentPlayer.teamId);
  const teamName = team?.fullName ?? currentPlayer.teamId;

  return (
    <div className="tradeup-shell tradeup-shell--game" onPointerDown={resume}>
      <GameBackground />

      <header className="lineup-reveal__header">
        <button type="button" className="tu-back" onClick={onBack}>
          ← Lineup
        </button>
        <p className="lineup-trade__upgrading">Upgrading {activePosition}</p>
        <span className="lineup-reveal__spacer" aria-hidden />
      </header>

      <main className="game-board lineup-trade">
        <div className="game-board__top">
          <section className="game-asset-card lineup-trade__asset" aria-label="Your trade asset">
            <div className="game-asset-card__main">
              <div className="game-asset-card__media">
                <PlayerHeadshot
                  name={currentPlayer.name}
                  teamId={currentPlayer.teamId}
                  playerId={currentPlayer.id}
                  headshotUrl={currentPlayer.headshotUrl}
                  size="asset"
                  priority
                />
              </div>
              <div className="game-asset-card__body">
                <p className="game-asset-card__eyebrow">Your player</p>
                <h2 className="game-asset-card__name">{currentPlayer.name}</h2>
                <div className="game-asset-card__meta">
                  <TeamLogo teamId={currentPlayer.teamId} abbreviation={currentPlayer.teamId} size="xs" />
                  <span>{teamName}</span>
                </div>
              </div>
            </div>
            <div className="lineup-trade__asset-actions">
              <button
                type="button"
                className="tu-btn tu-btn--primary lineup-trade__action-btn"
                onClick={handleTradeUp}
                disabled={busy}
              >
                Trade Up
              </button>
              <button
                type="button"
                className="tu-btn tu-btn--secondary lineup-trade__action-btn"
                onClick={handleKeep}
                disabled={busy}
              >
                Keep
              </button>
            </div>
          </section>
        </div>

        <section className="game-roster" aria-label="Trade offers">
          <header className="game-roster__header">
            <h2 className="game-roster__title">
              {round ? `${round.team.fullName} offers` : 'Loading offers…'}
            </h2>
            {round ? (
              <p className="game-roster__subtitle">Open offers, then agree or pass on each</p>
            ) : null}
          </header>

          {feedback ? (
            <p
              className={`lineup-trade__feedback${
                feedback.type === 'accepted' ? ' lineup-trade__feedback--accept' : ' lineup-trade__feedback--reject'
              }`}
              role="status"
            >
              {feedback.message}
            </p>
          ) : null}

          {!offersOpen ? (
            <div className="game-roster__grid">
              {offers.map((player) => (
                <PlayerOption
                  key={`${round?.team.id ?? 'round'}-${player.id}`}
                  player={player}
                  disabled={busy}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          ) : null}
        </section>
      </main>

      <AnimatePresence>
        {offersOpen && round ? (
          <motion.div
            key="offers-sheet"
            className="trade-offers-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOffersOpen(false)}
            aria-hidden={false}
          >
            <motion.div
              className="trade-offers-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Trade offers"
              initial={{ y: 18, opacity: 0, scale: 0.985 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 18, opacity: 0, scale: 0.985 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="trade-offers-sheet__header">
                <p className="trade-offers-sheet__title">
                  {round.team.fullName} offers
                </p>
                <button
                  type="button"
                  className="tu-back trade-offers-sheet__close"
                  onClick={() => setOffersOpen(false)}
                  disabled={busy}
                >
                  Close
                </button>
              </div>

              <p className="trade-offers-sheet__hint">
                Agree to trade. Pass to skip. Pick a new offer whenever you want.
              </p>

              <div className="trade-offers-sheet__grid">
                {offers.map((player, index) => {
                  const passed = passedOfferIds.has(player.id);
                  const teamAbbr = player.teamId.toUpperCase();
                  const specialty = getPrimaryStrength(player);

                  // Keep this logic aligned with PlayerOption name sizing.
                  const nameLen = player.name.length;
                  const nameSize = nameLen > 22 ? ' game-candidate__name--xs' : nameLen > 17 ? ' game-candidate__name--sm' : '';
                  const specialtySize = specialty.length > 18 ? ' game-candidate__specialty--compact' : '';

                  return (
                    <motion.div
                      key={player.id}
                      className={`trade-offer-card${passed ? ' is-passed' : ''}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.025, duration: 0.22 }}
                    >
                      <div className="game-candidate__photo">
                        <PlayerHeadshot
                          name={player.name}
                          teamId={player.teamId}
                          playerId={player.id}
                          headshotUrl={player.headshotUrl}
                          size="fill"
                          priority={false}
                        />
                      </div>

                      <div className="game-candidate__body">
                        <div className="game-candidate__identity">
                          <span className="game-candidate__abbr">{teamAbbr}</span>
                          <span className={`game-candidate__name${nameSize}`}>{player.name}</span>
                        </div>
                        <div className="game-candidate__meta-row">
                          <span className="game-candidate__ppg-line">{player.stats.ppg.toFixed(1)} PPG</span>
                          <span className={`game-candidate__specialty${specialtySize}`}>{specialty}</span>
                        </div>
                      </div>

                      <div className="trade-offer-card__actions">
                        <button
                          type="button"
                          className="trade-offer-card__agree tu-btn tu-btn--primary"
                          disabled={busy || passed}
                          onClick={() => handleSelect(player)}
                        >
                          Agree
                        </button>
                        <button
                          type="button"
                          className="trade-offer-card__pass tu-btn tu-btn--secondary"
                          disabled={busy || passed}
                          onClick={() => handlePass(player)}
                        >
                          {passed ? 'Passed' : 'Pass'}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <div className="trade-offers-sheet__footer">
                <button
                  type="button"
                  className="tu-btn tu-btn--secondary trade-offers-sheet__btn"
                  disabled={busy}
                  onClick={() => {
                    playTap();
                    setPassedOfferIds(new Set());
                    refreshOffers();
                  }}
                >
                  New Offers
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
