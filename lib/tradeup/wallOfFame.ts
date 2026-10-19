/**
 * Wall of Fame — players whose Bank reaches $1,000,000,000.
 *
 * Signed-in players are inducted permanently on the server (wall_of_fame table).
 * Guests keep a permanent on-device record; spending afterwards never removes either.
 */

export const WALL_OF_FAME_GOAL = 1_000_000_000;

const LOCAL_WALL_KEY = 'oneb_wall_of_fame_local_v1';
const LOCAL_SIGNATURE_KEY = 'oneb_wall_signature_v1';

export const SIGNATURE_MAX = 24;

/** Trimmed, single-spaced name, or null when it isn't a valid signature (2–24 letters, digits, space . ' -). */
export function normalizeSignature(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > SIGNATURE_MAX) return null;
  return /^[\p{L}\p{N} .'\-]+$/u.test(name) ? name : null;
}

export interface WallSignature {
  name: string;
  signedAt: string;
}

/** Guest signature on this device (permanent once stamped). */
export function getLocalSignature(): WallSignature | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_SIGNATURE_KEY) ?? 'null') as WallSignature | null;
    return parsed && typeof parsed.name === 'string' && typeof parsed.signedAt === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveLocalSignature(raw: string): WallSignature | null {
  const existing = getLocalSignature();
  if (existing) return existing;
  const name = normalizeSignature(raw);
  if (!name) return null;
  const signature = { name, signedAt: new Date().toISOString() };
  try {
    localStorage.setItem(LOCAL_SIGNATURE_KEY, JSON.stringify(signature));
  } catch {
    return null;
  }
  return signature;
}

export function qualifiesForWall(bankBalance: number): boolean {
  return bankBalance >= WALL_OF_FAME_GOAL;
}

/** Progress markers on the way to the Wall (informational — no extra Cash). */
export const BANK_MILESTONES = [
  1_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000,
  100_000_000, 250_000_000, 500_000_000, 750_000_000, WALL_OF_FAME_GOAL,
] as const;

/** Next milestone and the true fraction of the way there from the previous one. */
export function nextMilestone(balance: number): { from: number; next: number; pct: number } | null {
  const next = BANK_MILESTONES.find((m) => balance < m);
  if (next == null) return null;
  const index = BANK_MILESTONES.indexOf(next);
  const from = index > 0 ? BANK_MILESTONES[index - 1]! : 0;
  return { from, next, pct: Math.max(0, Math.min(1, (balance - from) / (next - from))) };
}

/** Guest induction time on this device (permanent once set). */
export function getLocalInduction(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(LOCAL_WALL_KEY);
  } catch {
    return null;
  }
}

export function recordLocalInduction(bankBalance: number): string | null {
  const existing = getLocalInduction();
  if (existing || !qualifiesForWall(bankBalance)) return existing;
  const at = new Date().toISOString();
  try {
    localStorage.setItem(LOCAL_WALL_KEY, at);
  } catch {
    return null;
  }
  return at;
}

/** Dev `?wallPreview=1` — opens the signing flow with sample inductees for design review. */
export function isWallPreview(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('wallPreview') === '1';
  } catch {
    return false;
  }
}

const PREVIEW_NAMES = ['Vaultline', 'NorthStar', 'Kairo', 'Meridian', 'Halcyon', 'Brightwater', 'Okonkwo'];

/** Dev-only sample inductees for design review (never shown in production). */
export function previewInductees(): Array<{ username: string; inductedAt: string }> {
  if (process.env.NODE_ENV === 'production') return [];
  return PREVIEW_NAMES.map((name, i) => ({
    username: name,
    inductedAt: new Date(Date.UTC(2026, 8, 3 + i * 6, 18)).toISOString(),
  }));
}
