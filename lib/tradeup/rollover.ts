/**
 * Rollover — every dollar a completed Classic Run is worth above $1,000,000,000 goes straight to
 * the Bank. No choice, no multiplier, nothing to lose. In-game Cash only.
 *
 * Signed-in players are paid by the server when the verified run is recorded
 * (supabase/migrations/20261026_2_rollover_run_bonus_rank_rewards.sql); guests on this device.
 */

import { appendLocalLedger, BANK_CHANGED_EVENT } from './bank';

export const ROLLOVER_GOAL = 1_000_000_000;

export function rolloverFor(teamValue: number): number {
  return Math.max(0, Math.round(teamValue) - ROLLOVER_GOAL);
}

/** Guest payout for one run (once per run). Returns the amount credited by this call. */
export function payLocalRollover(runRef: string, teamValue: number): number {
  const amount = rolloverFor(teamValue);
  if (amount <= 0) return 0;
  const paid = appendLocalLedger({ ref: runRef, amount, kind: 'classic_run_bonus' });
  if (paid) window.dispatchEvent(new Event(BANK_CHANGED_EVENT));
  return paid ? amount : 0;
}

const LEGACY_SURPLUS_KEY = 'oneb_surplus_v1';
const LEGACY_SLIP_KEY = 'oneb_wager_slip_v1';
const LEGACY_KEYS = ['oneb_wager_draft_v1', 'oneb_cash_table_wager_v1'];

/**
 * One-time cleanup of the retired on-device Risk It and Bet on Yourself data: runs still waiting
 * on the old choice are paid in full, an open slip gets its stake back, then the records go.
 */
export function retireLocalGambling(): void {
  if (typeof window === 'undefined') return;
  let changed = false;
  try {
    const surplus = JSON.parse(localStorage.getItem(LEGACY_SURPLUS_KEY) ?? 'null') as Record<
      string,
      { status?: string; runRef?: string; surplus?: number }
    > | null;
    for (const record of Object.values(surplus ?? {})) {
      if (record?.status === 'pending' && typeof record.runRef === 'string' && (record.surplus ?? 0) > 0) {
        changed = appendLocalLedger({ ref: record.runRef, amount: record.surplus!, kind: 'classic_run_bonus' }) || changed;
      }
    }
    const slip = JSON.parse(localStorage.getItem(LEGACY_SLIP_KEY) ?? 'null') as {
      id?: string;
      mode?: string;
      status?: string;
      totalStake?: number;
    } | null;
    if (slip?.mode === 'local' && slip.status === 'open' && typeof slip.id === 'string' && (slip.totalStake ?? 0) > 0) {
      changed = appendLocalLedger({ ref: slip.id, amount: slip.totalStake!, kind: 'cash_table_refund' }) || changed;
    }
    for (const key of [LEGACY_SURPLUS_KEY, LEGACY_SLIP_KEY, ...LEGACY_KEYS]) localStorage.removeItem(key);
  } catch {
    /* unreadable legacy data: leave it */
  }
  if (changed) window.dispatchEvent(new Event(BANK_CHANGED_EVENT));
}
