/**
 * Award Classic-run XP once per runRef. Safe to call from recordClassicRun.
 * Credits XP/coins immediately. No hub "coins collected" overlay — rewards
 * are shown on the evaluation screen instead.
 */

import { calculateClassicRunRewards, COINS_LEVEL_UP } from './config';
import {
  applyXpAward,
  hasAwardedXpRun,
  saveXpProfile,
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

  const levelsGained = Math.max(0, applied.toLevel - applied.fromLevel);
  const levelCoins = levelsGained * COINS_LEVEL_UP;
  let profile = applied.profile;
  if (levelCoins > 0) {
    profile = saveXpProfile({
      ...applied.profile,
      coins: applied.profile.coins + levelCoins,
    });
  }

  const coinsFromRun = breakdown.coins + levelCoins;
  // Permanent: server awards from verified leaderboard run (fixed 20 / 50).
  // Level-up coins stay local until a server level system exists.
  if (breakdown.coins > 0) {
    void import('./cloudCoins')
      .then((mod) => mod.awardClassicRunCoins(ref))
      .catch(() => {
        /* node scripts / offline — local credit already applied */
      });
  }

  return {
    awarded: true,
    breakdown: { ...breakdown, coins: coinsFromRun },
    profile,
    fromLevel: applied.fromLevel,
    toLevel: applied.toLevel,
    pending: null,
  };
}
