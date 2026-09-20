/**
 * Public Classic World leaderboard — verified scores via Supabase RPC.
 * Clients submit lineups (player ids + seats); server computes the value.
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isAnonymousUser } from '@/lib/account/userKind';
import { LINEUP_POSITIONS } from '@/lib/tradeup/startingLineup';
import type { ValuedPlayer } from '@/lib/tradeup/billionDollar';
import type { Position } from '@/lib/tradeup/types';
import type { LeaderboardSeatInput } from '@/lib/account/leaderboardTeamResolve';

export interface LeaderboardRow {
  rank: number;
  username: string;
  verifiedBest: number;
  achievedAt: string | null;
  lineup: LeaderboardSeatInput[];
}

export interface MyLeaderboardStanding extends LeaderboardRow {}

export interface SubmitLineupResult {
  ok: true;
  verifiedValue: number;
  isNewBest: boolean;
  verifiedBest: number;
}

type LineupSeat = { player_id: string; slot: Position };

function parseLineup(raw: unknown): LeaderboardSeatInput[] {
  if (!Array.isArray(raw)) return [];
  const seats: LeaderboardSeatInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const playerId = typeof row.player_id === 'string' ? row.player_id : '';
    const slot = typeof row.slot === 'string' ? row.slot : '';
    if (!playerId || !slot) continue;
    seats.push({ player_id: playerId, slot });
  }
  return seats;
}

function mapLeaderboardRow(row: Record<string, unknown>): LeaderboardRow {
  return {
    rank: Number(row.rank) || 0,
    username: typeof row.username === 'string' ? row.username : '—',
    verifiedBest: Math.max(0, Math.round(Number(row.verified_best) || 0)),
    achievedAt: typeof row.achieved_at === 'string' ? row.achieved_at : null,
    lineup: parseLineup(row.lineup),
  };
}

function toLineupPayload(lineup: ValuedPlayer[]): LineupSeat[] | null {
  if (lineup.length < 5) return null;
  const seats: LineupSeat[] = [];
  for (let i = 0; i < 5; i += 1) {
    const player = lineup[i];
    const slot = LINEUP_POSITIONS[i];
    if (!player?.id || !slot) return null;
    seats.push({ player_id: player.id, slot });
  }
  return seats;
}

function logLeaderboardError(
  scope: string,
  error: { message?: string; code?: string; details?: string; hint?: string } | null | undefined,
  extra?: unknown,
) {
  const parts = [
    `[leaderboard] ${scope}`,
    error?.message,
    error?.code ? `code=${error.code}` : null,
    error?.details ? `details=${error.details}` : null,
    error?.hint ? `hint=${error.hint}` : null,
  ].filter(Boolean);
  console.error(parts.join(' | '), extra ?? '');
}

/** Top N public World entries (username + verified PB + lineup seats). */
export async function fetchClassicLeaderboardTop(limit = 100): Promise<{
  ok: true;
  rows: LeaderboardRow[];
} | { ok: false; message: string }> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc('get_classic_leaderboard_top', {
      p_limit: limit,
    });
    if (error) {
      logLeaderboardError('top fetch failed', error);
      return { ok: false, message: 'Could not load the leaderboard.' };
    }
    const rows: LeaderboardRow[] = (Array.isArray(data) ? data : []).map((row) =>
      mapLeaderboardRow(row as Record<string, unknown>),
    );
    return { ok: true, rows };
  } catch (err) {
    console.error('[leaderboard] top fetch error', err);
    return { ok: false, message: 'Could not load the leaderboard.' };
  }
}

/** Current permanent user's World rank, or null if guest / no verified PB. */
export async function fetchMyClassicLeaderboardRank(): Promise<{
  ok: true;
  standing: MyLeaderboardStanding | null;
} | { ok: false; message: string }> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user ?? null;
    if (!user || isAnonymousUser(user)) {
      return { ok: true, standing: null };
    }
    const { data, error } = await supabase.rpc('get_my_classic_leaderboard_rank');
    if (error) {
      logLeaderboardError('my rank failed', error);
      return { ok: false, message: 'Could not load your rank.' };
    }
    const row = Array.isArray(data) && data.length > 0 ? (data[0] as Record<string, unknown>) : null;
    if (!row) return { ok: true, standing: null };
    return { ok: true, standing: mapLeaderboardRow(row) };
  } catch (err) {
    console.error('[leaderboard] my rank error', err);
    return { ok: false, message: 'Could not load your rank.' };
  }
}

/**
 * Submit a finished Classic lineup for server verification.
 * No-op for guests / anonymous. Never throws into gameplay.
 */
export async function submitVerifiedClassicLineup(
  lineup: ValuedPlayer[],
  clientRunId?: string | null,
): Promise<SubmitLineupResult | { ok: false; skipped?: boolean; message?: string }> {
  try {
    const seats = toLineupPayload(lineup);
    if (!seats) {
      console.error('[leaderboard] submit skipped: incomplete_lineup', {
        count: lineup.length,
        ids: lineup.map((p) => p?.id ?? null),
      });
      return { ok: false, skipped: true, message: 'incomplete_lineup' };
    }

    const supabase = getSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user ?? null;
    if (!user || isAnonymousUser(user)) {
      return { ok: false, skipped: true };
    }

    const probeId = seats[0]!.player_id;
    const { data: probe, error: probeError } = await supabase
      .from('classic_player_seat_values')
      .select('player_id')
      .eq('player_id', probeId)
      .maybeSingle();
    if (probeError) {
      logLeaderboardError('seat probe failed', probeError, { player_id: probeId });
    } else if (!probe) {
      console.error(
        '[leaderboard] submit blocked: classic_player_seat_values is empty/missing player. Apply supabase/migrations/20260924_classic_player_seat_values_seed.sql',
        { player_id: probeId },
      );
      return { ok: false, message: 'seat_values_missing' };
    }

    const { data, error } = await supabase.rpc('submit_classic_leaderboard_lineup', {
      p_lineup: seats,
      p_client_run_id: clientRunId?.trim() || null,
    });
    if (error) {
      logLeaderboardError('submit failed', error, { seats });
      return { ok: false, message: error.message };
    }
    const payload = (data ?? {}) as Record<string, unknown>;
    if (payload.ok !== true) {
      console.error('[leaderboard] submit rejected by server', payload);
      return { ok: false, message: 'submit_rejected' };
    }
    console.info('[leaderboard] submit ok', {
      verifiedValue: payload.verified_value,
      isNewBest: payload.is_new_best,
      verifiedBest: payload.verified_best,
    });
    return {
      ok: true,
      verifiedValue: Math.max(0, Math.round(Number(payload.verified_value) || 0)),
      isNewBest: Boolean(payload.is_new_best),
      verifiedBest: Math.max(0, Math.round(Number(payload.verified_best) || 0)),
    };
  } catch (err) {
    console.error('[leaderboard] submit error', err);
    return { ok: false, message: 'submit_error' };
  }
}
