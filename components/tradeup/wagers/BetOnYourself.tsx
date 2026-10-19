'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useBankBalance } from '@/hooks/useBankBalance';
import { useLocale } from '@/hooks/useLocale';
import { formatCash } from '@/lib/tradeup/bank';
import { hapticLight, hapticSelection } from '@/lib/tradeup/haptics';
import {
  getSlipState,
  setDraft,
  slipTotals,
  WAGER_SLIP_EVENT,
  type LockFailure,
} from '@/lib/tradeup/wagerSlip';
import {
  formatMultiplierX100,
  MAX_WAGERS_PER_RUN,
  maxStakeFor,
  STAKE_STEPS,
  wagerReturn,
  WAGERS,
  type WagerDef,
  type WagerPick,
} from '@/lib/tradeup/wagers';
import { WagerIcon } from './WagerIcon';

type Copy = { en: string; es: string };

const COPY = {
  title: { en: 'Bet on Yourself', es: 'Apuesta por ti' },
  optional: { en: 'Optional · Use your Bank', es: 'Opcional · Usa tu Banco' },
  selected: { en: '{n} Selected', es: '{n} elegidas' },
  active: { en: '{n} Active', es: '{n} activas' },
  atRisk: { en: '{amount} at risk', es: '{amount} en juego' },
  locksAtSpin: { en: 'locks when you spin', es: 'se fija al girar' },
  failInsufficient: { en: 'Wagers not placed — not enough in your Bank', es: 'No se apostó: saldo insuficiente' },
  failOther: { en: 'Wagers not placed — try again next run', es: 'No se apostó: intenta en la próxima' },
  kicker: { en: 'BET ON YOURSELF', es: 'APUESTA POR TI' },
  bank: { en: 'Bank', es: 'Banco' },
  intro: {
    en: 'Pick up to three. Each wager settles on its own when the run ends.',
    es: 'Elige hasta tres. Cada apuesta se liquida por separado al terminar.',
  },
  lockedIntro: { en: 'Locked for this run.', es: 'Fijadas para esta partida.' },
  target: { en: 'Target', es: 'Meta' },
  stake: { en: 'Stake', es: 'Apuesta' },
  ret: { en: 'Return', es: 'Retorno' },
  profit: { en: 'Profit', es: 'Ganancia' },
  yourWagers: { en: 'YOUR WAGERS', es: 'TUS APUESTAS' },
  totalRisk: { en: 'At risk', es: 'En juego' },
  maxReturn: { en: 'Max total return', es: 'Retorno máximo' },
  returnNote: {
    en: 'Total return includes your stake. Wagers lock when you spin.',
    es: 'El retorno incluye tu apuesta. Se fijan al girar.',
  },
  maxNote: { en: 'Max three wagers per run', es: 'Máximo tres apuestas por partida' },
  needBank: { en: 'Needs {amount} in your Bank', es: 'Necesitas {amount} en tu Banco' },
  done: { en: 'DONE', es: 'LISTO' },
  clear: { en: 'Clear', es: 'Borrar' },
  gameCash: { en: 'Game cash · not real money', es: 'Dinero del juego · no es dinero real' },
} satisfies Record<string, Copy>;

function pick(copy: Copy, locale: string): string {
  return locale === 'es' ? copy.es : copy.en;
}

function subscribe(onChange: () => void) {
  window.addEventListener(WAGER_SLIP_EVENT, onChange);
  return () => window.removeEventListener(WAGER_SLIP_EVENT, onChange);
}

/** Snapshot that changes identity whenever the slip store emits. */
let version = 0;
let snapshot = { version, state: getSlipState() };
function getSnapshot() {
  return snapshot;
}
if (typeof window !== 'undefined') {
  window.addEventListener(WAGER_SLIP_EVENT, () => {
    version += 1;
    snapshot = { version, state: { ...getSlipState() } };
  });
}
const serverSnapshot = { version: -1, state: { draft: [], current: null, lockError: null } as ReturnType<typeof getSlipState> };

export function useWagerSlip() {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot).state;
}

function failureText(reason: LockFailure, locale: string): string {
  return pick(reason === 'insufficient' ? COPY.failInsufficient : COPY.failOther, locale);
}

/**
 * Collapsed "Bet on Yourself" bar on the Classic booth. Opens a sheet to build a 1–3 wager slip.
 * Hidden once the run has started unless wagers are active (or failed to lock).
 */
