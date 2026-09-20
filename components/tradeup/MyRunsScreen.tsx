'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { USER_DATA_CLEARED_EVENT } from '@/lib/account/clearLocalUserData';
import { formatDollarsExact } from '@/lib/tradeup/billionDollar';
import { getBillionRuns, type BillionRun } from '@/lib/tradeup/billionRuns';
import { CLASSIC_PROGRESS_EVENT } from '@/lib/tradeup/storage';
import { contrastOnPrimary, getTeamColors } from '@/lib/tradeup/teamColors';
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

function formatCompactMillions(value: number): string {
  const millions = Math.round(value / 1_000_000);
  if (millions >= 1000) {
    const billions = millions / 1000;
    return `$${billions % 1 === 0 ? billions.toFixed(0) : billions.toFixed(2)}B`;
  }
  return `$${millions}M`;
}

function loadSortedRuns(): BillionRun[] {
  return [...getBillionRuns()].sort((a, b) => {
    if (b.teamValue !== a.teamValue) return b.teamValue - a.teamValue;
    return b.completedAt - a.completedAt;
  });
}

export function MyRunsScreen() {
  const { locale, t } = useLocale();
  const [runs, setRuns] = useState<BillionRun[]>(() => loadSortedRuns());
  const [openId, setOpenId] = useState<string | null>(() => loadSortedRuns()[0]?.id ?? null);

  useEffect(() => {
    const refresh = () => {
      const next = loadSortedRuns();
      setRuns(next);
      setOpenId((id) => (id && next.some((run) => run.id === id) ? id : next[0]?.id ?? null));
    };
    refresh();
    window.addEventListener(CLASSIC_PROGRESS_EVENT, refresh);
    window.addEventListener(USER_DATA_CLEARED_EVENT, refresh);
    return () => {
      window.removeEventListener(CLASSIC_PROGRESS_EVENT, refresh);
      window.removeEventListener(USER_DATA_CLEARED_EVENT, refresh);
    };
  }, []);

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
            {runs.map((run, index) => {
              const open = openId === run.id;
              const isBest = index === 0;
              return (
                <li
                  key={run.id}
                  className={`run-ledger__card${open ? ' is-open' : ''}${
                    isBest ? ' is-best' : ''
                  }`}
                >
                  <button
                    type="button"
                    className="run-ledger__summary"
                    aria-expanded={open}
                    onClick={() => toggle(run)}
                  >
                    <span className="run-ledger__copy">
                      <span className="run-ledger__value-row">
                        <strong>{formatDollarsExact(run.teamValue)}</strong>
                        {isBest ? (
                          <span className="run-ledger__best">{t('runs.bestBadge')}</span>
                        ) : null}
                      </span>
                      <em>{formatRunDate(run.completedAt, locale)}</em>
                    </span>
                    <span className="run-ledger__chevron" aria-hidden>
                      {open ? '−' : '+'}
                    </span>
                  </button>

                  {open ? (
                    <ul className="run-ledger__players">
                      {run.players.map((player) => {
                        const primary = player.teamId
                          ? getTeamColors(player.teamId).primary
                          : '#333333';
                        const ink = contrastOnPrimary(primary);
                        return (
                          <li
                            key={`${run.id}-${player.position}`}
                            className="run-ledger__player-row"
                            style={
                              {
                                ['--row-accent' as string]: primary,
                                ['--row-ink' as string]: ink,
                                backgroundColor: primary,
                                color: ink,
                              } as CSSProperties
                            }
                          >
                            <span className="run-ledger__pos">{player.position}</span>
                            <span className="run-ledger__meta">
                              <strong>{player.name}</strong>
                              <em>
                                {player.teamName}
                                {player.era !== '—' ? ` · ${player.era}` : ''}
                              </em>
                            </span>
                            <span className="run-ledger__val">
                              {formatCompactMillions(player.dollarValue)}
                            </span>
                          </li>
                        );
                      })}
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
