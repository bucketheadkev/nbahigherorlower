'use client';

import { useEffect, useState } from 'react';
import {
  DIAG_LABELS,
  getDiagnosticFlags,
  setDiagnosticMode,
  subscribeDiagnostic,
  type DiagnosticMode,
} from '@/lib/tradeup/perf/diagnosticMode';
import {
  startFrameMetrics,
  stopFrameMetrics,
  subscribeFrameMetrics,
  type FrameSnapshot,
} from '@/lib/tradeup/perf/frameMetrics';
import { PERFORMANCE_DEBUG } from '@/lib/tradeup/perf/perfConfig';
import { getQualityLevel, setQualityLevel, type QualityLevel } from '@/lib/tradeup/perf/adaptiveQuality';

const MODES: DiagnosticMode[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

/**
 * Dev / diagnostic FPS overlay. Gated by PERFORMANCE_DEBUG.
 * Never enable PERFORMANCE_DEBUG for App Store builds.
 */
export function DevPerfOverlay() {
  const [snap, setSnap] = useState<FrameSnapshot | null>(null);
  const [mode, setMode] = useState<DiagnosticMode>('A');
  const [quality, setQuality] = useState<QualityLevel>(getQualityLevel());

  useEffect(() => {
    if (!PERFORMANCE_DEBUG) return;
    startFrameMetrics();
    const offM = subscribeFrameMetrics(setSnap);
    const offD = subscribeDiagnostic((f) => setMode(f.mode));
    setMode(getDiagnosticFlags().mode);
    return () => {
      offM();
      offD();
      stopFrameMetrics();
    };
  }, []);

  if (!PERFORMANCE_DEBUG || !snap) return null;

  return (
    <div className="dev-perf-overlay" aria-hidden>
      <div className="dev-perf-overlay__row">
        <strong>
          {snap.fps} FPS
        </strong>
        <span>avg {snap.avgFps}</span>
        <span>1% {snap.low1}</span>
        <span>{snap.frameMs}ms</span>
      </div>
      <div className="dev-perf-overlay__row">
        <span>long&gt;25ms {snap.longFrames}</span>
        <span>raf {snap.activeRafs}</span>
        <span>{snap.screen}</span>
        <span>Q:{quality}</span>
      </div>
      <div className="dev-perf-overlay__modes">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            className={mode === m ? 'is-on' : undefined}
            title={DIAG_LABELS[m]}
            onPointerDown={(e) => {
              e.preventDefault();
              setDiagnosticMode(m);
              setMode(m);
            }}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="dev-perf-overlay__modes">
        {(['high', 'medium', 'low', 'minimal'] as QualityLevel[]).map((q) => (
          <button
            key={q}
            type="button"
            className={quality === q ? 'is-on' : undefined}
            onPointerDown={(e) => {
              e.preventDefault();
              setQualityLevel(q);
              setQuality(q);
            }}
          >
            {q[0]!.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
