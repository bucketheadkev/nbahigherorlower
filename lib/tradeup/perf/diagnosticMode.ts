/**
 * Internal diagnostic configurations A–G.
 * Not shown to normal users unless PERFORMANCE_DEBUG is on.
 */

export type DiagnosticMode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export type DiagnosticFlags = {
  mode: DiagnosticMode;
  effects: boolean;
  sound: boolean;
  haptics: boolean;
  plainTextSpinners: boolean;
  ticketAnim: boolean;
  simpleTransformsOnly: boolean;
  staticOnly: boolean;
};

const PRESETS: Record<DiagnosticMode, Omit<DiagnosticFlags, 'mode'>> = {
  A: {
    effects: true,
    sound: true,
    haptics: true,
    plainTextSpinners: false,
    ticketAnim: true,
    simpleTransformsOnly: false,
    staticOnly: false,
  },
  B: {
    effects: false,
    sound: true,
    haptics: true,
    plainTextSpinners: false,
    ticketAnim: true,
    simpleTransformsOnly: false,
    staticOnly: false,
  },
  C: {
    effects: true,
    sound: false,
    haptics: false,
    plainTextSpinners: false,
    ticketAnim: true,
    simpleTransformsOnly: false,
    staticOnly: false,
  },
  D: {
    effects: true,
    sound: true,
    haptics: true,
    plainTextSpinners: true,
    ticketAnim: true,
    simpleTransformsOnly: false,
    staticOnly: false,
  },
  E: {
    effects: true,
    sound: true,
    haptics: true,
    plainTextSpinners: false,
    ticketAnim: false,
    simpleTransformsOnly: false,
    staticOnly: false,
  },
  F: {
    effects: false,
    sound: true,
    haptics: true,
    plainTextSpinners: true,
    ticketAnim: true,
    simpleTransformsOnly: true,
    staticOnly: false,
  },
  G: {
    effects: false,
    sound: false,
    haptics: false,
    plainTextSpinners: true,
    ticketAnim: false,
    simpleTransformsOnly: true,
    staticOnly: true,
  },
};

let mode: DiagnosticMode = 'A';
const listeners = new Set<(f: DiagnosticFlags) => void>();

export function getDiagnosticMode(): DiagnosticMode {
  return mode;
}

export function getDiagnosticFlags(): DiagnosticFlags {
  return { mode, ...PRESETS[mode] };
}

export function setDiagnosticMode(next: DiagnosticMode): void {
  mode = next;
  const flags = getDiagnosticFlags();
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.diagMode = next;
    document.documentElement.dataset.perfEffects = flags.effects ? '1' : '0';
  }
  listeners.forEach((fn) => fn(flags));
}

export function subscribeDiagnostic(fn: (f: DiagnosticFlags) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const DIAG_LABELS: Record<DiagnosticMode, string> = {
  A: 'Full (effects+SFX+haptics)',
  B: 'No visual effects',
  C: 'No sound/haptics',
  D: 'Plain-text spinners',
  E: 'No ticket anim',
  F: 'Simple transforms only',
  G: 'Static + FPS only',
};
