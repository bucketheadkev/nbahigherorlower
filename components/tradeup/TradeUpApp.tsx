'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useGameReducedMotion } from '@/hooks/useGameReducedMotion';
import { useH2HInviteLink } from '@/hooks/useH2HInviteLink';
import { readInvalidInviteReason, readJoinCodeFromLocation, clearPendingH2HJoinCode } from '@/lib/multiplayer/h2hInvite';
import { clearActiveRoom, readActiveRoom } from '@/lib/multiplayer/activeRoom';
import { leaveRoom } from '@/lib/multiplayer/rooms';
import { warmSpinPairIndex } from '@/lib/tradeup/billionDollar';
import { initAdaptiveQuality } from '@/lib/tradeup/perf/adaptiveQuality';
import { installWebHapticTargets } from '@/lib/tradeup/haptics';
import { retireLocalGambling } from '@/lib/tradeup/rollover';
import { installTapGuard } from '@/lib/tradeup/tapGuard';
import { LocaleProvider } from '@/hooks/useLocale';
import {
  hasSeenHowItWorks,
  markHowItWorksSeen,
  REPLAY_INTRO_EVENT,
  resetHowItWorksSeen,
} from '@/lib/account/howItWorksStorage';
import {
  BallionSplash,
  hasIntroFinishedThisLoad,
  INTRO_HOLD_MAX_MS,
  INTRO_TOTAL_MS,
  resetIntroFinishedThisLoad,
} from './BallionSplash';
import { Onboarding } from './onboarding/Onboarding';
import { EarningsSummaryHost } from './EarningsSummary';
import { RankScreen } from './rank/RankScreen';
import { RankRewardHost } from './rank/RankRewardHost';
import { RunResultsPreview } from './dev/RunResultsPreview';
import type { CircuitRunConfig } from '@/lib/account/circuitCloud';
import { ChallengesScreen } from './ChallengesScreen';
import { LeaderboardScreen } from './LeaderboardScreen';
import { MobileBottomNav, type HubTab } from './MobileBottomNav';
import { MyRunsScreen } from './MyRunsScreen';
import { TradeUpHome } from './TradeUpHome';
import { TradeUpLoading } from './TradeUpLoading';

const BillionTradeEngine = dynamic(
  () => import('./BillionTradeEngine').then((mod) => ({ default: mod.BillionTradeEngine })),
  { loading: () => <TradeUpLoading /> },
);

const HeadToHeadFlow = dynamic(
  () => import('./HeadToHeadFlow').then((mod) => ({ default: mod.HeadToHeadFlow })),
  { loading: () => <TradeUpLoading /> },
);

type Screen = 'hub' | 'engine' | 'h2h';

const HOME_ART = [
  '/images/home-v2/arena.jpg',
  '/images/home-v2/classic.jpg',
  '/images/home-v2/1v1.jpg',
  '/images/home-v2/money.png',
  '/images/home-v2/trophy.png',
];

/** Survives Strict Mode remounts — intro plays once per page load. */
let splashDoneThisLoad = false;

/** Parent failsafe must survive Strict Mode effect cleanup (same as BallionSplash). */
let parentSplashFailsafeId: number | null = null;

function markSplashDone() {
  splashDoneThisLoad = true;
}

function clearParentSplashFailsafe() {
  if (parentSplashFailsafeId != null) {
    window.clearTimeout(parentSplashFailsafeId);
    parentSplashFailsafeId = null;
  }
}

function shouldPlaySplash(): boolean {
  return !splashDoneThisLoad && !hasIntroFinishedThisLoad();
}

