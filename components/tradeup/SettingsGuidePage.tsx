'use client';

import { useEffect } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { getGuideContent, GUIDE_NAV, type GuideId } from '@/lib/i18n/guides';
import { hapticTap } from '@/lib/tradeup/haptics';

interface SettingsGuidePageProps {
  guideId: GuideId;
  onBack: () => void;
}

/** Full-screen settings guide — How to Play / How Values Work. */
export function SettingsGuidePage({ guideId, onBack }: SettingsGuidePageProps) {
  const { locale } = useLocale();
  const nav = GUIDE_NAV[locale] ?? GUIDE_NAV.en;
  const content = getGuideContent(locale, guideId);
  const isValues = guideId === 'how-values-work';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <div
      className={`settings-guide${isValues ? ' settings-guide--values' : ' settings-guide--play'}`}
      role="dialog"
      aria-modal="true"
      aria-label={content.title}
    >
      <header className="settings-guide__header">
        <button
          type="button"
          className="settings-ctrl settings-guide__back"
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            hapticTap();
            onBack();
          }}
          onClick={onBack}
        >
          ← {nav.back}
        </button>
        <div className="settings-guide__titles">
          <p className="settings-guide__kicker">{content.kicker}</p>
          <h1 className="settings-guide__title">{content.title}</h1>
          <p className="settings-guide__tagline">{content.tagline}</p>
        </div>
      </header>

      <div className="settings-guide__scroll">
        {content.steps ? (
          <section className="sg-block" aria-label={nav.stepsLabel}>
            <p className="sg-block__label">{nav.stepsLabel}</p>
            <ol className="sg-steps">
              {content.steps.map((step, i) => (
                <li key={step.n} className="sg-step">
                  <span className="sg-step__index" aria-hidden>
                    {step.n}
                  </span>
                  <div className="sg-step__copy">
                    <strong className="sg-step__title">{step.title}</strong>
                    <span className="sg-step__line">{step.line}</span>
                  </div>
                  {i < content.steps!.length - 1 ? (
                    <span className="sg-step__rail" aria-hidden />
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {content.modes ? (
          <section className="sg-block" aria-label={nav.modesLabel}>
            <p className="sg-block__label">{nav.modesLabel}</p>
            <div className="sg-modes">
              {content.modes.map((mode) => (
                <article key={mode.title} className="sg-mode">
                  <span className="sg-mode__mark" aria-hidden>
                    {mode.mark}
                  </span>
                  <strong className="sg-mode__title">{mode.title}</strong>
                  <span className="sg-mode__line">{mode.line}</span>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {content.tips ? (
          <section className="sg-block" aria-label={nav.tipsLabel}>
            <p className="sg-block__label">{nav.tipsLabel}</p>
            <ul className="sg-tips">
              {content.tips.map((tip) => (
                <li key={tip} className="sg-tip">
                  {tip}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {content.pricing ? (
          <section className="sg-block" aria-label={nav.factsLabel}>
            <p className="sg-block__label">{nav.factsLabel}</p>
            <p className="sg-pricing">{content.pricing}</p>
          </section>
        ) : null}

        {content.facts ? (
          <section className="sg-block" aria-label={nav.factsLabel}>
            <p className="sg-block__label">{nav.factsLabel}</p>
            <div className="sg-facts">
              {content.facts.map((fact, i) => (
                <article key={fact.title} className="sg-fact">
                  <span className="sg-fact__num" aria-hidden>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="sg-fact__copy">
                    <strong className="sg-fact__title">{fact.title}</strong>
                    <span className="sg-fact__line">{fact.line}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {content.tiers ? (
          <section className="sg-block sg-block--tiers" aria-label={nav.tierRanges}>
            <div className="sg-tiers-head">
              <p className="sg-block__label">{nav.tierRanges}</p>
              <span className="sg-tiers-note">
                {locale === 'es' ? 'De menor a mayor' : 'Low → high'}
              </span>
            </div>
            <div className="sg-ladder" role="list">
              {content.tiers.map((row) => (
                <div
                  key={row.tier}
                  role="listitem"
                  className={`sg-ladder__row sg-ladder__row--${row.tier.toLowerCase()}`}
                >
                  <span className="sg-ladder__badge">{row.tier}</span>
                  <span className="sg-ladder__meta">
                    <span className="sg-ladder__blurb">{row.blurb}</span>
                    <span className="sg-ladder__range">{row.range}</span>
                  </span>
                  <span className="sg-ladder__bar" aria-hidden>
                    <span className="sg-ladder__fill" />
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {content.closing ? (
          <p className="settings-guide__closing">{content.closing}</p>
        ) : null}
        <div className="settings-guide__scroll-pad" aria-hidden />
      </div>
    </div>
  );
}
