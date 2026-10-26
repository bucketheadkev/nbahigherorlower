/**
 * Wall of Fame — players whose Bank reaches $1,000,000,000.
 *
 * Signed-in players earn their place on the server (wall_of_fame) and sign the public wall.
 * Guests keep an on-device record of reaching it and need an account to sign.
 * Spending afterwards never removes either.
 */

export const WALL_OF_FAME_GOAL = 1_000_000_000;

const LOCAL_WALL_KEY = 'oneb_wall_of_fame_local_v1';

export const SIGNATURE_MAX = 24;

/** Trimmed, single-spaced name, or null when it isn't a valid signature (2–24 letters, digits, space . ' -). */
export function normalizeSignature(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > SIGNATURE_MAX) return null;
  return /^[\p{L}\p{N} .'\-]+$/u.test(name) ? name : null;
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

const PREVIEW_FIRST = [
  'Vaultline', 'NorthStar', 'Kairo', 'Meridian', 'Halcyon', 'Brightwater', 'Okonkwo', 'Maya Reyes',
  'J. Thornton', 'Deshawn', 'Lucia', 'Big Mike', 'Ana Sofia', 'Tre Daniels', 'Coach K', 'Ramon',
  'Priya', 'Leo Marsh', "D'Angelo", 'Skyler', 'Mateo', 'Ivy Chen', 'Nate Harlow', 'Bianca',
];

/** Dev-only sample wall (`?wallPreview=1`) for design review; never shown in production. */
export function previewWall(count = 180): Array<{ number: number; signature: string; username: string; signedAt: string }> {
  if (process.env.NODE_ENV === 'production') return [];
  return Array.from({ length: count }, (_, i) => {
    const base = PREVIEW_FIRST[i % PREVIEW_FIRST.length]!;
    const signature = i < PREVIEW_FIRST.length ? base : `${base} ${Math.floor(i / PREVIEW_FIRST.length) + 1}`;
    return {
      number: i + 1,
      signature,
      username: signature.replace(/[^A-Za-z0-9]/g, '').slice(0, 14) || `player${i}`,
      signedAt: new Date(Date.UTC(2026, 6, 1) + i * 9 * 3_600_000).toISOString(),
    };
  });
}
