/**
 * Performance flags for Trade Up.
 *
 * PERFORMANCE_TEST_BUILD — stripped loop only. Keep false for shipping.
 * PERFORMANCE_DEBUG — master switch for tools; still requires manual enable via localStorage.
 */

export const PERFORMANCE_TEST_BUILD = false;

/**
 * When true, DevPerfOverlay CAN appear — but only if isPerfDebugEnabled() is also true.
 * Keep false for App Store / normal gameplay.
 */
export const PERFORMANCE_DEBUG = false;

/** Hidden enable: localStorage.setItem('tradeup_perf_debug','1') then reload. */
export function isPerfDebugEnabled(): boolean {
  if (!PERFORMANCE_DEBUG) return false;
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('tradeup_perf_debug') === '1';
  } catch {
    return false;
  }
}

export type PerfToggles = {
  sound: boolean;
  haptics: boolean;
  visualEffects: boolean;
  logos: boolean;
  ticketAnim: boolean;
  spinnerAnim: boolean;
};

export const DEFAULT_PERF_TOGGLES: PerfToggles = {
  sound: true,
  haptics: true,
  visualEffects: true,
  logos: true,
  ticketAnim: true,
  spinnerAnim: true,
};
