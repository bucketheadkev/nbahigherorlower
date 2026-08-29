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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <div
      className="settings-guide"
      role="dialog"
      aria-modal="true"
      aria-label={content.title}
    >
      <header className="settings-guide__header">
        <button
          type="button"
          className="settings-guide__back"
          onPointerDown={() => {
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
          <section className="settings-guide__section" aria-label="Tiers">
            <h2 className="settings-guide__heading">{nav.tierRanges}</h2>
            <ul className="settings-guide__tiers">
              {content.tiers.map((row) => (
                <li
                  key={row.tier}
                  className={`settings-guide__tier settings-guide__tier--${row.tier.toLowerCase()}`}
                >
                  <span className="settings-guide__tier-badge">{row.tier}</span>
                  <div className="settings-guide__tier-copy">
                    <span className="settings-guide__tier-range">{row.range}</span>
                    <span className="settings-guide__tier-blurb">{row.blurb}</span>
                  </div>
                </li>
              ))}
            </ul>
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
