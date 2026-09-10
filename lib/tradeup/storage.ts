import type { StartingTier } from './types';

const MUTE_KEY = 'tradeup_muted';
const BEST_CHAIN_KEY = 'tradeup_best_chain';
const BEST_RECORD_KEY = 'tradeup_best_season_record_v1';
const BEST_ROSTER_VALUE_KEY = 'tradeup_best_roster_value_v1';
const CREDITS_KEY = 'tradeup_credits';
const STARTING_TIER_KEY = 'tradeup_starting_tier';
const STARTING_TIERS_OWNED_KEY = 'tradeup_starting_tiers_owned';
const NEGOTIATION_TUTORIAL_KEY = 'tradeup_negotiation_tutorial_seen';

const VALID_STARTING_TIERS: StartingTier[] = ['F', 'D', 'C', 'B'];

function isStartingTier(value: string | null): value is StartingTier {
  return value === 'F' || value === 'D' || value === 'C' || value === 'B';
}

function migrateStartingTierStorage(): void {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(STARTING_TIERS_OWNED_KEY)) return;

  // Legacy installs: only F-tier is owned by default. Do not infer ownership from equipped tier.
  localStorage.setItem(STARTING_TIERS_OWNED_KEY, JSON.stringify(['F']));
  localStorage.setItem(STARTING_TIER_KEY, 'F');
}

/** Reset equipped tier when it is not in the owned list (e.g. stale or invalid saves). */
export function sanitizeStartingTierState(): void {
  if (typeof window === 'undefined') return;
  migrateStartingTierStorage();
  const owned = getOwnedStartingTiers();
  const stored = localStorage.getItem(STARTING_TIER_KEY);
  if (!isStartingTier(stored) || !owned.includes(stored)) {
    localStorage.setItem(STARTING_TIER_KEY, 'F');
  }
}

export function isMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(MUTE_KEY) === '1';
}

export function setMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
}

export function hasSeenNegotiationTutorial(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(NEGOTIATION_TUTORIAL_KEY) === '1';
}

export function markNegotiationTutorialSeen(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NEGOTIATION_TUTORIAL_KEY, '1');
}

export function getBestChain(): number {
  if (typeof window === 'undefined') return 0;
  return Number(localStorage.getItem(BEST_CHAIN_KEY) ?? 0);
}

export function saveBestChain(chain: number): number {
  if (typeof window === 'undefined') return chain;
  const best = getBestChain();
  if (chain > best) {
    localStorage.setItem(BEST_CHAIN_KEY, String(chain));
    return chain;
  }
  return best;
}

/** Highest finished-run roster dollar value the player has ever posted. */
export function getBestRosterValue(): number {
  if (typeof window === 'undefined') return 0;
  const raw = Number(localStorage.getItem(BEST_ROSTER_VALUE_KEY) ?? 0);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
}

export function saveBestRosterValue(value: number): {
  best: number;
  isNewBest: boolean;
} {
  const rounded = Math.max(0, Math.round(value));
  if (typeof window === 'undefined') {
    return { best: rounded, isNewBest: false };
  }
  const current = getBestRosterValue();
  if (rounded > current) {
    localStorage.setItem(BEST_ROSTER_VALUE_KEY, String(rounded));
    return { best: rounded, isNewBest: true };
  }
  return { best: current, isNewBest: false };
}

const BEST_WORLD_RANK_KEY = 'tradeup_best_world_rank_v1';
const BEST_FOUR_PLAYER_SUM_KEY = 'tradeup_best_four_player_sum_v1';

/** Best (lowest) world leaderboard rank ever achieved. 0 = none yet. */
export function getBestWorldRank(): number {
  if (typeof window === 'undefined') return 0;
  const raw = Number(localStorage.getItem(BEST_WORLD_RANK_KEY) ?? 0);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
}

export function saveBestWorldRank(rank: number): number {
  const next = Math.max(1, Math.round(rank));
  if (typeof window === 'undefined') return next;
  const current = getBestWorldRank();
  if (current <= 0 || next < current) {
    localStorage.setItem(BEST_WORLD_RANK_KEY, String(next));
    return next;
  }
  return current;
}

/** Highest sum of any four players on a finished roster. */
export function getBestFourPlayerSum(): number {
  if (typeof window === 'undefined') return 0;
  const raw = Number(localStorage.getItem(BEST_FOUR_PLAYER_SUM_KEY) ?? 0);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
}

export function saveBestFourPlayerSum(value: number): number {
  const rounded = Math.max(0, Math.round(value));
  if (typeof window === 'undefined') return rounded;
  const current = getBestFourPlayerSum();
  if (rounded > current) {
    localStorage.setItem(BEST_FOUR_PLAYER_SUM_KEY, String(rounded));
    return rounded;
  }
  return current;
}

