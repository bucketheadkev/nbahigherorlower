'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { H2H_POSITIONS, type H2HPosition } from '@/lib/multiplayer/h2hPenalty';
import type { H2HRoundPublic } from '@/lib/multiplayer/h2hState';
import { setH2HShowdownCursor } from '@/lib/multiplayer/rooms';
import { nextShowdownCursor, type ShowdownCursor } from '@/lib/multiplayer/showdownCursor';
import { MultiplayerApiError } from '@/lib/multiplayer/types';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { formatDollars } from '@/lib/tradeup/billionDollar';
import { getTeamColors, contrastOnPrimary } from '@/lib/tradeup/teamColors';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { POSITION_LABELS } from '@/lib/tradeup/startingLineup';
import {
  animateProgress,
  easeOutCubic,
} from '@/lib/tradeup/perf/rafClock';
import { playH2HRoundWinSound, prepareH2HEmojiAudio, warmH2HReactionSounds } from '@/lib/tradeup/h2hEmojiSound';
import { hapticLight, hapticSuccess } from '@/lib/tradeup/haptics';
import { useLocale } from '@/hooks/useLocale';
import { GameBackground } from '../game/GameBackground';
import { H2HEmojiReactions } from './H2HEmojiReactions';
import { h2hDebug } from '@/lib/multiplayer/h2hDebug';

const COUNT_MS = 2400;
/** $0 fades in for this long, then both cards count up together. */
const VALUE_REVEAL_MS = 750;
const FEED_FLOAT_MS = 780;
const TOTAL_RISE_MS = 1400;

type ShowdownPhase = 'counting' | 'bountyBoost' | 'feeding' | 'settled';

interface H2HShowdownSequenceProps {
  roomId: string;
  rounds: H2HRoundPublic[];
  p1Name: string;
  p2Name: string;
  myPlayerNumber: 1 | 2;
  isHost: boolean;
  showdown: ShowdownCursor;
  onSynced: () => Promise<void>;
  /** When set with multiplier, that slot's shown value is scaled for running totals. */
  bountyPosition?: H2HPosition | null;
  bountyMultiplier?: number;
  /** Running score from settled rounds (defaults to summed raw values). */
  scoreFormatter?: (rounds: H2HRoundPublic[]) => { p1: number; p2: number };
  formatScore?: (value: number) => string;
  onComplete: () => void;
}

function displayName(name: string) {
  return name.trim().replace(/\s+/g, ' ') || name;
}

function roundValue(
  round: H2HRoundPublic,
  side: 'p1' | 'p2',
  bountyPosition: H2HPosition | null = null,
  bountyMultiplier = 1,
) {
  const raw =
    side === 'p1'
      ? Math.round(round.p1_raw_value ?? round.p1_adjusted_value ?? 0)
      : Math.round(round.p2_raw_value ?? round.p2_adjusted_value ?? 0);
  const mult =
    bountyPosition && round.position === bountyPosition
      ? Math.max(1, Math.round(bountyMultiplier))
      : 1;
  return raw * mult;
}

function defaultTotals(
  settled: H2HRoundPublic[],
  bountyPosition: H2HPosition | null,
  bountyMultiplier = 1,
) {
  return settled.reduce(
    (acc, r) => ({
      p1: acc.p1 + roundValue(r, 'p1', bountyPosition, bountyMultiplier),
      p2: acc.p2 + roundValue(r, 'p2', bountyPosition, bountyMultiplier),
    }),
    { p1: 0, p2: 0 },
  );
}

function sideTotals(
  rounds: H2HRoundPublic[],
  iAmP1: boolean,
  bountyPosition: H2HPosition | null,
  bountyMultiplier: number,
  scoreFormatter?: (rounds: H2HRoundPublic[]) => { p1: number; p2: number },
) {
  const raw = scoreFormatter
    ? scoreFormatter(rounds)
    : defaultTotals(rounds, bountyPosition, bountyMultiplier);
  return {
    mine: iAmP1 ? raw.p1 : raw.p2,
    opp: iAmP1 ? raw.p2 : raw.p1,
  };
}

