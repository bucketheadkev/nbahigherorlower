'use client';

import type { MouseEventHandler } from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useBankBalance } from '@/hooks/useBankBalance';
import { useLocale } from '@/hooks/useLocale';
import { formatCash } from '@/lib/tradeup/bank';
import { ROLLOVER_GOAL } from '@/lib/tradeup/rollover';

interface HomeBankProgressProps {
  /** Opens Wall of Fame preview. */
  onOpenWall?: MouseEventHandler<HTMLButtonElement>;
  /** Opens Bank leaderboard (optional — card body). */
  onOpenBoard?: MouseEventHandler<HTMLButtonElement>;
}

/**
 * Home Bank progress — WoF CTA opens wall preview; card can open Bank board.
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
    <div
      className={`rh5-bank${pending ? ' is-pending' : ''}${hasFill ? ' has-fill' : ''}`}
      aria-busy={pending}
    >
      <div className="rh5-bank__row">
        <button
          type="button"
          className="rh5-bank__body ui-tap"
          aria-label={t('home.bankProgressLabel')}
          onClick={onOpenBoard}
        >
          <span className="rh5-bank__label">
            {t('home.bankMoneyBefore')}
            <span className="rh5-bank__goal-amt">{t('home.bankMoneyAmt')}</span>
            {t('home.bankMoneyAfter')}
          </span>
          <span className="rh5-bank__value">{pending ? '—' : formatCash(balance)}</span>
          <span className="rh5-bank__track" aria-hidden>
            <span className="rh5-bank__fill" style={{ width: `${pct}%` }}>
              <span className="rh5-bank__glow" />
              <span className="rh5-bank__bubbles" aria-hidden>
                <i />
                <i />
                <i />
                <i />
              </span>
            </span>
          </span>
        </button>

        <div className="rh5-bank__wof-wrap">
          <button
            type="button"
            className="rh5-bank__wof ui-tap"
            aria-label={`${t('home.wallOfFame')}. ${t('home.wallOfFameBlurb')}`}
            onClick={onOpenWall}
          >
            {t('home.wallOfFame')}
          </button>
          <span className="rh5-bank__wof-blurb">{t('home.wallOfFameBlurb')}</span>
        </div>
      </div>
    </div>
  );
}
