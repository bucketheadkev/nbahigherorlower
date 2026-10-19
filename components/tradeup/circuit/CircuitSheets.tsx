'use client';

import { motion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { useLocale } from '@/hooks/useLocale';
import {
  fetchStandings,
  isCircuitPreview,
  previewStandings,
  type CircuitCompetition,
  type CircuitResult,
  type CircuitStanding,
} from '@/lib/account/circuitCloud';
import { formatCash } from '@/lib/tradeup/bank';
import { hapticLight, hapticSuccess } from '@/lib/tradeup/haptics';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';

type Copy = { en: string; es: string };

const COPY = {
  back: { en: '← Back', es: '← Atrás' },
  standings: { en: 'STANDINGS', es: 'CLASIFICACIÓN' },
  players: { en: 'Players', es: 'Jugadores' },
  runs: { en: 'Runs in', es: 'Partidas' },
  pool: { en: 'Prize pool', es: 'Bote' },
  places: ['1ST', '2ND', '3RD'],
  open: { en: 'Open', es: 'Libre' },
  you: { en: 'YOU', es: 'TÚ' },
  inPrizes: { en: 'On pace for {amount}', es: 'Vas por {amount}' },
  behind: { en: '{amount} behind 3rd', es: 'A {amount} del 3.º' },
  runOpen: { en: 'Your entry run is still open — make it count.', es: 'Tu partida de entrada sigue abierta.' },
  minNote: {
    en: 'Pays out at {min}+ runs — {more} more needed, otherwise every entry is refunded.',
    es: 'Paga con {min}+ partidas — faltan {more}; si no, se reembolsan todas las entradas.',
  },
  noRuns: { en: 'No runs yet — be the first on the board.', es: 'Aún no hay partidas: sé el primero.' },
  loadError: { en: "Couldn't load standings.", es: 'No se pudo cargar la clasificación.' },
  tie: {
    en: 'Ties go to the earlier run.',
    es: 'Los empates los gana la partida más temprana.',
  },
  final: { en: 'FINAL RESULTS', es: 'RESULTADOS FINALES' },
  ended: { en: 'Ended {date}', es: 'Terminó {date}' },
  yourPlace: { en: 'You finished #{rank} of {count}', es: 'Terminaste #{rank} de {count}' },
  credited: { en: '{amount} credited to your Bank', es: '{amount} acreditados a tu Banco' },
  outside: { en: 'Outside the prizes this time.', es: 'Fuera de los premios esta vez.' },
  noRun: { en: 'Your entry run wasn’t submitted.', es: 'No enviaste tu partida de entrada.' },
  cancelled: { en: 'LEAGUE CANCELLED', es: 'LIGA CANCELADA' },
  cancelledWhy: {
    en: 'Fewer than {min} runs were submitted, so the league didn’t pay out.',
    es: 'Se enviaron menos de {min} partidas, así que la liga no pagó premios.',
  },
  cancelledOther: { en: 'This league was cancelled.', es: 'Esta liga fue cancelada.' },
  refunded: { en: '{amount} refunded to your Bank', es: '{amount} reembolsados a tu Banco' },
  done: { en: 'Done', es: 'Listo' },
  gameCash: { en: 'Game cash · not real money', es: 'Dinero del juego · no es dinero real' },
} satisfies Record<string, Copy | string[]>;

function pick(copy: Copy, locale: string): string {
  return locale === 'es' ? copy.es : copy.en;
}

function fill(text: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((out, [k, v]) => out.replace(`{${k}}`, String(v)), text);
}

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(locale === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric' });
}

function Sheet({
  label,
  onClose,
  children,
  layer = 'standings',
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  layer?: 'standings' | 'results';
}) {
  const reduceMotion = getPrefersReducedMotion();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <motion.div
      className={`circuit-sheet circuit-sheet--${layer}`}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
    >
      <motion.div
        className="circuit-sheet__frame"
        initial={reduceMotion ? false : { y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 16, opacity: 0 }}
        transition={{ duration: 0.42, ease: [0.25, 1, 0.5, 1] }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/** First/second/third prize tiles. `holders` shows who currently sits in each place. */
export function PrizeLadder({
  prizes,
  holders,
  locale,
}: {
  prizes: number[];
  holders?: Array<CircuitStanding | undefined>;
  locale: string;
}) {
  return (
    <ol className="circuit-prizes">
      {prizes.slice(0, 3).map((amount, i) => (
        <li key={i} className={`circuit-prize circuit-prize--${i + 1}`}>
          <span className="circuit-prize__place">{COPY.places[i]}</span>
          <strong className="circuit-prize__amount">{formatCash(amount)}</strong>
          {holders ? (
            <span className={`circuit-prize__holder${holders[i]?.isMe ? ' is-me' : ''}`}>
              {holders[i]?.username ?? pick(COPY.open, locale)}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function StandingsSheet({
  competition,
  serverNow,
  countdownText,
  onClose,
}: {
  competition: CircuitCompetition;
  serverNow: number;
  countdownText: string;
  onClose: () => void;
}) {
  const { locale } = useLocale();
  const [live, setLive] = useState<CircuitCompetition>(competition);
  const [rows, setRows] = useState<CircuitStanding[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isCircuitPreview()) {
      const meAt = competition.me?.rank ?? null;
      setRows(previewStandings(Math.max(competition.submitted, competition.standings.length), competition.standings[0]?.runValue ?? 1_050_000_000, meAt));
      return;
    }
    let cancelled = false;
    const load = () =>
      void fetchStandings(competition.id).then((result) => {
        if (cancelled) return;
        if (result.ok === false) {
          setFailed(true);
          return;
        }
        setFailed(false);
        setLive(result.competition);
        setRows(result.rows);
      });
    load();
    const id = window.setInterval(load, 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [competition]);

  const list = rows ?? live.standings;
  const me = list.find((r) => r.isMe) ?? null;
  const third = list.find((r) => r.rank === 3);
  const short = Math.max(0, live.minRuns - live.submitted);
  const msLeft = Date.parse(live.endsAt) - serverNow;

  let meLine: string | null = null;
  if (me && me.rank <= 3) meLine = fill(pick(COPY.inPrizes, locale), { amount: formatCash(live.prizes[me.rank - 1] ?? 0) });
  else if (me && third) meLine = fill(pick(COPY.behind, locale), { amount: formatCash(Math.max(0, third.runValue - me.runValue)) });

  return (
    <Sheet label={`${live.name} — ${pick(COPY.standings, locale)}`} onClose={onClose}>
      <header className="circuit-sheet__top">
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
        <span className={`circuit-card__clock${msLeft <= 0 ? ' is-ended' : msLeft < 3_600_000 ? ' is-soon' : ''}`}>
          <i aria-hidden />
          {countdownText}
        </span>
      </header>

      <div className="circuit-sheet__head">
        <p className="circuit__eyebrow">{pick(COPY.standings, locale)}</p>
        <h2 className={`circuit-sheet__title circuit-sheet__title--${live.format}`}>{live.name}</h2>
        <dl className="circuit-sheet__facts">
          <div>
            <dt>{pick(COPY.players, locale)}</dt>
            <dd>{live.participants}</dd>
          </div>
          <div>
            <dt>{pick(COPY.runs, locale)}</dt>
            <dd>{live.submitted}</dd>
          </div>
          <div>
            <dt>{pick(COPY.pool, locale)}</dt>
            <dd className="is-money">{formatCash(live.prizePool)}</dd>
          </div>
        </dl>
      </div>

      <PrizeLadder prizes={live.prizes} holders={[1, 2, 3].map((r) => list.find((s) => s.rank === r))} locale={locale} />

      {short > 0 ? (
        <p className="circuit-sheet__warn">
          {fill(pick(COPY.minNote, locale), { min: live.minRuns, more: short })}
        </p>
      ) : null}

      {me ? (
        <div className="circuit-me">
          <span className="circuit-me__tag">{pick(COPY.you, locale)}</span>
          <strong className="circuit-me__rank">#{me.rank}</strong>
          <div className="circuit-me__body">
            <span className="circuit-me__value">{formatCash(me.runValue)}</span>
            {meLine ? <span className="circuit-me__line">{meLine}</span> : null}
          </div>
        </div>
      ) : live.me && live.me.runValue == null ? (
        <p className="circuit-sheet__note">{pick(COPY.runOpen, locale)}</p>
      ) : null}

      {failed && !rows ? (
        <p className="circuit-sheet__note">{pick(COPY.loadError, locale)}</p>
      ) : list.length === 0 ? (
        <p className="circuit-sheet__note">{pick(COPY.noRuns, locale)}</p>
      ) : (
        <ol className="circuit-table">
          {list.map((row, i) => {
            const gap = i > 0 && row.rank - list[i - 1]!.rank > 1;
            return (
              <li
                key={`${row.rank}-${row.username}`}
                className={`circuit-table__row${row.isMe ? ' is-me' : ''}${row.rank <= 3 ? ` is-top is-top-${row.rank}` : ''}${gap ? ' has-gap' : ''}`}
              >
                <span className="circuit-table__rank">{row.rank}</span>
                <span className="circuit-table__user">{row.username}</span>
                <span className="circuit-table__value">{formatCash(row.runValue)}</span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="circuit__cash">{pick(COPY.tie, locale)}</p>
    </Sheet>
  );
}

export function ResultsSheet({ result, onClose }: { result: CircuitResult; onClose: () => void }) {
  const { locale } = useLocale();
  const reduceMotion = getPrefersReducedMotion();
  const cancelled = result.status === 'cancelled';
  const won = !cancelled && result.payout > 0;

  useEffect(() => {
    if (won) hapticSuccess();
  }, [won]);

  // Podium order on screen: 2nd, 1st, 3rd.
  const byRank = (r: number) => result.podium.find((p) => p.rank === r);
  const podium = [2, 1, 3].map((r) => ({ rank: r, row: byRank(r) }));

  return (
    <Sheet label={pick(COPY.final, locale)} onClose={onClose} layer="results">
      <div className="circuit-sheet__head circuit-final__head">
        <p className="circuit__eyebrow">{pick(cancelled ? COPY.cancelled : COPY.final, locale)}</p>
        <h2 className={`circuit-sheet__title circuit-sheet__title--${result.format}`}>{result.name}</h2>
        <p className="circuit-sheet__note">{fill(pick(COPY.ended, locale), { date: formatDate(result.endsAt, locale) })}</p>
      </div>

      {cancelled ? (
        <div className="circuit-final__cancel">
          <p>
            {result.cancelReason === 'not_enough_runs'
              ? fill(pick(COPY.cancelledWhy, locale), { min: result.minRuns })
              : pick(COPY.cancelledOther, locale)}
          </p>
          <strong>{fill(pick(COPY.refunded, locale), { amount: formatCash(result.payout || result.entryFee) })}</strong>
        </div>
      ) : (
        <>
          <ol className="circuit-podium">
            {podium.map(({ rank, row }, i) => (
              <motion.li
                key={rank}
                className={`circuit-podium__step circuit-podium__step--${rank}${row?.isMe ? ' is-me' : ''}`}
                initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1], delay: 0.15 + [0.25, 0, 0.4][i]! }}
              >
                <span className="circuit-podium__user">{row?.username ?? '—'}</span>
                <span className="circuit-podium__value">{row ? formatCash(row.runValue) : ''}</span>
                <div className="circuit-podium__block">
                  <span className="circuit-podium__place">{COPY.places[rank - 1]}</span>
                  <strong className="circuit-podium__prize">{row?.payout ? `+${formatCash(row.payout)}` : ''}</strong>
                </div>
              </motion.li>
            ))}
          </ol>

          <motion.div
            className={`circuit-final__you${won ? ' is-won' : ''}`}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.75 }}
          >
            {result.rank != null ? (
              <>
                <p className="circuit-final__place">
                  {fill(pick(COPY.yourPlace, locale), { rank: result.rank, count: result.entrants })}
                </p>
                {result.runValue != null ? (
                  <p className="circuit-final__run">{formatCash(result.runValue)}</p>
                ) : null}
                <p className="circuit-final__reward">
                  {won
                    ? fill(pick(COPY.credited, locale), { amount: `+${formatCash(result.payout)}` })
                    : pick(COPY.outside, locale)}
                </p>
              </>
            ) : (
              <p className="circuit-final__reward">{pick(COPY.noRun, locale)}</p>
            )}
          </motion.div>
        </>
      )}

      <button type="button" className="circuit-card__btn circuit-card__btn--play circuit-final__done" onClick={onClose}>
        {pick(COPY.done, locale)}
      </button>
      <p className="circuit__cash">{pick(COPY.gameCash, locale)}</p>
    </Sheet>
  );
}
