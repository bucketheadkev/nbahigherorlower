'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_PERF_TOGGLES,
  PERFORMANCE_TEST_BUILD,
  type PerfToggles,
} from '@/lib/tradeup/perf/perfConfig';
import {
  preloadPerfAudio,
  setPerfAudioToggles,
  unlockPerfAudio,
} from '@/lib/tradeup/perf/perfAudio';
import {
  preparePerfHaptics,
  setPerfHapticToggles,
} from '@/lib/tradeup/perf/perfHaptics';
import { PerfMachine } from './PerfMachine';
import { PerfPanel } from './PerfPanel';

interface PerformanceTestAppProps {
  onExit: () => void;
}

type Screen = 'boot' | 'play';

/**
 * Stripped Performance Test Build entry.
 * Full Trade Up systems remain in the repo but are not mounted here.
 */
export function PerformanceTestApp({ onExit }: PerformanceTestAppProps) {
  const [screen, setScreen] = useState<Screen>('boot');
  const [loopKey, setLoopKey] = useState(0);
  const [toggles, setToggles] = useState<PerfToggles>(DEFAULT_PERF_TOGGLES);

  useEffect(() => {
    preloadPerfAudio();
    preparePerfHaptics();
  }, []);

  useEffect(() => {
    setPerfAudioToggles(toggles);
    setPerfHapticToggles(toggles);
  }, [toggles]);

  const start = useCallback(() => {
    unlockPerfAudio();
    setScreen('play');
  }, []);

  const restart = useCallback(() => {
    setLoopKey((k) => k + 1);
  }, []);

  if (!PERFORMANCE_TEST_BUILD) {
    return (
      <div className="perf-shell">
        <p>Performance test build disabled.</p>
        <button type="button" onClick={onExit}>
          Home
        </button>
      </div>
    );
  }

  return (
    <div className="perf-root">
      {screen === 'boot' ? (
        <div className="perf-boot">
          <p className="perf-boot__eyebrow">Performance Test Build</p>
          <h1 className="perf-boot__title">SMOOTH BASELINE</h1>
          <p className="perf-boot__sub">
            Minimal spin → ticket → insert loop. No ads, no roster DB, no five-player run.
          </p>
          <button
            type="button"
            className="perf-spin"
            onPointerDown={(e) => {
              e.preventDefault();
              start();
            }}
          >
            <span>PLAY</span>
          </button>
        </div>
      ) : (
        <PerfMachine
          key={loopKey}
          toggles={toggles}
          onRestart={restart}
          onExit={onExit}
        />
      )}
      <PerfPanel
        toggles={toggles}
        onChange={setToggles}
        screen={screen}
      />
    </div>
  );
}
