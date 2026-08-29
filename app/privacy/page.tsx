import type { Metadata } from 'next';
import { LegalPageShell } from '@/components/legal/LegalPageShell';
import { PRIVACY_POLICY } from '@/lib/legal/privacyPolicyContent';
import '../legal-pages.css';

export const metadata: Metadata = {
  title: 'Privacy Policy — $1B RUN',
  description: 'Privacy Policy for 1B Run by KovA Studios.',
};

export default function PrivacyPage() {
  return (
    <LegalPageShell kicker="KovA Studios" title={PRIVACY_POLICY.title}>
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
    </LegalPageShell>
  );
}
