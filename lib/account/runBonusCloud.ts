/**
 * Run Bonuses — server calls (supabase/migrations/20261026_2_rollover_run_bonus_rank_rewards.sql).
 * The server picks the bonus, judges the verified run and pays once; the app only shows it.
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { BANK_CHANGED_EVENT } from '@/lib/tradeup/bank';
import { isRunBonusId, type RunBonusId } from '@/lib/tradeup/runBonuses';

const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);

export type RunBonusStatus = 'open' | 'completed' | 'missed';

export interface RunBonusAssignment {
  id: string;
  bonusId: RunBonusId;
  status: RunBonusStatus;
  payout: number;
  /** The Classic run it was judged on, once settled. */
  clientRunId: string | null;
}

export type RunBonusResult = { ok: true; assignment: RunBonusAssignment | null } | { ok: false; reason: 'unavailable' | 'error' };

function toAssignment(raw: unknown): RunBonusAssignment | null {
  const row = (raw ?? {}) as Record<string, unknown>;
  if (!isRunBonusId(row.bonus_id) || typeof row.assignment_id !== 'string') return null;
  const status = row.status === 'completed' || row.status === 'missed' ? row.status : 'open';
  return {
    id: row.assignment_id,
    bonusId: row.bonus_id,
    status,
    payout: Number(row.payout) || 0,
    clientRunId: typeof row.client_run_id === 'string' ? row.client_run_id : null,
  };
}

async function call(fn: string, args?: Record<string, unknown>): Promise<RunBonusResult> {
  try {
    const { data, error } = await getSupabaseBrowserClient().rpc(fn, args);
    if (error) {
      if (error.code && MISSING_FUNCTION_CODES.has(error.code)) return { ok: false, reason: 'unavailable' };
      console.error(`[run-bonus] ${fn} failed`, error.message);
      return { ok: false, reason: 'error' };
    }
    return { ok: true, assignment: toAssignment(data) };
  } catch (err) {
    console.error(`[run-bonus] ${fn} error`, err);
    return { ok: false, reason: 'error' };
  }
}

/** A run's verdict still on its way; the next run's bonus waits for it so reroll use isn't lost. */
let inFlight: Promise<unknown> | null = null;

/** The bonus for the next (or unfinished) Classic run. The same one comes back until a run is done. */
export async function fetchRunBonus(): Promise<RunBonusResult> {
  if (inFlight) await inFlight.catch(() => undefined);
  return call('get_run_bonus');
}

/** After the run is recorded: judge it and pay a completed bonus (once). */
export async function settleRunBonus(clientRunId: string, rerollsUsed: boolean): Promise<RunBonusResult> {
  const pending = call('settle_run_bonus', { p_client_run_id: clientRunId, p_rerolls_used: rerollsUsed });
  inFlight = pending;
  const result = await pending.finally(() => {
    if (inFlight === pending) inFlight = null;
  });
  if (result.ok && result.assignment?.status === 'completed' && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(BANK_CHANGED_EVENT));
  }
  return result;
}
