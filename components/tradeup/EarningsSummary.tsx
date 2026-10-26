'use client';

import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useLocale } from '@/hooks/useLocale';
import { USER_DATA_CLEARED_EVENT } from '@/lib/account/clearLocalUserData';
import { collectEarnings, fetchPendingEarnings, type EarningsItem } from '@/lib/account/earningsCloud';
import { isFranchisePreview } from '@/lib/account/franchisePreview';
import type { MessageKey } from '@/lib/i18n/messages';
import {
  BANK_CHANGED_EVENT,
  BANK_PAYOUT_EVENT,
  catchUpRunBonuses,
  challengeReward,
  formatCash,
  getUncelebratedPayouts,
  markPayoutsCelebrated,
  RUN_BONUS_GOAL,
  type BankPayoutDetail,
} from '@/lib/tradeup/bank';
import { OPEN_EARNINGS_EVENT } from '@/lib/tradeup/earningsSummary';
import { playFinalTotalSettleSound } from '@/lib/tradeup/gameAudio';
import { hapticSuccess, hapticTap } from '@/lib/tradeup/haptics';
import { INTERRUPTIONS_CHANGED_EVENT, interruptionsHeld } from '@/lib/tradeup/interruptions';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { TEAMS } from '@/lib/tradeup/teams';
import { getTeamColors } from '@/lib/tradeup/teamColors';

type Copy = { en: string; es: string };

const COPY = {
  kicker: { en: 'EARNINGS', es: 'GANANCIAS' },
  totalLabel: { en: 'Total earned', es: 'Total ganado' },
  income: { en: 'Franchise income · {hours} hours', es: 'Ingreso de franquicia · {hours} horas' },
  income1: { en: 'Franchise income · 1 hour', es: 'Ingreso de franquicia · 1 hora' },
  bonus: { en: '48-hour completion bonus', es: 'Bono de 48 horas completas' },
  refund: { en: 'Franchise refund · {team}', es: 'Reembolso de franquicia · {team}' },
  refundNote: {
    en: 'One franchise per player now — refunded in full, already in your Bank',
    es: 'Ahora es una franquicia por jugador: reembolso total, ya en tu Banco',
  },
  achievement: { en: 'Achievement', es: 'Logro' },
  achievements: { en: 'Achievements · {count} unlocked', es: 'Logros · {count} desbloqueados' },
  runBonus: { en: 'Run bonus', es: 'Bono de corrida' },
  runLine: { en: '{total} run', es: 'Corrida de {total}' },
  inBank: { en: 'Already in your Bank', es: 'Ya en tu Banco' },
  collect: { en: 'COLLECT {amount}', es: 'COBRAR {amount}' },
  done: { en: 'CONTINUE', es: 'CONTINUAR' },
  collecting: { en: 'Adding to your Bank…', es: 'Sumando a tu Banco…' },
  changed: {
    en: 'Updated to what was actually added just now.',
    es: 'Actualizado con lo que se sumó en este momento.',
  },
  failed: { en: 'Couldn’t reach the Bank. Try again.', es: 'No se pudo conectar con el Banco. Intenta de nuevo.' },
  gameCash: { en: 'Game cash · not real money', es: 'Dinero del juego · no es dinero real' },
} satisfies Record<string, Copy>;

/** Lets a just-finished run land its total before the summary takes over. */
const EVENT_DELAY_MS = 650;
/** Server earnings poll while the hub is open (hourly income keeps accruing). */
const POLL_MS = 5 * 60_000;
const COUNT_MS = 900;
const STAGGER_MS = 110;
const MAX_ACHIEVEMENT_ROWS = 3;

function pick(copy: Copy, locale: string): string {
  return locale === 'es' ? copy.es : copy.en;
}

function fill(text: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, String(v)), text);
}

interface Row {
  key: string;
  label: string;
  detail: string | null;
  amount: number;
  /** Paid when the player confirms (vs. already in the Bank). */
  collectable: boolean;
  accent: string | null;
}

interface Pending {
  server: EarningsItem[];
  achievements: string[];
  extras: BankPayoutDetail[];
}

