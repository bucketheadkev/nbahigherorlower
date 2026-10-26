/**
 * Wall of Fame (supabase/migrations/20261018_2, 20261018_5, 20261025_5).
 * Eligibility happens server-side when a Bank reaches $1B; the public wall lists signed players.
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);

export interface WallEntry {
  /** Signing order: No. 1 signed first. */
  number: number;
  signature: string;
  username: string;
  signedAt: string;
}

export interface WallPage {
  total: number;
  entries: WallEntry[];
}

export interface MyWallStatus {
  /** Reached a $1B Bank (may sign). */
  inductedAt: string | null;
  signature: string | null;
  signedAt: string | null;
  number: number | null;
}

type Failure = { ok: false; reason: 'unavailable' | 'error' };

function failure(error: { code?: string; message?: string }): Failure {
  if (error.code && MISSING_FUNCTION_CODES.has(error.code)) return { ok: false, reason: 'unavailable' };
  console.error('[wall-of-fame]', error.message);
  return { ok: false, reason: 'error' };
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const num = (v: unknown) => (typeof v === 'number' ? v : v == null ? null : Number(v) || null);

export async function fetchWallPage(offset: number, limit = 120): Promise<{ ok: true; page: WallPage } | Failure> {
  try {
    const { data, error } = await getSupabaseBrowserClient().rpc('get_wall_of_fame_page', {
      p_offset: offset,
      p_limit: limit,
    });
    if (error) return failure(error);
    const raw = (data ?? {}) as Record<string, unknown>;
    const rows = Array.isArray(raw.entries) ? (raw.entries as Array<Record<string, unknown>>) : [];
    return {
      ok: true,
      page: {
        total: Number(raw.total) || 0,
        entries: rows
          .filter((row) => str(row.signature) && str(row.username))
          .map((row) => ({
            number: Number(row.number) || 0,
            signature: row.signature as string,
            username: row.username as string,
            signedAt: String(row.signed_at ?? ''),
          })),
      },
    };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export async function fetchMyWallStatus(): Promise<{ ok: true; status: MyWallStatus } | Failure> {
  try {
    const { data, error } = await getSupabaseBrowserClient().rpc('get_my_wall_signature');
    if (error) return failure(error);
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      status: {
        inductedAt: str(row.inducted_at),
        signature: str(row.display_name),
        signedAt: str(row.signed_at),
        number: num(row.number),
      },
    };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export type SignFailure = 'unavailable' | 'invalid' | 'taken' | 'not_inducted' | 'account' | 'error';

/** Signs the public wall once. Repeat calls return the existing signature. */
export async function signWallOfFame(
  name: string,
): Promise<{ ok: true; signature: string; signedAt: string; number: number | null } | { ok: false; reason: SignFailure }> {
  try {
    const { data, error } = await getSupabaseBrowserClient().rpc('stamp_wall_of_fame', { p_name: name });
    if (error) {
      const msg = error.message ?? '';
      if (error.code && MISSING_FUNCTION_CODES.has(error.code)) return { ok: false, reason: 'unavailable' };
      if (msg.includes('invalid_name')) return { ok: false, reason: 'invalid' };
      if (msg.includes('name_taken')) return { ok: false, reason: 'taken' };
      if (msg.includes('not_inducted')) return { ok: false, reason: 'not_inducted' };
      if (msg.includes('permanent_account_required')) return { ok: false, reason: 'account' };
      console.error('[wall-of-fame] sign', msg);
      return { ok: false, reason: 'error' };
    }
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      signature: String(row.display_name ?? name),
      signedAt: String(row.signed_at ?? ''),
      number: num(row.number),
    };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
