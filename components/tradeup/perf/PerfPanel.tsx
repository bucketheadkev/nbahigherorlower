'use client';

import { memo, useEffect, useState } from 'react';
import {
  PERFORMANCE_DEBUG,
  type PerfToggles,
} from '@/lib/tradeup/perf/perfConfig';
import {
  getPerfSnapshot,
  resetPerfMinFps,
  startPerfMetrics,
  stopPerfMetrics,
  subscribePerfMetrics,
} from '@/lib/tradeup/perf/perfMetrics';

interface PerfPanelProps {
  toggles: PerfToggles;
  onChange: (next: PerfToggles) => void;
  screen: string;
}

export const PerfPanel = memo(function PerfPanel({
  toggles,
  onChange,
  screen,
}: PerfPanelProps) {
  const [snap, setSnap] = useState(getPerfSnapshot);

  useEffect(() => {
    if (!PERFORMANCE_DEBUG) return;
    startPerfMetrics();
    const unsub = subscribePerfMetrics(setSnap);
    return () => {
      unsub();
      stopPerfMetrics();
    };
  }, []);

  if (!PERFORMANCE_DEBUG) return null;

  const toggle = (key: keyof PerfToggles) => {
    onChange({ ...toggles, [key]: !toggles[key] });
  };

  return (
    <aside className="perf-panel" aria-label="Performance diagnostics">
      <div className="perf-panel__row">
        <strong>FPS {snap.fps}</strong>
        <span>min {snap.minFps}</span>
        <button type="button" onClick={() => resetPerfMinFps()}>
          reset min
        </button>
      </div>
      <div className="perf-panel__row">
        <span>long {snap.longTasks}</span>
        <span>anims {snap.activeAnims}</span>
        <span>items {snap.spinnerItems}</span>
      </div>
      <div className="perf-panel__row">
        <span>screen: {screen}</span>
      </div>
      <div className="perf-panel__toggles">
        {(
          [
            ['sound', 'Sound'],
            ['haptics', 'Haptics'],
            ['spinnerAnim', 'Spinner'],
            ['ticketAnim', 'Ticket'],
            ['visualEffects', 'FX'],
            ['logos', 'Logos'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={toggles[key] ? 'is-on' : 'is-off'}
            onClick={() => toggle(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </aside>
  );
});