function hasHeadline(p: Pending): boolean {
  return (
    p.achievements.length > 0 ||
    p.extras.length > 0 ||
    p.server.some((i) => i.kind !== 'franchise_income')
  );
}

function isEmpty(p: Pending): boolean {
  return p.server.length + p.achievements.length + p.extras.length === 0;
}

const teamName = (id: string | null) => TEAMS.find((t) => t.id === id)?.fullName ?? id ?? '';

function buildRows(p: Pending, locale: string, t: (key: MessageKey) => string): Row[] {
  const rows: Row[] = [];
  for (const item of p.server) {
    const accent = item.teamId ? getTeamColors(item.teamId).primary : null;
    if (item.kind === 'franchise_income') {
      rows.push({
        key: `inc:${item.ref}`,
        label: item.hours === 1 ? pick(COPY.income1, locale) : fill(pick(COPY.income, locale), { hours: item.hours }),
        detail: teamName(item.teamId),
        amount: item.amount,
        collectable: true,
        accent,
      });
    } else if (item.kind === 'franchise_bonus') {
      rows.push({ key: `bonus:${item.ref}`, label: pick(COPY.bonus, locale), detail: teamName(item.teamId), amount: item.amount, collectable: true, accent });
    } else {
      rows.push({
        key: `refund:${item.ref}`,
        label: fill(pick(COPY.refund, locale), { team: teamName(item.teamId) }),
        detail: pick(COPY.refundNote, locale),
        amount: item.amount,
        collectable: false,
        accent,
      });
    }
  }
  for (const extra of p.extras) {
    rows.push({
      key: `extra:${extra.kind}:${extra.ref}`,
      label: pick(COPY.runBonus, locale),
      detail: fill(pick(COPY.runLine, locale), { total: formatCash(extra.runTotal ?? RUN_BONUS_GOAL + extra.amount) }),
      amount: extra.amount,
      collectable: false,
      accent: null,
    });
  }
  const achievements = [...p.achievements].sort((a, b) => challengeReward(b) - challengeReward(a));
  if (achievements.length > MAX_ACHIEVEMENT_ROWS) {
    rows.push({
      key: 'ach:group',
      label: fill(pick(COPY.achievements, locale), { count: achievements.length }),
      detail: achievements
        .slice(0, 2)
        .map((id) => t(`challenge.${id}.blurb` as MessageKey))
        .join(' · '),
      amount: achievements.reduce((s, id) => s + challengeReward(id), 0),
      collectable: false,
      accent: null,
    });
  } else {
    for (const id of achievements) {
      rows.push({
        key: `ach:${id}`,
        label: pick(COPY.achievement, locale),
        detail: t(`challenge.${id}.blurb` as MessageKey),
        amount: challengeReward(id),
        collectable: false,
        accent: null,
      });
    }
  }
  return rows;
}

/**
 * One earnings screen for everything that paid or is waiting: franchise hours, completion
 * bonuses, achievements and run bonuses. Opens at safe moments only (never over a
 * draft or a 1V1 turn), shows rows in sequence with a count-up, and pays with one button.
 * Server items are paid by collect_earnings(), which credits each item once — reopening the
 * summary or pressing again can never pay twice.
 */
