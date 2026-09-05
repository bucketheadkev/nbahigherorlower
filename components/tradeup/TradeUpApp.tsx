'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { useGameReducedMotion } from '@/hooks/useGameReducedMotion';
import { useH2HInviteLink } from '@/hooks/useH2HInviteLink';
import { clearActiveRoom } from '@/lib/multiplayer/activeRoom';
import { warmSpinPairIndex } from '@/lib/tradeup/billionDollar';
import { initAdaptiveQuality } from '@/lib/tradeup/perf/adaptiveQuality';
import {
  PERFORMANCE_DEBUG,
  PERFORMANCE_TEST_BUILD,
  isPerfDebugEnabled,
} from '@/lib/tradeup/perf/perfConfig';
import { LocaleProvider } from '@/hooks/useLocale';
import { BallionSplash } from './BallionSplash';
import { ChallengesScreen } from './ChallengesScreen';
import { MobileBottomNav, type HubTab } from './MobileBottomNav';
import { MyRunsScreen } from './MyRunsScreen';
import { TradeUpHome } from './TradeUpHome';
import { TradeUpLoading } from './TradeUpLoading';

const PerformanceTestApp = dynamic(
  () =>
    import('./perf/PerformanceTestApp').then((mod) => ({
      default: mod.PerformanceTestApp,
    })),
  { loading: () => <TradeUpLoading /> },
);

const BillionTradeEngine = dynamic(
  () => import('./BillionTradeEngine').then((mod) => ({ default: mod.BillionTradeEngine })),
  { loading: () => <TradeUpLoading /> },
);

const HeadToHeadFlow = dynamic(
  () => import('./HeadToHeadFlow').then((mod) => ({ default: mod.HeadToHeadFlow })),
  { loading: () => <TradeUpLoading /> },
);

const DevPerfOverlay = dynamic(
  () => import('./perf/DevPerfOverlay').then((mod) => ({ default: mod.DevPerfOverlay })),
  { ssr: false },
);

type Screen = 'hub' | 'engine' | 'h2h' | 'perf';

/** Survives Strict Mode remounts — intro plays once per page load. */
let splashDoneThisLoad = false;

/** App shell — Classic + Head-to-Head with hub tabs. */
export function TradeUpApp() {
  const reduceMotion = useGameReducedMotion();
  const [screen, setScreen] = useState<Screen>('hub');
  const [hubTab, setHubTab] = useState<HubTab>('home');
  const [engineKey, setEngineKey] = useState(0);
  const [h2hKey, setH2hKey] = useState(0);
  const [showPerf, setShowPerf] = useState(false);
  const [showSplash, setShowSplash] = useState(() => !splashDoneThisLoad);
  const [appReady, setAppReady] = useState(false);
  const [runsKey, setRunsKey] = useState(0);
  const [pendingH2HJoinCode, setPendingH2HJoinCode] = useState<string | null>(null);

  useH2HInviteLink((code) => {
    setPendingH2HJoinCode(code);
    setH2hKey((k) => k + 1);
    setScreen('h2h');
  });

  useEffect(() => {
    initAdaptiveQuality();
    setShowPerf(isPerfDebugEnabled());

    const idle =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(() => warmSpinPairIndex(), { timeout: 1200 })
        : window.setTimeout(() => warmSpinPairIndex(), 200);

    void import('@/lib/tradeup/gameAudio').then((mod) => {
      mod.syncAudioSettings();
      mod.unlockGameAudio();
    });

    // Mark shell ready after first paint so the logo can hold if needed.
    const readyId = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setAppReady(true));
    });

    return () => {
      window.cancelAnimationFrame(readyId);
      if (typeof cancelIdleCallback === 'function' && typeof idle === 'number') {
        try {
          cancelIdleCallback(idle as number);
        } catch {
          window.clearTimeout(idle as number);
        }
      } else {
        window.clearTimeout(idle as number);
      }
    };
  }, []);

  const handlePlay = useCallback(() => {
    setEngineKey((k) => k + 1);
    setScreen(PERFORMANCE_TEST_BUILD ? 'perf' : 'engine');
  }, []);

  const handleHeadToHead = useCallback(() => {
    clearActiveRoom();
    setH2hKey((k) => k + 1);
    setScreen('h2h');
  }, []);

  const handleExit = useCallback(() => {
    clearActiveRoom();
    setRunsKey((k) => k + 1);
    setHubTab('home');
    setScreen('hub');
  }, []);

  const handleSplashDone = useCallback(() => {
    splashDoneThisLoad = true;
    setShowSplash(false);
    void import('@/lib/tradeup/gameAudio').then((mod) => {
      mod.syncAudioSettings();
      mod.unlockGameAudio();
      mod.preloadGameAudio();
    });
  }, []);

  // Never leave LAN / slow-hydrate devices stuck on the intro overlay
  useEffect(() => {
    if (!showSplash) return;
    const failsafe = window.setTimeout(() => {
      splashDoneThisLoad = true;
      setShowSplash(false);
    }, 8000);
    return () => window.clearTimeout(failsafe);
  }, [showSplash]);

  const handleHubChange = useCallback((tab: HubTab) => {
    setHubTab(tab);
    setScreen('hub');
    if (tab === 'runs') setRunsKey((k) => k + 1);
  }, []);

  const showTabs = screen === 'hub' && !showSplash;

  return (
    <LocaleProvider>
      {screen === 'engine' ? (
        <BillionTradeEngine
          key={engineKey}
          onExit={handleExit}
          onPlayAgain={() => setEngineKey((k) => k + 1)}
        />
      ) : screen === 'h2h' ? (
        <HeadToHeadFlow
          key={h2hKey}
          onExit={handleExit}
          pendingJoinCode={pendingH2HJoinCode}
          onJoinCodeConsumed={() => setPendingH2HJoinCode(null)}
        />
      ) : screen === 'perf' ? (
        <PerformanceTestApp key={engineKey} onExit={handleExit} />
      ) : hubTab === 'challenges' && !showSplash ? (
        <ChallengesScreen />
      ) : hubTab === 'runs' && !showSplash ? (
        <MyRunsScreen key={runsKey} />
      ) : (
        /* Home mounts under the intro so the logo fades into the real screen. */
        <TradeUpHome onPlay={handlePlay} onHeadToHead={handleHeadToHead} />
      )}

      {showSplash ? (
        <BallionSplash
          onDone={handleSplashDone}
          reduceMotion={reduceMotion}
          appReady={appReady}
        />
      ) : null}

      {showTabs ? (
        <MobileBottomNav active={hubTab} onChange={handleHubChange} />
      ) : null}

      {showPerf && PERFORMANCE_DEBUG ? <DevPerfOverlay /> : null}
    </LocaleProvider>
  );
}
