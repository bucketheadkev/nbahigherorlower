export interface DraftSlamPoint {
  x: number;
  y: number;
  size: number;
}

/** Measure compact disc flight from list position badge → dock circle. */
export function measureDraftSlam(
  playerId: string,
  slot: string,
): { from: DraftSlamPoint; to: DraftSlamPoint } | null {
  if (typeof document === 'undefined') return null;

  const row = document.querySelector(
    `[data-draft-player-id="${CSS.escape(playerId)}"]`,
  );
  const sourceEl = row?.querySelector('.franchise-pick__pos') ?? row;
  const targetEl = document.querySelector(
    `[data-draft-slot="${slot}"] .billion-court-dock__circle`,
  );

  if (!sourceEl || !targetEl) return null;

  const fromR = sourceEl.getBoundingClientRect();
  const toR = targetEl.getBoundingClientRect();

  return {
    from: {
      x: fromR.left + fromR.width / 2,
      y: fromR.top + fromR.height / 2,
      size: Math.max(Math.min(fromR.width, fromR.height), 36),
    },
    to: {
      x: toR.left + toR.width / 2,
      y: toR.top + toR.height / 2,
      size: Math.max(toR.width, toR.height, 36),
    },
  };
}
