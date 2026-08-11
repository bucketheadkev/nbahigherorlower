/**
 * Low-frequency FPS / long-task diagnostics for Performance Test Build.
 */

type MetricsSnapshot = {
  fps: number;
  minFps: number;
  longTasks: number;
  activeAnims: number;
  activeTimers: number;
  spinnerItems: number;
};

let fps = 60;
let minFps = 60;
let frames = 0;
let lastSample = 0;
let rafId = 0;
let longTasks = 0;
let activeAnims = 0;
let activeTimers = 0;
let spinnerItems = 0;
let observer: PerformanceObserver | null = null;
let running = false;

const listeners = new Set<(s: MetricsSnapshot) => void>();

function snapshot(): MetricsSnapshot {
  return {
    fps,
    minFps,
    longTasks,
    activeAnims,
    activeTimers,
    spinnerItems,
  };
}

function emit(): void {
  const s = snapshot();
  listeners.forEach((fn) => fn(s));
}

function loop(now: number): void {
  if (!running) return;
  frames += 1;
  if (!lastSample) lastSample = now;
  const elapsed = now - lastSample;
  if (elapsed >= 500) {
    fps = Math.round((frames * 1000) / elapsed);
    minFps = Math.min(minFps, fps || 60);
    frames = 0;
    lastSample = now;
    emit();
  }
  rafId = requestAnimationFrame(loop);
}

export function startPerfMetrics(): void {
  if (typeof window === 'undefined' || running) return;
  running = true;
  minFps = 60;
  frames = 0;
  lastSample = 0;
  rafId = requestAnimationFrame(loop);
  try {
    if ('PerformanceObserver' in window) {
      observer = new PerformanceObserver((list) => {
        longTasks += list.getEntries().length;
      });
      observer.observe({ entryTypes: ['longtask'] as string[] });
    }
  } catch {
    observer = null;
  }
}

export function stopPerfMetrics(): void {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  observer?.disconnect();
  observer = null;
}

export function subscribePerfMetrics(fn: (s: MetricsSnapshot) => void): () => void {
  listeners.add(fn);
  fn(snapshot());
  return () => listeners.delete(fn);
}

export function resetPerfMinFps(): void {
  minFps = fps || 60;
  emit();
}

export function setPerfActiveAnims(n: number): void {
  activeAnims = n;
}

export function setPerfActiveTimers(n: number): void {
  activeTimers = n;
}

export function setPerfSpinnerItems(n: number): void {
  spinnerItems = n;
}

export function getPerfSnapshot(): MetricsSnapshot {
  return snapshot();
}
