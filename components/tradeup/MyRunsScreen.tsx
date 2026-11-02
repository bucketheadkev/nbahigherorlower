'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { USER_DATA_CLEARED_EVENT } from '@/lib/account/clearLocalUserData';
import { BILLION_GOAL, formatDollars } from '@/lib/tradeup/billionDollar';
import { getBillionRuns, type BillionRun } from '@/lib/tradeup/billionRuns';
import { formatCash } from '@/lib/tradeup/bank';
import { CLASSIC_PROGRESS_EVENT } from '@/lib/tradeup/storage';
import { teamRowStyle } from '@/lib/tradeup/teamColors';
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

function loadSortedRuns(): BillionRun[] {
  return [...getBillionRuns()].sort((a, b) => {
    if (b.teamValue !== a.teamValue) return b.teamValue - a.teamValue;
    return b.completedAt - a.completedAt;
  });
}

function teamStyle(teamId: string | undefined): CSSProperties {
  return teamRowStyle(teamId) as CSSProperties;
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

  const best = runs[0];

  return (
    <div className="tradeup-shell tradeup-shell--home tradeup-shell--hub oneb-hub myruns">
      <div className="myruns-bg" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="myruns-bg__court" src="/images/arena/draft-court.jpg" alt="" decoding="async" />
        <span className="myruns-bg__shade" />
      </div>

      <header className="oneb-hub__header myruns-head">
        <p className="myruns-head__eyebrow">{t('runs.eyebrow')}</p>
        <h1 className="myruns-head__title">{t('runs.title')}</h1>
        {best ? (
          <div className="myruns-stats">
            <div className="myruns-stat myruns-stat--best">
              <span className="myruns-stat__label">{t('runs.statBest')}</span>
              <strong className="myruns-stat__value">{formatCash(best.teamValue)}</strong>
            </div>
            <div className="myruns-stat">
              <span className="myruns-stat__label">{t('runs.statCount')}</span>
              <strong className="myruns-stat__value">{runs.length}</strong>
            </div>
          </div>
        ) : null}
      </header>

      <main className="oneb-hub__scroll myruns-scroll">
        {runs.length === 0 ? (
          <div className="myruns-empty">
            <span className="myruns-empty__ring" aria-hidden>
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
                <path
                  d="M3 12h18M12 3c-2.6 2.4-2.6 15.6 0 18M12 3c2.6 2.4 2.6 15.6 0 18M5.4 5.6c3.4 2 9.8 2 13.2 0M5.4 18.4c3.4-2 9.8-2 13.2 0"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <p className="myruns-empty__title">{t('runs.emptyTitle')}</p>
            <p className="myruns-empty__copy">{t('runs.emptyCopy')}</p>
          </div>
        ) : (
          <ul className="myruns-list">
            {runs.map((run) => {
              const open = openId === run.id;
              const isBest = run === best;
              const above = Math.max(0, run.teamValue - BILLION_GOAL);
              return (
                <li key={run.id} className={`myrun${open ? ' is-open' : ''}${isBest ? ' is-best' : ''}`}>
                  <button
                    type="button"
                    className="myrun__summary"
                    aria-expanded={open}
                    onClick={() => toggle(run)}
                  >
                    <span className="myrun__copy">
                      <span className="myrun__kicker">
                        {t('runs.valueLabel')}
                        {isBest ? <span className="myrun__badge">{t('runs.bestBadge')}</span> : null}
                      </span>
                      <strong className="myrun__value">{formatCash(run.teamValue)}</strong>
                      <span className="myrun__sub">
                        <span>{formatRunDate(run.completedAt, locale)}</span>
                        {above > 0 ? (
                          <span className="myrun__above">
                            {t('runs.aboveGoal', { amount: `+${formatCash(above)}` })}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="myrun__chevron" aria-hidden>
                      <svg viewBox="0 0 12 8" width="12" height="8" fill="none">
                        <path
                          d="M1.5 1.75 6 6.25l4.5-4.5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </button>

                  {open ? (
                    <ul className="run-ledger__players myrun__players">
                      {run.players.map((player) => (
                        <li
                          key={`${run.id}-${player.position}`}
                          className="run-ledger__player-row"
                          style={teamStyle(player.teamId)}
                        >
                          <span className="run-ledger__pos">{player.position}</span>
                          <span className="run-ledger__meta">
                            <strong>{player.name}</strong>
                            <em>
                              {player.teamName}
                              {player.era !== '—' ? ` · ${player.era}` : ''}
                            </em>
                          </span>
                          <span className="run-ledger__val">{formatDollars(player.dollarValue)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="myrun__roster" aria-hidden>
                      {run.players.map((player) => (
                        <span
                          key={player.position}
                          className="myrun__chip"
                          style={teamStyle(player.teamId)}
                        >
                          {player.position}
                        </span>
                      ))}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
