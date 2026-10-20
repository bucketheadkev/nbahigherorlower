'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useLocale } from '@/hooks/useLocale';
import type { SurplusMode } from '@/hooks/useSurplus';
import { formatCash } from '@/lib/tradeup/bank';
import { hapticLight, hapticSuccess, hapticTap } from '@/lib/tradeup/haptics';
import {
  EXPECTED_MULTIPLIER,
  formatMultiplier,
  multiplierTier,
  oddsPercent,
  SURPLUS_ODDS,
  type SurplusChoice,
  type SurplusState,
} from '@/lib/tradeup/surplusSpin';
import { TickerNumber } from '../onboarding/ticker';
import { SurplusReel } from './SurplusReel';

type Copy = { en: string; es: string };

const COPY = {
  kicker: { en: 'SURPLUS', es: 'EXCEDENTE' },
  above: { en: 'Above $1,000,000,000', es: 'Sobre $1,000,000,000' },
  choose: {
    en: 'Bank it, or risk it on one spin. Only this surplus is at stake.',
    es: 'Guárdalo o arriésgalo en un giro. Solo este excedente está en juego.',
  },
  bank: { en: 'BANK IT', es: 'GUARDAR' },
  risk: { en: 'RISK IT', es: 'ARRIESGAR' },
  riskRange: { en: '0× to 10×', es: '0× a 10×' },
  confirm: { en: 'Risk {amount} on one spin?', es: '¿Arriesgar {amount} en un giro?' },
  confirmNote: {
    en: 'You could get 0× — or up to 10×. Your Bank is never touched.',
    es: 'Puede salir 0× o hasta 10×. Tu Banco nunca se toca.',
  },
  spin: { en: 'SPIN', es: 'GIRAR' },
  back: { en: 'Back', es: 'Atrás' },
  locking: { en: 'Locking in…', es: 'Confirmando…' },
  banked: { en: 'BANKED', es: 'GUARDADO' },
  zero: { en: 'No surplus this time', es: 'Sin excedente esta vez' },
  deposited: { en: 'Deposited to your Bank', es: 'Depositado en tu Banco' },
  demoResult: { en: 'Demo result · not added to your Bank', es: 'Resultado de demo · no se suma a tu Banco' },
  demoBanner: { en: 'DEMO · PRACTICE ONLY', es: 'DEMO · SOLO PRÁCTICA' },
  demoChoose: {
    en: 'Try either one. No real Cash is won or lost here.',
    es: 'Prueba cualquiera. Aquí no se gana ni se pierde dinero real.',
  },
  viewOdds: { en: 'View odds', es: 'Ver probabilidades' },
  hideOdds: { en: 'Hide odds', es: 'Ocultar' },
  oddsAvg: {
    en: 'Average return {avg} per $1 risked. Banking always pays 1×.',
    es: 'Retorno promedio {avg} por cada $1 arriesgado. Guardar siempre paga 1×.',
  },
  errorLoad: { en: "Couldn't load this surplus.", es: 'No se pudo cargar el excedente.' },
  verifying: { en: 'Verifying your run…', es: 'Verificando tu partida…' },
  errorResolve: { en: "Couldn't save your choice. Try again.", es: 'No se pudo guardar tu elección. Intenta de nuevo.' },
  unverified: {
    en: "This run couldn't be verified, so its surplus can't be paid.",
    es: 'No se pudo verificar esta partida, así que su excedente no se puede pagar.',
  },
  retry: { en: 'Retry', es: 'Reintentar' },
  gameCash: { en: 'Game cash · not real money', es: 'Dinero del juego · no es dinero real' },
} satisfies Record<string, Copy>;

function pick(copy: Copy, locale: string): string {
  return locale === 'es' ? copy.es : copy.en;
}

/** Counts up from $0 when the spin result lands. */
function PayoutCount({ value, animate }: { value: number; animate: boolean }) {
  const [shown, setShown] = useState(animate ? 0 : value);
  useEffect(() => {
    setShown(value);
  }, [value]);
  return <TickerNumber value={shown} duration={900} />;
}

interface SurplusDecisionProps {
  surplus: number;
  mode: SurplusMode;
  state: SurplusState | null;
  busy: boolean;
  error: string | null;
  reduceMotion: boolean;
  onChoose: (choice: SurplusChoice) => Promise<SurplusState | null>;
  onRetry: () => void;
  /** Onboarding practice: demo banner, no confirm step, and no Bank wording. */
  demo?: boolean;
}

