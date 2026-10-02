'use client';

import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { formatDollars, TIER_DOLLAR_BANDS } from '@/lib/tradeup/billionDollar';
import { hapticTap } from '@/lib/tradeup/haptics';
import type { PlayerTier } from '@/lib/tradeup/tiers';
import { ArenaAtmosphere } from './ArenaAtmosphere';

const TIER_ORDER: PlayerTier[] = ['F', 'D', 'C', 'B', 'A', 'S', 'GOAT'];

interface HowItWorksProps {
  onDone: () => void;
}

/** Short first-launch primer. Two taps: the goal, then the price tiers. */
export function HowItWorks({ onDone }: HowItWorksProps) {
  const { t } = useLocale();
  const [page, setPage] = useState<'goal' | 'prices'>('goal');
  const [tier, setTier] = useState<PlayerTier | null>(null);

  const press =
    (fn: () => void) => (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      hapticTap();
      fn();
    };

  const band = tier ? TIER_DOLLAR_BANDS[tier] : null;

  return (
    <div className="how-it-works" role="dialog" aria-modal="true" aria-labelledby="how-it-works-title">
      <div className="how-it-works__frame">
        <ArenaAtmosphere intensity="hub" />
        <div className="how-it-works__scroll">
          {page === 'goal' ? (
            <>
              <p className="how-it-works__eyebrow">{t('intro.eyebrow')}</p>
              <h1 id="how-it-works-title" className="how-it-works__title">
                {t('intro.title')}
              </h1>
              <p className="how-it-works__lead">{t('intro.goal')}</p>
              <ol className="how-it-works__steps how-it-works__steps--short">
                <li>
                  <span>1</span>
                  <p>{t('intro.step1')}</p>
                </li>
                <li>
                  <span>2</span>
                  <p>{t('intro.step2')}</p>
                </li>
                <li>
                  <span>3</span>
                  <p>{t('intro.step3')}</p>
                </li>
              </ol>
            </>
          ) : (
            <>
              <p className="how-it-works__eyebrow">{t('intro.valuesTitle')}</p>
              <h1 id="how-it-works-title" className="how-it-works__title how-it-works__title--plain">
                {t('intro.valuesCopy')}
              </h1>
              <p className="how-it-works__lead">{t('intro.sum')}</p>
              <div className="how-it-works__tier-row" role="group" aria-label={t('intro.tapTier')}>
                {TIER_ORDER.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={`how-it-works__tier${tier === name ? ' is-on' : ''}`}
                    aria-pressed={tier === name}
                    onPointerDown={press(() => setTier(name))}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <p className="how-it-works__range" aria-live="polite">
                {band
                  ? `${formatDollars(band.minDollars)} – ${formatDollars(band.maxDollars)}`
                  : t('intro.tapTier')}
              </p>
            </>
          )}
        </div>
        <div className="how-it-works__dock">
          {page === 'goal' ? (
            <button type="button" className="how-it-works__cta" onPointerDown={press(() => setPage('prices'))}>
              {t('intro.seePrices')}
            </button>
          ) : (
            <button type="button" className="how-it-works__cta" onPointerDown={press(onDone)}>
              {t('intro.cta')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
