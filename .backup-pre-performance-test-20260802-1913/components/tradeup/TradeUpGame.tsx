'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { StartingTier, TradePlayer } from '@/lib/tradeup/types';
import { useTradeUpGame } from '@/hooks/useTradeUpGame';
import { useSound } from '@/hooks/useSound';
import { getSellValue } from '@/lib/tradeup/credits';
import { getPlayerTier } from '@/lib/tradeup/tiers';
import { MAX_LIVES } from '@/lib/tradeup/types';
import { CurrentPlayerCard } from './CurrentPlayerCard';
import { TradeResultOverlay } from './TradeResultOverlay';
import { GameOverScreen } from './GameOverScreen';
import { TradeUpLoading } from './TradeUpLoading';
import { TradeUpError } from './TradeUpError';
import { SellPlayerModal } from './SellPlayerModal';
import { GameBackground } from './game/GameBackground';
import { GameStatusBar } from './game/GameStatusBar';
import { AddToCollectionModal } from './game/AddToCollectionModal';
import { NegotiationOfferPanel } from './game/NegotiationOfferPanel';
import {
  NegotiationTutorial,
  useNegotiationTutorial,
} from './game/NegotiationTutorial';
import { NegotiationResolvingOverlay } from './game/NegotiationResolvingOverlay';
import { TradeChainStrip } from './game/TradeChainStrip';

interface TradeUpGameProps {
  startingTier: StartingTier;
  credits: number;
  onExit: () => void;
  onSold: (amount: number) => void;
  onClaimFranchise: (player: TradePlayer) => void;
}

export function TradeUpGame({
  startingTier,
  credits,
  onExit,
  onSold,
  onClaimFranchise,
}: TradeUpGameProps) {
  const { muted, toggleMute, playAccept, playReject, playTap, playSellCredits, playAddCollection, playLifeGain, playLifeLost, resume } =
    useSound();
  const [showSellModal, setShowSellModal] = useState(false);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [chainExpanded, setChainExpanded] = useState(false);
  const [chainPinned, setChainPinned] = useState(false);
  const sellActionLockRef = useRef(false);
  const collectionActionLockRef = useRef(false);
  const { showTutorial, dismissTutorial } = useNegotiationTutorial();

  const {
    phase,
    currentPlayer,
    offer,
    lives,
    tradePath,
    tradesCompleted,
    rejectionsUsed,
    result,
    locked,
    initError,
    askForMore,
    attemptTrade,
    walkAway,
    sellPlayer,
    dismissResult,
    continueAfterAccept,
    restart,
  } = useTradeUpGame({
    startingTier,
    onAccept: playAccept,
    onReject: playReject,
    onTap: playTap,
  });

  const handleFirstInteraction = useCallback(() => {
    resume();
  }, [resume]);

  const handleConfirmSell = useCallback(() => {
    if (sellActionLockRef.current) return;
    const value = sellPlayer();
    if (value !== null) {
      sellActionLockRef.current = true;
      playSellCredits();
      onSold(value);
    }
    setShowSellModal(false);
  }, [sellPlayer, onSold, playSellCredits]);

  const handleAddToCollectionClick = useCallback(() => {
    if (!currentPlayer || locked || phase === 'result' || phase === 'gameover' || phase === 'resolving') {
      return;
    }
    setShowCollectionModal(true);
  }, [currentPlayer, locked, phase]);

  const handleConfirmAddToCollection = useCallback(() => {
    if (!currentPlayer || collectionActionLockRef.current) return;
    collectionActionLockRef.current = true;
    resume();
    playAddCollection();
    onClaimFranchise(currentPlayer);
    setShowCollectionModal(false);
  }, [currentPlayer, resume, playAddCollection, onClaimFranchise]);

  const handleAskForMore = useCallback(() => {
    askForMore();
  }, [askForMore]);

  const handleAcceptDismiss = useCallback(() => {
    if (lives < MAX_LIVES) playLifeGain();
    continueAfterAccept();
  }, [lives, playLifeGain, continueAfterAccept]);

  const handleRejectDismiss = useCallback(() => {
    playLifeLost();
    dismissResult();
  }, [playLifeLost, dismissResult]);

  const showResult = phase === 'result' && result;
  const celebrateAccept = Boolean(showResult && result?.type === 'accepted');
  const declined = Boolean(showResult && result?.type === 'rejected');

  useEffect(() => {
    if (tradePath.length <= 1) return;
    setChainPinned(true);
    const timer = window.setTimeout(() => setChainPinned(false), 850);
    return () => window.clearTimeout(timer);
  }, [tradePath.length]);

  if (initError) {
    return <TradeUpError message={initError} onRetry={restart} />;
  }

  if (!currentPlayer || !offer) {
    return <TradeUpLoading />;
  }

  const sellValue = getSellValue(currentPlayer);
  const actionsDisabled =
    locked || !!showResult || phase === 'gameover' || phase === 'resolving' || phase === 'transitioning';
  const chainLength = tradePath.length;
  const chainOpen = chainExpanded || chainPinned;

  return (
    <div className="tradeup-shell tradeup-shell--game" onPointerDown={handleFirstInteraction}>
      <GameBackground />

      <GameStatusBar
        currentPlayer={currentPlayer}
        chainLength={chainLength}
        lives={lives}
        maxLives={MAX_LIVES}
        credits={credits}
        muted={muted}
        onToggleMute={toggleMute}
        onExit={onExit}
      />

      <main className="hub">
        <div className="hub__stack">
          <button
            type="button"
            className="hub-chain-toggle"
            onClick={() => setChainExpanded((v) => !v)}
            aria-expanded={chainOpen}
          >
            <TradeChainStrip path={tradePath} expanded={chainOpen} />
          </button>

          <CurrentPlayerCard
            player={currentPlayer}
            celebrate={celebrateAccept}
            sellValue={sellValue}
            onSell={() => setShowSellModal(true)}
            onAddToCollection={handleAddToCollectionClick}
            actionsDisabled={actionsDisabled}
          />

          <NegotiationOfferPanel
            offer={offer}
            transitioning={phase === 'transitioning'}
            resolving={phase === 'resolving'}
            declined={declined}
            disabled={actionsDisabled || showTutorial}
            onAttempt={attemptTrade}
            onAskForMore={handleAskForMore}
            onWalkAway={walkAway}
          />
        </div>
      </main>

      <NegotiationResolvingOverlay
        active={phase === 'resolving'}
        teamName={offer.team.name}
      />

      <TradeResultOverlay
        result={showResult ? result : null}
        lives={lives}
        maxLives={MAX_LIVES}
        onRejectDismiss={handleRejectDismiss}
        onAcceptDismiss={handleAcceptDismiss}
      />

      <AnimatePresence>
        {showCollectionModal ? (
          <AddToCollectionModal
            player={currentPlayer}
            sellValue={sellValue}
            onConfirm={handleConfirmAddToCollection}
            onCancel={() => setShowCollectionModal(false)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showSellModal ? (
          <SellPlayerModal
            playerName={currentPlayer.name}
            tierLabel={getPlayerTier(currentPlayer)}
            credits={sellValue}
            onConfirm={handleConfirmSell}
            onCancel={() => setShowSellModal(false)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {phase === 'gameover' ? (
          <GameOverScreen
            tradePath={tradePath}
            tradesCompleted={tradesCompleted}
            rejectionsUsed={rejectionsUsed}
            onPlayAgain={restart}
            onHome={onExit}
          />
        ) : null}
      </AnimatePresence>

      <NegotiationTutorial open={showTutorial} onDismiss={dismissTutorial} />
    </div>
  );
}
