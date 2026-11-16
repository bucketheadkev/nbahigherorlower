/**
 * Award Classic-run XP once per runRef. Safe to call from recordClassicRun.
 * Does not modify evaluation layout — queues a slim XP/reward reveal for after settle.
 */

import { calculateClassicRunRewards } from './config';
import {
  applyXpAward,
  enqueuePendingXpReveal,
  hasAwardedXpRun,
  type PendingXpReveal,
  type XpProfile,
} from './storage';

export interface ClassicXpAwardResult {
  awarded: boolean;
  reason?: 'duplicate' | 'invalid' | 'empty';
  breakdown?: ReturnType<typeof calculateClassicRunRewards>;
  profile?: XpProfile;
  fromLevel?: number;
  toLevel?: number;
  pending?: PendingXpReveal | null;
}

/**
 * Credit XP + coins for a finished Classic run.
 * Idempotent on `runRef` (same key as rollover / earnings).
 */
export function awardClassicRunXp(runRef: string, teamValue: number): ClassicXpAwardResult {
  const ref = typeof runRef === 'string' ? runRef.trim() : '';
  if (!ref) return { awarded: false, reason: 'invalid' };
  if (!Number.isFinite(teamValue) || teamValue < 0) return { awarded: false, reason: 'invalid' };
  if (hasAwardedXpRun(ref)) return { awarded: false, reason: 'duplicate' };

  const breakdown = calculateClassicRunRewards(teamValue);
  if (breakdown.total <= 0) return { awarded: false, reason: 'empty', breakdown };

  const applied = applyXpAward({
    runRef: ref,
    xp: breakdown.total,
    coins: breakdown.coins,
  });
  if (!applied) return { awarded: false, reason: 'duplicate', breakdown };

  const pendingItem: PendingXpReveal = {
    id: `xp_${ref}`,
    runRef: ref,
    fromLevel: applied.fromLevel,
    toLevel: applied.toLevel,
    fromTotalXp: applied.fromTotalXp,
    toTotalXp: applied.toTotalXp,
    xpFromRun: breakdown.total,
    coinsFromRun: breakdown.coins,
    coinsBefore: applied.coinsBefore,
    coinsAfter: applied.coinsAfter,
    createdAt: Date.now(),
  };
  enqueuePendingXpReveal(pendingItem);

  return {
    awarded: true,
    breakdown,
    profile: applied.profile,
    fromLevel: applied.fromLevel,
    toLevel: applied.toLevel,
    pending: pendingItem,
  };
}
