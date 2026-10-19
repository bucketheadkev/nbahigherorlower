/**
 * Global Bank leaderboard — top players by Bank total (in-game Cash).
 *
 * Reads two server functions:
 *   get_bank_leaderboard_top(p_limit int) → rank, username, bank_total
 *   get_my_bank_leaderboard_rank()        → rank, username, bank_total
 * Until they exist on the database, callers get `{ ok: false, reason: 'unavailable' }`.
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isAnonymousUser } from '@/lib/account/userKind';

export interface BankStanding {
  rank: number;
  username: string;
  bankTotal: number;
}

export type BankBoardFailure = { ok: false; reason: 'unavailable' | 'error' };

/** PostgREST / Postgres codes for a function that is not deployed yet. */
const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);

function mapStanding(row: Record<string, unknown>): BankStanding {
  return {
    rank: Number(row.rank) || 0,
    username: typeof row.username === 'string' ? row.username : '—',
    bankTotal: Math.max(0, Math.round(Number(row.bank_total) || 0)),
  };
}

function failure(error: { code?: string; message?: string }, scope: string): BankBoardFailure {
  if (error.code && MISSING_FUNCTION_CODES.has(error.code)) {
    return { ok: false, reason: 'unavailable' };
  }
  console.error(`[bank-board] ${scope}`, error.message ?? error);
  return { ok: false, reason: 'error' };
}

export async function fetchBankLeaderboardTop(
  limit = 100,
): Promise<{ ok: true; rows: BankStanding[] } | BankBoardFailure> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc('get_bank_leaderboard_top', { p_limit: limit });
    if (error) return failure(error, 'top fetch failed');
    const rows = (Array.isArray(data) ? data : []).map((row) =>
      mapStanding(row as Record<string, unknown>),
    );
    return { ok: true, rows };
  } catch (err) {
    console.error('[bank-board] top fetch error', err);
    return { ok: false, reason: 'error' };
  }
}

/** Signed-in player's ledger balance (server-authoritative). */
export async function fetchMyBankBalance(): Promise<{ ok: true; balance: number } | BankBoardFailure> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc('get_my_bank_balance');
    if (error) return failure(error, 'balance fetch failed');
    return { ok: true, balance: Math.max(0, Math.round(Number(data) || 0)) };
  } catch (err) {
    console.error('[bank-board] balance fetch error', err);
    return { ok: false, reason: 'error' };
  }
}

/** Signed-in player's Bank rank, or null for guests / players without a Bank row. */
export async function fetchMyBankRank(): Promise<
  { ok: true; standing: BankStanding | null } | BankBoardFailure
> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user ?? null;
    if (!user || isAnonymousUser(user)) return { ok: true, standing: null };
    const { data, error } = await supabase.rpc('get_my_bank_leaderboard_rank');
    if (error) return failure(error, 'my rank failed');
    const row = Array.isArray(data) && data.length > 0 ? (data[0] as Record<string, unknown>) : null;
    return { ok: true, standing: row ? mapStanding(row) : null };
  } catch (err) {
    console.error('[bank-board] my rank error', err);
    return { ok: false, reason: 'error' };
  }
}
