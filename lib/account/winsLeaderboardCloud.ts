/**
 * Classic $1B wins leaderboard — daily (24h) + all-time.
 *
 * A win = verified Classic run with verified_value >= $1,000,000,000.
 * RPCs (apply supabase/migrations/20261123_classic_wins_daily.sql):
 *   get_classic_wins_all_time / get_classic_wins_daily
 *   get_my_classic_wins_all_time / get_my_classic_wins_daily
 *   settle_classic_wins_daily (idempotent $10M bank payouts for prior period top 10)
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isAnonymousUser } from '@/lib/account/userKind';

export type WinsBoardPeriod = 'daily' | 'allTime';

export interface WinsStanding {
  rank: number;
  username: string;
  wins: number;
}

export type WinsBoardFailure = { ok: false; reason: 'unavailable' | 'error' };

const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);

/** 24h contest buckets from Unix epoch (not tied to local midnight). */
export const DAILY_WINS_PERIOD_MS = 86_400_000;

function mapStanding(row: Record<string, unknown>): WinsStanding {
  return {
    rank: Number(row.rank) || 0,
    username: typeof row.username === 'string' ? row.username : '—',
    wins: Math.max(0, Math.round(Number(row.wins) || 0)),
  };
}

function failure(error: { code?: string; message?: string }, scope: string): WinsBoardFailure {
  if (error.code && MISSING_FUNCTION_CODES.has(error.code)) {
    return { ok: false, reason: 'unavailable' };
  }
  console.error(`[wins-board] ${scope}`, error.message ?? error);
  return { ok: false, reason: 'error' };
}

const TOP_RPC: Record<WinsBoardPeriod, string> = {
  daily: 'get_classic_wins_daily',
  allTime: 'get_classic_wins_all_time',
};

const MINE_RPC: Record<WinsBoardPeriod, string> = {
  daily: 'get_my_classic_wins_daily',
  allTime: 'get_my_classic_wins_all_time',
};

export async function fetchWinsLeaderboardTop(
  period: WinsBoardPeriod,
  limit = 100,
): Promise<{ ok: true; rows: WinsStanding[] } | WinsBoardFailure> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc(TOP_RPC[period], { p_limit: limit });
    if (error) return failure(error, `${period} top fetch failed`);
    const rows = (Array.isArray(data) ? data : []).map((row) =>
      mapStanding(row as Record<string, unknown>),
    );
    return { ok: true, rows };
  } catch (err) {
    console.error(`[wins-board] ${period} top fetch error`, err);
    return { ok: false, reason: 'error' };
  }
}

export async function fetchMyWinsRank(
  period: WinsBoardPeriod,
): Promise<{ ok: true; standing: WinsStanding | null } | WinsBoardFailure> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user ?? null;
    if (!user || isAnonymousUser(user)) return { ok: true, standing: null };
    const { data, error } = await supabase.rpc(MINE_RPC[period]);
    if (error) return failure(error, `${period} my rank failed`);
    const row = Array.isArray(data) && data.length > 0 ? (data[0] as Record<string, unknown>) : null;
    return { ok: true, standing: row ? mapStanding(row) : null };
  } catch (err) {
    console.error(`[wins-board] ${period} my rank error`, err);
    return { ok: false, reason: 'error' };
  }
}

/** Start of the current 24h contest window (Unix-epoch aligned). */
export function getDailyWinsPeriodStart(now = new Date()): Date {
  const ms = Math.floor(now.getTime() / DAILY_WINS_PERIOD_MS) * DAILY_WINS_PERIOD_MS;
  return new Date(ms);
}

/** End of the current 24h contest window (when the board resets). */
export function getDailyWinsResetAt(now = new Date()): Date {
  return new Date(getDailyWinsPeriodStart(now).getTime() + DAILY_WINS_PERIOD_MS);
}

/** @deprecated use getDailyWinsResetAt */
export function getWeeklyWinsResetAt(now = new Date()): Date {
  return getDailyWinsResetAt(now);
}

/**
 * Idempotent settle of the previous 24h period — top 10 each get $10M bank cash.
 * Safe to call on every board load; no-ops if already settled or RPCs missing.
 */
export async function settleDailyWinsPayouts(): Promise<void> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.rpc('settle_classic_wins_daily');
    if (error && error.code && MISSING_FUNCTION_CODES.has(error.code)) return;
    if (error) console.error('[wins-board] settle daily failed', error.message ?? error);
  } catch (err) {
    console.error('[wins-board] settle daily error', err);
  }
}
