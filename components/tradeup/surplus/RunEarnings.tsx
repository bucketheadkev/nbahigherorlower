'use client';

import { useEffect, useRef } from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useBankBalance } from '@/hooks/useBankBalance';
import { useLocale } from '@/hooks/useLocale';
import { useSurplus } from '@/hooks/useSurplus';
import type { MessageKey } from '@/lib/i18n/messages';
import { challengeReward, formatCash } from '@/lib/tradeup/bank';
import { surplusFor } from '@/lib/tradeup/surplusSpin';
import { TickerNumber } from '../onboarding/ticker';
import { SurplusDecision } from './SurplusDecision';
import { WagerResults, wagersNet, type RunWagers } from '../wagers/WagerResults';

export interface RunEarningsData {
  /** Stable per run; also the server client_run_id. */
  runRef: string;
  runValue: number;
  achievementIds: string[];
  /** Bet on Yourself slip for this run (settles independently of Surplus Spin). */
  wagers: RunWagers;
  submit: 'pending' | 'ok' | 'skipped' | 'failed';
  /** Server-priced team value once the submit lands. */
  verifiedValue?: number | null;
  /** Set when this run is a Circuit league entry. */
  circuit?: { name: string } | null;
}

type Copy = { en: string; es: string };

const COPY = {
  title: { en: 'RUN EARNINGS', es: 'GANANCIAS DE LA PARTIDA' },
  achievements: { en: 'Achievements', es: 'Logros' },
  change: { en: 'Bank change', es: 'Cambio en el Banco' },
  balance: { en: 'Bank', es: 'Banco' },
  circuit: { en: 'Cash Leagues · {name}', es: 'Ligas de efectivo · {name}' },
  circuitPending: { en: 'Submitting your official entry…', es: 'Enviando tu entrada oficial…' },
  circuitOk: { en: 'Official entry recorded · standings update live', es: 'Entrada oficial registrada · la tabla se actualiza en vivo' },
  circuitFailed: {
    en: "Couldn't submit — your entry run is still open in Cash Leagues",
    es: 'No se pudo enviar: tu partida de entrada sigue abierta en Ligas de efectivo',
  },
} satisfies Record<string, Copy>;

function pick(copy: Copy, locale: string): string {
  return locale === 'es' ? copy.es : copy.en;
}

function signed(amount: number): string {
  if (amount === 0) return formatCash(0);
  return `${amount > 0 ? '+' : '−'}${formatCash(Math.abs(amount))}`;
}

export function RunEarnings({ data, reduceMotion }: { data: RunEarningsData; reduceMotion: boolean }) {
  const { locale, t } = useLocale();
  const { state: account } = useAccountAuth();
  const permanent = account.status === 'permanent';
  const balance = useBankBalance(permanent);
  const surplus = surplusFor(data.runValue);
  const surplusFlow = useSurplus({
    runRef: data.runRef,
    runValue: data.runValue,
    permanent,
    ready: surplus > 0 && account.status !== 'loading' && (!permanent || data.submit !== 'pending'),
    submitFailed: data.submit === 'failed',
    verifiedValue: data.verifiedValue ?? null,
  });

  const achievementCash = data.achievementIds.reduce((sum, id) => sum + challengeReward(id), 0);
  const surplusPaid =
    surplusFlow.state?.status === 'resolved' ? surplusFlow.state.payout ?? 0 : 0;
  const change = achievementCash + wagersNet(data.wagers) + surplusPaid;
  const hasWagers = data.wagers.status !== 'none';
  const hasRows = data.achievementIds.length > 0 || Boolean(data.circuit);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      ref.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    }, 350);
    return () => window.clearTimeout(id);
  }, [reduceMotion]);

  if (surplus <= 0 && !hasRows && !hasWagers) return null;

  return (
    <section ref={ref} className="run-earn" aria-label={pick(COPY.title, locale)}>
      <p className="run-earn__title">{pick(COPY.title, locale)}</p>

      {surplus > 0 && surplusFlow.error !== 'below' ? (
        <SurplusDecision
          surplus={surplus}
          mode={surplusFlow.mode}
          state={surplusFlow.state}
          busy={surplusFlow.busy}
          error={surplusFlow.error}
          reduceMotion={reduceMotion}
          onChoose={surplusFlow.choose}
          onRetry={() => void surplusFlow.retry()}
        />
      ) : null}

      {hasRows ? (
        <ul className="run-earn__rows">
          {data.circuit ? (
            <li className={`run-earn__row run-earn__row--circuit${data.submit === 'pending' ? ' is-pending' : ''}`}>
              <div>
                <span className="run-earn__label">
                  {pick(COPY.circuit, locale).replace('{name}', data.circuit.name)}
                </span>
                <span className="run-earn__detail">
                  {pick(
                    data.submit === 'ok'
                      ? COPY.circuitOk
                      : data.submit === 'pending'
                        ? COPY.circuitPending
                        : COPY.circuitFailed,
                    locale,
                  )}
                </span>
              </div>
              <strong className="run-earn__value">{formatCash(data.runValue)}</strong>
            </li>
          ) : null}
          {data.achievementIds.length > 0 ? (
            <li className="run-earn__row">
              <div>
                <span className="run-earn__label">
                  {pick(COPY.achievements, locale)} · {data.achievementIds.length}
                </span>
                {data.achievementIds.map((id) => (
                  <span key={id} className="run-earn__detail run-earn__detail--goal">
                    {t(`challenge.${id}.blurb` as MessageKey)}
                  </span>
                ))}
              </div>
              <strong className="run-earn__value is-up">{signed(achievementCash)}</strong>
            </li>
          ) : null}
        </ul>
      ) : null}

      <WagerResults wagers={data.wagers} reduceMotion={reduceMotion} />

      <div className="run-earn__foot">
        <div>
          <span>{pick(COPY.change, locale)}</span>
          <strong className={change >= 0 ? 'is-up' : 'is-down'}>{signed(change)}</strong>
        </div>
        {balance !== null ? (
          <div className="run-earn__balance">
            <span>{pick(COPY.balance, locale)}</span>
            <TickerNumber
              className="run-earn__balance-value"
              value={balance}
              duration={reduceMotion ? 0 : 900}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