export interface BestSeasonRecord {
  wins: number;
  losses: number;
}

export function getBestSeasonRecord(): BestSeasonRecord {
  if (typeof window === 'undefined') return { wins: 0, losses: 0 };
  try {
    const raw = localStorage.getItem(BEST_RECORD_KEY);
    if (!raw) return { wins: 0, losses: 0 };
    const parsed = JSON.parse(raw) as Partial<BestSeasonRecord>;
    const wins = Number(parsed.wins ?? 0);
    const losses = Number(parsed.losses ?? 0);
    if (!Number.isFinite(wins) || !Number.isFinite(losses)) return { wins: 0, losses: 0 };
    return {
      wins: Math.max(0, Math.min(82, Math.round(wins))),
      losses: Math.max(0, Math.min(82, Math.round(losses))),
    };
  } catch {
    return { wins: 0, losses: 0 };
  }
}

export function isBetterSeasonRecord(
  candidate: BestSeasonRecord,
  current: BestSeasonRecord,
): boolean {
  return candidate.wins > current.wins;
}

/** Persist only when the candidate has more wins than the saved best. */
export function saveBestSeasonRecord(candidate: BestSeasonRecord): {
  record: BestSeasonRecord;
  isNewBest: boolean;
} {
  if (typeof window === 'undefined') {
    return { record: candidate, isNewBest: false };
  }
  const current = getBestSeasonRecord();
  if (!isBetterSeasonRecord(candidate, current)) {
    return { record: current, isNewBest: false };
  }
  const next = {
    wins: Math.max(0, Math.min(82, Math.round(candidate.wins))),
    losses: Math.max(0, Math.min(82, Math.round(candidate.losses))),
  };
  localStorage.setItem(BEST_RECORD_KEY, JSON.stringify(next));
  return { record: next, isNewBest: true };
}

export function getCredits(): number {
  if (typeof window === 'undefined') return 0;
  return Number(localStorage.getItem(CREDITS_KEY) ?? 0);
}

/** @deprecated Dev credit grants removed for App Store builds. Kept as no-op for old call sites. */
export function applyDevCreditGrant(): void {
  /* intentionally empty — no automatic credit unlocks in production */
}

export function spendCredits(amount: number): { success: boolean; balance: number } {
  if (typeof window === 'undefined') return { success: false, balance: 0 };
  const safeAmount = Math.max(0, Math.floor(amount));
  const current = Number(localStorage.getItem(CREDITS_KEY) ?? 0);
  if (current < safeAmount) {
    return { success: false, balance: current };
  }
  const next = saveCredits(current - safeAmount);
  return { success: true, balance: next };
}

export function saveCredits(amount: number): number {
  if (typeof window === 'undefined') return amount;
  const safe = Math.max(0, Math.floor(amount));
  localStorage.setItem(CREDITS_KEY, String(safe));
  return safe;
}

export function addCredits(amount: number): number {
  return saveCredits(getCredits() + amount);
}

export function getOwnedStartingTiers(): StartingTier[] {
  if (typeof window === 'undefined') return ['F'];
  migrateStartingTierStorage();
  try {
    const raw = JSON.parse(localStorage.getItem(STARTING_TIERS_OWNED_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return ['F'];
    const owned = raw.filter((t): t is StartingTier => typeof t === 'string' && isStartingTier(t));
    const withDefault = new Set<StartingTier>(['F', ...owned]);
    return [...withDefault];
  } catch {
    return ['F'];
  }
}

export function isStartingTierOwned(tier: StartingTier): boolean {
  return getOwnedStartingTiers().includes(tier);
}

export function addOwnedStartingTier(tier: StartingTier): void {
  if (typeof window === 'undefined') return;
  migrateStartingTierStorage();
  const owned = new Set(getOwnedStartingTiers());
  owned.add(tier);
  localStorage.setItem(STARTING_TIERS_OWNED_KEY, JSON.stringify([...owned]));
}

export function getStartingTier(): StartingTier {
  if (typeof window === 'undefined') return 'F';
  sanitizeStartingTierState();
  const stored = localStorage.getItem(STARTING_TIER_KEY);
  if (isStartingTier(stored) && isStartingTierOwned(stored)) return stored;
  return 'F';
}

export function setStartingTier(tier: StartingTier): void {
  if (typeof window === 'undefined') return;
  if (!isStartingTierOwned(tier)) return;
  localStorage.setItem(STARTING_TIER_KEY, tier);
}

export function buildShareText(
  path: string[],
  trades: number,
  gmScore: number,
  gmTitle: string,
): string {
  const chain = path.join(' → ');
  return `Ballion 🏀\nGM Score: ${gmScore} — ${gmTitle}\n${chain}\n${trades} successful trades`;
}

export { VALID_STARTING_TIERS };
