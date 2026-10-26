'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { settleWagers } from '@/lib/tradeup/wagers';
import { WagerResults } from './WagerResults';

/** Dev-only `?wagerResultsPreview=1`: sample settled slip for design review. Nothing is credited. */
export function WagerResultsPreview() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    setShow(new URLSearchParams(window.location.search).get('wagerResultsPreview') === '1');
  }, []);
  if (!show) return null;
  const results = settleWagers(
    [
      { id: 'billion_or_bust', stake: 1_000_000 },
      { id: 'star_hunter', stake: 500_000 },
      { id: 'superteam', stake: 250_000 },
    ],
    { total: 986_000_000, draftValues: [212_000_000, 196_000_000, 194_000_000, 192_000_000, 192_000_000], rerollsUsed: true },
  );
  return createPortal(
    <div className="surplus-sheet" onClick={() => setShow(false)}>
      <div className="surplus-sheet__card">
        <section className="run-earn">
          <p className="run-earn__title">RUN EARNINGS</p>
          <WagerResults wagers={{ status: 'settled', results }} reduceMotion={false} />
        </section>
      </div>
    </div>,
    document.body,
  );
}
