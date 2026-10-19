'use client';

import { AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import {
  fetchCircuit,
  markResultSeen,
  readCircuitPreview,
  readSeenResults,
  type CircuitResult,
} from '@/lib/account/circuitCloud';
import { BANK_CHANGED_EVENT } from '@/lib/tradeup/bank';
import { ResultsSheet } from './CircuitSheets';

/**
 * Presents final results for a finished league the player entered, once per league.
 * Prizes and refunds are already credited server-side; this is the reveal.
 */
export function CircuitResultsHost({ enabled }: { enabled: boolean }) {
  const { state: account } = useAccountAuth();
  const permanent = account.status === 'permanent';
  const [result, setResult] = useState<CircuitResult | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!enabled || result) return;
    const preview = readCircuitPreview();
    if (!preview && !permanent) return;
    let cancelled = false;
    const pickUnseen = (results: CircuitResult[]) => {
      const seen = readSeenResults();
      const next = results.find((r) => !seen.has(r.competitionId));
      if (!next || cancelled) return;
      window.dispatchEvent(new Event(BANK_CHANGED_EVENT));
      setResult(next);
    };
    if (preview) {
      pickUnseen(preview.results);
      return;
    }
    void fetchCircuit().then((res) => {
      if (res.ok) pickUnseen(res.snapshot.results);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, permanent, result]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {enabled && result ? (
        <ResultsSheet
          key={result.competitionId}
          result={result}
          onClose={() => {
            markResultSeen(result.competitionId);
            setResult(null);
          }}
        />
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
