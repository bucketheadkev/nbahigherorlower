/** First-run onboarding walkthrough — shown once after the splash, on web and iOS. */

export const HOW_IT_WORKS_SEEN_KEY = '1brun_onboarding_seen_v2';

export function hasSeenHowItWorks(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(HOW_IT_WORKS_SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

export function markHowItWorksSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HOW_IT_WORKS_SEEN_KEY, '1');
  } catch {
    /* ignore quota / privacy errors */
  }
}

/** Settings → Replay intro. TradeUpApp listens and reopens the walkthrough. */
export const REPLAY_INTRO_EVENT = 'oneb:replay-intro';

export function requestIntroReplay(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(REPLAY_INTRO_EVENT));
}

export function resetHowItWorksSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(HOW_IT_WORKS_SEEN_KEY);
  } catch {
    /* ignore */
  }
}
