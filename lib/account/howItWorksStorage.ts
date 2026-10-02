/** First-run “how it works” screen — shown once after the splash, on web and iOS. */

export const HOW_IT_WORKS_SEEN_KEY = '1brun_how_it_works_seen_v1';

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

export function resetHowItWorksSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(HOW_IT_WORKS_SEEN_KEY);
  } catch {
    /* ignore */
  }
}