/** Count-up display: nearest million, no suffix ($0 → $1,000,000 → $1,683,000,000). */
function formatCountUpDollars(value: number, target: number, settled: boolean): string {
  if (settled) return formatDollars(target);
  const rounded = Math.floor(Math.max(0, value) / 1_000_000) * 1_000_000;
  return `$${rounded.toLocaleString('en-US')}`;
}

/**
 * Host-gated 1v1 showdown: simultaneous dual count-up per position,
 * gold winner ring, live totals. Host advances each position with Next.
 */
export function H2HShowdownSequence({
  roomId,
  rounds,
  p1Name,
  p2Name,
  myPlayerNumber,
  isHost,
  showdown,
  onSynced,
  bountyPosition = null,
  bountyMultiplier = 1,
  scoreFormatter,
  formatScore,
  onComplete,
}: H2HShowdownSequenceProps) {
  const { t, locale } = useLocale();
  const reduceMotion = getPrefersReducedMotion();
  const orderedRounds = useMemo(
    () =>
      H2H_POSITIONS.map((pos) => rounds.find((r) => r.position === pos)).filter(
        (r): r is H2HRoundPublic => Boolean(r?.matchup_resolved),
      ),
    [rounds],
  );

  const [started, setStarted] = useState(showdown.started);
  const [index, setIndex] = useState(showdown.index);
  const [phase, setPhase] = useState<ShowdownPhase>('counting');
  const [leftShown, setLeftShown] = useState(0);
  const [rightShown, setRightShown] = useState(0);
  const [valuesVisible, setValuesVisible] = useState(false);
  const [totalMineShown, setTotalMineShown] = useState(0);
  const [totalOppShown, setTotalOppShown] = useState(0);
  const [totalsRising, setTotalsRising] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<ShowdownCursor | null>(null);
  const startedRef = useRef(showdown.started);
  const pendingRef = useRef(false);
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabaseBrowserClient>['channel']> | null>(null);
  const appliedKey = useRef('');
  const onCompleteRef = useRef(onComplete);
  const onSyncedRef = useRef(onSynced);
  onCompleteRef.current = onComplete;
  onSyncedRef.current = onSynced;

  const live =
    overlay && overlay.revision >= showdown.revision ? overlay : showdown;

  const round = orderedRounds[index] ?? null;
  const isLast = index >= orderedRounds.length - 1;
  const iAmP1 = myPlayerNumber === 1;
  const positionKey = (round?.position as H2HPosition | undefined) ?? '';
  const isBountyRound = Boolean(
    bountyPosition && bountyMultiplier > 1 && round?.position === bountyPosition,
  );

  const leftRaw = round
    ? iAmP1
      ? roundValue(round, 'p1', null, 1)
      : roundValue(round, 'p2', null, 1)
    : 0;
  const rightRaw = round
    ? iAmP1
      ? roundValue(round, 'p2', null, 1)
      : roundValue(round, 'p1', null, 1)
    : 0;
  const leftBoosted = round
    ? iAmP1
      ? roundValue(round, 'p1', bountyPosition, bountyMultiplier)
      : roundValue(round, 'p2', bountyPosition, bountyMultiplier)
    : 0;
  const rightBoosted = round
    ? iAmP1
      ? roundValue(round, 'p2', bountyPosition, bountyMultiplier)
      : roundValue(round, 'p1', bountyPosition, bountyMultiplier)
    : 0;

  // Count to base values first; bounty boost applies after cards settle.
  const leftTarget = isBountyRound ? leftRaw : leftBoosted;
  const rightTarget = isBountyRound ? rightRaw : rightBoosted;
  const leftFinal = leftBoosted;
  const rightFinal = rightBoosted;

  // Totals before this position (Center never adds on this screen).
  const priorTotals = useMemo(
    () => sideTotals(orderedRounds.slice(0, index), iAmP1, bountyPosition, bountyMultiplier, scoreFormatter),
    [bountyMultiplier, bountyPosition, iAmP1, index, orderedRounds, scoreFormatter],
  );
  const afterTotals = useMemo(() => {
    if (isLast) return priorTotals;
    return sideTotals(orderedRounds.slice(0, index + 1), iAmP1, bountyPosition, bountyMultiplier, scoreFormatter);
  }, [bountyMultiplier, bountyPosition, iAmP1, index, isLast, orderedRounds, priorTotals, scoreFormatter]);

  // Snap top totals to prior when entering a position.
  useEffect(() => {
    if (!started || !positionKey) return;
    setTotalMineShown(priorTotals.mine);
    setTotalOppShown(priorTotals.opp);
    setTotalsRising(false);
  }, [positionKey, priorTotals.mine, priorTotals.opp, started]);

  useEffect(() => {
    warmH2HReactionSounds();
  }, []);

  useEffect(() => {
    if (orderedRounds.length === 0) {
      onCompleteRef.current();
    }
  }, [orderedRounds.length]);

  useEffect(() => {
    if (!live.started) return;
    const key = `${live.revision}:${live.index}:${live.finished}`;
    if (appliedKey.current === key) return;
    appliedKey.current = key;
    startedRef.current = true;
    setStarted(true);
    setSyncError(null);
    if (live.finished) {
      onCompleteRef.current();
      return;
    }
    const next = Math.min(Math.max(0, live.index), Math.max(0, orderedRounds.length - 1));
    setIndex(next);
    setPhase('counting');
  }, [live.finished, live.index, live.revision, live.started, orderedRounds.length]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`h2h_showdown_local:${roomId}`)
      .on('broadcast', { event: 'cursor' }, ({ payload }) => {
        const row = payload as ShowdownCursor;
        if (!row || typeof row.revision !== 'number') return;
        setOverlay({
          started: Boolean(row.started),
          index: Math.max(0, Math.min(4, Math.round(row.index))),
          finished: Boolean(row.finished),
          revision: row.revision,
        });
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId]);

  const commitCursor = useCallback(
    async (command: { started: boolean; index: number; finished: boolean }) => {
      if (!isHost || pendingRef.current) return;
      pendingRef.current = true;
      setSyncError(null);

      const publishLocal = (revisionBump = true) => {
        const current = overlay && overlay.revision >= showdown.revision ? overlay : showdown;
        const stepped = nextShowdownCursor(current, command);
        if (!stepped.ok) return null;
        const cursor = revisionBump
          ? stepped.cursor
          : { ...stepped.cursor, revision: Math.max(stepped.cursor.revision, current.revision + 1) };
        setOverlay(cursor);
        void channelRef.current?.send({
          type: 'broadcast',
          event: 'cursor',
          payload: cursor,
        });
        return cursor;
      };

      // Optimistic broadcast so the guest never waits solely on RPC latency.
      publishLocal();

      try {
        const next = await setH2HShowdownCursor(roomId, command);
        setOverlay(next);
        void channelRef.current?.send({
          type: 'broadcast',
          event: 'cursor',
          payload: next,
        });
        await onSyncedRef.current();
      } catch (err) {
        const stale =
          err instanceof MultiplayerApiError && err.code === 'SHOWDOWN_STALE';
        const freshStart = command.started && command.index === 0 && !command.finished;
        // One retry — never permanently abandon the server cursor.
        try {
          await new Promise((r) => window.setTimeout(r, 350));
          const next = await setH2HShowdownCursor(roomId, command);
          setOverlay(next);
          void channelRef.current?.send({
            type: 'broadcast',
            event: 'cursor',
            payload: next,
          });
          await onSyncedRef.current();
          return;
        } catch {
          /* fall through */
        }
        if (stale && freshStart) {
          publishLocal();
          await onSyncedRef.current().catch(() => undefined);
          return;
        }
        setSyncError(err instanceof Error ? err.message : 'Could not update the showdown.');
        await onSyncedRef.current().catch(() => undefined);
      } finally {
        pendingRef.current = false;
      }
    },
    [isHost, overlay, roomId, showdown],
  );

  const handleHostStart = useCallback(() => {
    if (!isHost || live.started || pendingRef.current) return;
    hapticLight();
    h2hDebug('showdown.hostStart', { roomId });
    void commitCursor({ started: true, index: 0, finished: false });
  }, [commitCursor, isHost, live.started, roomId]);

  // Auto-start showdown as soon as both lineups are finished — no dead gate screen.
  // Host writes the cursor; guest follows via Realtime / broadcast / reconcile.
  const autoStartRef = useRef(false);
  useEffect(() => {
    if (autoStartRef.current) return;
    if (!isHost || live.started || pendingRef.current) return;
    if (orderedRounds.length < 5) return;
    autoStartRef.current = true;
    h2hDebug('showdown.autoStart', { roomId, rounds: orderedRounds.length });
    void commitCursor({ started: true, index: 0, finished: false });
  }, [commitCursor, isHost, live.started, orderedRounds.length, roomId]);

  const advance = useCallback(() => {
    if (!isHost || pendingRef.current || phase !== 'settled' || !live.started) return;
    hapticLight();
    h2hDebug('showdown.advance', {
      roomId,
      index: live.index,
      finished: isLast,
    });
    if (isLast) {
      void commitCursor({ started: true, index: live.index, finished: true });
      return;
    }
    void commitCursor({ started: true, index: live.index + 1, finished: false });
  }, [commitCursor, isHost, isLast, live.index, live.started, phase, roomId]);

  // Dual card count-up — then optional bounty boost — then feed into top totals.
  useEffect(() => {
    if (!started || !positionKey || phase !== 'counting') return;

    if (reduceMotion) {
      if (isBountyRound) {
        setLeftShown(leftRaw);
        setRightShown(rightRaw);
        setPhase('bountyBoost');
      } else {
        setLeftShown(leftTarget);
        setRightShown(rightTarget);
        setPhase(isLast ? 'settled' : 'feeding');
      }
      return;
    }

    setLeftShown(0);
    setRightShown(0);
    setValuesVisible(false);
    let lastLeft = 0;
    let lastRight = 0;
    const signal = { cancelled: false };
    const revealFrame = window.requestAnimationFrame(() => {
      if (!signal.cancelled) setValuesVisible(true);
    });

    const countTimer = window.setTimeout(() => {
      if (signal.cancelled) return;
      void animateProgress(COUNT_MS, easeOutCubic, (e) => {
        const nextLeft = Math.round(leftTarget * e);
        const nextRight = Math.round(rightTarget * e);
        lastLeft = Math.max(lastLeft, nextLeft);
        lastRight = Math.max(lastRight, nextRight);
        setLeftShown(lastLeft);
        setRightShown(lastRight);
      }, signal).then(() => {
        if (signal.cancelled) return;
        setLeftShown(leftTarget);
        setRightShown(rightTarget);
        if (isBountyRound) {
          h2hDebug('showdown.bountyBoost', { position: positionKey, mult: bountyMultiplier });
          setPhase('bountyBoost');
        } else {
          setPhase(isLast ? 'settled' : 'feeding');
        }
      });
    }, VALUE_REVEAL_MS);

    return () => {
      signal.cancelled = true;
      window.cancelAnimationFrame(revealFrame);
      window.clearTimeout(countTimer);
    };
  }, [
    bountyMultiplier,
    isBountyRound,
    isLast,
    leftRaw,
    leftTarget,
    phase,
    positionKey,
    reduceMotion,
    rightRaw,
    rightTarget,
    started,
  ]);

  // Bounty: animate base → multiplied after cards are visible.
  useEffect(() => {
    if (!started || phase !== 'bountyBoost') return;

    if (reduceMotion) {
      setLeftShown(leftFinal);
      setRightShown(rightFinal);
      setPhase(isLast ? 'settled' : 'feeding');
      return;
    }

    const signal = { cancelled: false };
    const fromLeft = leftRaw;
    const fromRight = rightRaw;
    let lastLeft = fromLeft;
    let lastRight = fromRight;
    const hold = { id: 0 };

    // Animate base → multiplied, then hold so the whole-million payoff registers.
    void animateProgress(900, easeOutCubic, (e) => {
      const nextLeft = Math.round(fromLeft + (leftFinal - fromLeft) * e);
      const nextRight = Math.round(fromRight + (rightFinal - fromRight) * e);
      lastLeft = Math.max(lastLeft, nextLeft);
      lastRight = Math.max(lastRight, nextRight);
      setLeftShown(lastLeft);
      setRightShown(lastRight);
    }, signal).then(() => {
      if (signal.cancelled) return;
      setLeftShown(leftFinal);
      setRightShown(rightFinal);
      hold.id = window.setTimeout(() => {
        if (signal.cancelled) return;
        setPhase(isLast ? 'settled' : 'feeding');
      }, 1300);
    });

    return () => {
      signal.cancelled = true;
      if (hold.id) window.clearTimeout(hold.id);
    };
  }, [
    isLast,
    leftFinal,
    leftRaw,
    phase,
    reduceMotion,
    rightFinal,
    rightRaw,
    started,
  ]);

  // Feed float → top totals rise (PG–PF only).
  useEffect(() => {
    if (!started || phase !== 'feeding' || isLast) return;

    if (reduceMotion) {
      setTotalMineShown(afterTotals.mine);
      setTotalOppShown(afterTotals.opp);
      setPhase('settled');
      return;
    }

    setTotalsRising(false);
    setTotalMineShown(priorTotals.mine);
    setTotalOppShown(priorTotals.opp);

    const signal = { cancelled: false };
    const floatHold = window.setTimeout(() => {
      if (signal.cancelled) return;
      setTotalsRising(true);
      const fromMine = priorTotals.mine;
      const fromOpp = priorTotals.opp;
      const toMine = afterTotals.mine;
      const toOpp = afterTotals.opp;
      let lastMine = fromMine;
      let lastOpp = fromOpp;

      void animateProgress(TOTAL_RISE_MS, easeOutCubic, (e) => {
        const nextMine = Math.round(fromMine + (toMine - fromMine) * e);
        const nextOpp = Math.round(fromOpp + (toOpp - fromOpp) * e);
        lastMine = Math.max(lastMine, nextMine);
        lastOpp = Math.max(lastOpp, nextOpp);
        setTotalMineShown(lastMine);
        setTotalOppShown(lastOpp);
      }, signal).then(() => {
        if (signal.cancelled) return;
        setTotalMineShown(toMine);
        setTotalOppShown(toOpp);
        setTotalsRising(false);
        setPhase('settled');
      });
    }, FEED_FLOAT_MS);

    return () => {
      signal.cancelled = true;
      window.clearTimeout(floatHold);
    };
  }, [
    afterTotals.mine,
    afterTotals.opp,
    isLast,
    phase,
    priorTotals.mine,
    priorTotals.opp,
    reduceMotion,
    started,
  ]);

  const myName = displayName(iAmP1 ? p1Name : p2Name);
  const oppName = displayName(iAmP1 ? p2Name : p1Name);

  if (!started) {
    return (
      <div className="h2h-shell h2h-shell--arena" aria-label="Lineups locked">
        <GameBackground />
        <div className="h2h-lobby h2h-lobby--showdown-gate">
          <h1 className="h2h-gate__title">{t('h2h.showdownReady')}</h1>
          <p className="h2h-gate__names">
            <span>{myName}</span>
            <em aria-hidden>vs</em>
            <span>{oppName}</span>
          </p>
          <p className="h2h-gate__span">PG → C</p>
          {isHost ? (
            syncError ? (
              <button
                type="button"
                className="run-btn run-btn--primary h2h-lobby__submit h2h-gate__start"
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleHostStart();
                }}
              >
                <strong>{t('h2h.startShowdown')}</strong>
              </button>
            ) : (
              <p className="h2h-lobby__waiting h2h-lobby__waiting--ready" role="status">
                Starting showdown…
              </p>
            )
          ) : (
            <p className="h2h-lobby__waiting h2h-lobby__waiting--ready" role="status">
              {t('h2h.waitingShowdown')}
            </p>
          )}
          {syncError ? (
            <p className="h2h-lobby__status" role="alert">
              {syncError}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (!round) return null;

  const position = round.position as H2HPosition;
  const positionLabel =
    locale === 'es' ? ES_POSITION_LABELS[position] : POSITION_LABELS[position];

  const leftSel = iAmP1 ? round.p1_selection : round.p2_selection;
  const rightSel = iAmP1 ? round.p2_selection : round.p1_selection;
  const winnerSide =
    round.matchup_winner === 'tie'
      ? null
      : round.matchup_winner === 'p1'
        ? iAmP1
          ? 'left'
          : 'right'
        : iAmP1
          ? 'right'
          : 'left';

  const cardsSettled = phase === 'settled' || phase === 'feeding';
  const canAdvance = phase === 'settled';
  const showFeed = phase === 'feeding' && !isLast;

  const announcer =
    phase === 'bountyBoost' && isBountyRound
      ? `${bountyMultiplier}× BOUNTY`
      : !cardsSettled
        ? null
        : round.matchup_winner === 'tie'
          ? t('h2h.tiePosition', { position: positionLabel })
          : t('h2h.winsPosition', {
              name:
                round.matchup_winner === 'p1'
                  ? displayName(p1Name)
                  : displayName(p2Name),
              position: positionLabel.toLowerCase(),
            });

  const iWonRound =
    phase === 'settled' &&
    ((iAmP1 && round.matchup_winner === 'p1') ||
      (!iAmP1 && round.matchup_winner === 'p2'));

  const myTotalLabel = totalsRising
    ? formatCountUpDollars(totalMineShown, afterTotals.mine, false)
    : formatDollars(totalMineShown);
  const oppTotalLabel = totalsRising
    ? formatCountUpDollars(totalOppShown, afterTotals.opp, false)
    : formatDollars(totalOppShown);

  return (
    <ShowdownRoundView
      roomId={roomId}
      position={position}
      positionLabel={positionLabel}
      myName={myName}
      oppName={oppName}
      myTotal={myTotalLabel}
      oppTotal={oppTotalLabel}
      leader={(() => {
        // Corner totals lag the cards until the feed. Use whichever is further ahead
        // so the username flips as soon as the lead changes, and does not snap back.
        const mineSoFar = Math.max(totalMineShown, priorTotals.mine + leftShown);
        const oppSoFar = Math.max(totalOppShown, priorTotals.opp + rightShown);
        if (mineSoFar === oppSoFar) return null;
        return mineSoFar > oppSoFar ? 'you' : 'opp';
      })()}
      leftSel={leftSel}
      rightSel={rightSel}
      leftShown={leftShown}
      rightShown={rightShown}
      leftTarget={phase === 'bountyBoost' || phase === 'feeding' || phase === 'settled' ? leftFinal : leftTarget}
      rightTarget={phase === 'bountyBoost' || phase === 'feeding' || phase === 'settled' ? rightFinal : rightTarget}
      valuesVisible={valuesVisible || cardsSettled || phase === 'bountyBoost'}
      settled={cardsSettled}
      feeding={showFeed}
      bountyBoosting={phase === 'bountyBoost'}
      bountyMultiplier={isBountyRound ? bountyMultiplier : null}
      canAdvance={canAdvance}
      winnerSide={winnerSide}
      announcer={announcer}
      iWonRound={iWonRound}
      myPlayerNumber={myPlayerNumber}
      isHost={isHost}
      status={syncError}
      onHostAdvance={advance}
      nextLabel={isLast ? t('h2h.seeResults') : t('h2h.nextPosition')}
      waitingLabel={t('h2h.waitingHostNext')}
    />
  );
}

const ES_POSITION_LABELS: Record<H2HPosition, string> = {
  PG: 'Base',
  SG: 'Escolta',
  SF: 'Alero',
  PF: 'Ala-pívot',
  C: 'Pívot',
};

function ShowdownRoundView({
  roomId,
  position,
  positionLabel,
  myName,
  oppName,
  myTotal,
  oppTotal,
  leader,
  leftSel,
  rightSel,
  leftShown,
  rightShown,
  leftTarget,
  rightTarget,
  valuesVisible,
  settled,
  feeding,
  bountyBoosting = false,
  bountyMultiplier = null,
  canAdvance,
  winnerSide,
  announcer,
  iWonRound,
  myPlayerNumber,
  isHost,
  status,
  onHostAdvance,
  nextLabel,
  waitingLabel,
}: {
  roomId: string;
  position: H2HPosition;
  positionLabel: string;
  myName: string;
  oppName: string;
  myTotal: string;
  oppTotal: string;
  leader: 'you' | 'opp' | null;
  leftSel: H2HRoundPublic['p1_selection'];
  rightSel: H2HRoundPublic['p2_selection'];
  leftShown: number;
  rightShown: number;
  leftTarget: number;
  rightTarget: number;
  valuesVisible: boolean;
  settled: boolean;
  feeding: boolean;
  bountyBoosting?: boolean;
  bountyMultiplier?: number | null;
  canAdvance: boolean;
  winnerSide: 'left' | 'right' | null;
  announcer: string | null;
  iWonRound: boolean;
  myPlayerNumber: 1 | 2;
  isHost: boolean;
  status?: string | null;
  onHostAdvance: () => void;
  nextLabel: string;
  waitingLabel: string;
}) {
  const soundPlayed = useRef(false);

  useEffect(() => {
    soundPlayed.current = false;
  }, [position]);

  useEffect(() => {
    if (!settled || soundPlayed.current) return;
    soundPlayed.current = true;
    if (iWonRound) {
      prepareH2HEmojiAudio();
      playH2HRoundWinSound();
      hapticSuccess();
    }
  }, [iWonRound, settled]);

  return (
    <div className="h2h-shell h2h-shell--arena" aria-label={`${positionLabel} showdown`}>
      <GameBackground />
      <div className="h2h-lobby h2h-lobby--showdown">
        <header className="h2h-sd__totals" aria-live="polite">
          <div className={`h2h-sd__total h2h-sd__total--you${feeding ? ' is-feeding' : ''}`}>
            <span className={leader === 'you' ? 'is-ahead' : undefined}>{myName}</span>
            <strong>{myTotal}</strong>
          </div>
          <div className={`h2h-sd__total h2h-sd__total--opp${feeding ? ' is-feeding' : ''}`}>
            <span className={leader === 'opp' ? 'is-ahead' : undefined}>{oppName}</span>
            <strong>{oppTotal}</strong>
          </div>
        </header>

        <p className="h2h-sd__pos">{position}</p>
        {bountyMultiplier && bountyMultiplier > 1 ? (
          <p className="h2h-sd__bounty-tag" aria-label="Bounty matchup">
            {bountyBoosting ? `${bountyMultiplier}× BOUNTY` : `BOUNTY · ${bountyMultiplier}×`}
          </p>
        ) : null}

        <div className={`h2h-sd__match${settled ? ' is-settled' : ''}${bountyBoosting ? ' is-bounty-boost' : ''}`}>
          <ShowdownCard
            side="left"
            you
            selection={leftSel}
            value={leftShown}
            target={leftTarget}
            settled={settled}
            feeding={feeding}
            valuesVisible={valuesVisible}
            dimmed={settled && winnerSide === 'right'}
            bountyBoosting={bountyBoosting}
            bountyMultiplier={bountyMultiplier}
          />
          <ShowdownCard
            side="right"
            you={false}
            selection={rightSel}
            value={rightShown}
            target={rightTarget}
            settled={settled}
            feeding={feeding}
            valuesVisible={valuesVisible}
            dimmed={settled && winnerSide === 'left'}
            bountyBoosting={bountyBoosting}
            bountyMultiplier={bountyMultiplier}
          />
        </div>

        <p
          className={`h2h-sd__announce${announcer ? ' is-on' : ''}${
            iWonRound ? ' is-you' : winnerSide ? ' is-opp' : ''
          }`}
          role="status"
        >
          {announcer ?? '\u00a0'}
        </p>

        {canAdvance ? (
          isHost ? (
            <button
              type="button"
              className="run-btn run-btn--primary h2h-sd__next"
              onPointerDown={(e) => {
                e.preventDefault();
                onHostAdvance();
              }}
            >
              <strong>{nextLabel}</strong>
            </button>
          ) : (
            <p className="h2h-sd__waiting" role="status">
              {waitingLabel}
            </p>
          )
        ) : (
          <div className="h2h-sd__next-spacer" aria-hidden />
        )}
        {status ? (
          <p className="h2h-lobby__status" role="alert">
            {status}
          </p>
        ) : null}

        <div className="h2h-sd__emoji">
          <H2HEmojiReactions
            roomId={roomId}
            position={position}
            myPlayerNumber={myPlayerNumber}
            enabled
          />
        </div>
      </div>
    </div>
  );
}

function ShowdownCard({
  side,
  you,
  selection,
  value,
  target,
  settled,
  feeding,
  valuesVisible,
  dimmed,
  bountyBoosting = false,
  bountyMultiplier = null,
}: {
  side: 'left' | 'right';
  you: boolean;
  selection: H2HRoundPublic['p1_selection'];
  value: number;
  target: number;
  settled: boolean;
  feeding: boolean;
  valuesVisible: boolean;
  dimmed: boolean;
  bountyBoosting?: boolean;
  bountyMultiplier?: number | null;
}) {
  const colors = selection ? getTeamColors(selection.teamId) : { primary: '#10202b' };
  const ink = contrastOnPrimary(colors.primary);

  return (
    <div
      className={`h2h-sd__card-wrap h2h-sd__card-wrap--${side}${you ? ' is-you' : ''}${
        dimmed ? ' is-dimmed' : ''
      }${feeding ? ' is-feeding' : ''}${
        valuesVisible ? ' is-value-on' : ''
      }${bountyBoosting ? ' is-bounty-boost' : ''}`}
    >
      {feeding ? (
        <span className="h2h-sd__feed" aria-hidden>
          +{formatDollars(target)}
        </span>
      ) : null}
      <div
        className="h2h-sd__card"
        style={{ background: colors.primary, color: ink }}
      >
        <strong className="h2h-sd__card-name" style={{ color: ink }}>
          {selection?.name ?? '—'}
        </strong>
        {bountyBoosting && bountyMultiplier ? (
          <span className="h2h-sd__bounty-chip" style={{ color: ink }}>
            {bountyMultiplier}× BOUNTY
          </span>
        ) : null}
        <em className="h2h-sd__card-value" style={{ color: ink }}>
          {formatCountUpDollars(value, target, settled && !bountyBoosting)}
        </em>
      </div>
    </div>
  );
}
