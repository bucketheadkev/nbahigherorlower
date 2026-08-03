'use client';

import { useGameReducedMotion } from '@/hooks/useGameReducedMotion';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import {
  getBestFourPlayerSum,
  getBestRosterValue,
  getBestWorldRank,
} from '@/lib/tradeup/storage';
import { ChallengesScreen } from './ChallengesScreen';
import { LeaderboardScreen } from './LeaderboardScreen';
import { MobileBottomNav, type HubTab } from './MobileBottomNav';
import { TradeUpHome } from './TradeUpHome';
import { TradeUpLoading } from './TradeUpLoading';
import { TradeUpLogo } from './TradeUpLogo';

const BillionTradeEngine = dynamic(
  () => import('./BillionTradeEngine').then((mod) => ({ default: mod.BillionTradeEngine })),
  { loading: () => <TradeUpLoading /> },
);

type Screen = 'home' | 'challenges' | 'leaderboard' | 'engine';

interface HubStats {
  personalBest: number;
  bestWorldRank: number;
  bestFourPlayerSum: number;
}

function readHubStats(): HubStats {
  return {
    personalBest: getBestRosterValue(),
    bestWorldRank: getBestWorldRank(),
    bestFourPlayerSum: getBestFourPlayerSum(),
  };
}

export function TradeUpApp() {
  const [screen, setScreen] = useState<Screen>('home');
  const [hubTab, setHubTab] = useState<HubTab>('home');
  const [hubStats, setHubStats] = useState<HubStats>({
    personalBest: 0,
    bestWorldRank: 0,
    bestFourPlayerSum: 0,
  });
  const [launching, setLaunching] = useState(false);
  const [engineKey, setEngineKey] = useState(0);
  const reduceMotion = useGameReducedMotion();

  useEffect(() => {
    // Sound is always on — mute toggle removed from the product.
    try {
      localStorage.setItem('tradeup_muted', '0');
    } catch {
      /* ignore */
    }
    void import('@/lib/tradeup/gameAudio').then((mod) => {
      mod.setGameSfxMuted(false);
      mod.unlockGameAudio();
    });
    // Rewarded ads: initialize stub/provider once at launch (never crashes without SDK).
    void import('@/lib/tradeup/ads/rewardedAdService').then((mod) => {
      void mod.RewardedAdService.initialize();
    });
  }, []);

  const refreshProgression = useCallback(() => {
    setHubStats(readHubStats());
  }, []);

  useEffect(() => {
    refreshProgression();
  }, [refreshProgression]);

  const handleEnterHome = useCallback(() => {
    refreshProgression();
    setLaunching(false);
    setHubTab('home');
    setScreen('home');
  }, [refreshProgression]);

  const handlePlay = useCallback(() => {
    if (launching) return;
    setLaunching(true);
    const delay = reduceMotion ? 180 : 900;
    window.setTimeout(() => {
      setScreen('engine');
      setLaunching(false);
    }, delay);
  }, [launching, reduceMotion]);

  const handleHubChange = useCallback(
    (tab: HubTab) => {
      refreshProgression();
      setHubTab(tab);
      setScreen(tab);
    },
    [refreshProgression],
  );

  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const };

  const inRun = screen === 'engine';
  const showTabs = !inRun && !launching;

  return (
    <>
      <AnimatePresence>
        {launching ? (
          <motion.div
            key="play-launch"
            className="play-launch"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.28 }}
            aria-hidden
          >
            <span className="play-launch__wipe play-launch__wipe--a" />
            <span className="play-launch__wipe play-launch__wipe--b" />
            <span className="play-launch__flash" />
            <span className="play-launch__mark">
              <TradeUpLogo size="md" priority />
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {inRun ? (
          <motion.div
            key="engine"
            className="screen-fade"
            initial={reduceMotion ? false : { opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={transition}
          >
            <BillionTradeEngine
              key={engineKey}
              onExit={handleEnterHome}
              onPlayAgain={() => {
                refreshProgression();
                setEngineKey((k) => k + 1);
              }}
              onWin={refreshProgression}
            />
          </motion.div>
        ) : screen === 'challenges' ? (
          <motion.div
            key="challenges"
            className="screen-fade"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={transition}
          >
            <ChallengesScreen
              personalBest={hubStats.personalBest}
              bestWorldRank={hubStats.bestWorldRank}
              bestFourPlayerSum={hubStats.bestFourPlayerSum}
            />
          </motion.div>
        ) : screen === 'leaderboard' ? (
          <motion.div
            key="leaderboard"
            className="screen-fade"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={transition}
          >
            <LeaderboardScreen personalBest={hubStats.personalBest} />
          </motion.div>
        ) : (
          <motion.div
            key="home"
            className="screen-fade"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 1.02 }}
            transition={transition}
          >
            <TradeUpHome launching={launching} onPlay={handlePlay} />
          </motion.div>
        )}
      </AnimatePresence>

      {showTabs ? <MobileBottomNav active={hubTab} onChange={handleHubChange} /> : null}
    </>
  );
}
