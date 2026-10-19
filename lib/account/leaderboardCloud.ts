/**
 * Verified Classic run submission via Supabase RPC.
 * Clients submit lineups (player ids + seats); server computes the value.
 * The public leaderboard now ranks Bank totals (see bankLeaderboardCloud).
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isAnonymousUser } from '@/lib/account/userKind';
import { LINEUP_POSITIONS } from '@/lib/tradeup/startingLineup';
import type { ValuedPlayer } from '@/lib/tradeup/billionDollar';
import type { Position } from '@/lib/tradeup/types';

export interface SubmitLineupResult {
  ok: true;
  verifiedValue: number;
  isNewBest: boolean;
  verifiedBest: number;
}

type LineupSeat = { player_id: string; slot: Position };

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

    const ids = seats.map((seat) => seat.player_id);
    const { data: catalog, error: probeError } = await supabase
      .from('classic_player_seat_values')
      .select('player_id, value_pg, value_sg, value_sf, value_pf, value_c')
      .in('player_id', ids);
    if (probeError) {
      logLeaderboardError('seat probe failed', probeError, ids.join(','));
    } else {
      const byId = new Map(
        (catalog ?? []).map((row) => [row.player_id as string, row as Record<string, unknown>]),
      );
      const missing = seats.filter((seat) => {
        const row = byId.get(seat.player_id);
        if (!row) return true;
        const value = row[`value_${seat.slot.toLowerCase()}`];
        return value == null;
      });
      if (missing.length > 0 || (catalog ?? []).length === 0) {
        console.error(
          `[leaderboard] submit blocked: unknown_player ${missing
            .map((seat) => `${seat.slot}:${seat.player_id}`)
            .join(', ')}. Apply supabase/migrations/20260927_classic_seat_lookup.sql`,
        );
        return { ok: false, message: 'unknown_player' };
      }
    }

    const { data, error } = await supabase.rpc('submit_classic_leaderboard_lineup', {
      p_lineup: seats,
      p_client_run_id: clientRunId?.trim() || null,
    });
    if (error) {
      logLeaderboardError(
        'submit failed',
        error,
        seats.map((seat) => `${seat.slot}:${seat.player_id}`).join(','),
      );
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
