/**
 * Dynasty Road — server calls (supabase/migrations/20261107_1_dynasty_road.sql and
 * 20261108_1_dynasty_chests.sql). The server owns every decision: which runs qualify and earn
 * chest progress, chest rarity and rewards, every timer, keys, ownership and completion. The app
 * shows the state it returns.
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { CHEST_TIER_ORDER, DEFAULT_CHEST_RULES, type ChestRules, type ChestTier } from '@/lib/tradeup/dynasty/chests';
import { isDynastyPreview, previewDynastyCall } from './dynastyPreview';

export type DynastySource = 'classic_run' | 'chest' | 'grant';

export interface DynastyOwned {
  collectionId: string;
  playerId: string;
  source: DynastySource;
  acquiredAt: string;
  /** The chest it came from, for chest players. */
  chestTier: ChestTier | null;
}

export type ChestStatus = 'waiting' | 'unlocking' | 'ready' | 'opened';

export interface DynastyChest {
  id: string;
  tier: ChestTier;
  /** As of the snapshot; a countdown that passes zero becomes ready on the next refresh. */
  status: ChestStatus;
  earnedAt: string;
  /** Server epoch ms. */
  unlockEndsAt: number | null;
  unlockedBy: 'timer' | 'key' | null;
  openedAt: string | null;
  rewardCollectionId: string | null;
  rewardPlayerId: string | null;
  rewardIsNew: boolean | null;
}

export interface ChestProgress {
  points: number;
  runsCounted: number;
  chestsEarned: number;
  /** Duplicate rewards in a row (duplicate protection counter). */
  dupStreak: number;
}

export interface RunReward {
  clientRunId: string;
  points: number;
  reason: 'counted' | 'too_soon';
  chestIds: string[];
}

export interface ChestReveal {
  chestId: string;
  tier: ChestTier;
  collectionId: string;
  playerId: string;
  isNew: boolean;
  dupStreak: number;
  /** Duplicate protection picked this player. */
  protected: boolean;
  /** Boosted by the Focus Dynasty. */
  focus: boolean;
  /** Nothing was left to collect, so a duplicate was unavoidable. */
  allOwned: boolean;
  completedNow: boolean;
  alreadyOpened: boolean;
}

export interface DynastyCompletion {
  collectionId: string;
  completedAt: string;
}

export interface DynastyClaim {
  clientRunId: string;
  collectionId: string;
  playerId: string;
  claimedAt: string;
}

export interface DynastyOption {
  collectionId: string;
  playerId: string;
  owned: boolean;
}

export interface DynastyPendingRun {
  clientRunId: string;
  verifiedValue: number;
  achievedAt: string;
  options: DynastyOption[];
}

export interface DynastyState {
  owned: DynastyOwned[];
  completed: DynastyCompletion[];
  /** Recent signings, newest first (lets a results screen recognize its own run). */
  claims: DynastyClaim[];
  /** $1B runs with no signing yet that still have an unowned player to offer. */
  pending: DynastyPendingRun[];
  minRunValue: number;
  /** False until the chest migration is applied on the server. */
  chestsEnabled: boolean;
  chestRules: ChestRules;
  chestProgress: ChestProgress;
  chests: DynastyChest[];
  focusCollectionId: string | null;
  keys: number;
  runRewards: RunReward[];
  /** server clock − device clock, so countdowns ignore a wrong device time. */
  serverOffsetMs: number;
}

export interface DynastySignResult {
  state: DynastyState;
  signed: { collectionId: string; playerId: string };
  /** True when this exact signing had already been saved (a retry). */
  alreadySigned: boolean;
  /** This signing finished its collection. */
  completedNow: boolean;
}

export type DynastyFailure =
  | 'account'
  | 'run_not_found'
  | 'already_claimed'
  | 'already_owned'
  | 'not_eligible'
  | 'not_qualified'
  | 'chest_locked'
  | 'unlock_busy'
  | 'no_keys'
  | 'chest_ready'
  | 'chest_opened'
  | 'focus_invalid'
  | 'unavailable'
  | 'network'
  | 'error';

export type DynastyResult<T> =
  | { ok: true; data: T; reason?: undefined }
  | { ok: false; reason: DynastyFailure; data?: undefined };

const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883', '42P01']);
const NETWORK_FAILURE = /failed to fetch|load failed|networkerror|network request failed|timeout/i;

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const rows = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
const SOURCES = new Set<DynastySource>(['classic_run', 'chest', 'grant']);
const TIERS = new Set<string>(CHEST_TIER_ORDER);
const tierOf = (v: unknown): ChestTier => (TIERS.has(String(v)) ? (String(v) as ChestTier) : 'pro');
const msOrNull = (v: unknown) => (v == null || v === '' ? null : Date.parse(String(v)) || null);
const STATUSES = new Set<ChestStatus>(['waiting', 'unlocking', 'ready', 'opened']);

