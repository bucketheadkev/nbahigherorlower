export interface DraftSlamPoint {
  x: number;
  y: number;
  size: number;
  width: number;
  height: number;
}

export function measureDraftSlam(
  playerId: string,
  slot: string,
): { from: DraftSlamPoint; to: DraftSlamPoint } | null {
  if (typeof document === 'undefined') return null;

  const row = document.querySelector(
    `[data-draft-player-id="${CSS.escape(playerId)}"]`,
  ) as HTMLElement | null;
  const targetEl = document.querySelector(
    `[data-draft-slot="${slot}"] .billion-court-dock__circle`,
  );

  if (!row || !targetEl) return null;

  const fromR = row.getBoundingClientRect();
  const toR = targetEl.getBoundingClientRect();
  const fromSize = Math.min(Math.max(fromR.height, 44), 72);

  return {
    from: {
      x: fromR.left + fromR.width / 2,
      y: fromR.top + fromR.height / 2,
      size: fromSize,
      width: fromR.width,
      height: fromR.height,
    },
    to: {
      x: toR.left + toR.width / 2,
      y: toR.top + toR.height / 2,
      size: Math.max(toR.width, toR.height, 36),
      width: toR.width,
      height: toR.height,
    },
  };
}