export function SurplusDecision({
  surplus,
  mode,
  state,
  busy,
  error,
  reduceMotion,
  onChoose,
  onRetry,
  demo = false,
}: SurplusDecisionProps) {
  const { locale } = useLocale();
  const [confirming, setConfirming] = useState(false);
  const [spun, setSpun] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [showOdds, setShowOdds] = useState(false);
  const [pendingChoice, setPendingChoice] = useState<SurplusChoice | null>(null);

  const resolved = state?.status === 'resolved';
  const choice = state?.choice;
  const tenths = state?.multiplierTenths ?? null;
  const payout = state?.payout ?? 0;
  const showReel = resolved && choice === 'spin';
  const resultVisible = resolved && (choice === 'bank' || !spun || revealed);

  const choose = async (next: SurplusChoice) => {
    hapticTap();
    // Mark the spin first so the reel mounts at rest and animates to the stored result.
    if (next === 'spin') setSpun(true);
    setPendingChoice(next);
    const result = await onChoose(next).finally(() => setPendingChoice(null));
    if (!result || result.status !== 'resolved') {
      setSpun(false);
      return;
    }
    if (next === 'bank') hapticSuccess();
  };

  if (mode === 'error') {
    return (
      <section className="sdec sdec--error" aria-label={pick(COPY.kicker, locale)}>
        <p className="sdec__kicker">{pick(COPY.kicker, locale)}</p>
        <p className="sdec__amount">+{formatCash(surplus)}</p>
        <p className="sdec__note sdec__note--error" role="alert">
          {pick(error === 'unverified' ? COPY.unverified : COPY.errorLoad, locale)}
        </p>
        <button type="button" className="sdec__link" onClick={onRetry}>
          {pick(COPY.retry, locale)}
        </button>
      </section>
    );
  }

  return (
    <section
      className={`sdec${resolved ? ' is-resolved' : ''}${showReel ? ' has-reel' : ''}${demo ? ' sdec--demo' : ''}`}
      aria-label={pick(COPY.kicker, locale)}
    >
      {demo ? (
        <p className="sdec__demo">{pick(COPY.demoBanner, locale)}</p>
      ) : (
        <div className="sdec__head">
          <div>
            <p className="sdec__kicker">{pick(COPY.kicker, locale)}</p>
            <p className="sdec__sub">{pick(COPY.above, locale)}</p>
          </div>
          <p className="sdec__amount">+{formatCash(surplus)}</p>
        </div>
      )}

      {showReel ? (
        <SurplusReel
          target={tenths}
          animate={spun}
          reduceMotion={reduceMotion}
          onLanded={() => {
            if (payout > surplus) hapticSuccess();
            else hapticLight();
            setRevealed(true);
          }}
        />
      ) : null}

      <AnimatePresence mode="wait" initial={false}>
        {!resolved ? (
          confirming ? (
            <motion.div
              key="confirm"
              className="sdec__body"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <p className="sdec__prompt">
                {pick(COPY.confirm, locale).replace('{amount}', formatCash(surplus))}
              </p>
              <p className="sdec__note">{pick(COPY.confirmNote, locale)}</p>
              <div className="sdec__actions">
                <button
                  type="button"
                  className="sdec__btn sdec__btn--ghost"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  <span>{pick(COPY.back, locale)}</span>
                </button>
                <button
                  type="button"
                  className="sdec__btn sdec__btn--risk"
                  disabled={busy}
                  onClick={() => void choose('spin')}
                >
                  <span>{pendingChoice === 'spin' ? pick(COPY.locking, locale) : pick(COPY.spin, locale)}</span>
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="choose"
              className="sdec__body"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <p className="sdec__note">
                {pick(mode === 'loading' ? COPY.verifying : demo ? COPY.demoChoose : COPY.choose, locale)}
              </p>
              <div className="sdec__actions">
                <button
                  type="button"
                  className="sdec__btn sdec__btn--bank"
                  disabled={busy}
                  onClick={() => void choose('bank')}
                >
                  <span>{pendingChoice === 'bank' ? pick(COPY.locking, locale) : pick(COPY.bank, locale)}</span>
                  <em>+{formatCash(surplus)}</em>
                </button>
                <button
                  type="button"
                  className="sdec__btn sdec__btn--risk"
                  disabled={busy}
                  onClick={() => {
                    if (demo) {
                      void choose('spin');
                      return;
                    }
                    hapticLight();
                    setConfirming(true);
                  }}
                >
                  <span>{pick(COPY.risk, locale)}</span>
                  <em>{pick(COPY.riskRange, locale)}</em>
                </button>
              </div>
              {error === 'resolve' ? (
                <p className="sdec__note sdec__note--error" role="alert">
                  {pick(COPY.errorResolve, locale)}
                </p>
              ) : null}
            </motion.div>
          )
        ) : resultVisible ? (
          <motion.div
            key="result"
            className={`sdec__result${payout > 0 ? ' is-paid' : ' is-zero'}`}
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.25, 1, 0.5, 1] }}
            aria-live="polite"
          >
            <span className={`sdec__tag sdec__tag--${choice === 'spin' && tenths != null ? multiplierTier(tenths) : 'bank'}`}>
              {choice === 'spin' && tenths != null ? formatMultiplier(tenths) : pick(COPY.banked, locale)}
            </span>
            <div className="sdec__payout">
              {payout > 0 ? (
                <>
                  <strong>
                    +<PayoutCount value={payout} animate={spun && !reduceMotion} />
                  </strong>
                  <span>{pick(demo ? COPY.demoResult : COPY.deposited, locale)}</span>
                </>
              ) : (
                <>
                  <strong>$0</strong>
                  <span>{pick(COPY.zero, locale)}</span>
                </>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!resolved ? (
        <div className="sdec__foot">
          <button
            type="button"
            className="sdec__link"
            aria-expanded={showOdds}
            onClick={() => setShowOdds((v) => !v)}
          >
            {pick(showOdds ? COPY.hideOdds : COPY.viewOdds, locale)}
          </button>
          <span className="sdec__cash">{pick(COPY.gameCash, locale)}</span>
        </div>
      ) : null}

      {showOdds && !resolved ? (
        <div className="sdec__odds">
          <ul>
            {SURPLUS_ODDS.map((odd) => (
              <li key={odd.tenths} className={`sdec__odd sdec__odd--${multiplierTier(odd.tenths)}`}>
                <span>{formatMultiplier(odd.tenths)}</span>
                <em>{oddsPercent(odd.weight)}</em>
              </li>
            ))}
          </ul>
          <p>
            {pick(COPY.oddsAvg, locale).replace('{avg}', `${EXPECTED_MULTIPLIER.toFixed(3)}×`)}
          </p>
        </div>
      ) : null}
    </section>
  );
}
