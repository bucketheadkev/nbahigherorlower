/**
 * 30-team prize wheel math — single source of truth with TEAMS order.
 */

import { TEAMS } from './teams';
import type { TeamInfo } from './types';

export const TEAM_WHEEL_COUNT = 30;
export const TEAM_WHEEL_SEGMENT_DEG = 360 / TEAM_WHEEL_COUNT;

/** Canonical wheel order — exactly the 30 NBA franchises, no duplicates. */
export function getTeamWheelTeams(): TeamInfo[] {
  if (TEAMS.length !== TEAM_WHEEL_COUNT) {
    console.warn(
      `[teamWheel] Expected ${TEAM_WHEEL_COUNT} teams, found ${TEAMS.length}`,
    );
  }
  return TEAMS;
}

export function getTeamWheelIndex(teamId: string): number {
  const idx = TEAMS.findIndex((t) => t.id === teamId);
  return idx >= 0 ? idx : 0;
}

/**
 * Final CSS rotation (degrees) so segment `winnerIndex` center sits under
 * the fixed top pointer. Adds `fullSpins` complete revolutions for drama.
 *
 * Wheel layout: segment 0 starts at the top (12 o'clock) and proceeds clockwise.
 * Pointer is fixed at top. Positive CSS rotate is clockwise.
 */
export function computeTeamWheelLandingRotation(
  winnerIndex: number,
  fullSpins = 6,
): number {
  const i = ((winnerIndex % TEAM_WHEEL_COUNT) + TEAM_WHEEL_COUNT) % TEAM_WHEEL_COUNT;
  // Center of segment i is at i * SEGMENT + SEGMENT/2 from top, clockwise.
  // Rotate wheel CCW-equivalent so that center lands under pointer:
  // rotation = spins*360 + (360 - centerAngle)
  const centerFromTop = i * TEAM_WHEEL_SEGMENT_DEG + TEAM_WHEEL_SEGMENT_DEG / 2;
  return fullSpins * 360 + (360 - centerFromTop);
}

/** Which segment is under the pointer for a given absolute rotation. */
export function teamIndexFromRotation(rotationDeg: number): number {
  const normalized = ((rotationDeg % 360) + 360) % 360;
  // Pointer at top; wheel rotated by `normalized` clockwise.
  // Content that was at angle θ is now at θ + normalized.
  // Under pointer (0): original angle = (360 - normalized) % 360
  const underPointer = (360 - normalized) % 360;
  return Math.floor(underPointer / TEAM_WHEEL_SEGMENT_DEG) % TEAM_WHEEL_COUNT;
}

/** Cubic-ish ease-out for tick sync (matches visual deceleration). */
export function wheelEaseOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

export function rotationAtProgress(
  fromDeg: number,
  toDeg: number,
  t: number,
): number {
  return fromDeg + (toDeg - fromDeg) * wheelEaseOut(t);
}
