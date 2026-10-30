/**
 * Rank-up rewards. Signed-in players claim from the server (claim_rank_rewards in
 * supabase/migrations/20261026_2_rollover_run_bonus_rank_rewards.sql); guests on this device.
 * Each rank pays once, ever — falling and climbing back never pays again.
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { appendLocalLedger, BANK_CHANGED_EVENT, getBankBalance, getLocalLedgerRefs } from '@/lib/tradeup/bank';
import { RANKS, type RankId } from '@/lib/tradeup/rank/config';
import { localBankPeak } from '@/lib/tradeup/rank/local';

const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);
const KEY_PREFIX = 'bankrank:';

export interface RankRewardItem {
  rankId: RankId;
  reward: number;
}

export type RankClaim =
  | { ok: true; items: RankRewardItem[]; claimed: RankId[] }
  | { ok: false; reason: 'unavailable' | 'error' };

const isRank = (v: unknown): v is RankId => typeof v === 'string' && RANKS.some((r) => r.id === v);

/** Pays every rank reached and not yet rewarded. Returns what this call credited. */
export async function claimRankRewards(permanent: boolean): Promise<RankClaim> {
  if (!permanent) return claimLocal();
  try {
    const { data, error } = await getSupabaseBrowserClient().rpc('claim_rank_rewards');
    if (error) {
      if (error.code && MISSING_FUNCTION_CODES.has(error.code)) return { ok: false, reason: 'unavailable' };
      console.error('[rank-rewards] claim failed', error.message);
      return { ok: false, reason: 'error' };
    }
    const row = (data ?? {}) as Record<string, unknown>;
    const items = (Array.isArray(row.items) ? row.items : [])
      .map((i) => i as Record<string, unknown>)
      .filter((i) => isRank(i.rank_id))
      .map((i) => ({ rankId: i.rank_id as RankId, reward: Number(i.reward) || 0 }));
    const claimed = (Array.isArray(row.claimed) ? row.claimed : []).filter(isRank);
    if (items.length > 0 && typeof window !== 'undefined') window.dispatchEvent(new Event(BANK_CHANGED_EVENT));
    return { ok: true, items, claimed };
  } catch (err) {
    console.error('[rank-rewards] claim error', err);
    return { ok: false, reason: 'error' };
  }
}

function claimLocal(): RankClaim {
  if (typeof window === 'undefined') return { ok: true, items: [], claimed: [] };
  const items: RankRewardItem[] = [];
  // A reward raises the Bank; look again until nothing new qualifies.
  for (let pass = 0; pass < RANKS.length; pass += 1) {
    const peak = localBankPeak(getBankBalance());
    const before = items.length;
    for (const def of RANKS) {
      if (def.reward <= 0 || peak < def.minBank) continue;
      if (appendLocalLedger({ ref: `${KEY_PREFIX}${def.id}`, amount: def.reward, kind: 'rank_reward' })) {
        items.push({ rankId: def.id, reward: def.reward });
      }
    }
    if (items.length === before) break;
  }
  if (items.length > 0) window.dispatchEvent(new Event(BANK_CHANGED_EVENT));
  const claimed = [...getLocalLedgerRefs('rank_reward')]
    .filter((ref) => ref.startsWith(KEY_PREFIX))
    .map((ref) => ref.slice(KEY_PREFIX.length))
    .filter(isRank);
  return { ok: true, items, claimed };
}
