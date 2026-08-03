'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FranchiseData } from '@/lib/tradeup/franchise/types';
import type { PlayerTier } from '@/lib/tradeup/tiers';
import { countFilledSlots, getRosterSimulationProgress, isRosterCompleteForSimulation, totalLineupSlots } from '@/lib/tradeup/franchise/tier';
import { simulateSeason, type SeasonSimulationResult } from '@/lib/tradeup/franchise/seasonSim';
import { CreditsBadge } from './CreditsBadge';
import { HomeBackground } from './home/HomeBackground';
import { FranchiseGradeHero } from './franchise/FranchiseGradeHero';
import { MyFranchisePanel } from './franchise/MyFranchisePanel';
import { SeasonSimulator } from './franchise/SeasonSimulator';
import { FranchiseSimButton } from './franchise/FranchiseSimButton';

interface TradeUpFranchiseProps {
  credits: number;
  franchise: FranchiseData;
  franchiseTier: PlayerTier | null;
  tierImproved: boolean;
  collectionIds: string[];
  collectionSize: number;
  newPlayerId: string | null;
  focusCollection?: boolean;
  onFocusCollectionDone?: () => void;
  collectionNotice?: string | null;
  onBack: () => void;
  onAssignStarting: (playerId: string, replacePlayerId?: string) => void;
  onAssignBench: (playerId: string, replacePlayerId?: string) => void;
  onMoveToCollection: (playerId: string) => void;
  onSwapPlayers: (playerA: string, playerB: string) => void;
  onSellFranchisePlayer: (playerId: string) => { name: string; amount: number } | null;
  onFranchiseDrop: (
    playerId: string,
    zone: 'collection' | 'starting' | 'bench',
    slotIndex: number | null,
  ) => void;
}

export function TradeUpFranchise({
  credits,
  franchise,
  franchiseTier,
  tierImproved,
  collectionIds,
  collectionSize,
  newPlayerId,
  focusCollection = false,
  onFocusCollectionDone,
  collectionNotice = null,
  onBack,
  onAssignStarting,
  onAssignBench,
  onMoveToCollection,
  onSwapPlayers,
  onSellFranchisePlayer,
  onFranchiseDrop,
}: TradeUpFranchiseProps) {
  const [simPhase, setSimPhase] = useState<'idle' | 'simulating' | 'results'>('idle');
  const [simResult, setSimResult] = useState<SeasonSimulationResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const simLockRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!focusCollection) return;
    const timer = window.setTimeout(() => {
      document.getElementById('franchise-collection')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      onFocusCollectionDone?.();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusCollection, onFocusCollectionDone]);

  const lineupFilled =
    countFilledSlots(franchise.startingFive) + countFilledSlots(franchise.bench);
  const rosterProgress = getRosterSimulationProgress(franchise);
  const canSimulate = isRosterCompleteForSimulation(franchise);
  const isSimulating = simPhase === 'simulating';

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const startSimulation = useCallback(() => {
    if (simLockRef.current || !canSimulate) return;
    const result = simulateSeason(franchise);
    if (!result) return;
    simLockRef.current = true;
    setSimResult(result);
    setSimPhase('simulating');
  }, [franchise, canSimulate]);

  const handleSimulate = useCallback(() => {
    startSimulation();
  }, [startSimulation]);

  const handleAnimationComplete = useCallback(() => {
    setSimPhase('results');
    simLockRef.current = false;
  }, []);

  const handleSimulateAgain = useCallback(() => {
    startSimulation();
  }, [startSimulation]);

  const handleCloseSim = useCallback(() => {
    setSimPhase('idle');
    setSimResult(null);
    simLockRef.current = false;
  }, []);

  return (
    <div className="tradeup-shell tradeup-shell--franchise">
      <HomeBackground />

      <header className="tradeup-header franchise-page-header">
        <button type="button" className="tu-back" onClick={onBack}>
          ← Home
        </button>
        <CreditsBadge credits={credits} size="large" />
      </header>

      <main className="franchise-page-main">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="franchise-page-title">My Franchise</h1>
        </motion.div>

        <FranchiseGradeHero
          franchiseTier={franchiseTier}
          tierImproved={tierImproved}
          collectionSize={collectionSize}
          lineupFilled={lineupFilled}
          lineupTotal={totalLineupSlots()}
        />

        <FranchiseSimButton
          canSimulate={canSimulate}
          isSimulating={isSimulating}
          startersFilled={rosterProgress.starters}
          benchFilled={rosterProgress.bench}
          onSimulate={handleSimulate}
        />

        <MyFranchisePanel
          data={franchise}
          collectionIds={collectionIds}
          collectionSize={collectionSize}
          newPlayerId={newPlayerId}
          onAssignStarting={onAssignStarting}
          onAssignBench={onAssignBench}
          onMoveToCollection={onMoveToCollection}
          onSwapPlayers={onSwapPlayers}
          onSell={onSellFranchisePlayer}
          onDrop={onFranchiseDrop}
          onToast={showToast}
        />
      </main>

      <AnimatePresence>
        {collectionNotice ? (
          <div className="franchise-toast-host franchise-toast-host--center">
            <motion.p
              className="franchise-collection-notice"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            >
              {collectionNotice}
            </motion.p>
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {toast ? (
          <motion.p
            className="franchise-roster-toast"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
          >
            {toast}
          </motion.p>
        ) : null}
      </AnimatePresence>

      <SeasonSimulator
        franchise={franchise}
        franchiseTier={franchiseTier}
        result={simResult}
        phase={simPhase}
        onClose={handleCloseSim}
        onSimulateAgain={handleSimulateAgain}
        onAnimationComplete={handleAnimationComplete}
      />
    </div>
  );
}