function toChest(c: Record<string, unknown>): DynastyChest {
  return {
    id: str(c.id),
    tier: tierOf(c.tier),
    status: STATUSES.has(c.status as ChestStatus) ? (c.status as ChestStatus) : 'waiting',
    earnedAt: str(c.earned_at),
    unlockEndsAt: msOrNull(c.unlock_ends_at),
    unlockedBy: c.unlocked_by === 'key' || c.unlocked_by === 'timer' ? c.unlocked_by : null,
    openedAt: c.opened_at ? str(c.opened_at) : null,
    rewardCollectionId: c.reward_collection_id ? str(c.reward_collection_id) : null,
    rewardPlayerId: c.reward_player_id ? str(c.reward_player_id) : null,
    rewardIsNew: typeof c.reward_is_new === 'boolean' ? c.reward_is_new : null,
  };
}

function toOption(r: Record<string, unknown>): DynastyOption {
  return { collectionId: str(r.collection_id), playerId: str(r.player_id), owned: r.owned === true };
}

export function toDynastyState(raw: unknown): DynastyState {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    owned: rows(r.owned).map((o) => ({
      collectionId: str(o.collection_id),
      playerId: str(o.player_id),
      source: SOURCES.has(o.source as DynastySource) ? (o.source as DynastySource) : 'grant',
      acquiredAt: str(o.acquired_at),
      chestTier: o.chest_tier ? tierOf(o.chest_tier) : null,
    })),
    completed: rows(r.completed).map((c) => ({ collectionId: str(c.collection_id), completedAt: str(c.completed_at) })),
    claims: rows(r.claims).map((c) => ({
      clientRunId: str(c.client_run_id),
      collectionId: str(c.collection_id),
      playerId: str(c.player_id),
      claimedAt: str(c.claimed_at),
    })),
    pending: rows(r.pending).map((p) => ({
      clientRunId: str(p.client_run_id),
      verifiedValue: num(p.verified_value),
      achievedAt: str(p.achieved_at),
      options: rows(p.options).map(toOption),
    })),
    minRunValue: num(r.min_run_value) || 1_000_000_000,
    ...toChestState(r),
  };
}

function toChestState(r: Record<string, unknown>) {
  const rules = (r.chest_rules ?? null) as Record<string, unknown> | null;
  const progress = (r.chest_progress ?? {}) as Record<string, unknown>;
  const serverNow = msOrNull(r.server_now);
  return {
    chestsEnabled: rules != null,
    chestRules: rules
      ? {
          pointsPerRun: num(rules.points_per_run),
          pointsBillionBonus: num(rules.points_billion_bonus),
          pointsPerChest: Math.max(1, num(rules.points_per_chest)),
          unlockSeconds: num(rules.unlock_seconds) || DEFAULT_CHEST_RULES.unlockSeconds,
          maxUnlocking: Math.max(1, num(rules.max_unlocking)),
          dupProtectionAfter: Math.max(1, num(rules.dup_protection_after)),
        }
      : DEFAULT_CHEST_RULES,
    chestProgress: {
      points: num(progress.points),
      runsCounted: num(progress.runs_counted),
      chestsEarned: num(progress.chests_earned),
      dupStreak: num(progress.dup_streak),
    },
    chests: rows(r.chests).map(toChest),
    focusCollectionId: r.focus_collection_id ? str(r.focus_collection_id) : null,
    keys: num(r.keys),
    runRewards: rows(r.run_rewards).map((x) => ({
      clientRunId: str(x.client_run_id),
      points: num(x.points),
      reason: (x.reason === 'too_soon' ? 'too_soon' : 'counted') as RunReward['reason'],
      chestIds: Array.isArray(x.chest_ids) ? (x.chest_ids as unknown[]).map(str) : [],
    })),
    serverOffsetMs: serverNow ? serverNow - Date.now() : 0,
  };
}

function toReveal(raw: unknown): { state: DynastyState; reveal: ChestReveal } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const v = (r.reveal ?? {}) as Record<string, unknown>;
  return {
    state: toDynastyState(r),
    reveal: {
      chestId: str(v.chest_id),
      tier: tierOf(v.tier),
      collectionId: str(v.collection_id),
      playerId: str(v.player_id),
      isNew: v.is_new === true,
      dupStreak: num(v.dup_streak),
      protected: v.protected === true,
      focus: v.focus === true,
      allOwned: v.all_owned === true,
      completedNow: v.completed_now === true,
      alreadyOpened: v.already_opened === true,
    },
  };
}

