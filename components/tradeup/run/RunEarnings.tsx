'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useBankBalance } from '@/hooks/useBankBalance';
import { useLocale } from '@/hooks/useLocale';
import type { MessageKey } from '@/lib/i18n/messages';
import { challengeReward, formatCash } from '@/lib/tradeup/bank';
import { rolloverFor } from '@/lib/tradeup/rollover';
import { RUN_BONUS_BY_ID, type RunBonusId } from '@/lib/tradeup/runBonuses';
import { TickerNumber } from '../onboarding/ticker';
import { RolloverPanel } from './RolloverPanel';

export interface RunBonusOutcome {
  /** pending = waiting on the server's verdict for this run. */
  status: 'none' | 'pending' | 'completed' | 'missed' | 'error';
  bonusId: RunBonusId | null;
  payout: number;
}

export interface RunEarningsData {
  /** Stable per run; also the server client_run_id. */
  runRef: string;
  runValue: number;
  achievementIds: string[];
  submit: 'pending' | 'ok' | 'skipped' | 'failed';
  /** Server-priced team value once the submit lands. */
  verifiedValue?: number | null;
  /** Guest runs are paid on this device right away. */
  local: boolean;
  runBonus: RunBonusOutcome;
  /** Set when this run is a Cash Cups entry. */
  circuit?: { name: string } | null;
}

type Copy = { en: string; es: string };

const COPY = {
  title: { en: 'RUN EARNINGS', es: 'GANANCIAS DE LA PARTIDA' },
  achievements: { en: 'Achievements', es: 'Logros' },
  change: { en: 'Bank change', es: 'Cambio en el Banco' },
  balance: { en: 'Bank', es: 'Banco' },
  depositing: { en: 'Depositing to your Bank…', es: 'Depositando en tu Banco…' },
  deposited: { en: 'Deposited to your Bank', es: 'Depositado en tu Banco' },
  notDeposited: {
    en: 'This run couldn’t be verified, so nothing was deposited.',
    es: 'No se pudo verificar la partida, así que no se depositó nada.',
  },
  bonusDone: { en: 'RUN BONUS COMPLETE', es: 'BONO DE PARTIDA COMPLETADO' },
  bonusMissed: { en: 'Run Bonus · not completed this time', es: 'Bono de partida · no completado esta vez' },
  bonusChecking: { en: 'Checking your Run Bonus…', es: 'Revisando tu bono de partida…' },
  bonusError: { en: 'Run Bonus result will show on your next run.', es: 'El resultado del bono se verá en tu próxima partida.' },
  circuit: { en: 'Cash Cups · {name}', es: 'Copas de efectivo · {name}' },
  circuitPending: { en: 'Submitting your official entry…', es: 'Enviando tu entrada oficial…' },
  circuitOk: { en: 'Official entry recorded · standings update live', es: 'Entrada oficial registrada · la tabla se actualiza en vivo' },
  circuitFailed: {
    en: "Couldn't submit — your entry run is still open in Cash Cups",
    es: 'No se pudo enviar: tu partida de entrada sigue abierta en Copas de efectivo',
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
  const balance = useBankBalance(account.status === 'permanent');
  const rollover = rolloverFor(data.verifiedValue ?? data.runValue);
  const rolloverCounts = data.local || data.submit === 'ok';
  const achievementCash = data.achievementIds.reduce((sum, id) => sum + challengeReward(id), 0);
  const bonus = data.runBonus;
  const bonusDef = bonus.bonusId ? RUN_BONUS_BY_ID[bonus.bonusId] : null;
  const bonusCash = bonus.status === 'completed' ? bonus.payout : 0;
  const change = achievementCash + (rolloverCounts ? rollover : 0) + bonusCash;
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      ref.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    }, 350);
    return () => window.clearTimeout(id);
  }, [reduceMotion]);

  const showBonus = bonus.status !== 'none' && bonusDef != null;
  if (rollover <= 0 && data.achievementIds.length === 0 && !data.circuit && !showBonus) return null;

  const rolloverStatus = data.local
    ? pick(COPY.deposited, locale)
    : data.submit === 'pending'
      ? pick(COPY.depositing, locale)
      : data.submit === 'ok'
        ? pick(COPY.deposited, locale)
        : pick(COPY.notDeposited, locale);

  return (
    <section ref={ref} className="run-earn" aria-label={pick(COPY.title, locale)}>
      <p className="run-earn__title">{pick(COPY.title, locale)}</p>

      {rollover > 0 ? <RolloverPanel amount={rollover} status={rolloverStatus} reduceMotion={reduceMotion} /> : null}

      {showBonus ? (
        bonus.status === 'completed' ? (
          <motion.div
            className={`rb-result rb-result--t${bonusDef!.tier}`}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.25 }}
          >
            <span className="rb-result__gem" aria-hidden>
              <svg viewBox="0 0 16 16">
                <path d="M8 1.5 14 6l-6 8.5L2 6Z" />
              </svg>
            </span>
            <div className="rb-result__copy">
              <span className="rb-result__kicker">{pick(COPY.bonusDone, locale)}</span>
              <strong>{pick(bonusDef!.name, locale)}</strong>
              <em>{pick(bonusDef!.rule, locale)}</em>
            </div>
            <strong className="rb-result__amount">+{formatCash(bonus.payout)}</strong>
          </motion.div>
        ) : (
          <p className={`rb-result-note${bonus.status === 'missed' ? ' is-missed' : ''}`}>
            {bonus.status === 'pending'
              ? pick(COPY.bonusChecking, locale)
              : bonus.status === 'missed'
                ? `${pick(COPY.bonusMissed, locale)} — ${pick(bonusDef!.name, locale)}`
                : pick(COPY.bonusError, locale)}
          </p>
        )
      ) : null}

      {data.circuit || data.achievementIds.length > 0 ? (
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

      <div className="run-earn__foot">
        <div>
          <span>{pick(COPY.change, locale)}</span>
          <strong className="is-up">{signed(change)}</strong>
        </div>
        {balance !== null ? (
          <div className="run-earn__balance">
            <span>{pick(COPY.balance, locale)}</span>
            <TickerNumber className="run-earn__balance-value" value={balance} duration={reduceMotion ? 0 : 900} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
