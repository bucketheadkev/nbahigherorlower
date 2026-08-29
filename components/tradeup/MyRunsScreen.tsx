'use client';

import { useMemo, useState } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { formatDollarsExact } from '@/lib/tradeup/billionDollar';
import { getBillionRuns, type BillionRun } from '@/lib/tradeup/billionRuns';
import { ArenaAtmosphere } from './ArenaAtmosphere';
import { hapticLight } from '@/lib/tradeup/haptics';

function formatRunDate(ts: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleDateString();
  }
}

export function MyRunsScreen() {
  const { locale, t } = useLocale();
  const runs = useMemo(() => getBillionRuns(), []);
  const [openId, setOpenId] = useState<string | null>(runs[0]?.id ?? null);

  const toggle = (run: BillionRun) => {
    hapticLight();
    setOpenId((id) => (id === run.id ? null : run.id));
  };

  const meta =
    runs.length === 0
      ? t('runs.emptyMeta')
      : runs.length === 1
        ? t('runs.metaOne')
        : t('runs.metaMany', { count: runs.length });

  return (
    <div className="tradeup-shell tradeup-shell--home tradeup-shell--hub oneb-hub">
      <ArenaAtmosphere intensity="hub" />
      <header className="oneb-hub__header">
        <p className="oneb-hub__eyebrow">{t('runs.eyebrow')}</p>
        <h1 className="oneb-hub__title">{t('runs.title')}</h1>
        <p className="oneb-hub__meta">{meta}</p>
      </header>

      <main className="oneb-hub__scroll">
        {runs.length === 0 ? (
          <div className="run-empty">
            <p className="run-empty__kicker">{t('runs.waiting')}</p>
            <p className="run-empty__copy">{t('runs.emptyCopy')}</p>
          </div>
        ) : (
          <ul className="run-ledger">
            {runs.map((run) => {
              const open = openId === run.id;
              return (
                <li key={run.id} className={`run-ledger__card${open ? ' is-open' : ''}`}>
                  <button
                    type="button"
                    className="run-ledger__summary"
                    aria-expanded={open}
                    onClick={() => toggle(run)}
                  >
                    <span className="run-ledger__copy">
                      <strong>{formatDollarsExact(run.teamValue)}</strong>
                      <em>{formatRunDate(run.completedAt, locale)}</em>
                    </span>
                    <span className="run-ledger__chevron" aria-hidden>
                      {open ? '−' : '+'}
                    </span>
                  </button>

                  {open ? (
                    <ul className="run-ledger__players">
                      {run.players.map((player) => (
                        <li key={`${run.id}-${player.position}`}>
                          <span className="run-ledger__pos">{player.position}</span>
                          <span className="run-ledger__meta">
                            <strong>{player.name}</strong>
                            <em>
                              {player.teamName}
                              {player.era !== '—' ? ` · ${player.era}` : ''}
                            </em>
                          </span>
                          <span className="run-ledger__val">
                            {formatDollarsExact(player.dollarValue)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