function toSignResult(raw: unknown): DynastySignResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const signed = (r.signed ?? {}) as Record<string, unknown>;
  return {
    state: toDynastyState(r),
    signed: { collectionId: str(signed.collection_id), playerId: str(signed.player_id) },
    alreadySigned: r.already_signed === true,
    completedNow: r.completed_now === true,
  };
}

function failureFrom(error: { code?: string; message?: string }): DynastyFailure {
  const msg = error.message ?? '';
  if (error.code && MISSING_FUNCTION_CODES.has(error.code)) return 'unavailable';
  if (NETWORK_FAILURE.test(msg)) return 'network';
  if (/not_authenticated|permanent_account_required|profile_required/.test(msg)) return 'account';
  if (msg.includes('run_not_found')) return 'run_not_found';
  if (msg.includes('run_already_claimed')) return 'already_claimed';
  if (msg.includes('already_owned')) return 'already_owned';
  if (/player_not_in_run|player_not_eligible|invalid_run/.test(msg)) return 'not_eligible';
  if (/run_not_qualified|run_before_launch/.test(msg)) return 'not_qualified';
  if (msg.includes('chest_locked')) return 'chest_locked';
  if (msg.includes('unlock_slot_busy')) return 'unlock_busy';
  if (msg.includes('no_keys')) return 'no_keys';
  if (msg.includes('chest_ready')) return 'chest_ready';
  if (/chest_opened|chest_not_found/.test(msg)) return 'chest_opened';
  if (/focus_not_eligible|focus_completed/.test(msg)) return 'focus_invalid';
  return 'error';
}

async function rpc<T>(fn: string, args: Record<string, unknown> | undefined, map: (raw: unknown) => T): Promise<DynastyResult<T>> {
  if (isDynastyPreview()) {
    const result = previewDynastyCall(fn, args);
    return result.ok ? { ok: true, data: map(result.data) } : { ok: false, reason: failureFrom({ message: result.error }) };
  }
  try {
    const { data, error } = await getSupabaseBrowserClient().rpc(fn, args);
    if (error) {
      const reason = failureFrom(error);
      if (reason === 'error' || reason === 'unavailable') console.error(`[dynasty] ${fn} failed`, error.message);
      return { ok: false, reason };
    }
    return { ok: true, data: map(data) };
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err ?? '');
    if (NETWORK_FAILURE.test(text)) return { ok: false, reason: 'network' };
    console.error(`[dynasty] ${fn} failed`, text);
    return { ok: false, reason: 'error' };
  }
}

export const fetchDynastyState = () => rpc('dynasty_state', undefined, toDynastyState);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sign one player from a verified run. Safe to repeat: the server returns the saved signing for a
 * retry of the same pick, so a dropped connection is retried automatically.
 */
export async function signDynastyPlayer(
  clientRunId: string,
  collectionId: string,
  playerId: string,
): Promise<DynastyResult<DynastySignResult>> {
  const args = { p_client_run_id: clientRunId, p_collection_id: collectionId, p_player_id: playerId };
  return withRetry(() => rpc('dynasty_sign_from_run', args, toSignResult));
}

/** Every call below is idempotent on the server, so a dropped connection is simply retried. */
async function withRetry<T>(call: () => Promise<DynastyResult<T>>): Promise<DynastyResult<T>> {
  let result = await call();
  for (const delay of [700, 1800]) {
    if (result.ok || result.reason !== 'network') break;
    await wait(delay);
    result = await call();
  }
  return result;
}

export const startChestUnlock = (chestId: string) =>
  withRetry(() => rpc('dynasty_chest_start_unlock', { p_chest_id: chestId }, toDynastyState));

/** `requestId` is minted once per tap and reused for retries, so one tap spends at most one key. */
export const spendChestKey = (chestId: string, requestId: string) =>
  withRetry(() => rpc('dynasty_chest_use_key', { p_chest_id: chestId, p_request_id: requestId }, toDynastyState));

export const openChest = (chestId: string) => withRetry(() => rpc('dynasty_chest_open', { p_chest_id: chestId }, toReveal));

export const setFocusDynasty = (collectionId: string | null) =>
  withRetry(() => rpc('dynasty_set_focus', { p_collection_id: collectionId }, toDynastyState));

export function newRequestId(): string {
  const c = globalThis.crypto;
  return c && 'randomUUID' in c ? c.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
