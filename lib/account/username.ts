/** Public leaderboard username rules (must match profiles DB CHECK). */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Preserve display capitalization; trim only. */
export function sanitizeUsernameDisplay(raw: string): string {
  return raw.trim();
}

export function isValidUsername(raw: string): boolean {
  return USERNAME_PATTERN.test(sanitizeUsernameDisplay(raw));
}

export function usernameValidationMessage(raw: string): string | null {
  const display = sanitizeUsernameDisplay(raw);
  if (!display) return 'Enter a username.';
  if (display.length < USERNAME_MIN || display.length > USERNAME_MAX) {
    return `Use ${USERNAME_MIN}–${USERNAME_MAX} characters.`;
  }
  if (!USERNAME_PATTERN.test(display)) {
    return 'Letters, numbers, and underscores only. No spaces.';
  }
  return null;
}