export function BetOnYourself({ runStarted, reduceMotion }: { runStarted: boolean; reduceMotion: boolean }) {
  const { locale } = useLocale();
  const { state: account } = useAccountAuth();
  const bank = useBankBalance(account.status === 'permanent');
  const slip = useWagerSlip();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const locked = Boolean(slip.current);
  const picks = slip.current?.picks ?? slip.draft;
  const { atRisk } = slipTotals(picks);

  useEffect(() => {
    if (runStarted && !locked) setOpen(false);
  }, [locked, runStarted]);

  if (runStarted && !locked && !slip.lockError) return null;

  let sub = pick(COPY.optional, locale);
  let badge: string | null = null;
  if (slip.lockError && !locked) {
    sub = failureText(slip.lockError, locale);
  } else if (picks.length > 0) {
    badge = pick(locked ? COPY.active : COPY.selected, locale).replace('{n}', String(picks.length));
    sub = `${pick(COPY.atRisk, locale).replace('{amount}', formatCash(atRisk))}${locked ? '' : ` · ${pick(COPY.locksAtSpin, locale)}`}`;
  }

  const canOpen = !(runStarted && !locked);

  return (
    <>
      <button
        type="button"
        className={`bet-bar${locked ? ' is-locked' : ''}${picks.length > 0 ? ' has-picks' : ''}${slip.lockError && !locked ? ' is-error' : ''}`}
        aria-expanded={open}
        disabled={!canOpen}
        onClick={() => {
          hapticLight();
          setOpen(true);
        }}
      >
        <span className="bet-bar__mark" aria-hidden>
          <WagerIcon icon="billion" />
        </span>
        <span className="bet-bar__text">
          <span className="bet-bar__title">
            {pick(COPY.title, locale)}
            {badge ? <em> · {badge}</em> : null}
          </span>
          <span className="bet-bar__sub">{sub}</span>
        </span>
        <svg className="bet-bar__chevron" viewBox="0 0 16 16" aria-hidden>
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {mounted
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <BetSheet
                  key="sheet"
                  locale={locale}
                  bank={bank}
                  picks={picks}
                  locked={locked}
                  reduceMotion={reduceMotion}
                  onClose={() => setOpen(false)}
                />
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}

function BetSheet({
  locale,
  bank,
  picks,
  locked,
  reduceMotion,
  onClose,
}: {
  locale: string;
  bank: number | null;
  picks: WagerPick[];
  locked: boolean;
  reduceMotion: boolean;
  onClose: () => void;
}) {
  const totals = slipTotals(picks);
  const full = picks.length >= MAX_WAGERS_PER_RUN;
  const balance = bank ?? 0;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shown = useMemo(
    () => (locked ? WAGERS.filter((w) => picks.some((p) => p.id === w.id)) : WAGERS),
    [locked, picks],
  );

  const toggle = (def: WagerDef) => {
    if (locked) return;
    const existing = picks.find((p) => p.id === def.id);
    if (existing) {
      hapticLight();
      setDraft(picks.filter((p) => p.id !== def.id));
      return;
    }
    if (full) return;
    const room = balance - totals.atRisk;
    const stake = STAKE_STEPS.find((s) => s <= maxStakeFor(def.id) && s <= room);
    if (!stake) return;
    hapticSelection();
    setDraft([...picks, { id: def.id, stake }]);
  };

  const setStake = (id: WagerDef['id'], stake: number) => {
    hapticSelection();
    setDraft(picks.map((p) => (p.id === id ? { ...p, stake } : p)));
  };

  return (
    <motion.div
      className="bet-sheet"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.14 } }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      <motion.section
        className="bet-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label={pick(COPY.kicker, locale)}
        initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
        animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { y: '100%', transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }}
        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="bet-sheet__grabber" aria-hidden />
        <header className="bet-sheet__head">
          <div>
            <p className="bet-sheet__kicker">{pick(COPY.kicker, locale)}</p>
            <p className="bet-sheet__intro">{pick(locked ? COPY.lockedIntro : COPY.intro, locale)}</p>
          </div>
          <div className="bet-sheet__bank">
            <span>{pick(COPY.bank, locale)}</span>
            <strong>{bank == null ? '—' : formatCash(bank)}</strong>
          </div>
          <button type="button" className="bet-sheet__close" aria-label={pick(COPY.done, locale)} onClick={onClose}>
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
        </header>

        <ul className="bet-sheet__list">
          {shown.map((def) => {
            const chosen = picks.find((p) => p.id === def.id) ?? null;
            const room = balance - totals.atRisk + (chosen?.stake ?? 0);
            const affordable = STAKE_STEPS[0] <= room;
            const disabled = !locked && !chosen && (full || !affordable);
            return (
              <li
                key={def.id}
                className={`bet-row${chosen ? ' is-chosen' : ''}${disabled ? ' is-disabled' : ''}`}
              >
                <button
                  type="button"
                  className="bet-row__head"
                  aria-pressed={Boolean(chosen)}
                  disabled={locked || disabled}
                  onClick={() => toggle(def)}
                >
                  <span className="bet-row__icon" aria-hidden>
                    <WagerIcon icon={def.icon} />
                  </span>
                  <span className="bet-row__copy">
                    <span className="bet-row__name">{def.name}</span>
                    <span className="bet-row__rule">
                      {disabled && !full && !affordable
                        ? pick(COPY.needBank, locale).replace('{amount}', formatCash(STAKE_STEPS[0]))
                        : def.rule}
                    </span>
                  </span>
                  <span className="bet-row__mult">{formatMultiplierX100(def.multiplierX100)}</span>
                  {!locked ? <span className="bet-row__check" aria-hidden /> : null}
                </button>

                <AnimatePresence initial={false}>
                  {chosen ? (
                    <motion.div
                      key="detail"
                      className="bet-row__detail"
                      initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0, transition: { duration: 0.16 } }}
                      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <dl className="bet-row__numbers">
                        <div>
                          <dt>{pick(COPY.target, locale)}</dt>
                          <dd>{def.target}</dd>
                        </div>
                        <div>
                          <dt>{pick(COPY.stake, locale)}</dt>
                          <dd>{formatCash(chosen.stake)}</dd>
                        </div>
                        <div>
                          <dt>{pick(COPY.ret, locale)}</dt>
                          <dd className="is-money">{formatCash(wagerReturn(chosen.stake, def.multiplierX100))}</dd>
                        </div>
                      </dl>
                      <p className="bet-row__profit">
                        {pick(COPY.profit, locale)} +
                        {formatCash(wagerReturn(chosen.stake, def.multiplierX100) - chosen.stake)}
                      </p>
                      {!locked ? (
                        <div className="bet-row__stakes" role="group" aria-label={pick(COPY.stake, locale)}>
                          {STAKE_STEPS.filter((s) => s <= maxStakeFor(def.id)).map((s) => (
                            <button
                              key={s}
                              type="button"
                              className={`bet-chip${chosen.stake === s ? ' is-on' : ''}`}
                              disabled={s > room}
                              aria-pressed={chosen.stake === s}
                              onClick={() => setStake(def.id, s)}
                            >
                              {formatCash(s)}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>

        <footer className="bet-sheet__foot">
          <div className="bet-sheet__summary">
            <div>
              <span>
                {pick(COPY.yourWagers, locale)} {picks.length}/{MAX_WAGERS_PER_RUN}
              </span>
              <strong>{full && !locked ? pick(COPY.maxNote, locale) : '\u00a0'}</strong>
            </div>
            <div>
              <span>{pick(COPY.totalRisk, locale)}</span>
              <strong>{formatCash(totals.atRisk)}</strong>
            </div>
            <div>
              <span>{pick(COPY.maxReturn, locale)}</span>
              <strong className="is-money">{formatCash(totals.maxReturn)}</strong>
            </div>
          </div>
          <p className="bet-sheet__note">{pick(COPY.returnNote, locale)}</p>
          <div className="bet-sheet__actions">
            {!locked && picks.length > 0 ? (
              <button type="button" className="bet-sheet__clear" onClick={() => setDraft([])}>
                {pick(COPY.clear, locale)}
              </button>
            ) : null}
            <button type="button" className="bet-sheet__done" onClick={onClose}>
              {pick(COPY.done, locale)}
            </button>
          </div>
          <p className="bet-sheet__cash">{pick(COPY.gameCash, locale)}</p>
        </footer>
      </motion.section>
    </motion.div>
  );
}
