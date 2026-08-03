/**
 * Verifies trophy apply once-only + rank-record reset + sweep bonus semantics.
 * Run: npx tsx scripts/verify-trophy-apply.ts
 */
const store = new Map<string, string>();

(globalThis as unknown as { window: unknown }).window = globalThis;
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  get length() {
    return store.size;
  },
  clear() {
    store.clear();
  },
  getItem(key: string) {
    return store.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    store.set(key, value);
  },
  removeItem(key: string) {
    store.delete(key);
  },
  key() {
    return null;
  },
};

async function main() {
  const { applyMatchTrophyResult, getTrophyProfile } = await import('../lib/tradeup/trophyStorage');
  const {
    TROPHY_LOSS_PENALTY,
    TROPHY_SWEEP_BONUS,
    TROPHY_WIN_REWARD,
  } = await import('../lib/tradeup/ranks');

  let r = applyMatchTrophyResult('m1', true);
  if (!r.applied || r.delta !== TROPHY_WIN_REWARD) throw new Error('win delta');
  if (r.applied && r.transaction.sweepBonus !== 0) throw new Error('non-sweep bonus');
  if (r.profile.rankWins !== 1 || r.profile.wins !== 1) throw new Error('rank/lifetime win');

  r = applyMatchTrophyResult('m1', true);
  if (r.applied) throw new Error('duplicate apply');

  r = applyMatchTrophyResult('m2', false);
  if (!r.applied || r.delta !== -TROPHY_LOSS_PENALTY) throw new Error('loss delta');
  if (r.profile.rankWins !== 1 || r.profile.rankLosses !== 1) throw new Error('rank record');
  if (r.profile.wins !== 1 || r.profile.losses !== 1) throw new Error('lifetime');

  r = applyMatchTrophyResult('m_sweep', true, { sweep: true });
  if (!r.applied) throw new Error('sweep apply');
  if (r.delta !== TROPHY_WIN_REWARD + TROPHY_SWEEP_BONUS) {
    throw new Error(`sweep delta ${r.delta}`);
  }
  if (r.transaction.baseDelta !== TROPHY_WIN_REWARD) throw new Error('sweep base');
  if (r.transaction.sweepBonus !== TROPHY_SWEEP_BONUS) throw new Error('sweep bonus');
  if (r.profile.wins !== 2 || r.profile.rankWins !== 2) {
    throw new Error('sweep must count as one win');
  }

  r = applyMatchTrophyResult('m_sweep', true, { sweep: true });
  if (r.applied) throw new Error('duplicate sweep apply');

  // Non-sweep victory must not get bonus even if someone passes sweep:false explicitly
  r = applyMatchTrophyResult('m_win2', true, { sweep: false });
  if (!r.applied || r.delta !== TROPHY_WIN_REWARD) throw new Error('explicit non-sweep');

  const p = getTrophyProfile();
  store.set(
    'tradeup_trophy_profile_v1',
    JSON.stringify({
      ...p,
      trophies: 200,
      rankId: 'iron',
      rankWins: 4,
      rankLosses: 1,
      processedMatchIds: p.processedMatchIds,
    }),
  );

  // Promotion-causing sweep: 200 + 100 = 300, crosses 250 threshold; still one win.
  r = applyMatchTrophyResult('m_promo_sweep', true, { sweep: true });
  if (!r.applied || !r.promoted) throw new Error('expected sweep promotion');
  if (r.delta !== TROPHY_WIN_REWARD + TROPHY_SWEEP_BONUS) throw new Error('promo sweep delta');
  if (r.profile.rankWins !== 0 || r.profile.rankLosses !== 0) throw new Error('rank reset');
  if (
    !r.profile.history.some(
      (e) => e.kind === 'rank_record' && e.wins === 5 && e.losses === 1,
    )
  ) {
    throw new Error('rank record saved once for sweep promo');
  }
  if (r.profile.trophies !== 300) throw new Error(`trophy total ${r.profile.trophies}`);

  store.set(
    'tradeup_trophy_profile_v1',
    JSON.stringify({
      ...getTrophyProfile(),
      trophies: 230,
      rankId: 'iron',
      rankWins: 4,
      rankLosses: 1,
      processedMatchIds: getTrophyProfile().processedMatchIds,
    }),
  );

  r = applyMatchTrophyResult('m_promo', true);
  if (!r.applied || !r.promoted) throw new Error('expected promotion');
  if (r.profile.rankWins !== 0 || r.profile.rankLosses !== 0) throw new Error('rank reset');
  if (r.profile.trophies !== 280) throw new Error(`trophy total ${r.profile.trophies}`);

  store.set(
    'tradeup_trophy_profile_v1',
    JSON.stringify({
      ...getTrophyProfile(),
      trophies: 10,
      rankId: 'iron',
      rankWins: 0,
      rankLosses: 0,
    }),
  );
  r = applyMatchTrophyResult('m_floor', false);
  if (!r.applied || r.profile.trophies !== 0) throw new Error('floor');

  console.log('verify-trophy-apply: OK', {
    TROPHY_WIN_REWARD,
    TROPHY_LOSS_PENALTY,
    TROPHY_SWEEP_BONUS,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
