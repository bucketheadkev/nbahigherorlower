'use client';

function rectPoint(el: Element): { x: number; y: number; size: number } {
  const r = el.getBoundingClientRect();
  return {
    x: r.left + r.width / 2,
    y: r.top + r.height / 2,
    size: Math.max(r.width, r.height),
  };
}

/**
 * Measure slam flight from a draft-list player row to a court / dock slot.
 */
export function measureDraftSlam(
  playerId: string,
  slot: string,
): {
  from: { x: number; y: number; size: number };
  to: { x: number; y: number; size: number };
} | null {
  if (typeof document === 'undefined') return null;
  const fromEl = document.querySelector(
    `[data-draft-player-id="${CSS.escape(playerId)}"]`,
  );
  const toEl =
    document.querySelector(
      `[data-draft-slot="${CSS.escape(slot)}"] .draft-hub-court__slot`,
    ) ??
    document.querySelector(
      `[data-draft-slot="${CSS.escape(slot)}"] .halfcourt__slot-face`,
    ) ??
    document.querySelector(
      `[data-draft-slot="${CSS.escape(slot)}"] .billion-court-dock__circle`,
    ) ??
    document.querySelector(`[data-draft-slot="${CSS.escape(slot)}"]`);
  if (!fromEl || !toEl) return null;
  return {
    from: rectPoint(fromEl),
    to: rectPoint(toEl),
  };
}

/** Measure only the destination seat (after hub court has mounted). */
export function measureDraftSlotTarget(slot: string): {
  x: number;
  y: number;
  size: number;
} | null {
  if (typeof document === 'undefined') return null;
  const toEl =
    document.querySelector(
      `[data-draft-slot="${CSS.escape(slot)}"] .draft-hub-court__slot`,
    ) ??
    document.querySelector(
      `[data-draft-slot="${CSS.escape(slot)}"] .billion-court-dock__circle`,
    ) ??
    document.querySelector(`[data-draft-slot="${CSS.escape(slot)}"]`);
  if (!toEl) return null;
  return rectPoint(toEl);
}

export function measureDraftPlayerOrigin(playerId: string): {
  x: number;
  y: number;
  size: number;
} | null {
  if (typeof document === 'undefined') return null;
  const fromEl = document.querySelector(
    `[data-draft-player-id="${CSS.escape(playerId)}"]`,
  );
  if (!fromEl) return null;
  return rectPoint(fromEl);
}
