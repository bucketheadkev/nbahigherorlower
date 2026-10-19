'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useLocale } from '@/hooks/useLocale';
import { useSurplus, type SurplusMode } from '@/hooks/useSurplus';
import { formatCash } from '@/lib/tradeup/bank';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import {
  fetchPendingServerSurplus,
  latestPendingLocalSurplus,
  payoutFor,
  readSurplusPreview,
  rollMultiplier,
  type SurplusChoice,
  type SurplusState,
} from '@/lib/tradeup/surplusSpin';
import { SurplusDecision } from './SurplusDecision';

type Copy = { en: string; es: string };

const COPY = {
  title: { en: 'UNCLAIMED SURPLUS', es: 'EXCEDENTE SIN COBRAR' },
  from: { en: 'From your {value} run', es: 'De tu partida de {value}' },
  later: { en: 'Decide later', es: 'Decidir después' },
  done: { en: 'Done', es: 'Listo' },
} satisfies Record<string, Copy>;

function pick(copy: Copy, locale: string): string {
  return locale === 'es' ? copy.es : copy.en;
}

/**
 * Recovers a surplus decision that was interrupted (app closed or Build Another tapped
 * before choosing). Shows on the home screen only.
 */
export function PendingSurplusHost({ enabled }: { enabled: boolean }) {
  const { state: account } = useAccountAuth();
  const [pending, setPending] = useState<SurplusState | null>(null);
  const [preview, setPreview] = useState<{ runValue: number; forced: number | null } | null>(null);
  const [mounted, setMounted] = useState(false);
  const dismissedRef = useRef(new Set<string>());
  const permanent = account.status === 'permanent';

  useEffect(() => {
    setMounted(true);
    setPreview(readSurplusPreview());
  }, []);

  useEffect(() => {
    if (!enabled || account.status === 'loading' || pending) return;
    let cancelled = false;
    const fromDevice = () => {
      const local = latestPendingLocalSurplus();
      if (local && !dismissedRef.current.has(local.runRef)) setPending(local);
    };
    if (!permanent) {
      fromDevice();
      return;
    }
    void fetchPendingServerSurplus().then((result) => {
      if (cancelled) return;
      if (result.ok === false) {
        if (result.reason === 'unavailable') fromDevice();
        return;
      }
      const state = result.state;
      if (state.status === 'pending' && state.runRef && !dismissedRef.current.has(state.runRef)) {
        setPending(state);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [account.status, enabled, pending, permanent]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {enabled && preview ? (
        <PreviewSurplusSheet key="preview" preview={preview} onClose={() => setPreview(null)} />
      ) : enabled && pending ? (
        <PendingSurplusSheet
          key={pending.runRef}
          pending={pending}
          permanent={permanent}
          onClose={() => {
            dismissedRef.current.add(pending.runRef);
            setPending(null);
          }}
        />
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

interface SheetFlow {
  mode: SurplusMode;
  state: SurplusState | null;
  busy: boolean;
  error: string | null;
  choose: (choice: SurplusChoice) => Promise<SurplusState | null>;
  retry: () => void | Promise<void>;
}

function PendingSurplusSheet({
  pending,
  permanent,
  onClose,
}: {
  pending: SurplusState;
  permanent: boolean;
  onClose: () => void;
}) {
  const flow = useSurplus({
    runRef: pending.runRef,
    runValue: pending.runValue,
    permanent,
    ready: true,
  });
  return <SurplusSheet pending={pending} flow={flow} onClose={onClose} />;
}

/** Dev-only design/test harness: simulated outcome, nothing stored or credited. */
function PreviewSurplusSheet({
  preview,
  onClose,
}: {
  preview: { runValue: number; forced: number | null };
  onClose: () => void;
}) {
  const surplus = Math.round(preview.runValue) - 1_000_000_000;
  const base: SurplusState = { status: 'pending', runRef: 'preview', runValue: preview.runValue, surplus };
  const [state, setState] = useState<SurplusState>(base);
  const choose = useCallback(
    async (choice: SurplusChoice) => {
      const tenths = choice === 'spin' ? preview.forced ?? rollMultiplier() : 10;
      const next: SurplusState = {
        ...base,
        status: 'resolved',
        choice,
        multiplierTenths: tenths,
        payout: payoutFor(surplus, tenths),
      };
      setState(next);
      return next;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preview.forced, surplus],
  );
  const flow: SheetFlow = { mode: 'local', state, busy: false, error: null, choose, retry: () => {} };
  return <SurplusSheet pending={base} flow={flow} onClose={onClose} />;
}

function SurplusSheet({
  pending,
  flow,
  onClose,
}: {
  pending: SurplusState;
  flow: SheetFlow;
  onClose: () => void;
}) {
  const { locale } = useLocale();
  const reduceMotion = getPrefersReducedMotion();
  const resolved = flow.state?.status === 'resolved';

  return (
    <motion.div
      className="surplus-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={pick(COPY.title, locale)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
    >
      <motion.div
        className="surplus-sheet__card"
        initial={reduceMotion ? false : { y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 12, opacity: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
      >
        <p className="surplus-sheet__title">{pick(COPY.title, locale)}</p>
        <p className="surplus-sheet__from">
          {pick(COPY.from, locale).replace('{value}', formatCash(pending.runValue))}
        </p>
        <SurplusDecision
          surplus={pending.surplus}
          mode={flow.mode}
          state={flow.state}
          busy={flow.busy}
          error={flow.error}
          reduceMotion={reduceMotion}
          onChoose={flow.choose}
          onRetry={() => void flow.retry()}
        />
        <button
          type="button"
          className={`surplus-sheet__close${resolved ? ' is-done' : ''}`}
          disabled={flow.busy}
          onClick={onClose}
        >
          {pick(resolved ? COPY.done : COPY.later, locale)}
        </button>
      </motion.div>
    </motion.div>
  );
}
