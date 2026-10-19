'use client';

import { motion } from 'framer-motion';
import { useLocale } from '@/hooks/useLocale';
import { formatCash } from '@/lib/tradeup/bank';
import {
  formatMultiplierX100,
  WAGER_BY_ID,
  type WagerPick,
  type WagerResult,
} from '@/lib/tradeup/wagers';
import { WagerIcon } from './WagerIcon';

export type RunWagers =
  | { status: 'none' }
  | { status: 'pending'; picks: WagerPick[] }
  | { status: 'settled'; results: WagerResult[] }
  | { status: 'error'; picks: WagerPick[] };

type Copy = { en: string; es: string };

const COPY = {
  title: { en: 'WAGERS', es: 'APUESTAS' },
  settling: { en: 'Settling…', es: 'Liquidando…' },
  won: { en: 'Won', es: 'Ganada' },
  lost: { en: 'Missed', es: 'Fallida' },
  stake: { en: '{amount} stake', es: 'Apuesta de {amount}' },
  returned: { en: 'Returned', es: 'Devuelto' },
  lostTotal: { en: 'Lost', es: 'Perdido' },
  net: { en: 'Net', es: 'Neto' },
  error: {
    en: "Couldn't settle these wagers right now — they settle when this run is verified.",
    es: 'No se pudieron liquidar ahora: se liquidan cuando se verifique la partida.',
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

export function WagerResults({ wagers, reduceMotion }: { wagers: RunWagers; reduceMotion: boolean }) {
  const { locale } = useLocale();
  if (wagers.status === 'none') return null;

  const rows =
    wagers.status === 'settled'
      ? wagers.results
      : wagers.picks.map((p) => ({ ...p, won: false, returned: 0, multiplierX100: WAGER_BY_ID[p.id].multiplierX100 }));
  const settled = wagers.status === 'settled';
  const returned = settled ? wagers.results.reduce((s, r) => s + r.returned, 0) : 0;
  const lost = settled ? wagers.results.filter((r) => !r.won).reduce((s, r) => s + r.stake, 0) : 0;
  const net = wagersNet(wagers);

  return (
    <section className="wager-results" aria-label={pick(COPY.title, locale)}>
      <p className="wager-results__title">{pick(COPY.title, locale)}</p>
      <ul className="wager-results__list">
        {rows.map((row, i) => {
          const def = WAGER_BY_ID[row.id];
          const state = settled ? (row.won ? 'won' : 'lost') : 'pending';
          return (
            <motion.li
              key={row.id}
              className={`wager-result is-${state}`}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1], delay: 0.12 + i * 0.16 }}
            >
              <span className="wager-result__icon" aria-hidden>
                <WagerIcon icon={def.icon} />
              </span>
              <div className="wager-result__copy">
                <span className="wager-result__name">
                  {def.name}
                  <em>{formatMultiplierX100(row.multiplierX100)}</em>
                </span>
                <span className="wager-result__detail">
                  {pick(COPY.stake, locale).replace('{amount}', formatCash(row.stake))}
                </span>
              </div>
              <div className="wager-result__outcome">
                <span className="wager-result__state">
                  {state === 'pending'
                    ? pick(COPY.settling, locale)
                    : pick(state === 'won' ? COPY.won : COPY.lost, locale)}
                </span>
                <strong className="wager-result__amount">
                  {state === 'won' ? `+${formatCash(row.returned)}` : state === 'lost' ? `−${formatCash(row.stake)}` : ''}
                </strong>
              </div>
            </motion.li>
          );
        })}
      </ul>

      {settled ? (
        <motion.dl
          className="wager-results__totals"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 + rows.length * 0.16 }}
        >
          <div>
            <dt>{pick(COPY.returned, locale)}</dt>
            <dd className="is-up">+{formatCash(returned)}</dd>
          </div>
          <div>
            <dt>{pick(COPY.lostTotal, locale)}</dt>
            <dd className={lost > 0 ? 'is-down' : ''}>{lost > 0 ? `−${formatCash(lost)}` : formatCash(0)}</dd>
          </div>
          <div>
            <dt>{pick(COPY.net, locale)}</dt>
            <dd className={net >= 0 ? 'is-up' : 'is-down'}>
              {net >= 0 ? '+' : '−'}
              {formatCash(Math.abs(net))}
            </dd>
          </div>
        </motion.dl>
      ) : wagers.status === 'error' ? (
        <p className="wager-results__note">{pick(COPY.error, locale)}</p>
      ) : null}
    </section>
  );
}
