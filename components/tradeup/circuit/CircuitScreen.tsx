'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from '@/hooks/useLocale';
import {
  enterCircuit,
  fetchCircuit,
  markResultSeen,
  readCircuitPreview,
  startCircuitRun,
  type CircuitCompetition,
  type CircuitFailure,
  type CircuitResult,
  type CircuitRunConfig,
  type CircuitSnapshot,
} from '@/lib/account/circuitCloud';
import { PrizeLadder, ResultsSheet, StandingsSheet } from './CircuitSheets';
import { formatCash } from '@/lib/tradeup/bank';
import { hapticLight, hapticSuccess, hapticTap } from '@/lib/tradeup/haptics';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';

type Copy = { en: string; es: string };

const COPY = {
  back: { en: '← Back', es: '← Atrás' },
  eyebrow: { en: 'COMPETE FOR CASH', es: 'COMPITE POR EFECTIVO' },
  title: { en: 'CASH LEAGUES', es: 'LIGAS DE EFECTIVO' },
  sub: {
    en: 'Enter with Bank money. One Classic run counts. The top three win Cash.',
    es: 'Entra con dinero del Banco. Cuenta una partida Clásica. Los tres mejores ganan efectivo.',
  },
  bank: { en: 'My Bank', es: 'Mi Banco' },
  entry: { en: 'Entry', es: 'Entrada' },
  pool: { en: 'Prize pool', es: 'Bote' },
  players: { en: 'Players', es: 'Jugadores' },
  endsIn: { en: 'Ends in', es: 'Termina en' },
  ended: { en: 'Settling…', es: 'Liquidando…' },
  enter: { en: 'ENTER', es: 'ENTRAR' },
  need: { en: 'NEED {amount}', es: 'NECESITAS {amount}' },
  signIn: { en: 'SIGN IN TO COMPETE', es: 'INICIA SESIÓN PARA COMPETIR' },
  closed: { en: 'ENTRIES CLOSED', es: 'INSCRIPCIONES CERRADAS' },
  confirm: { en: 'Pay {amount} from your Bank?', es: '¿Pagar {amount} de tu Banco?' },
  confirmNote: {
    en: 'One entry per league. Refunded only if no one submits a run.',
    es: 'Una entrada por liga. Solo se reembolsa si nadie envía una partida.',
  },
  confirmCta: { en: 'CONFIRM', es: 'CONFIRMAR' },
  cancel: { en: 'Back', es: 'Atrás' },
  entering: { en: 'ENTERING…', es: 'ENTRANDO…' },
  play: { en: 'PLAY ENTRY RUN', es: 'JUGAR PARTIDA DE ENTRADA' },
  starting: { en: 'STARTING…', es: 'INICIANDO…' },
  playNote: { en: 'You’re in. One run counts — make it great.', es: 'Estás dentro. Cuenta una partida: que sea grande.' },
  yourEntry: { en: 'YOUR ENTRY', es: 'TU ENTRADA' },
  rankOf: { en: '#{rank} of {count}', es: '#{rank} de {count}' },
  standings: { en: 'View standings ›', es: 'Ver clasificación ›' },
  results: { en: 'RECENT RESULTS', es: 'RESULTADOS RECIENTES' },
  refunded: { en: 'Refunded', es: 'Reembolsado' },
  cancelledShort: { en: 'Cancelled · no runs', es: 'Cancelada · sin partidas' },
  noPrize: { en: 'No prize', es: 'Sin premio' },
  noRun: { en: 'No run submitted', es: 'Sin partida' },
  offline: { en: 'CASH LEAGUES ARE COMING ONLINE', es: 'LAS LIGAS DE EFECTIVO ESTÁN POR ABRIR' },
  offlineNote: {
    en: 'Cash Leagues open as soon as the server is ready.',
    es: 'Las ligas abren en cuanto el servidor esté listo.',
  },
  error: { en: "Couldn't load Cash Leagues.", es: 'No se pudieron cargar las Ligas de efectivo.' },
  retry: { en: 'Retry', es: 'Reintentar' },
  failInsufficient: { en: 'Not enough in your Bank.', es: 'No tienes suficiente en tu Banco.' },
  failClosed: { en: 'This league is closed.', es: 'Esta liga está cerrada.' },
  failAccount: { en: 'Sign in to compete.', es: 'Inicia sesión para competir.' },
  failPlayed: { en: 'Your entry run is already in.', es: 'Tu partida de entrada ya está registrada.' },
  failGeneric: { en: 'Something went wrong. Try again.', es: 'Algo salió mal. Intenta de nuevo.' },
  gameCash: { en: 'Game cash · not real money', es: 'Dinero del juego · no es dinero real' },
} satisfies Record<string, Copy>;

