import type { Position } from './types';
import type { SeasonRecord } from './lineupSeason';
import { ROUND_BUDGET, ROUND_CREDITS_CAP } from './lineupBudget';
import { generateFreeLineup, rollGuaranteedSSlot } from './lineupOffers';
import { LINEUP_POSITIONS } from './startingLineup';

export type LineupPlayerSource = 'free' | 'market' | null;

export interface LineupPositionState {
  /** Currently shown / locked player for this slot. */
  playerId: string | null;
  /** Original free reveal — protected fallback while the market is open. */
  freePlayerId: string | null;
  revealed: boolean;
  finalized: boolean;
  /** Credits paid for a market replacement; null when the free player was kept. */
  purchasePrice: number | null;
  marketOpen: boolean;
  /** How the finalized player was locked in. Null until finalized. */
  source: LineupPlayerSource;
  /** True once the Keep +100 Round Credits bonus has been claimed for this slot. */
  keepBonusClaimed: boolean;
}

export interface PositionalBattleResult {
  slot: Position;
  userWon: boolean;
}

export interface LineupMatchResult {
  won: boolean;
  /** Surviving card counts after five positional battles. */
  playerScore: number;
  opponentScore: number;
  playerPower: number;
  opponentPower: number;
  slotResults: PositionalBattleResult[];
  userSurviving: number;
  opponentSurviving: number;
  /** Perfect 5–0 sweep — computed once with the locked result. */
  sweep: boolean;
}

export type LineupMatchPhase = 'matchmaking' | 'intro' | 'battle' | 'result';

/** Persisted head-to-head match for the current run (not the 82-game season). */
export interface LineupMatchState {
  matchId: string;
  opponentIds: Record<Position, string>;
  /** Null until the official result is calculated once before battles. */
  result: LineupMatchResult | null;
  phase: LineupMatchPhase;
  /** Session mirror of trophy apply — global processedMatchIds is authoritative. */
  trophiesApplied: boolean;
}

export interface LineupSession {
  lineupId: string;
  /** Temporary per-run budget. Never mixed with permanent account credits. */
  roundCredits: number;
  creditsSpent: number;
  /** Position whose Trade Up market is currently being viewed. */
  activePosition: Position | null;
  players: Record<Position, LineupPositionState>;
  /** Market offer IDs for each position (generated when market is opened / rerolled). */
  offers: Record<Position, string[] | null>;
  offerFingerprint: Record<Position, string | null>;
  runCompleted: boolean;
  /** Legacy 82-game season fields — retained for saved data; unused by H2H flow. */
  seasonRecord: SeasonRecord | null;
  seasonSimulationComplete: boolean;
  /** Active head-to-head matchup after lineup lock-in. */
  match: LineupMatchState | null;
  /**
   * Position whose free reveal is forced to S-tier this run, or null when the
   * run-level FREE_LINEUP_GUARANTEED_S_CHANCE roll missed.
   */
  guaranteedSSlot: Position | null;
}

const STORAGE_KEY = 'tradeup_lineup_session_v11';
const LEGACY_KEYS = [
  'tradeup_lineup_session_v10',
  'tradeup_lineup_session_v9',
  'tradeup_lineup_session_v8',
  'tradeup_lineup_session_v7',
  'tradeup_lineup_session_v6',
  'tradeup_lineup_session_v5',
  'tradeup_lineup_session_v4',
  'tradeup_lineup_session_v3',
  'tradeup_lineup_session_v2',
  'tradeup_lineup_session_v1',
];

function emptySlot(): LineupPositionState {
  return {
    playerId: null,
    freePlayerId: null,
    revealed: false,
    finalized: false,
    purchasePrice: null,
    marketOpen: false,
    source: null,
    keepBonusClaimed: false,
  };
}

function emptyPlayers(): Record<Position, LineupPositionState> {
  return {
    PG: emptySlot(),
    SG: emptySlot(),
    SF: emptySlot(),
    PF: emptySlot(),
    C: emptySlot(),
  };
}

