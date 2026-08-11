'use client';

import { useMemo, useState } from 'react';
import { formatDollarsExact } from '@/lib/tradeup/billionDollar';
import { getBillionRuns, type BillionRun } from '@/lib/tradeup/billionRuns';
import { hapticLight } from '@/lib/tradeup/haptics';

function formatRunDate(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleDateString();
  }
}

export function MyRunsScreen() {
  const runs = useMemo(() => getBillionRuns(), []);
  const [openId, setOpenId] = useState<string | null>(runs[0]?.id ?? null);

  const toggle = (run: BillionRun) => {
    hapticLight();
    setOpenId((id) => (id === run.id ? null : run.id));
  };

  return (
    <div className="tradeup-shell tradeup-shell--home tradeup-shell--hub oneb-hub">
      <header className="oneb-hub__header">
        <p className="oneb-hub__eyebrow">HISTORY</p>
        <h1 className="oneb-hub__title">My Runs</h1>
        <p className="oneb-hub__meta">
          {runs.length === 0 ? 'No billion runs yet' : `${runs.length} billion+ squad${runs.length === 1 ? '' : 's'}`}
        </p>
      </header>

      <main className="oneb-hub__scroll">
        {runs.length === 0 ? (
          <div className="oneb-runs__empty">
            <p>Hit $1,000,000,000 or more to save a run here.</p>
          </div>
        ) : (
          <ul className="oneb-runs__list">
            {runs.map((run) => {
              const open = openId === run.id;
              return (
                <li key={run.id} className={`oneb-runs__card${open ? ' is-open' : ''}`}>
                  <button
                    type="button"
                    className="oneb-runs__summary"
                    aria-expanded={open}
                    onClick={() => toggle(run)}
                  >
                    <span className="oneb-runs__summary-copy">
                      <strong>{formatDollarsExact(run.teamValue)}</strong>
                      <em>{formatRunDate(run.completedAt)}</em>
                    </span>
                    <span className="oneb-runs__chevron" aria-hidden>
                      {open ? '▾' : '▸'}
                    </span>
                  </button>

                  {open ? (
                    <ul className="oneb-runs__players">
                      {run.players.map((player) => (
                        <li key={`${run.id}-${player.position}`}>
                          <span className="oneb-runs__pos">{player.position}</span>
                          <span className="oneb-runs__player-meta">
                            <strong>{player.name}</strong>
                            <em>
                              {player.teamName}
                              {player.era !== '—' ? ` · ${player.era}` : ''}
                            </em>
                          </span>
                          <span className="oneb-runs__val">
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
