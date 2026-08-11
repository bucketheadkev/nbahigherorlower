/**
 * Centralized requestAnimationFrame bookkeeping.
 * Tracks active loops for diagnostics; cancels cleanly on pause/unmount.
 */

let activeLoops = 0;
const handles = new Set<number>();
let hidden = false;

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    hidden = document.visibilityState === 'hidden';
  });
}

export function getActiveRafLoops(): number {
  return activeLoops;
}

export function isPageHidden(): boolean {
  return hidden;
}

/** Schedule a frame; returns cancel handle. Counts toward active loops while pending. */
export function scheduleFrame(cb: FrameRequestCallback): number {
  const id = requestAnimationFrame((t) => {
    handles.delete(id);
    activeLoops = Math.max(0, activeLoops - 1);
    if (hidden) return;
    cb(t);
  });
  handles.add(id);
  activeLoops += 1;
  return id;
}

export function cancelFrame(id: number): void {
  if (!handles.has(id)) {
    cancelAnimationFrame(id);
    return;
  }
  cancelAnimationFrame(id);
  handles.delete(id);
  activeLoops = Math.max(0, activeLoops - 1);
}

export function cancelAllFrames(): void {
  for (const id of handles) cancelAnimationFrame(id);
  handles.clear();
  activeLoops = 0;
}

/**
 * Run a timed transform animation without React.
 * Calls onFrame every rAF with eased progress 0→1; resolves when done.
 */
export function animateProgress(
  durationMs: number,
  ease: (t: number) => number,
  onFrame: (eased: number, raw: number) => void,
  signal?: { cancelled: boolean },
): Promise<void> {
  return new Promise((resolve) => {
    if (durationMs < 16) {
      onFrame(1, 1);
      resolve();
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      if (signal?.cancelled) {
        resolve();
        return;
      }
      const raw = Math.min(1, (now - t0) / durationMs);
      onFrame(ease(raw), raw);
      if (raw < 1) {
        raf = scheduleFrame(step);
        return;
      }
      resolve();
    };
    raf = scheduleFrame(step);
    if (signal) {
      const prev = signal as { cancelled: boolean; _raf?: number };
      prev._raf = raf;
    }
  });
}

export function easeOutCubic(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

export function easeOutQuint(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 5);
}

export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutExpo(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
}