export function EarningsSummaryHost({ enabled }: { enabled: boolean }) {
  const { state: account } = useAccountAuth();
  const { locale, t } = useLocale();
  const serverEnabled = account.status === 'permanent' || isFranchisePreview();
  const [open, setOpen] = useState<Pending | null>(null);
  const [mounted, setMounted] = useState(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const serverRef = useRef(serverEnabled);
  serverRef.current = serverEnabled;
  const openRef = useRef(open);
  openRef.current = open;
  const extrasRef = useRef<BankPayoutDetail[]>([]);
  /** Income-only summaries open once per return to the app, not every hour while playing. */
  const incomeAllowedRef = useRef(true);
  const wantedRef = useRef(false);
  const checkingRef = useRef(false);

  useEffect(() => setMounted(true), []);

  const gather = useCallback(async (): Promise<Pending> => {
    let server: EarningsItem[] = [];
    if (serverRef.current) {
      const result = await fetchPendingEarnings();
      if (result.ok) server = result.data;
    }
    return {
      server,
      achievements: getUncelebratedPayouts(),
      extras: [...extrasRef.current],
    };
  }, []);

  const check = useCallback(
    async (manual = false) => {
      if (manual) wantedRef.current = true;
      if (openRef.current || checkingRef.current) return;
      const safe = enabledRef.current && !interruptionsHeld();
      if (!safe && !manual) return;
      checkingRef.current = true;
      try {
        const pending = await gather();
        if (openRef.current || isEmpty(pending)) {
          wantedRef.current = false;
          return;
        }
        const show = wantedRef.current || hasHeadline(pending) || incomeAllowedRef.current;
        if (!show) return;
        if (!enabledRef.current && !manual) return;
        if (interruptionsHeld() && !manual) return;
        wantedRef.current = false;
        incomeAllowedRef.current = false;
        setOpen(pending);
      } finally {
        checkingRef.current = false;
      }
    },
    [gather],
  );

  useEffect(() => {
    if (!enabled) return;
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void check(), EVENT_DELAY_MS);
    };
    const onPayout = (event: Event) => {
      const detail = (event as CustomEvent<BankPayoutDetail>).detail;
      if (!detail || !(detail.amount > 0)) return;
      if (!extrasRef.current.some((e) => e.kind === detail.kind && e.ref === detail.ref)) extrasRef.current.push(detail);
      schedule();
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      incomeAllowedRef.current = true;
      schedule();
    };
    catchUpRunBonuses();
    const first = window.setTimeout(() => void check(), 500);
    const poll = window.setInterval(() => void check(), POLL_MS);
    window.addEventListener(BANK_PAYOUT_EVENT, onPayout);
    window.addEventListener(BANK_CHANGED_EVENT, schedule);
    window.addEventListener(USER_DATA_CLEARED_EVENT, schedule);
    window.addEventListener(INTERRUPTIONS_CHANGED_EVENT, schedule);
    window.addEventListener('storage', schedule);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(timer);
      window.clearInterval(poll);
      window.removeEventListener(BANK_PAYOUT_EVENT, onPayout);
      window.removeEventListener(BANK_CHANGED_EVENT, schedule);
      window.removeEventListener(USER_DATA_CLEARED_EVENT, schedule);
      window.removeEventListener(INTERRUPTIONS_CHANGED_EVENT, schedule);
      window.removeEventListener('storage', schedule);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check, enabled]);

  // Run bonuses can arrive while a game screen is up; keep them for the next safe moment.
  useEffect(() => {
    if (enabled) return;
    const onPayout = (event: Event) => {
      const detail = (event as CustomEvent<BankPayoutDetail>).detail;
      if (!detail || !(detail.amount > 0)) return;
      if (!extrasRef.current.some((e) => e.kind === detail.kind && e.ref === detail.ref)) extrasRef.current.push(detail);
    };
    window.addEventListener(BANK_PAYOUT_EVENT, onPayout);
    return () => window.removeEventListener(BANK_PAYOUT_EVENT, onPayout);
  }, [enabled]);

  useEffect(() => {
    const onRequest = () => void check(true);
    window.addEventListener(OPEN_EARNINGS_EVENT, onRequest);
    return () => window.removeEventListener(OPEN_EARNINGS_EVENT, onRequest);
  }, [check]);

  const finish = useCallback((pending: Pending) => {
    markPayoutsCelebrated(pending.achievements);
    extrasRef.current = extrasRef.current.filter(
      (e) => !pending.extras.some((x) => x.kind === e.kind && x.ref === e.ref),
    );
    setOpen(null);
    window.dispatchEvent(new Event(BANK_CHANGED_EVENT));
  }, []);

  if (!mounted || !open) return null;
  return createPortal(
    <EarningsSheet
      pending={open}
      locale={locale}
      rowsFor={(p) => buildRows(p, locale, t as (key: MessageKey) => string)}
      onCollect={async (pending) => {
        let paidServer: EarningsItem[] = pending.server;
        if (pending.server.length > 0) {
          const result = await collectEarnings();
          if (result.ok === false) return { ok: false as const };
          // Legacy refunds were already credited; show what this call acknowledged/credited.
          paidServer = result.data.items;
        }
        return { ok: true as const, settled: { ...pending, server: paidServer } };
      }}
      onDone={finish}
    />,
    document.body,
  );
}

