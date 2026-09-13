/**
 * Persistent Head-to-Head display name (local only — not a networked account).
 */

const H2H_USERNAME_KEY = 'ballion_h2h_username_v1';

export const H2H_USERNAME_MIN = 2;
export const H2H_USERNAME_MAX = 24;

export function sanitizeH2HUsername(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, H2H_USERNAME_MAX);
}

export function isValidH2HUsername(raw: string): boolean {
  const name = sanitizeH2HUsername(raw);
  if (name.length < H2H_USERNAME_MIN || name.length > H2H_USERNAME_MAX) return false;
  // Letters, numbers, spaces, underscore, hyphen, period
  return /^[A-Za-z0-9][A-Za-z0-9 ._'-]*$/.test(name);
}

export function getH2HUsername(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(H2H_USERNAME_KEY);
    if (!raw) return null;
    const name = sanitizeH2HUsername(raw);
    return isValidH2HUsername(name) ? name : null;
  } catch {
    return null;
  }
}

export function setH2HUsername(raw: string): string | null {
  if (typeof window === 'undefined') return null;
  const name = sanitizeH2HUsername(raw);
  if (!isValidH2HUsername(name)) return null;
  try {
    localStorage.setItem(H2H_USERNAME_KEY, name);
    return name;
  } catch {
    return null;
  }
}

/** Compact money for mode tiles — $842M / $1.05B */
export function formatDollarsShort(value: number): string {
  const n = Math.max(0, Math.round(value));
  if (n >= 1_000_000_000) {
    const b = n / 1_000_000_000;
    const text = b >= 10 ? b.toFixed(0) : b.toFixed(2).replace(/\.?0+$/, '');
    return `$${text}B`;
  }
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    const text = m >= 100 ? m.toFixed(0) : m.toFixed(1).replace(/\.0$/, '');
    return `$${text}M`;
  }
  if (n <= 0) return '—';
  return `$${n.toLocaleString()}`;
}
