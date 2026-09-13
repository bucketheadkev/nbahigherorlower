'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { H2H_POSITIONS, type H2HPosition } from '@/lib/multiplayer/h2hPenalty';
import type { H2HRoundPublic } from '@/lib/multiplayer/h2hState';
import type { ValuedPlayer } from '@/lib/tradeup/billionDollar';
import { pickSelectionToPlayer } from '@/lib/tradeup/h2hDraftBridge';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { ClassicRosterReveal } from '../ClassicRosterReveal';

interface H2HClassicValueRevealProps {
  rounds: H2HRoundPublic[];
  myPlayerNumber: 1 | 2;
  myName: string;
  opponentName: string;
  onComplete: () => void;
}

type SeatedH2HPlayer = ValuedPlayer & { seatedSlot: H2HPosition };

function rosterForSide(
  rounds: H2HRoundPublic[],
  side: 'p1' | 'p2',
): SeatedH2HPlayer[] {
  return H2H_POSITIONS.flatMap((pos) => {
    const round = rounds.find((r) => r.position === pos);
    if (!round) return [];
    const selection = side === 'p1' ? round.p1_selection : round.p2_selection;
    if (!selection) return [];
    const raw =
      side === 'p1'
        ? (round.p1_raw_value ?? round.p1_adjusted_value ?? selection.dollarValue ?? 0)
        : (round.p2_raw_value ?? round.p2_adjusted_value ?? selection.dollarValue ?? 0);
    return [{ ...pickSelectionToPlayer(selection, raw), seatedSlot: pos }];
  });
}

/**
 * 1v1 pre-matchup valuation — same ClassicRosterReveal reader as Classic Run
 * (analyze → count-up + cash register → FINAL FIVE), then continue to PG→C rounds.
 */
export function H2HClassicValueReveal({
  rounds,
  myPlayerNumber,
  myName,
  opponentName,
  onComplete,
}: H2HClassicValueRevealProps) {
  const reduceMotion = getPrefersReducedMotion();
  const [step, setStep] = useState<'you' | 'opp'>('you');

  const mySide = myPlayerNumber === 1 ? 'p1' : 'p2';
  const oppSide = myPlayerNumber === 1 ? 'p2' : 'p1';

  const myRoster = useMemo(() => rosterForSide(rounds, mySide), [mySide, rounds]);
  const oppRoster = useMemo(() => rosterForSide(rounds, oppSide), [oppSide, rounds]);

  const myLabel = (myName.split(/\s+/)[0] ?? myName).trim() || 'YOU';
  const oppLabel = (opponentName.split(/\s+/)[0] ?? opponentName).trim() || 'OPP';

  const canShowYou = myRoster.length >= 5;
  const canShowOpp = oppRoster.length >= 5;

  useEffect(() => {
    if (!canShowYou && !canShowOpp) onComplete();
  }, [canShowOpp, canShowYou, onComplete]);

  useEffect(() => {
    if (step === 'you' && !canShowYou && canShowOpp) setStep('opp');
  }, [canShowOpp, canShowYou, step]);

  const handleMyDone = useCallback(() => {
    if (canShowOpp) setStep('opp');
    else onComplete();
  }, [canShowOpp, onComplete]);

  const handleOppDone = useCallback(() => {
    onComplete();
  }, [onComplete]);

  if (!canShowYou && !canShowOpp) return null;

  if (step === 'you' && canShowYou) {
    return (
      <ClassicRosterReveal
        key="h2h-you"
        roster={myRoster}
        reduceMotion={reduceMotion}
        actions="continue"
        continueLabel={canShowOpp ? 'See opponent' : 'Position rounds'}
        eyebrow={`YOUR FIVE · ${myLabel}`}
        onComplete={() => {}}
        onPlayAgain={() => {}}
        onContinue={handleMyDone}
      />
    );
  }

  if (canShowOpp) {
    return (
      <ClassicRosterReveal
        key="h2h-opp"
        roster={oppRoster}
        reduceMotion={reduceMotion}
        actions="continue"
        continueLabel="Position rounds"
        eyebrow={`OPPONENT · ${oppLabel}`}
        onComplete={() => {}}
        onPlayAgain={() => {}}
        onContinue={handleOppDone}
      />
    );
  }

  return null;
}
