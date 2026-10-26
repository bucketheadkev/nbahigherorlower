/** Opens the earnings summary now (a player tapped Collect), instead of waiting for a safe moment. */
export const OPEN_EARNINGS_EVENT = 'oneb:open-earnings';

export function requestEarningsSummary(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_EARNINGS_EVENT));
}
