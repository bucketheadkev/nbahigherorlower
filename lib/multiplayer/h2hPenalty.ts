/**
 * Isolated 1V1 matchup — penalties removed; both players keep full value.
 */
export function calculateHeadToHeadPenalty(_winnerValue: number, _loserValue: number): number {
  return 0;
}

export function applyHeadToHeadResult(
  leftValue: number,
  rightValue: number,
): {
  winner: 'p1' | 'p2' | 'tie';
  p1Adjusted: number;
  p2Adjusted: number;
  penalty: number;
} {
  const p1 = Math.round(leftValue);
  const p2 = Math.round(rightValue);
  if (p1 === p2) {
    return { winner: 'tie', p1Adjusted: p1, p2Adjusted: p2, penalty: 0 };
  }
  if (p1 > p2) {
    return { winner: 'p1', p1Adjusted: p1, p2Adjusted: p2, penalty: 0 };
  }
  return { winner: 'p2', p1Adjusted: p1, p2Adjusted: p2, penalty: 0 };
}

export const H2H_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
export type H2HPosition = (typeof H2H_POSITIONS)[number];

export function nextH2HPosition(position: H2HPosition): H2HPosition | null {
  const idx = H2H_POSITIONS.indexOf(position);
  if (idx < 0 || idx >= H2H_POSITIONS.length - 1) return null;
  return H2H_POSITIONS[idx + 1]!;
}
