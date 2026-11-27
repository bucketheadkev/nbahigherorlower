'use client';

import type { MouseEventHandler } from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useBankBalance } from '@/hooks/useBankBalance';
import { useLocale } from '@/hooks/useLocale';
import { formatCash } from '@/lib/tradeup/bank';
import { ROLLOVER_GOAL } from '@/lib/tradeup/rollover';

interface HomeBankProgressProps {
  onOpenWall?: MouseEventHandler<HTMLButtonElement>;
  onOpenBoard?: MouseEventHandler<HTMLButtonElement>;
}

/**
 * Home vault meter — Road to $1B + Wall of Fame.
 * Destinations unchanged (board / wall).
 */
export function HomeBankProgress({ onOpenWall, onOpenBoard }: HomeBankProgressProps) {
  const { t } = useLocale();
  const { state } = useAccountAuth();
  const balance = useBankBalance(state.status);
  const pending = balance == null;
  const fill = pending ? 0 : Math.min(1, Math.max(0, balance / ROLLOVER_GOAL));
  const pct = Math.round(fill * 1000) / 10;
  const hasFill = !pending && fill > 0.015;

  return (
    <section
      className={`rh6-vault${pending ? ' is-pending' : ''}${hasFill ? ' has-fill' : ''}`}
      aria-busy={pending}
    >
      <button
        type="button"
        className="rh6-vault__main ui-tap"
        aria-label={t('home.bankProgressLabel')}
        onClick={onOpenBoard}
      >
        <span className="rh6-vault__kicker">
          {t('home.bankMoneyBefore')}
          <span className="rh6-vault__kicker-amt">{t('home.bankMoneyAmt')}</span>
          {t('home.bankMoneyAfter')}
        </span>
        <span className="rh6-vault__cash">{pending ? '—' : formatCash(balance)}</span>
        <span className="rh6-vault__track" aria-hidden>
          <span className="rh6-vault__fill" style={{ width: `${pct}%` }} />
        </span>
      </button>

      <button
        type="button"
        className="rh6-vault__wof ui-tap"
        aria-label={`${t('home.wallOfFame')}. ${t('home.wallOfFameBlurb')}`}
        onClick={onOpenWall}
      >
        <span className="rh6-vault__wof-title">{t('home.wallOfFame')}</span>
        <span className="rh6-vault__wof-hint">{t('home.wallOfFameBlurb')}</span>
      </button>
    </section>
  );
}
