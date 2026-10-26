/**
 * Guest peak Bank balance on this device (signed-in players get theirs from the server).
 * Only ever moves up, so spending never lowers a guest's rank either.
 */

const PEAK_KEY = 'oneb_bank_peak_v1';

export function localBankPeak(current: number): number {
  if (typeof window === 'undefined') return current;
  let stored = 0;
  try {
    stored = Math.max(0, Number(localStorage.getItem(PEAK_KEY)) || 0);
  } catch {
    /* private mode */
  }
  const peak = Math.max(stored, current);
  if (peak > stored) {
    try {
      localStorage.setItem(PEAK_KEY, String(Math.round(peak)));
    } catch {
      /* private mode */
    }
  }
  return peak;
}
