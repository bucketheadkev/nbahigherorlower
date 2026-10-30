'use client';

import { useLocale } from '@/hooks/useLocale';
import { formatCash } from '@/lib/tradeup/bank';
import { TickerNumber } from '../onboarding/ticker';

type Copy = { en: string; es: string };

const COPY = {
  label: { en: 'ROLLOVER EARNED', es: 'EXCEDENTE GANADO' },
  rule: {
    en: 'Every dollar above $1 billion goes straight to your Bank.',
    es: 'Cada dólar por encima de $1,000 millones va directo a tu Banco.',
  },
} satisfies Record<string, Copy>;

const plus = (value: number) => `+${formatCash(value)}`;

/** The run's guaranteed payout above $1B: counts up from $0 with a green glow. */
export function RolloverPanel({
  amount,
  status,
  reduceMotion,
}: {
  amount: number;
  /** Small line under the rule, e.g. "Deposited to your Bank". */
  status?: string | null;
  reduceMotion: boolean;
}) {
  const { locale } = useLocale();
  return (
    <div className={`rollover${reduceMotion ? ' is-still' : ''}`}>
      <span className="rollover__shine" aria-hidden />
      <p className="rollover__label">{locale === 'es' ? COPY.label.es : COPY.label.en}</p>
      <p className="rollover__amount" aria-label={plus(amount)}>
        <TickerNumber value={amount} from={reduceMotion ? undefined : 0} duration={1500} format={plus} />
      </p>
      <p className="rollover__rule">{locale === 'es' ? COPY.rule.es : COPY.rule.en}</p>
      {status ? <p className="rollover__status">{status}</p> : null}
    </div>
  );
}
