import { ALL_PLAYERS } from './rosters';
import { CANONICAL_POSITIONS } from './lineupEligibility';
import { LINEUP_POSITIONS } from './startingLineup';
import type { Position, TradePlayer } from './types';

const MULTI_POSITION_PATTERN = /[/|,]|PGSG|SGSF|SFPF|PFC/i;

export interface PositionValidationIssue {
  code:
    | 'missing-primary'
    | 'invalid-primary'
    | 'multi-position-primary'
    | 'position-mirror-mismatch'
    | 'starting-card-mismatch'
    | 'trade-up-mismatch'
    | 'empty-position-pool';
  message: string;
  playerId?: string;
  position?: Position;
}

function isCanonical(value: unknown): value is Position {
  return typeof value === 'string' && (CANONICAL_POSITIONS as readonly string[]).includes(value);
}

/** Development-time roster + offer validation for strict primary positions. */
export function validateRosterPrimaryPositions(
  pool: readonly TradePlayer[] = ALL_PLAYERS,
): PositionValidationIssue[] {
  const issues: PositionValidationIssue[] = [];

  for (const player of pool) {
    if (player.primaryPosition == null || player.primaryPosition === ('' as Position)) {
      issues.push({
        code: 'missing-primary',
        message: `Player ${player.id} (${player.name}) is missing primaryPosition`,
        playerId: player.id,
      });
      continue;
    }

    if (!isCanonical(player.primaryPosition)) {
      issues.push({
        code: 'invalid-primary',
        message: `Player ${player.id} has invalid primaryPosition "${String(player.primaryPosition)}"`,
        playerId: player.id,
      });
    }

    if (MULTI_POSITION_PATTERN.test(String(player.primaryPosition))) {
      issues.push({
        code: 'multi-position-primary',
        message: `Player ${player.id} has multi-position primaryPosition "${String(player.primaryPosition)}"`,
        playerId: player.id,
      });
    }

    if (player.position !== player.primaryPosition) {
      issues.push({
        code: 'position-mirror-mismatch',
        message: `Player ${player.id} position "${player.position}" != primaryPosition "${player.primaryPosition}"`,
        playerId: player.id,
      });
    }
  }

  for (const position of CANONICAL_POSITIONS) {
    const count = pool.filter((player) => player.primaryPosition === position).length;
    if (count === 0) {
      issues.push({
        code: 'empty-position-pool',
        message: `No players with primaryPosition ${position}`,
        position,
      });
    }
  }

  return issues;
}

export function validateStartingCardPosition(
  slot: Position,
  player: TradePlayer,
): PositionValidationIssue | null {
  if (player.primaryPosition === slot) return null;
  return {
    code: 'starting-card-mismatch',
    message: `Starting card ${slot} received ${player.name} (${player.primaryPosition})`,
    playerId: player.id,
    position: slot,
  };
}

export function validateTradeUpOffers(
  slot: Position,
  offers: readonly TradePlayer[],
): PositionValidationIssue[] {
  return offers
    .filter((player) => player.primaryPosition !== slot)
    .map((player) => ({
      code: 'trade-up-mismatch' as const,
      message: `Trade Up ${slot} offer ${player.name} has primaryPosition ${player.primaryPosition}`,
      playerId: player.id,
      position: slot,
    }));
}

/** Run roster validation once in development and log any data problems. */
export function assertPrimaryPositionsInDev(): void {
  if (process.env.NODE_ENV === 'production') return;
  const issues = validateRosterPrimaryPositions();
  if (issues.length === 0) return;
  console.error('[primaryPosition] Roster validation failed:', issues);
}

/** Ensure lineup slots match player primary positions (dev only). */
export function assertLineupPositionsInDev(
  lineup: Partial<Record<Position, TradePlayer | null | undefined>>,
): void {
  if (process.env.NODE_ENV === 'production') return;
  for (const slot of LINEUP_POSITIONS) {
    const player = lineup[slot];
    if (!player) continue;
    const issue = validateStartingCardPosition(slot, player);
    if (issue) console.error('[primaryPosition]', issue.message);
  }
}

/** Ensure market offers match the active card position (dev only). */
export function assertTradeUpOffersInDev(slot: Position, offers: readonly TradePlayer[]): void {
  if (process.env.NODE_ENV === 'production') return;
  const issues = validateTradeUpOffers(slot, offers);
  for (const issue of issues) console.error('[primaryPosition]', issue.message);
  if (offers.length < 3) {
    console.warn(
      `[primaryPosition] Trade Up ${slot} returned ${offers.length} unique same-position offers (no cross-position fill).`,
    );
  }
}
