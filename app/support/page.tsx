import type { Metadata } from 'next';
import { LegalPageShell } from '@/components/legal/LegalPageShell';
import { SUPPORT_CONTENT } from '@/lib/legal/privacyPolicyContent';
import '../legal-pages.css';

export const metadata: Metadata = {
  title: 'Support — 1B Run',
  description: 'Contact KovA Studios for 1B Run support.',
};

export default function SupportPage() {
  return (
    <LegalPageShell kicker="KovA Studios" title={SUPPORT_CONTENT.title}>
      <p className="legal-page__intro">{SUPPORT_CONTENT.paragraphs[0]}</p>
      <p className="legal-page__contact">
        <a href="mailto:onebillionrun@gmail.com">{SUPPORT_CONTENT.paragraphs[1]}</a>
      </p>
      <p className="legal-page__body">{SUPPORT_CONTENT.paragraphs[2]}</p>
    </LegalPageShell>
  );
}
