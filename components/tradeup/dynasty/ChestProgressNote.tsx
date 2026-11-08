'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { dynastyAccountKey, useDynasty } from '@/hooks/useDynasty';
import { useLocale } from '@/hooks/useLocale';
import type { DynastyChest } from '@/lib/account/dynastyCloud';
import { previewRecordRun } from '@/lib/account/dynastyPreview';
import { CHEST_TIER_COLOR, CHEST_TIER_NAME, chestArtId } from '@/lib/tradeup/dynasty/chests';
import { dc } from '@/lib/tradeup/dynasty/copy';
import { ChestArt } from '../franchise/Chest';
import type { RunVerify } from './DynastySignOffer';

/**
 * Chest progress for the run that just finished, shown under the earnings and the signing offer.
 * The server awards it when the run is recorded; this only reads what it awarded for this run id.
 */
export function ChestProgressNote({
  clientRunId,
  lineup,
  runValue,
  verify,
}: {
  clientRunId: string;
  lineup: string[];
  runValue: number;
  verify: RunVerify;
}) {
  const { locale } = useLocale();
  const { state: account } = useAccountAuth();
  const accountKey = dynastyAccountKey(account);
  const dynasty = useDynasty(accountKey);
  const preview = accountKey === 'dynasty-preview';
  const { refresh } = dynasty;

  useEffect(() => {
    if (preview) previewRecordRun(clientRunId, lineup, runValue);
  }, [preview, clientRunId, lineup, runValue]);

  // Re-read once the run is recorded (that's when the server awards its progress).
  const asked = useRef(0);
  const award = dynasty.state?.runRewards.find((r) => r.clientRunId === clientRunId) ?? null;
  useEffect(() => {
    if (!accountKey || award) return;
    if (!preview && verify !== 'ok') return;
    if (asked.current >= 3) return;
    const id = window.setTimeout(() => {
      asked.current += 1;
      refresh();
    }, asked.current === 0 ? 0 : 1500);
    return () => window.clearTimeout(id);
  }, [accountKey, award, preview, verify, refresh, dynasty.state]);

  if (accountKey == null) {
    return <p className="dyn-run-note dyn-run-note--guest">{dc('chestsGuest', locale)}</p>;
  }
  const state = dynasty.state;
  if (!state?.chestsEnabled || !award) {
    return !preview && verify === 'pending' ? <p className="dyn-run-note">{dc('chestChecking', locale)}</p> : null;
  }

  const rules = state.chestRules;
  const earned = award.chestIds
    .map((id) => state.chests.find((c) => c.id === id))
    .filter((c): c is DynastyChest => c != null);
  const lang = locale === 'es' ? 'es' : 'en';

  return (
    <section className="dyn-run" aria-label={dc('chestProgress', locale)}>
      <div className="dyn-run__row">
        <span className="dyn-run__kicker">{dc('chestProgress', locale)}</span>
        <strong className="dyn-run__gain">{award.reason === 'too_soon' ? '+0' : `+${award.points}`}</strong>
      </div>
      <span className="dyn-next__bar dyn-run__bar" aria-hidden>
        {Array.from({ length: rules.pointsPerChest }, (_, i) => (
          <span key={i} className={i < state.chestProgress.points ? 'is-on' : ''} />
        ))}
      </span>
      {earned.length > 0 ? (
        <div className="dyn-run__earned">
          {earned.map((c) => (
            <span key={c.id} className="dyn-run__chest" style={{ '--tier': CHEST_TIER_COLOR[c.tier] } as CSSProperties}>
              <ChestArt chest={chestArtId(c.tier)} className="dyn-run__art" />
              <span>
                <strong>{dc('chestEarned', locale)}</strong>
                <em>{dc('chestEarnedLine', locale, { tier: CHEST_TIER_NAME[c.tier][lang] })}</em>
              </span>
            </span>
          ))}
        </div>
      ) : (
        <p className="dyn-run__line">
          {award.reason === 'too_soon'
            ? dc('tooSoon', locale)
            : dc(rules.pointsPerChest - state.chestProgress.points === 1 ? 'nextChestOne' : 'nextChestMany', locale, {
                n: rules.pointsPerChest - state.chestProgress.points,
              })}
        </p>
      )}
    </section>
  );
}
