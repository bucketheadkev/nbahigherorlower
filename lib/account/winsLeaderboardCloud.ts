/**
 * Classic $1B wins leaderboard — weekly + all-time.
 *
 * A win = verified Classic run with verified_value >= $1,000,000,000.
 * RPCs (apply supabase/migrations/20261115_classic_wins_leaderboard.sql):
 *   get_classic_wins_all_time / get_classic_wins_weekly
 *   get_my_classic_wins_all_time / get_my_classic_wins_weekly
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isAnonymousUser } from '@/lib/account/userKind';

export type WinsBoardPeriod = 'weekly' | 'allTime';

export interface WinsStanding {
  rank: number;
  username: string;
  wins: number;
}

export type WinsBoardFailure = { ok: false; reason: 'unavailable' | 'error' };

const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);

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
  weekly: 'get_classic_wins_weekly',
  allTime: 'get_classic_wins_all_time',
};

const MINE_RPC: Record<WinsBoardPeriod, string> = {
  weekly: 'get_my_classic_wins_weekly',
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

/** Next Monday 00:00 UTC — end of the current ISO week window. */
export function getWeeklyWinsResetAt(now = new Date()): Date {
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = utc.getUTCDay(); // 0 Sun … 1 Mon
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  utc.setUTCDate(utc.getUTCDate() + daysUntilMonday);
  utc.setUTCHours(0, 0, 0, 0);
  return utc;
}
