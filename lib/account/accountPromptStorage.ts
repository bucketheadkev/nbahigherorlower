/** First-run “SAVE YOUR PROGRESS” prompt — local dismissal only. */

export const ACCOUNT_PROMPT_SEEN_KEY = '1brun_account_prompt_seen_v1';

export function hasSeenAccountPrompt(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(ACCOUNT_PROMPT_SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

export function markAccountPromptSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACCOUNT_PROMPT_SEEN_KEY, '1');
  } catch {
    /* ignore quota / privacy errors */
  }
}

/** Dev/testing: clear only the first-run prompt flag (does not touch Auth or profiles). */
export function resetAccountPromptSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ACCOUNT_PROMPT_SEEN_KEY);
  } catch {
    /* ignore */
  }
}
