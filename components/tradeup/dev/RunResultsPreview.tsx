'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getDollarValueForSlot, type ValuedPlayer } from '@/lib/tradeup/billionDollar';
import { getHistPlayerById } from '@/lib/tradeup/decadeRosters';
import type { Position, TradePlayer } from '@/lib/tradeup/types';
import { ClassicRosterReveal } from '../ClassicRosterReveal';
import { DIRK, EWING, KOBE, LEBRON, MAGIC } from '../onboarding/introData';
import { RunEarnings } from '../run/RunEarnings';
import { DynastySignOffer } from '../dynasty/DynastySignOffer';
import { ChestProgressNote } from '../dynasty/ChestProgressNote';

/**
 * Dev-only `?runResultsPreview=1`: the real end-of-run screen for a lineup over $1B with its
 * Rollover and a completed sample Run Bonus. Nothing here is submitted or credited.
 */
export function RunResultsPreview() {
  const [show, setShow] = useState<'1' | 'dynasty' | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const mode = new URLSearchParams(window.location.search).get('runResultsPreview');
    setShow(mode === '1' || mode === 'dynasty' ? mode : null);
  }, []);
  if (!show) return null;

  // `dynasty`: a $1B+ five with Dynasty Road players (2010s Warriors/Heat/Mavericks, '90s Bulls).
  const seats: Array<[TradePlayer, Position]> =
    show === 'dynasty'
      ? ([
          ['hist_2010s_GSW_stephen_curry', 'PG'],
          ['hist_1990s_CHI_michael_jordan', 'SG'],
          ['hist_2010s_MIA_lebron_james', 'SF'],
          ['hist_2010s_DAL_dirk_nowitzki', 'PF'],
          ['hist_1990s_HOU_hakeem_olajuwon', 'C'],
        ] as const).map(([id, slot]) => [getHistPlayerById(id)!, slot])
      : [
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
        onPlayAgain={() => setShow(null)}
        earnings={
          <>
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
            <DynastySignOffer
              clientRunId={`preview_run_results_${show}`}
              lineup={roster.map((p) => p.id)}
              runValue={total}
              verify="ok"
              context="results"
            />
            <ChestProgressNote
              clientRunId={`preview_run_results_${show}`}
              lineup={roster.map((p) => p.id)}
              runValue={total}
              verify="ok"
            />
          </>
        }
      />
    </div>,
    document.body,
  );
}
