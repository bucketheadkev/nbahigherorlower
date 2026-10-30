'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getDollarValueForSlot, type ValuedPlayer } from '@/lib/tradeup/billionDollar';
import type { Position } from '@/lib/tradeup/types';
import { ClassicRosterReveal } from '../ClassicRosterReveal';
import { DIRK, EWING, KOBE, LEBRON, MAGIC } from '../onboarding/introData';
import { RunEarnings } from '../run/RunEarnings';

/**
 * Dev-only `?runResultsPreview=1`: the real end-of-run screen for a lineup over $1B with its
 * Rollover and a completed sample Run Bonus. Nothing here is submitted or credited.
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
              submit: 'ok',
              local: false,
              runBonus: { status: 'completed', bonusId: 'triple_threat', payout: 3_000_000 },
            }}
            reduceMotion={false}
          />
        }
      />
    </div>,
    document.body,
  );
}