function emptyOffers(): Record<Position, string[] | null> {
  return { PG: null, SG: null, SF: null, PF: null, C: null };
}

function emptyFingerprints(): Record<Position, string | null> {
  return { PG: null, SG: null, SF: null, PF: null, C: null };
}

function normalizeMatch(raw: Partial<LineupMatchState> | null | undefined): LineupMatchState | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.matchId !== 'string' || !raw.matchId) return null;
  if (!raw.opponentIds || typeof raw.opponentIds !== 'object') return null;

  const opponentIds = emptyFingerprints() as Record<Position, string>;
  for (const pos of LINEUP_POSITIONS) {
    const id = (raw.opponentIds as Record<Position, string | undefined>)[pos];
    if (typeof id !== 'string' || !id) return null;
    opponentIds[pos] = id;
  }

  let result: LineupMatchResult | null = null;
  if (raw.result && typeof raw.result === 'object') {
    const candidate = raw.result as Partial<LineupMatchResult>;
    const slotResults = Array.isArray(candidate.slotResults)
      ? candidate.slotResults.filter(
          (entry): entry is PositionalBattleResult =>
            Boolean(entry) &&
            typeof entry === 'object' &&
            LINEUP_POSITIONS.includes((entry as PositionalBattleResult).slot) &&
            typeof (entry as PositionalBattleResult).userWon === 'boolean',
        )
      : [];
    if (
      typeof candidate.won === 'boolean' &&
      typeof candidate.playerScore === 'number' &&
      typeof candidate.opponentScore === 'number' &&
      typeof candidate.playerPower === 'number' &&
      typeof candidate.opponentPower === 'number' &&
      slotResults.length === 5
    ) {
      result = {
        won: candidate.won,
        playerScore: Math.round(candidate.playerScore),
        opponentScore: Math.round(candidate.opponentScore),
        playerPower: candidate.playerPower,
        opponentPower: candidate.opponentPower,
        slotResults,
        userSurviving:
          typeof candidate.userSurviving === 'number'
            ? Math.round(candidate.userSurviving)
            : Math.round(candidate.playerScore),
        opponentSurviving:
          typeof candidate.opponentSurviving === 'number'
            ? Math.round(candidate.opponentSurviving)
            : Math.round(candidate.opponentScore),
        sweep: Boolean(
          candidate.won &&
            (typeof candidate.userSurviving === 'number'
              ? candidate.userSurviving
              : candidate.playerScore) === 5 &&
            (typeof candidate.opponentSurviving === 'number'
              ? candidate.opponentSurviving
              : candidate.opponentScore) === 0,
        ),
      };
    }
  }

  const rawPhase = typeof raw.phase === 'string' ? raw.phase : 'matchmaking';
  const phase: LineupMatchPhase =
    rawPhase === 'intro' || rawPhase === 'battle' || rawPhase === 'result' || rawPhase === 'matchmaking'
      ? rawPhase
      : rawPhase === 'reveal'
        ? 'intro'
        : rawPhase === 'resolving'
          ? 'battle'
          : 'matchmaking';

  return {
    matchId: raw.matchId,
    opponentIds,
    result,
    phase,
    trophiesApplied: Boolean(raw.trophiesApplied),
  };
}

export function createFreshLineupSession(): LineupSession {
  const guaranteedSSlot = rollGuaranteedSSlot();
  const freeLineup = generateFreeLineup(guaranteedSSlot);
  const players = emptyPlayers();
  for (const slot of LINEUP_POSITIONS) {
    players[slot].freePlayerId = freeLineup[slot].id;
  }

  return {
    lineupId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    roundCredits: ROUND_BUDGET,
    creditsSpent: 0,
    activePosition: null,
    players,
    offers: emptyOffers(),
    offerFingerprint: emptyFingerprints(),
    runCompleted: false,
    seasonRecord: null,
    seasonSimulationComplete: false,
    match: null,
    guaranteedSSlot,
  };
}

