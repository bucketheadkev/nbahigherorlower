/**
 * Lightweight audio pool for Performance Test Build.
 * Preload once; never create Audio per tap; never block UI.
 */

import type { PerfToggles } from './perfConfig';

type Cue = 'tap' | 'confirm' | 'spin' | 'land' | 'print' | 'insert' | 'result';

const CUE_PATH: Record<Cue, string> = {
  tap: '/sounds/ui-tap.mp3',
  confirm: '/sounds/ui-confirm.mp3',
  spin: '/sounds/wheel-spin.mp3',
  land: '/sounds/wheel-stop.mp3',
  print: '/sounds/ticket-release.mp3',
  insert: '/sounds/slot-place.mp3',
  result: '/sounds/success-soft.mp3',
};

const pool = new Map<Cue, HTMLAudioElement>();
let togglesRef: { current: PerfToggles } = {
  current: { sound: true, haptics: true, visualEffects: false, logos: false, ticketAnim: true, spinnerAnim: true },
};
let preloaded = false;
let spinEl: HTMLAudioElement | null = null;

export function setPerfAudioToggles(t: PerfToggles): void {
  togglesRef.current = t;
  if (!t.sound && spinEl) {
    try {
      spinEl.pause();
      spinEl.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
}

export function preloadPerfAudio(): void {
  if (typeof window === 'undefined' || preloaded) return;
  preloaded = true;
  (Object.keys(CUE_PATH) as Cue[]).forEach((cue) => {
    const el = new Audio(CUE_PATH[cue]);
    el.preload = 'auto';
    el.volume = cue === 'spin' ? 0.18 : 0.32;
    if (cue === 'spin') {
      el.loop = true;
      spinEl = el;
    }
    pool.set(cue, el);
    try {
      el.load();
    } catch {
      /* ignore */
    }
  });
}

export function unlockPerfAudio(): void {
  preloadPerfAudio();
  // Warm decode with a silent play/pause under user gesture when available
  pool.forEach((el) => {
    try {
      const p = el.play();
      if (p) {
        void p.then(() => {
          el.pause();
          el.currentTime = 0;
        }).catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
  });
}

export function playPerfSound(cue: Cue): void {
  if (!togglesRef.current.sound) return;
  const el = pool.get(cue);
  if (!el) return;
  try {
    if (cue === 'spin') {
      el.currentTime = 0;
      void el.play().catch(() => undefined);
      return;
    }
    if (spinEl && !spinEl.paused && cue === 'land') {
      spinEl.pause();
      spinEl.currentTime = 0;
    }
    el.currentTime = 0;
    void el.play().catch(() => undefined);
  } catch {
    /* never block UI */
  }
}

export function stopPerfSpinLoop(): void {
  if (!spinEl) return;
  try {
    spinEl.pause();
    spinEl.currentTime = 0;
  } catch {
    /* ignore */
  }
}
