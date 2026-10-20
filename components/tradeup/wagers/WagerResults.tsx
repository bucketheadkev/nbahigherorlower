'use client';

import { motion } from 'framer-motion';
import { useLocale } from '@/hooks/useLocale';
import { formatCash } from '@/lib/tradeup/bank';
import { WAGER_BY_ID, wagerReturn, type WagerPick, type WagerResult } from '@/lib/tradeup/wagers';

export type RunWagers =
  | { status: 'none' }
  | { status: 'pending'; picks: WagerPick[] }
  | { status: 'settled'; results: WagerResult[] }
  | { status: 'error'; picks: WagerPick[] };

type Copy = { en: string; es: string };

const COPY = {
  title: { en: 'YOUR BETS', es: 'TUS APUESTAS' },
  settling: { en: 'Settling…', es: 'Liquidando…' },
  won: { en: 'Won', es: 'Ganada' },
  lost: { en: 'Missed', es: 'Fallida' },
  target: { en: 'Target', es: 'Meta' },
  stake: { en: 'Stake', es: 'Apuesta' },
  returned: { en: 'Return', es: 'Retorno' },
  error: {
    en: "Couldn't settle these bets right now. They settle when this run is verified.",
    es: 'No se pudieron liquidar ahora. Se liquidan cuando se verifique la partida.',
  },
} satisfies Record<string, Copy>;

function pick(copy: Copy, locale: string): string {
  return locale === 'es' ? copy.es : copy.en;
}

/** Net Bank change from a settled slip (stake already left the Bank at lock). */
export function wagersNet(wagers: RunWagers): number {
  if (wagers.status !== 'settled') return 0;
  return wagers.results.reduce((sum, r) => sum + r.returned - r.stake, 0);
}

/** One simple ticket per bet: target, stake, return. */
export function WagerResults({ wagers, reduceMotion }: { wagers: RunWagers; reduceMotion: boolean }) {
  const { locale } = useLocale();
  if (wagers.status === 'none') return null;

  const settled = wagers.status === 'settled';
  const rows = settled
    ? wagers.results
    : wagers.picks.map((p) => ({ ...p, won: false, returned: 0, multiplierX100: WAGER_BY_ID[p.id].multiplierX100 }));

  return (
    <section className="wager-results" aria-label={pick(COPY.title, locale)}>
      <p className="wager-results__title">{pick(COPY.title, locale)}</p>
      <ul className="wager-results__list">
        {rows.map((row, i) => {
          const def = WAGER_BY_ID[row.id];
          const state = settled ? (row.won ? 'won' : 'lost') : 'pending';
          const returned = state === 'pending' ? wagerReturn(row.stake, row.multiplierX100) : row.returned;
          return (
            <motion.li
              key={row.id}
              className={`wager-ticket is-${state}`}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1], delay: 0.12 + i * 0.14 }}
            >
              <div className="wager-ticket__head">
                <span className="wager-ticket__name">{def.name}</span>
                <span className="wager-ticket__state">
                  {state === 'pending'
                    ? pick(COPY.settling, locale)
                    : pick(state === 'won' ? COPY.won : COPY.lost, locale)}
                </span>
              </div>
              <dl className="wager-ticket__nums">
                <div>
                  <dt>{pick(COPY.target, locale)}</dt>
                  <dd>{def.target}</dd>
                </div>
                <div>
                  <dt>{pick(COPY.stake, locale)}</dt>
                  <dd>{formatCash(row.stake)}</dd>
                </div>
                <div className="wager-ticket__return">
                  <dt>{pick(COPY.returned, locale)}</dt>
                  <dd>{state === 'won' ? `+${formatCash(returned)}` : formatCash(state === 'lost' ? 0 : returned)}</dd>
                </div>
              </dl>
            </motion.li>
          );
        })}
      </ul>
      {wagers.status === 'error' ? <p className="wager-results__note">{pick(COPY.error, locale)}</p> : null}
    </section>
  );
}
