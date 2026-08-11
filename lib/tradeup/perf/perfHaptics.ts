/**
 * Minimal haptics for Performance Test — never on every reel tick.
 */

import type { PerfToggles } from './perfConfig';

type CapHaptics = {
  Haptics: {
    impact: (o: { style: string }) => Promise<void>;
    notification: (o: { type: string }) => Promise<void>;
  };
};

let cap: CapHaptics | null | undefined;
let togglesRef: { current: PerfToggles } = {
  current: { sound: true, haptics: true, visualEffects: false, logos: false, ticketAnim: true, spinnerAnim: true },
};

export function setPerfHapticToggles(t: PerfToggles): void {
  togglesRef.current = t;
}

async function getCap(): Promise<CapHaptics | null> {
  if (cap !== undefined) return cap;
  try {
    // Dynamic import — do not block first paint
    const mod = (await import('@capacitor/haptics')) as unknown as CapHaptics;
    cap = mod;
    return mod;
  } catch {
    cap = null;
    return null;
  }
}

function fire(style: 'LIGHT' | 'MEDIUM' | 'HEAVY'): void {
  if (!togglesRef.current.haptics) return;
  void getCap().then((m) => {
    if (!m) return;
    void m.Haptics.impact({ style }).catch(() => undefined);
  });
}

export function perfHapticTap(): void {
  fire('LIGHT');
}

export function perfHapticSpinStart(): void {
  fire('MEDIUM');
}

export function perfHapticLand(): void {
  fire('HEAVY');
}

export function perfHapticPrint(): void {
  fire('MEDIUM');
}

export function perfHapticInsert(): void {
  fire('MEDIUM');
}

/** Warm native bridge once (non-blocking). */
export function preparePerfHaptics(): void {
  void getCap();
}
