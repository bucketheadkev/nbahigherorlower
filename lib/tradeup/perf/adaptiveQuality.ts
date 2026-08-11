/**
 * Adaptive visual quality — targets stable ~60 FPS.
 * Downgrades nonessential effects when frame times stay high; sticky for the session.
 */

export type QualityLevel = 'high' | 'medium' | 'low' | 'minimal';

const LEVEL_ORDER: QualityLevel[] = ['high', 'medium', 'low', 'minimal'];

let level: QualityLevel = 'high';
let belowBudgetSince = 0;
let listeners = new Set<(q: QualityLevel) => void>();

/** Rolling frame-time samples during active animations (ms). */
const samples: number[] = [];
const SAMPLE_CAP = 90;

export function getQualityLevel(): QualityLevel {
  return level;
}

export function setQualityLevel(next: QualityLevel): void {
  if (next === level) return;
  level = next;
  applyDomAttribute();
  listeners.forEach((fn) => fn(level));
}

export function subscribeQuality(fn: (q: QualityLevel) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function applyDomAttribute() {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.perfQuality = level;
}

export function noteFrameMs(frameMs: number, animating: boolean): void {
  if (!animating) return;
  samples.push(frameMs);
  if (samples.length > SAMPLE_CAP) samples.shift();
  if (samples.length < 45) return;

  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  // ~55 FPS ≈ 18.2ms; sustained worse → drop quality
  if (avg > 18.2) {
    if (!belowBudgetSince) belowBudgetSince = performance.now();
    if (performance.now() - belowBudgetSince > 900) {
      downgrade();
      belowBudgetSince = 0;
      samples.length = 0;
    }
  } else {
    belowBudgetSince = 0;
  }
}

function downgrade() {
  const i = LEVEL_ORDER.indexOf(level);
  if (i < 0 || i >= LEVEL_ORDER.length - 1) return;
  setQualityLevel(LEVEL_ORDER[i + 1]!);
}

export function qualityAllows(feature: 'blur' | 'sheen' | 'particles' | 'shadows' | 'tickHaptics'): boolean {
  switch (level) {
    case 'high':
      return true;
    case 'medium':
      return feature !== 'particles' && feature !== 'blur';
    case 'low':
      return feature === 'tickHaptics' ? false : feature === 'shadows';
    case 'minimal':
      return false;
    default:
      return true;
  }
}

/** Call once at app boot. */
export function initAdaptiveQuality(): void {
  applyDomAttribute();
}
