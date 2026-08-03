export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export interface PlayerStats {
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
}

export interface TradePlayer {
  id: string;
  name: string;
  teamId: string;
  /** Authoritative NBA primary position — only value used for cards and Trade Up. */
  primaryPosition: Position;
  /**
   * Mirror of primaryPosition for legacy UI reads.
   * Do not use for eligibility, card generation, or Trade Up filtering.
   */
  position: Position;
  age: number;
  stats: PlayerStats;
  tradeValue: number;
  isStarter: boolean;
  isFranchise?: boolean;
  /** Backend-only: boosts S-tier trade odds; never shown in UI. */
  hiddenEliteOffer?: boolean;
  /** Backend-only: boosts A-tier trade odds; never shown in UI. */
  hiddenValue?: boolean;
  /** ESPN CDN headshot URL */
  headshotUrl?: string;
}

export interface TeamInfo {
  id: string;
  city: string;
  name: string;
  fullName: string;
  conference: 'East' | 'West';
  /** SportsLogos.net 2025-2026 primary logo (thumb) */
  logoUrl?: string;
}

export interface TeamPreferences {
  winNow: number;
  youth: number;
  defense: number;
  shooting: number;
  upside: number;
}

export type TradeOutcome = 'accepted' | 'rejected';

export type GamePhase = 'playing' | 'result' | 'gameover';

export type ResultType = 'accepted' | 'rejected';

export interface TradeRound {
  team: TeamInfo;
  needs: string[];
  options: TradePlayer[];
}

export interface GameRun {
  tradePath: TradePlayer[];
  tradesCompleted: number;
  longestChain: number;
}

export const MAX_LIVES = 3;
export const MAX_SKIPS = 3;
export const ELITE_THRESHOLD = 92;

/** Default starting tier for new runs (F is free; D/C/B unlocked via store). */
export type StartingTier = 'F' | 'D' | 'C' | 'B';
