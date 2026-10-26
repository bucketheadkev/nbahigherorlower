'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getDollarValueForSlot, type ValuedPlayer } from '@/lib/tradeup/billionDollar';
import type { Position } from '@/lib/tradeup/types';
import { settleWagers } from '@/lib/tradeup/wagers';
import { ClassicRosterReveal } from '../ClassicRosterReveal';
import { DIRK, EWING, KOBE, LEBRON, MAGIC } from '../onboarding/introData';
import { RunEarnings } from '../surplus/RunEarnings';

/**
 * Dev-only `?runResultsPreview=1`: the real end-of-run screen for a $1,005,000,000 lineup with a
 * settled sample slip. Surplus uses this account's normal path; nothing here is submitted.
 */
export function RunResultsPreview() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    setShow(new URLSearchParams(window.location.search).get('runResultsPreview') === '1');
  }, []);
  if (!show) return null;

  const seats: Array<[typeof MAGIC, Position]> = [
    [MAGIC, 'PG'],
    [KOBE, 'SG'],
    [LEBRON, 'SF'],
    [DIRK, 'PF'],
    [EWING, 'C'],
  ];
  const roster = seats.map(([p, slot]) => ({
    ...p,
    dollarValue: getDollarValueForSlot(p, slot),
    seatedSlot: slot,
  })) as Array<ValuedPlayer & { seatedSlot: Position }>;
  const total = roster.reduce((s, p) => s + p.dollarValue, 0);
  const results = settleWagers(
    [
      { id: 'billion_or_bust', stake: 1_000_000 },
      { id: 'star_hunter', stake: 500_000 },
      { id: 'superteam', stake: 250_000 },
    ],
    { total, draftValues: roster.map((p) => p.dollarValue), rerollsUsed: true },
  );

  return createPortal(
    <div
      className="tradeup-shell billion-shell billion-shell--vault"
      style={{ position: 'fixed', inset: 0, zIndex: 150, background: '#03143a' }}
    >
      <ClassicRosterReveal
        roster={roster}
        reduceMotion={false}
        onComplete={() => undefined}
        onPlayAgain={() => setShow(false)}
        earnings={
          <RunEarnings
            data={{
              runRef: 'preview_run_results',
              runValue: total,
              achievementIds: ['hit-1b'],
              wagers: { status: 'settled', results },
              submit: 'skipped',
            }}
            reduceMotion={false}
          />
        }
      />
    </div>,
    document.body,
  );
}
