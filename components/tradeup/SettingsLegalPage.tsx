'use client';

import { useEffect } from 'react';
import {
  PRIVACY_POLICY,
  SUPPORT_CONTENT,
} from '@/lib/legal/privacyPolicyContent';
import { hapticTap } from '@/lib/tradeup/haptics';
import '@/app/legal-pages.css';

export type LegalPageId = 'privacy' | 'support';

interface SettingsLegalPageProps {
  pageId: LegalPageId;
  onBack: () => void;
}

/** In-settings Privacy / Support overlay (same content as /privacy and /support). */
export function SettingsLegalPage({ pageId, onBack }: SettingsLegalPageProps) {
  const isPrivacy = pageId === 'privacy';
  const title = isPrivacy ? PRIVACY_POLICY.title : SUPPORT_CONTENT.title;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <div
      className="legal-page legal-page--overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header className="legal-page__header">
        <div className="legal-page__column">
          <button
            type="button"
            className="legal-page__back"
            onPointerDown={(event) => {
              if (event.pointerType === 'mouse' && event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              hapticTap();
              onBack();
            }}
            onClick={onBack}
          >
            ← Back
          </button>
          <div className="legal-page__titles">
            <p className="legal-page__kicker">KovA Studios</p>
            <h1 className="legal-page__title">{title}</h1>
          </div>
        </div>
      </header>

      <main className="legal-page__scroll">
        <div className="legal-page__column">
          {isPrivacy ? (
            <>
              <p className="legal-page__meta">{PRIVACY_POLICY.effectiveDate}</p>
              <p className="legal-page__intro">{PRIVACY_POLICY.intro}</p>
              {PRIVACY_POLICY.sections.map((section) => (
                <section key={section.heading} className="legal-page__section">
                  <h2 className="legal-page__heading">{section.heading}</h2>
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph.slice(0, 48)} className="legal-page__body">
                      {paragraph}
                    </p>
                  ))}
                  {section.bullets ? (
                    <ul className="legal-page__list">
                      {section.bullets.map((item) => (
                        <li key={item.slice(0, 48)}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                  {'trailing' in section && section.trailing ? (
                    <p className="legal-page__body">{section.trailing}</p>
                  ) : null}
                </section>
              ))}
            </>
          ) : (
            <>
              <p className="legal-page__intro">{SUPPORT_CONTENT.paragraphs[0]}</p>
              <p className="legal-page__contact">
                <a href="mailto:onebillionrun@gmail.com">{SUPPORT_CONTENT.paragraphs[1]}</a>
              </p>
              <p className="legal-page__body">{SUPPORT_CONTENT.paragraphs[2]}</p>
            </>
          )}
        </div>
      </main>
      <div className="legal-page__scroll-pad" aria-hidden />
    </div>
  );
}