function EarningsSheet({
  pending,
  locale,
  rowsFor,
  onCollect,
  onDone,
}: {
  pending: Pending;
  locale: string;
  rowsFor: (p: Pending) => Row[];
  onCollect: (p: Pending) => Promise<{ ok: true; settled: Pending } | { ok: false }>;
  onDone: (p: Pending) => void;
}) {
  const reduceMotion = getPrefersReducedMotion();
  const [current, setCurrent] = useState(pending);
  const [skip, setSkip] = useState(reduceMotion);
  const [busy, setBusy] = useState(false);
  const [settled, setSettled] = useState(false);
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const rows = rowsFor(current);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const collectable = rows.filter((r) => r.collectable).reduce((s, r) => s + r.amount, 0);
  const [shown, setShown] = useState(skip ? total : 0);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    hapticSuccess();
    playFinalTotalSettleSound();
    buttonRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (skip) {
      setShown(total);
      return;
    }
    let raf = 0;
    const delay = Math.min(rows.length, 6) * STAGGER_MS;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / COUNT_MS));
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(p >= 1 ? total : Math.round(total * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rows.length, skip, total]);

  const confirm = async () => {
    if (busyRef.current) return;
    if (settled) {
      onDone(current);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setSkip(true);
    hapticTap();
    const result = await onCollect(current);
    busyRef.current = false;
    setBusy(false);
    if (!result.ok) {
      setError(pick(COPY.failed, locale));
      return;
    }
    const before = rowsFor(current).filter((r) => r.collectable).reduce((s, r) => s + r.amount, 0);
    const after = rowsFor(result.settled).filter((r) => r.collectable).reduce((s, r) => s + r.amount, 0);
    if (before === after) {
      onDone(result.settled);
      return;
    }
    // Another device collected first, or another hour ticked over: show the real numbers.
    setCurrent(result.settled);
    setChanged(true);
    setSettled(true);
  };

  return (
    <div className="earn" role="dialog" aria-modal="true" aria-labelledby="earn-total">
      <div className="earn__backdrop" aria-hidden />
      <motion.section
        className="earn__sheet"
        initial={reduceMotion ? false : { y: 28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.38, ease: [0.25, 1, 0.5, 1] }}
        onClick={() => setSkip(true)}
      >
        <span className="earn__glow" aria-hidden />
        <p className="earn__kicker">{pick(COPY.kicker, locale)}</p>
        <p className="earn__total-label">{pick(COPY.totalLabel, locale)}</p>
        <p id="earn-total" className="earn__total" style={{ '--chars': `+${formatCash(total)}`.length } as CSSProperties}>
          +{formatCash(shown)}
        </p>
        <ul className="earn__rows">
          {rows.map((row, i) => (
            <motion.li
              key={row.key}
              className={`earn__row${row.collectable ? '' : ' is-credited'}`}
              style={row.accent ? ({ '--earn-accent': row.accent } as CSSProperties) : undefined}
              initial={skip ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: skip ? 0 : i * (STAGGER_MS / 1000), duration: 0.32, ease: [0.25, 1, 0.5, 1] }}
            >
              <span className="earn__row-text">
                <strong>{row.label}</strong>
                {row.detail ? <em>{row.detail}</em> : null}
                {!row.collectable && !row.key.startsWith('refund:') ? <em className="earn__row-note">{pick(COPY.inBank, locale)}</em> : null}
              </span>
              <b>+{formatCash(row.amount)}</b>
            </motion.li>
          ))}
        </ul>
        {changed ? <p className="earn__changed">{pick(COPY.changed, locale)}</p> : null}
        {error ? (
          <p className="earn__error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          ref={buttonRef}
          type="button"
          className="earn__cta"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            void confirm();
          }}
        >
          {busy
            ? pick(COPY.collecting, locale)
            : collectable > 0 && !settled
              ? fill(pick(COPY.collect, locale), { amount: formatCash(collectable) })
              : pick(COPY.done, locale)}
        </button>
        <p className="earn__note">{pick(COPY.gameCash, locale)}</p>
      </motion.section>
    </div>
  );
}
