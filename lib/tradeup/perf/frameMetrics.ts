/**
 * Real FPS from rAF timestamps — lightly sampled for overlay, not smoothed enough to hide drops.
 */

import { getActiveRafLoops } from './rafClock';
import { getQualityLevel, noteFrameMs, type QualityLevel } from './adaptiveQuality';

export type FrameSnapshot = {
  fps: number;
  avgFps: number;
  low1: number;
  frameMs: number;
  longFrames: number;
  quality: QualityLevel;
  activeRafs: number;
  screen: string;
};

let running = false;
let rafId = 0;
let lastTs = 0;
let frames = 0;
let windowStart = 0;
let fps = 0;
let frameMs = 16.7;
let longFrames = 0;
const recentFps: number[] = [];
const FPS_CAP = 40;
let screenLabel = 'boot';
let animating = false;

const listeners = new Set<(s: FrameSnapshot) => void>();

export function setMetricsScreen(label: string): void {
  screenLabel = label;
}

export function setMetricsAnimating(on: boolean): void {
  animating = on;
}

function snapshot(): FrameSnapshot {
  const sorted = [...recentFps].sort((a, b) => a - b);
  const low1 =
    sorted.length === 0
      ? fps
      : sorted[Math.max(0, Math.floor(sorted.length * 0.01))] ?? sorted[0]!;
  const avg =
    recentFps.length === 0
      ? fps
      : Math.round(recentFps.reduce((a, b) => a + b, 0) / recentFps.length);
  return {
    fps,
    avgFps: avg,
    low1: Math.round(low1),
    frameMs: Math.round(frameMs * 10) / 10,
    longFrames,
    quality: getQualityLevel(),
    activeRafs: getActiveRafLoops(),
    screen: screenLabel,
  };
}

function loop(ts: number) {
  if (!running) return;
  if (lastTs > 0) {
    const dt = ts - lastTs;
    frameMs = dt;
    frames += 1;
    if (dt > 25) longFrames += 1;
    noteFrameMs(dt, animating);
  }
  lastTs = ts;

  if (ts - windowStart >= 500) {
    const elapsed = ts - windowStart;
    fps = elapsed > 0 ? Math.round((frames * 1000) / elapsed) : 0;
    recentFps.push(fps);
    if (recentFps.length > FPS_CAP) recentFps.shift();
    frames = 0;
    windowStart = ts;
    const snap = snapshot();
    listeners.forEach((fn) => fn(snap));
  }

  rafId = requestAnimationFrame(loop);
}

export function startFrameMetrics(): void {
  if (running || typeof window === 'undefined') return;
  running = true;
  lastTs = 0;
  frames = 0;
  windowStart = performance.now();
  longFrames = 0;
  rafId = requestAnimationFrame(loop);
}

export function stopFrameMetrics(): void {
  running = false;
  cancelAnimationFrame(rafId);
}

export function subscribeFrameMetrics(fn: (s: FrameSnapshot) => void): () => void {
  listeners.add(fn);
  fn(snapshot());
  return () => listeners.delete(fn);
}

export function getFrameSnapshot(): FrameSnapshot {
  return snapshot();
}
