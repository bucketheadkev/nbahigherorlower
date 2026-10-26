/**
 * Earnings summary + My Rank — server calls (20261024_3_franchise_v2_ranks.sql, 20261025_1_bank_rank.sql).
 * `collect_earnings` pays each pending item exactly once and reports only what that call credited.
 */

import { franchiseRpc } from './franchiseCloud';

export type EarningsKind = 'franchise_income' | 'franchise_bonus' | 'franchise_refund';

export interface EarningsItem {
  kind: EarningsKind;
  ref: string;
  teamId: string | null;
  hours: number;
  amount: number;
  /** Already in the Bank (legacy refunds) — listed for the record, not collected again. */
  credited: boolean;
}

const KINDS = new Set<EarningsKind>(['franchise_income', 'franchise_bonus', 'franchise_refund']);
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

function toItems(raw: unknown): EarningsItem[] {
  const list = (raw as { items?: unknown })?.items;
  return (Array.isArray(list) ? list : [])
    .map((v) => v as Record<string, unknown>)
    .filter((v) => KINDS.has(v.kind as EarningsKind) && num(v.amount) > 0)
    .map((v) => ({
      kind: v.kind as EarningsKind,
      ref: String(v.ref),
      teamId: typeof v.team_id === 'string' ? v.team_id : null,
      hours: num(v.hours),
      amount: num(v.amount),
      credited: Boolean(v.credited),
    }));
}

export const fetchPendingEarnings = () => franchiseRpc('get_pending_earnings', undefined, toItems);

export const collectEarnings = () =>
  franchiseRpc('collect_earnings', undefined, (raw) => ({
    items: toItems(raw),
    balance: num((raw as { balance?: unknown })?.balance),
  }));

/** Rank input: current Bank balance and the highest it has ever been (20261025_1_bank_rank.sql). */
export const fetchMyRank = () =>
  franchiseRpc('get_my_rank', undefined, (raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return { balance: num(r.balance), peak: num(r.peak) };
  });