const RULES: Record<CircuitCompetition['format'], Copy> = {
  open_run: { en: 'Classic rules · highest team value wins', es: 'Reglas clásicas · gana el mayor valor' },
  no_reroll: { en: 'Rerolls off · highest team value wins', es: 'Sin cambios · gana el mayor valor' },
  high_stakes: { en: 'Classic rules · big entry, bigger pool', es: 'Reglas clásicas · entrada alta, bote mayor' },
};

/** Entries close 10 minutes before the deadline (mirrors enter_circuit). */
const ENTRY_CUTOFF_MS = 10 * 60 * 1000;
const REFRESH_MS = 30_000;

function pick(copy: Copy, locale: string): string {
  return locale === 'es' ? copy.es : copy.en;
}

function failureCopy(reason: CircuitFailure): Copy {
  switch (reason) {
    case 'insufficient':
      return COPY.failInsufficient;
    case 'closed':
      return COPY.failClosed;
    case 'account':
      return COPY.failAccount;
    case 'played':
      return COPY.failPlayed;
    default:
      return COPY.failGeneric;
  }
}

function countdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

interface CircuitScreenProps {
  open: boolean;
  permanent: boolean;
  bankBalance: number | null;
  onClose: () => void;
  onPlay: (config: CircuitRunConfig) => void;
  onSignIn: () => void;
}

export function CircuitScreen(props: CircuitScreenProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>{props.open ? <Circuit key="circuit" {...props} /> : null}</AnimatePresence>,
    document.body,
  );
}

