'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useLocale } from '@/hooks/useLocale';
import type { ActiveRunBonus } from '@/hooks/useRunBonus';
import { formatCash } from '@/lib/tradeup/bank';
import { hapticLight } from '@/lib/tradeup/haptics';
import { RUN_BONUS_BY_ID, runBonusProgress, TIER_NAME } from '@/lib/tradeup/runBonuses';

type Copy = { en: string; es: string };

const COPY = {
  label: { en: 'RUN BONUS', es: 'BONO DE PARTIDA' },
  loading: { en: 'Drawing your Run Bonus…', es: 'Sorteando tu bono…' },
  tier: { en: 'Tier {n} · {name}', es: 'Nivel {n} · {name}' },
  free: {
    en: 'Free · no entry, nothing to lose. Complete it this run and the reward goes to your Bank.',
    es: 'Gratis · sin entrada ni riesgo. Complétalo en esta partida y el premio va a tu Banco.',
  },
  done: { en: 'On track', es: 'En camino' },
} satisfies Record<string, Copy>;

const pick = (copy: Copy, locale: string) => (locale === 'es' ? copy.es : copy.en);

/**
 * The run's one optional objective, under the Spin button: a slim bar that opens to the details.
 * `seated` drives live progress for countable bonuses.
 */
export function RunBonusCard({
  bonus,
  seated,
  reduceMotion,
}: {
  bonus: ActiveRunBonus | null;
  seated: { playerId: string; value: number }[];
  reduceMotion: boolean;
}) {
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);

  if (!bonus) {
    return (
      <div className="rb-card is-loading" aria-busy>
        <span className="rb-card__gem" aria-hidden />
        <span className="rb-card__loading">{pick(COPY.loading, locale)}</span>
      </div>
    );
  }

  const def = RUN_BONUS_BY_ID[bonus.bonusId];
  const progress = runBonusProgress(def.id, seated);
  const complete = progress != null && progress.have >= progress.need;

  return (
    <div className={`rb-card rb-card--t${def.tier}${open ? ' is-open' : ''}${complete ? ' is-complete' : ''}`}>
      <button
        type="button"
        className="rb-card__bar"
        aria-expanded={open}
        onClick={() => {
          hapticLight();
          setOpen((v) => !v);
        }}
      >
        <span className="rb-card__gem" aria-hidden>
          <svg viewBox="0 0 16 16">
            <path d="M8 1.5 14 6l-6 8.5L2 6Z" />
          </svg>
        </span>
        <span className="rb-card__label">{pick(COPY.label, locale)}</span>
        <span className="rb-card__name">{pick(def.name, locale)}</span>
        {progress ? (
          <span className="rb-card__progress">
            {complete ? '✓' : `${progress.have}/${progress.need}`}
          </span>
        ) : null}
        <span className="rb-card__reward">+{formatCash(def.reward)}</span>
        <svg className="rb-card__chevron" viewBox="0 0 16 16" aria-hidden>
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="detail"
            className="rb-card__detail"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: { duration: 0.16 } }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="rb-card__inner">
              <p className="rb-card__rule">{pick(def.rule, locale)}</p>
              <p className="rb-card__meta">
                <span className={`rb-tier rb-tier--${def.tier}`}>
                  {pick(COPY.tier, locale).replace('{n}', String(def.tier)).replace('{name}', pick(TIER_NAME[def.tier], locale))}
                </span>
                {complete ? <span className="rb-card__ontrack">{pick(COPY.done, locale)}</span> : null}
              </p>
              <p className="rb-card__free">{pick(COPY.free, locale)}</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
