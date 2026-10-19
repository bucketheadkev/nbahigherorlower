/**
 * Wall of Fame reads (supabase/migrations/20261018_2_wall_of_fame.sql).
 * Induction itself happens server-side when a Bank balance reaches $1B.
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);

export interface WallInductee {
  username: string;
  inductedAt: string;
}

type Failure = { ok: false; reason: 'unavailable' | 'error' };

function failure(error: { code?: string; message?: string }): Failure {
  if (error.code && MISSING_FUNCTION_CODES.has(error.code)) return { ok: false, reason: 'unavailable' };
  console.error('[wall-of-fame]', error.message);
  return { ok: false, reason: 'error' };
}

export async function fetchWallOfFame(): Promise<{ ok: true; entries: WallInductee[] } | Failure> {
  try {
    const { data, error } = await getSupabaseBrowserClient().rpc('get_wall_of_fame', { p_limit: 500 });
    if (error) return failure(error);
    const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
    return {
      ok: true,
      entries: rows
        .filter((row) => typeof row.username === 'string' && row.username)
        .map((row) => ({ username: row.username as string, inductedAt: String(row.inducted_at ?? '') })),
    };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** The signed-in player's induction and stamped display name (20261018_5_wall_signature.sql). */
export async function fetchMySignature(): Promise<
  { ok: true; inductedAt: string | null; displayName: string | null; signedAt: string | null } | Failure
> {
  try {
    const { data, error } = await getSupabaseBrowserClient().rpc('get_my_wall_signature');
    if (error) return failure(error);
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      inductedAt: typeof row.inducted_at === 'string' ? row.inducted_at : null,
      displayName: typeof row.display_name === 'string' ? row.display_name : null,
      signedAt: typeof row.signed_at === 'string' ? row.signed_at : null,
    };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** Stamps the player's name on the public wall once. Repeat calls return the existing name. */
export async function stampWallOfFame(
  name: string,
): Promise<{ ok: true; displayName: string; signedAt: string } | { ok: false; reason: 'unavailable' | 'invalid' | 'not_inducted' | 'error' }> {
  try {
    const { data, error } = await getSupabaseBrowserClient().rpc('stamp_wall_of_fame', { p_name: name });
    if (error) {
      if (error.code && MISSING_FUNCTION_CODES.has(error.code)) return { ok: false, reason: 'unavailable' };
      if (error.message?.includes('invalid_name')) return { ok: false, reason: 'invalid' };
      if (error.message?.includes('not_inducted')) return { ok: false, reason: 'not_inducted' };
      console.error('[wall-of-fame] stamp', error.message);
      return { ok: false, reason: 'error' };
    }
    const row = (data ?? {}) as Record<string, unknown>;
    return { ok: true, displayName: String(row.display_name ?? name), signedAt: String(row.signed_at ?? '') };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** The signed-in player's induction time, or null when not inducted. */
export async function fetchMyInduction(): Promise<{ ok: true; inductedAt: string | null } | Failure> {
  try {
    const { data, error } = await getSupabaseBrowserClient().rpc('get_my_wall_of_fame');
    if (error) return failure(error);
    return { ok: true, inductedAt: typeof data === 'string' && data ? data : null };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