/** App shell — Classic + Head-to-Head with hub tabs. */
export function TradeUpApp() {
  const reduceMotion = useGameReducedMotion();
  const [screen, setScreen] = useState<Screen>('hub');
  const [hubTab, setHubTab] = useState<HubTab>('home');
  const [engineKey, setEngineKey] = useState(0);
  const [circuitRun, setCircuitRun] = useState<CircuitRunConfig | null>(null);
  const [h2hKey, setH2hKey] = useState(0);
  /**
   * Start false so SSR never paints the z-200 veil. Enable in useLayoutEffect
   * on the client — never gate on a second `splashMounted` flag (that desync
   * left showSplash true with no intro and dead pointer-events).
   */
  const [showSplash, setShowSplash] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [runsKey, setRunsKey] = useState(0);
  const [pendingH2HJoinCode, setPendingH2HJoinCode] = useState<string | null>(null);
  const [invalidInvite, setInvalidInvite] = useState<string | null>(null);

  useH2HInviteLink((code) => {
    setPendingH2HJoinCode(code);
    setH2hKey((k) => k + 1);
    setScreen('h2h');
    markSplashDone();
    clearParentSplashFailsafe();
    setShowSplash(false);
  });

  useEffect(() => {
    const invalid = readInvalidInviteReason();
    if (invalid) {
      setInvalidInvite(invalid);
      markSplashDone();
      clearParentSplashFailsafe();
      setShowSplash(false);
      return;
    }
    if (readJoinCodeFromLocation()) {
      markSplashDone();
      clearParentSplashFailsafe();
      setShowSplash(false);
      setScreen('h2h');
    }
  }, []);

  useEffect(() => {
    initAdaptiveQuality();
    retireLocalGambling();
    // Decode the home artwork once so returning to Play never waits on images; the intro's
    // load bar finishes only once it has (or after a short cap on slow networks).
    const artDecoded = Promise.all(
      HOME_ART.map((src) => {
        const img = new Image();
        img.src = src;
        return img.decode?.().catch(() => undefined) ?? Promise.resolve();
      }),
    );
    const artReady = Promise.race([artDecoded, new Promise((resolve) => window.setTimeout(resolve, 2500))]);

    const idle =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(() => warmSpinPairIndex(), { timeout: 1200 })
        : window.setTimeout(() => warmSpinPairIndex(), 200);

    let removeAudioUnlock = () => {};
    const removeTapGuard = installTapGuard();
    const removeWebHaptics = installWebHapticTargets();
    let bootCancelled = false;
    void import('@/lib/tradeup/gameAudio').then((mod) => {
      mod.syncAudioSettings();
      mod.unlockGameAudio();
      if (bootCancelled) return;
      removeAudioUnlock = mod.installPhoneAudioUnlock();
    });

    const readyId = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        void artReady.then(() => {
          if (!bootCancelled) setAppReady(true);
        });
      });
    });

    return () => {
      bootCancelled = true;
      removeTapGuard();
      removeWebHaptics();
      removeAudioUnlock();
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
    setCircuitRun(null);
    setEngineKey((k) => k + 1);
    setScreen('engine');
  }, []);

  const handlePlayCircuit = useCallback((config: CircuitRunConfig) => {
    setCircuitRun(config);
    setEngineKey((k) => k + 1);
    setScreen('engine');
  }, []);

  const releaseStickyH2HRoom = useCallback(() => {
    const saved = readActiveRoom();
    clearActiveRoom();
    clearPendingH2HJoinCode();
    if (saved?.roomId) {
      void leaveRoom(saved.roomId).catch(() => undefined);
    }
  }, []);

  const handleHeadToHead = useCallback(() => {
    releaseStickyH2HRoom();
    setH2hKey((k) => k + 1);
    setScreen('h2h');
  }, [releaseStickyH2HRoom]);

  const handleExit = useCallback(() => {
    setCircuitRun(null);
    releaseStickyH2HRoom();
    setRunsKey((k) => k + 1);
    setHubTab('home');
    setScreen('hub');
  }, [releaseStickyH2HRoom]);

  const handleSplashDone = useCallback(() => {
    markSplashDone();
    clearParentSplashFailsafe();
    setShowSplash(false);
    if (!hasSeenHowItWorks()) setShowGuide(true);
    void import('@/lib/tradeup/gameAudio').then((mod) => {
      mod.syncAudioSettings();
      mod.unlockGameAudio();
      mod.preloadGameAudio();
    });
  }, []);

  // Client-only splash enable — before paint, no secondary mount flag.
  useLayoutEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('replaySplash') === '1' || params.get('splash') === '1') {
        splashDoneThisLoad = false;
        resetIntroFinishedThisLoad();
      }
    } catch {
      // ignore
    }
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('resetHowItWorks') === '1') resetHowItWorksSeen();
    } catch {
      // ignore
    }
    if (!shouldPlaySplash()) {
      markSplashDone();
      setShowSplash(false);
      if (!hasSeenHowItWorks()) setShowGuide(true);
      return;
    }
    setShowSplash(true);
  }, []);

  useEffect(() => {
    if (!showSplash) return;
    if (!shouldPlaySplash()) {
      markSplashDone();
      setShowSplash(false);
      if (!hasSeenHowItWorks()) setShowGuide(true);
      return;
    }
    // Parent nuclear failsafe — Strict Mode must not clear this timer.
    if (parentSplashFailsafeId != null) return;
    const ms = (reduceMotion ? 720 : INTRO_TOTAL_MS) + INTRO_HOLD_MAX_MS + 1200;
      parentSplashFailsafeId = window.setTimeout(() => {
      parentSplashFailsafeId = null;
      markSplashDone();
      setShowSplash(false);
      if (!hasSeenHowItWorks()) setShowGuide(true);
    }, ms);
  }, [showSplash, reduceMotion]);

  useEffect(() => {
    const replay = () => {
      setScreen('hub');
      setHubTab('home');
      setShowGuide(true);
    };
    window.addEventListener(REPLAY_INTRO_EVENT, replay);
    return () => window.removeEventListener(REPLAY_INTRO_EVENT, replay);
  }, []);

  const handleHubChange = useCallback((tab: HubTab) => {
    setHubTab(tab);
    setScreen('hub');
    if (tab === 'runs') setRunsKey((k) => k + 1);
  }, []);

  // Mount hub tab bar under the splash so it crossfades in with home (not after).
  const showTabs = screen === 'hub' && !invalidInvite;

  return (
    <LocaleProvider>
      {invalidInvite ? (
        <div className="h2h-lobby" aria-label="Invite unavailable">
          <header className="h2h-lobby__header">
            <p className="h2h-lobby__eyebrow">1V1</p>
            <h1 className="h2h-lobby__title">Can’t join</h1>
          </header>
          <p className="h2h-lobby__status" role="alert">
            {invalidInvite}
          </p>
          <button
            type="button"
            className="h2h-lobby__leave"
            onClick={() => {
              window.history.replaceState({}, '', '/');
              setInvalidInvite(null);
              setScreen('hub');
            }}
          >
            Back to home
          </button>
        </div>
      ) : screen === 'engine' ? (
        <BillionTradeEngine
          key={engineKey}
          onExit={handleExit}
          onPlayAgain={() => {
            setCircuitRun(null);
            setEngineKey((k) => k + 1);
          }}
          circuit={circuitRun}
        />
      ) : screen === 'h2h' ? (
        <HeadToHeadFlow
          key={h2hKey}
          onExit={handleExit}
          pendingJoinCode={pendingH2HJoinCode}
          onJoinCodeConsumed={() => setPendingH2HJoinCode(null)}
        />
      ) : hubTab === 'challenges' && !showSplash ? (
        <ChallengesScreen />
      ) : hubTab === 'runs' && !showSplash ? (
        <MyRunsScreen key={runsKey} />
      ) : hubTab === 'board' && !showSplash ? (
        <LeaderboardScreen />
      ) : hubTab === 'rank' && !showSplash ? (
        <RankScreen />
      ) : (
        <TradeUpHome
          onPlay={handlePlay}
          onPlayCircuit={handlePlayCircuit}
          onHeadToHead={handleHeadToHead}
          allowAccountPrompt={!showSplash && !showGuide}
        />
      )}

      {showGuide && !showSplash ? (
        <Onboarding
          onDone={() => {
            markHowItWorksSeen();
            setShowGuide(false);
          }}
        />
      ) : null}

      {showSplash ? (
        <BallionSplash
          onDone={handleSplashDone}
          reduceMotion={reduceMotion}
          appReady={appReady}
        />
      ) : null}

      {showTabs ? (
        <div
          className={showSplash ? 'oneb-tabbar-host is-under-splash' : 'oneb-tabbar-host'}
          aria-hidden={showSplash || undefined}
        >
          <MobileBottomNav active={hubTab} onChange={handleHubChange} />
        </div>
      ) : null}

      <EarningsSummaryHost enabled={screen === 'hub' && !showSplash && !showGuide && !invalidInvite} />
      <RankRewardHost enabled={screen === 'hub' && !showSplash && !showGuide && !invalidInvite} />
      <RunResultsPreview />
    </LocaleProvider>
  );
}
