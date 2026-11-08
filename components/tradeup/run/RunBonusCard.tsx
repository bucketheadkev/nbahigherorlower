'use client';

import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocale } from '@/hooks/useLocale';
import type { ActiveRunBonus } from '@/hooks/useRunBonus';
import { formatCash } from '@/lib/tradeup/bank';
import { RUN_BONUS_BY_ID, runBonusProgress } from '@/lib/tradeup/runBonuses';

type Copy = { en: string; es: string };

const COPY = {
  label: { en: 'Run Bonus', es: 'Bono' },
  loading: { en: 'Drawing your Run Bonus…', es: 'Sorteando tu bono…' },
} satisfies Record<string, Copy>;

const pick = (copy: Copy, locale: string) => (locale === 'es' ? copy.es : copy.en);

const MAX_REM = 0.76;
const MIN_REM = 0.6;

/**
 * The run's one optional objective, under the Spin button: one row, the challenge on the left
 * and the reward on the right. The challenge shrinks slightly if it ever needs to, so it stays
 * on a single line.
 */
export const RunBonusCard = memo(function RunBonusCard({
  bonus,
  seated,
}: {
  bonus: ActiveRunBonus | null;
  seated: { playerId: string; value: number }[];
  reduceMotion?: boolean;
}) {
  const { locale } = useLocale();
  const nameRef = useRef<HTMLSpanElement | null>(null);
  const def = bonus ? RUN_BONUS_BY_ID[bonus.bonusId] : null;
  const challenge = def ? pick(def.short, locale) : '';

  useLayoutEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    const fit = () => {
      let size = MAX_REM;
      el.style.fontSize = `${size}rem`;
      while (el.scrollWidth > el.clientWidth + 0.5 && size > MIN_REM) {
        size = Math.max(MIN_REM, size - 0.02);
        el.style.fontSize = `${size}rem`;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [challenge]);

  if (!def) {
    return (
      <div className="rb-card is-loading" aria-busy>
        <span className="rb-card__loading">{pick(COPY.loading, locale)}</span>
      </div>
    );
  }

  const progress = runBonusProgress(def.id, seated);
  const complete = progress != null && progress.have >= progress.need;
  const reward = `+${formatCash(def.reward)}`;

  return (
    <div
      className={`rb-card rb-card--t${def.tier}${complete ? ' is-complete' : ''}`}
      role="note"
      aria-label={`${pick(COPY.label, locale)}: ${challenge}, ${reward}`}
    >
      <div className="rb-card__bar">
        <span ref={nameRef} className="rb-card__name">
          {challenge}
        </span>
        <span className="rb-card__reward">{reward}</span>
      </div>
    </div>
  );
});

/**
 * The same Run Bonus as a compact chip for the Classic arena's top bar (the arena has no room
 * under SPIN). Shows the reward; a tap opens the challenge, a second tap or 5 s closes it.
 */
export const RunBonusChip = memo(function RunBonusChip({
  bonus,
  seated,
}: {
  bonus: ActiveRunBonus | null;
  seated: { playerId: string; value: number }[];
}) {
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const def = bonus ? RUN_BONUS_BY_ID[bonus.bonusId] : null;

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => setOpen(false), 5000);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!def) return null;
  const progress = runBonusProgress(def.id, seated);
  const complete = progress != null && progress.have >= progress.need;
  const challenge = pick(def.short, locale);
  const reward = `+${formatCash(def.reward)}`;

  return (
    <div className={`rb-chip rb-chip--t${def.tier}${complete ? ' is-complete' : ''}${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="rb-chip__pill"
        aria-expanded={open}
        aria-label={`${pick(COPY.label, locale)}: ${challenge}, ${reward}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="rb-chip__label">{pick(COPY.label, locale)}</span>
        <span className="rb-chip__reward">{reward}</span>
      </button>
      {open ? (
        <p className="rb-chip__pop" role="note">
          {challenge}
        </p>
      ) : null}
    </div>
  );
});