function Circuit({ permanent: signedIn, bankBalance, onClose, onPlay, onSignIn }: CircuitScreenProps) {
  const { locale } = useLocale();
  const reduceMotion = getPrefersReducedMotion();
  const [preview] = useState(() => readCircuitPreview());
  const permanent = signedIn || preview != null;
  const [snapshot, setSnapshot] = useState<CircuitSnapshot | null>(null);
  const [failure, setFailure] = useState<CircuitFailure | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (preview) {
      setSnapshot((current) => current ?? preview);
      return;
    }
    if (loadingRef.current) return;
    loadingRef.current = true;
    const result = await fetchCircuit();
    loadingRef.current = false;
    if (result.ok === false) {
      setFailure(result.reason);
      return;
    }
    setFailure(null);
    setSnapshot(result.snapshot);
  }, [preview]);

  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => void load(), REFRESH_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(tick);
    };
  }, [load, permanent]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const serverNow = now + (snapshot?.clockOffsetMs ?? 0);
  const [standingsId, setStandingsId] = useState<string | null>(null);
  const [openResult, setOpenResult] = useState<CircuitResult | null>(null);
  const standingsFor = snapshot?.competitions.find((c) => c.id === standingsId) ?? null;

  // Refetch once a league passes its deadline so it settles and the next one opens.
  const nextDeadline = snapshot?.competitions.reduce(
    (min, c) => Math.min(min, Date.parse(c.endsAt)),
    Number.POSITIVE_INFINITY,
  );
  const deadlinePassed = nextDeadline != null && serverNow >= nextDeadline + 1500;
  useEffect(() => {
    if (deadlinePassed) void load();
  }, [deadlinePassed, load]);

  const replace = useCallback((competition: CircuitCompetition) => {
    setSnapshot((current) =>
      current
        ? {
            ...current,
            competitions: current.competitions.map((c) => (c.id === competition.id ? competition : c)),
          }
        : current,
    );
  }, []);

  return (
    <motion.div
      className="circuit"
      role="dialog"
      aria-modal="true"
      aria-label={pick(COPY.title, locale)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.22 } }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="circuit__frame"
        initial={reduceMotion ? false : { y: 22, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 14, opacity: 0, transition: { duration: 0.2 } }}
        transition={{ duration: 0.45, ease: [0.25, 1, 0.5, 1] }}
      >
        <header className="circuit__top">
          <button
            type="button"
            className="circuit__back"
            onClick={() => {
              hapticLight();
              onClose();
            }}
          >
            {pick(COPY.back, locale)}
          </button>
          {bankBalance != null ? (
            <span className="circuit__bank">
              <em>{pick(COPY.bank, locale)}</em>
              <strong>{formatCash(bankBalance)}</strong>
            </span>
          ) : null}
        </header>

        <div className="circuit__head">
          <p className="circuit__eyebrow">{pick(COPY.eyebrow, locale)}</p>
          <h1 className="circuit__title">{pick(COPY.title, locale)}</h1>
          <span className="circuit__rule" aria-hidden>
            <i />
          </span>
          <p className="circuit__sub">{pick(COPY.sub, locale)}</p>
        </div>

        {failure === 'unavailable' ? (
          <div className="circuit__state">
            <p className="circuit__state-title">{pick(COPY.offline, locale)}</p>
            <p className="circuit__state-note">{pick(COPY.offlineNote, locale)}</p>
          </div>
        ) : failure && !snapshot ? (
          <div className="circuit__state">
            <p className="circuit__state-note">{pick(COPY.error, locale)}</p>
            <button type="button" className="circuit__link" onClick={() => void load()}>
              {pick(COPY.retry, locale)}
            </button>
          </div>
        ) : !snapshot ? (
          <ul className="circuit__list" aria-busy>
            {[0, 1, 2].map((i) => (
              <li key={i} className="circuit-card circuit-card--skeleton" />
            ))}
          </ul>
        ) : (
          <>
            <ul className="circuit__list">
              {snapshot.competitions.map((competition, i) => (
                <motion.li
                  key={competition.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1], delay: 0.08 + i * 0.07 }}
                >
                  <CircuitCard
                    preview={preview != null}
                    competition={competition}
                    serverNow={serverNow}
                    permanent={permanent}
                    bankBalance={bankBalance}
                    locale={locale}
                    onUpdate={replace}
                    onPlay={onPlay}
                    onSignIn={onSignIn}
                    onStandings={() => setStandingsId(competition.id)}
                  />
                </motion.li>
              ))}
            </ul>

            {snapshot.results.length > 0 ? (
              <section className="circuit__results" aria-label={pick(COPY.results, locale)}>
                <p className="circuit__section">{pick(COPY.results, locale)}</p>
                <ul>
                  {snapshot.results.map((r) => (
                    <li key={r.competitionId}>
                      <button
                        type="button"
                        className="circuit-result"
                        onClick={() => {
                          hapticLight();
                          setOpenResult(r);
                        }}
                      >
                        <div>
                          <strong>{r.name}</strong>
                          <span>
                            {r.status === 'cancelled'
                              ? pick(COPY.cancelledShort, locale)
                              : r.rank != null
                                ? pick(COPY.rankOf, locale)
                                    .replace('{rank}', String(r.rank))
                                    .replace('{count}', String(r.entrants))
                                : pick(COPY.noRun, locale)}
                          </span>
                        </div>
                        <em className={r.payout > 0 && r.status === 'settled' ? 'is-paid' : ''}>
                          {r.status === 'cancelled'
                            ? pick(COPY.refunded, locale)
                            : r.payout > 0
                              ? `+${formatCash(r.payout)}`
                              : pick(COPY.noPrize, locale)}
                        </em>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <p className="circuit__cash">{pick(COPY.gameCash, locale)}</p>
          </>
        )}
      </motion.div>

      <AnimatePresence>
        {standingsFor ? (
          <StandingsSheet
            key={`standings-${standingsFor.id}`}
            competition={standingsFor}
            serverNow={serverNow}
            countdownText={
              Date.parse(standingsFor.endsAt) - serverNow <= 0
                ? pick(COPY.ended, locale)
                : countdown(Date.parse(standingsFor.endsAt) - serverNow)
            }
            onClose={() => setStandingsId(null)}
          />
        ) : null}
        {openResult ? (
          <ResultsSheet
            key={`result-${openResult.competitionId}`}
            result={openResult}
            onClose={() => {
              markResultSeen(openResult.competitionId);
              setOpenResult(null);
            }}
          />
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

type Busy = 'entering' | 'starting' | null;

function CircuitCard({
  preview,
  competition,
  serverNow,
  permanent,
  bankBalance,
  locale,
  onUpdate,
  onPlay,
  onSignIn,
  onStandings,
}: {
  preview: boolean;
  competition: CircuitCompetition;
  serverNow: number;
  permanent: boolean;
  bankBalance: number | null;
  locale: string;
  onUpdate: (competition: CircuitCompetition) => void;
  onPlay: (config: CircuitRunConfig) => void;
  onSignIn: () => void;
  onStandings: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<CircuitFailure | null>(null);
  const busyRef = useRef(false);

  const msLeft = Date.parse(competition.endsAt) - serverNow;
  const ended = msLeft <= 0;
  const entriesOpen = msLeft > ENTRY_CUTOFF_MS;
  const me = competition.me;
  const entered = Boolean(me);
  const played = me?.runValue != null;
  const short = bankBalance != null && bankBalance < competition.entryFee;
  const run = async (kind: Exclude<Busy, null>, task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    setError(null);
    try {
      await task();
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const enter = () =>
    run('entering', async () => {
      hapticTap();
      if (preview) {
        setConfirming(false);
        onUpdate({
          ...competition,
          participants: competition.participants + 1,
          prizePool: competition.prizePool + competition.entryFee,
          me: { attemptId: null, runValue: null, rank: null, payout: 0 },
        });
        return;
      }
      const result = await enterCircuit(competition.id);
      if (result.ok === false) {
        setError(result.reason);
        return;
      }
      hapticSuccess();
      setConfirming(false);
      onUpdate(result.competition);
    });

  const play = () =>
    run('starting', async () => {
      hapticTap();
      if (preview) {
        onPlay({
          competitionId: competition.id,
          format: competition.format,
          name: competition.name,
          attemptId: `circuit_preview_${Date.now().toString(36)}`,
          rerollsAllowed: competition.rerollsAllowed,
        });
        return;
      }
      const result = await startCircuitRun(competition);
      if (result.ok === false) {
        setError(result.reason);
        return;
      }
      onPlay(result.config);
    });

  let action: ReactNode;
  if (!permanent) {
    action = (
      <button type="button" className="circuit-card__btn circuit-card__btn--ghost" onClick={onSignIn}>
        {pick(COPY.signIn, locale)}
      </button>
    );
  } else if (played) {
    action = (
      <div className="circuit-card__entry">
        <span>{pick(COPY.yourEntry, locale)}</span>
        <strong>{formatCash(me!.runValue!)}</strong>
        {me!.rank != null ? (
          <em>
            {pick(COPY.rankOf, locale)
              .replace('{rank}', String(me!.rank))
              .replace('{count}', String(competition.submitted))}
          </em>
        ) : null}
      </div>
    );
  } else if (entered) {
    action = (
      <>
        <button
          type="button"
          className="circuit-card__btn circuit-card__btn--play"
          disabled={ended || busy !== null}
          onClick={() => void play()}
        >
          {busy === 'starting' ? pick(COPY.starting, locale) : pick(COPY.play, locale)}
        </button>
        <p className="circuit-card__note">{pick(COPY.playNote, locale)}</p>
      </>
    );
  } else if (!entriesOpen) {
    action = (
      <button type="button" className="circuit-card__btn circuit-card__btn--ghost" disabled>
        {pick(COPY.closed, locale)}
      </button>
    );
  } else if (confirming) {
    action = (
      <div className="circuit-card__confirm">
        <p className="circuit-card__prompt">
          {pick(COPY.confirm, locale).replace('{amount}', formatCash(competition.entryFee))}
        </p>
        <p className="circuit-card__note">{pick(COPY.confirmNote, locale)}</p>
        <div className="circuit-card__row">
          <button
            type="button"
            className="circuit-card__btn circuit-card__btn--ghost"
            disabled={busy !== null}
            onClick={() => setConfirming(false)}
          >
            {pick(COPY.cancel, locale)}
          </button>
          <button
            type="button"
            className="circuit-card__btn circuit-card__btn--play"
            disabled={busy !== null}
            onClick={() => void enter()}
          >
            {busy === 'entering' ? pick(COPY.entering, locale) : pick(COPY.confirmCta, locale)}
          </button>
        </div>
      </div>
    );
  } else {
    action = (
      <button
        type="button"
        className="circuit-card__btn circuit-card__btn--play"
        disabled={short || bankBalance == null}
        onClick={() => {
          hapticLight();
          setConfirming(true);
        }}
      >
        {short
          ? pick(COPY.need, locale).replace('{amount}', formatCash(competition.entryFee))
          : `${pick(COPY.enter, locale)} · ${formatCash(competition.entryFee)}`}
      </button>
    );
  }

  return (
    <article className={`circuit-card circuit-card--${competition.format}${entered ? ' is-entered' : ''}`}>
      <header className="circuit-card__head">
        <div>
          <h2 className="circuit-card__name">{competition.name}</h2>
          <p className="circuit-card__rules">{pick(RULES[competition.format], locale)}</p>
        </div>
        <span className={`circuit-card__clock${ended ? ' is-ended' : msLeft < 3_600_000 ? ' is-soon' : ''}`}>
          <i aria-hidden />
          {ended ? pick(COPY.ended, locale) : countdown(msLeft)}
        </span>
      </header>

      <dl className="circuit-card__stats">
        <div>
          <dt>{pick(COPY.entry, locale)}</dt>
          <dd>{formatCash(competition.entryFee)}</dd>
        </div>
        <div>
          <dt>{pick(COPY.pool, locale)}</dt>
          <dd className="is-money">{formatCash(competition.prizePool)}</dd>
        </div>
        <div>
          <dt>{pick(COPY.players, locale)}</dt>
          <dd>{competition.participants.toLocaleString('en-US')}</dd>
        </div>
      </dl>

      <PrizeLadder prizes={competition.prizes} locale={locale} />

      <div className="circuit-card__action">{action}</div>
      {error ? (
        <p className="circuit-card__error" role="alert">
          {pick(failureCopy(error), locale)}
        </p>
      ) : null}

      <button
        type="button"
        className="circuit-card__toggle"
        onClick={() => {
          hapticLight();
          onStandings();
        }}
      >
        {pick(COPY.standings, locale)}
      </button>
    </article>
  );
}
