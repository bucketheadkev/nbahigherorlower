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
      className={`settings-guide${isValues ? ' settings-guide--values' : ''}`}
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
        >
          ← {nav.back}
        </button>
        <div className="settings-guide__titles">
          <p className="settings-guide__kicker">{content.kicker}</p>
          <h1 className="settings-guide__title">{content.title}</h1>
        </div>
      </header>

      <div className="settings-guide__scroll">
        <p className="settings-guide__intro">{content.intro}</p>

        {content.sections.map((section) => (
          <section key={section.heading} className="settings-guide__section">
            <h2 className="settings-guide__heading">{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph.slice(0, 48)} className="settings-guide__body">
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        {content.tiers ? (
          <section
            className="settings-guide__section settings-guide__section--tiers"
            aria-label={nav.tierRanges}
          >
            <div className="settings-guide__ladder-head">
              <h2 className="settings-guide__heading">{nav.tierRanges}</h2>
              <p className="settings-guide__ladder-note">
                {locale === 'es' ? 'De menor a mayor' : 'Low to high'}
              </p>
            </div>

            <div className="settings-guide__ladder" role="table" aria-label={nav.tierRanges}>
              <div className="settings-guide__ladder-cols" aria-hidden>
                <span>Tier</span>
                <span>{locale === 'es' ? 'Nivel' : 'Level'}</span>
                <span>{locale === 'es' ? 'Rango' : 'Range'}</span>
              </div>
              {content.tiers.map((row) => (
                <div
                  key={row.tier}
                  role="row"
                  className={`settings-guide__ladder-row settings-guide__ladder-row--${row.tier.toLowerCase()}`}
                >
                  <span className="settings-guide__ladder-tier" role="cell">
                    {row.tier}
                  </span>
                  <span className="settings-guide__ladder-blurb" role="cell">
                    {row.blurb}
                  </span>
                  <span className="settings-guide__ladder-range" role="cell">
                    {row.range}
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