function isCompleteLineup(players: Record<Position, LineupPositionState> | undefined): boolean {
  if (!players) return false;
  return LINEUP_POSITIONS.every(
    (pos) => players[pos]?.finalized === true && Boolean(players[pos]?.playerId),
  );
}

function isOptionalMarketSession(parsed: Partial<LineupSession>): boolean {
  const sample = parsed.players?.PG;
  return (
    typeof parsed.roundCredits === 'number' &&
    Boolean(parsed.offers) &&
    Boolean(parsed.players) &&
    sample != null &&
    'freePlayerId' in sample &&
    'marketOpen' in sample
  );
}

function normalizeSlot(raw: Partial<LineupPositionState> | undefined): LineupPositionState {
  const base = emptySlot();
  if (!raw) return base;
  const source: LineupPlayerSource =
    raw.source === 'free' || raw.source === 'market'
      ? raw.source
      : raw.finalized
        ? typeof raw.purchasePrice === 'number' && raw.purchasePrice > 0
          ? 'market'
          : 'free'
        : null;
  return {
    playerId: raw.playerId ?? null,
    freePlayerId: raw.freePlayerId ?? raw.playerId ?? null,
    revealed: Boolean(raw.revealed),
    finalized: Boolean(raw.finalized),
    purchasePrice: typeof raw.purchasePrice === 'number' ? raw.purchasePrice : null,
    marketOpen: Boolean(raw.marketOpen) && !raw.finalized,
    source,
    // Never re-grant Keep bonuses from saved state — only trust an explicit claim flag.
    keepBonusClaimed: Boolean(raw.keepBonusClaimed) || (Boolean(raw.finalized) && source === 'free'),
  };
}

export function loadLineupSession(): LineupSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      for (const key of LEGACY_KEYS) {
        window.localStorage.removeItem(key);
      }
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<LineupSession>;
    if (!parsed.players || !parsed.lineupId || !isOptionalMarketSession(parsed)) {
      clearLineupSession();
      return null;
    }

    const players = emptyPlayers();
    for (const pos of LINEUP_POSITIONS) {
      players[pos] = normalizeSlot(parsed.players[pos]);
    }

    const runCompleted = parsed.runCompleted === true || isCompleteLineup(players);

    const storedRecord =
      parsed.seasonRecord &&
      Array.isArray(parsed.seasonRecord.games) &&
      parsed.seasonRecord.games.length === 82 &&
      parsed.seasonRecord.analysis &&
      typeof parsed.seasonRecord.analysis.lineupScore === 'number' &&
      parsed.seasonRecord.wins + parsed.seasonRecord.losses === 82
        ? parsed.seasonRecord
        : null;

    const guaranteedSSlot =
      parsed.guaranteedSSlot && LINEUP_POSITIONS.includes(parsed.guaranteedSSlot)
        ? parsed.guaranteedSSlot
        : null;

    const session: LineupSession = {
      lineupId: parsed.lineupId,
      roundCredits: Math.max(
        0,
        Math.min(ROUND_CREDITS_CAP, Math.round(parsed.roundCredits ?? ROUND_BUDGET)),
      ),
      creditsSpent: Math.max(0, Math.round(parsed.creditsSpent ?? 0)),
      activePosition:
        parsed.activePosition && LINEUP_POSITIONS.includes(parsed.activePosition)
          ? parsed.activePosition
          : null,
      players,
      offers: parsed.offers ?? emptyOffers(),
      offerFingerprint: parsed.offerFingerprint ?? emptyFingerprints(),
      runCompleted,
      seasonRecord: storedRecord,
      seasonSimulationComplete: storedRecord
        ? parsed.seasonSimulationComplete ?? false
        : false,
      match: normalizeMatch(parsed.match),
      guaranteedSSlot,
    };

    saveLineupSession(session);
    return session;
  } catch {
    return null;
  }
}

export function saveLineupSession(session: LineupSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* Quota or privacy mode — in-memory only */
  }
}

export function clearLineupSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    for (const key of LEGACY_KEYS) {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}
