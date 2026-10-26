'use client';

import { useLocale } from '@/hooks/useLocale';

const COPY = {
  kicker: { en: 'CASH CUPS · OFFICIAL ENTRY', es: 'COPAS DE EFECTIVO · ENTRADA OFICIAL' },
  oneRun: { en: 'One run counts. Make it great.', es: 'Solo cuenta una partida. Que sea grande.' },
  noRerolls: { en: 'Rerolls off · one run counts', es: 'Sin cambios · solo cuenta una partida' },
};

/** Booth reminder during a Circuit league entry run. */
export function CircuitRunCard({ name, rerollsAllowed }: { name: string; rerollsAllowed: boolean }) {
  const { locale } = useLocale();
  const pick = (c: { en: string; es: string }) => (locale === 'es' ? c.es : c.en);
  return (
    <section className="circuit-run" aria-label={`${pick(COPY.kicker)} — ${name}`}>
      <p className="circuit-run__kicker">
        <span className="circuit-run__dot" aria-hidden />
        {pick(COPY.kicker)}
      </p>
      <p className="circuit-run__name">{name}</p>
      <p className="circuit-run__rule">{pick(rerollsAllowed ? COPY.oneRun : COPY.noRerolls)}</p>
    </section>
  );
}
