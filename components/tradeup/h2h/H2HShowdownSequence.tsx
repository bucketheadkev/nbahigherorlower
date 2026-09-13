'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { H2H_POSITIONS, type H2HPosition } from '@/lib/multiplayer/h2hPenalty';
import type { H2HRoundPublic } from '@/lib/multiplayer/h2hState';
import { setH2HShowdownCursor } from '@/lib/multiplayer/rooms';
import { type ShowdownCursor } from '@/lib/multiplayer/showdownCursor';
import { formatDollars } from '@/lib/tradeup/billionDollar';
import { getTeamColors, contrastOnPrimary } from '@/lib/tradeup/teamColors';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { POSITION_LABELS } from '@/lib/tradeup/startingLineup';
import {
  animateProgress,
  easeOutCubic,
} from '@/lib/tradeup/perf/rafClock';
import { playH2HRoundWinSound, prepareH2HEmojiAudio } from '@/lib/tradeup/h2hEmojiSound';
import { hapticLight, hapticSuccess } from '@/lib/tradeup/haptics';
import { useLocale } from '@/hooks/useLocale';
import { GameBackground } from '../game/GameBackground';
import { H2HEmojiReactions } from './H2HEmojiReactions';

const COUNT_MS = 2200;
const FEED_FLOAT_MS = 780;
const TOTAL_RISE_MS = 1400;

type ShowdownPhase = 'counting' | 'feeding' | 'settled';

interface H2HShowdownSequenceProps {
  roomId: string;
  rounds: H2HRoundPublic[];
  p1Name: string;
  p2Name: string;
  myPlayerNumber: 1 | 2;
  isHost: boolean;
  showdown: ShowdownCursor;
  onSynced: () => Promise<void>;
  /** When set, that slot's shown value is doubled so the running total matches the five cards. */
  bountyPosition?: H2HPosition | null;
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
) {
  const raw =
    side === 'p1'
      ? Math.round(round.p1_raw_value ?? round.p1_adjusted_value ?? 0)
      : Math.round(round.p2_raw_value ?? round.p2_adjusted_value ?? 0);
  return bountyPosition && round.position === bountyPosition ? raw * 2 : raw;
}

function defaultTotals(settled: H2HRoundPublic[], bountyPosition: H2HPosition | null) {
  return settled.reduce(
    (acc, r) => ({
      p1: acc.p1 + roundValue(r, 'p1', bountyPosition),
      p2: acc.p2 + roundValue(r, 'p2', bountyPosition),
    }),
    { p1: 0, p2: 0 },
  );
}

function sideTotals(
  rounds: H2HRoundPublic[],
  iAmP1: boolean,
  bountyPosition: H2HPosition | null,
  scoreFormatter?: (rounds: H2HRoundPublic[]) => { p1: number; p2: number },
) {
  const raw = scoreFormatter ? scoreFormatter(rounds) : defaultTotals(rounds, bountyPosition);
  return {
    mine: iAmP1 ? raw.p1 : raw.p2,
    opp: iAmP1 ? raw.p2 : raw.p1,
  };
}

/**
 * Count-up display: always climb in whole millions ($0M → $1M → … → $179M)
 * so formatDollars quirks never make the number look like it jumped backward.
 */
function formatCountUpDollars(value: number, target: number, settled: boolean): string {
  if (settled) return formatDollars(target);
  if (target >= 1_000_000_000) {
    const b = Math.floor(Math.max(0, value) / 10_000_000) / 100;
    return `$${b.toFixed(2)}B`;
  }
  const m = Math.floor(Math.max(0, value) / 1_000_000);
  return `$${m}M`;
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
  const [totalMineShown, setTotalMineShown] = useState(0);
  const [totalOppShown, setTotalOppShown] = useState(0);
  const [totalsRising, setTotalsRising] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<ShowdownCursor | null>(null);
  const startedRef = useRef(showdown.started);
  const pendingRef = useRef(false);
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
  const leftTarget = round
    ? iAmP1
      ? roundValue(round, 'p1', bountyPosition)
      : roundValue(round, 'p2', bountyPosition)
    : 0;
  const rightTarget = round
    ? iAmP1
      ? roundValue(round, 'p2', bountyPosition)
      : roundValue(round, 'p1', bountyPosition)
    : 0;

  // Totals before this position (Center never adds on this screen).
  const priorTotals = useMemo(
    () => sideTotals(orderedRounds.slice(0, index), iAmP1, bountyPosition, scoreFormatter),
    [bountyPosition, iAmP1, index, orderedRounds, scoreFormatter],
  );
  const afterTotals = useMemo(() => {
    if (isLast) return priorTotals;
    return sideTotals(orderedRounds.slice(0, index + 1), iAmP1, bountyPosition, scoreFormatter);
  }, [bountyPosition, iAmP1, index, isLast, orderedRounds, priorTotals, scoreFormatter]);

  // Snap top totals to prior when entering a position.
  useEffect(() => {
    if (!started || !positionKey) return;
    setTotalMineShown(priorTotals.mine);
    setTotalOppShown(priorTotals.opp);
    setTotalsRising(false);
  }, [positionKey, priorTotals.mine, priorTotals.opp, started]);

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

  const commitCursor = useCallback(
    async (command: { started: boolean; index: number; finished: boolean }) => {
      if (!isHost || pendingRef.current) return;
      pendingRef.current = true;
      setSyncError(null);
      try {
        const next = await setH2HShowdownCursor(roomId, command);
        setOverlay(next);
        await onSyncedRef.current();
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : 'Could not update the showdown.');
        await onSyncedRef.current().catch(() => undefined);
      } finally {
        pendingRef.current = false;
      }
    },
    [isHost, roomId],
  );

  const handleHostStart = useCallback(() => {
    if (!isHost || live.started || pendingRef.current) return;
    hapticLight();
    void commitCursor({ started: true, index: 0, finished: false });
  }, [commitCursor, isHost, live.started]);

  const advance = useCallback(() => {
    if (!isHost || pendingRef.current || phase !== 'settled' || !live.started) return;
    hapticLight();
    if (isLast) {
      void commitCursor({ started: true, index: live.index, finished: true });
      return;
    }
    void commitCursor({ started: true, index: live.index + 1, finished: false });
  }, [commitCursor, isHost, isLast, live.index, live.started, phase]);

  // Dual card count-up — then feed into top totals (except Center).
  useEffect(() => {
    if (!started || !positionKey || phase !== 'counting') return;

    if (reduceMotion) {
      setLeftShown(leftTarget);
      setRightShown(rightTarget);
      setPhase(isLast ? 'settled' : 'feeding');
      return;
    }

    setLeftShown(0);
    setRightShown(0);
    let lastLeft = 0;
    let lastRight = 0;
    const signal = { cancelled: false };

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
      // Center: no feed / no top-total update until See Results.
      setPhase(isLast ? 'settled' : 'feeding');
    });

    return () => {
      signal.cancelled = true;
    };
  }, [isLast, leftTarget, phase, positionKey, reduceMotion, rightTarget, started]);

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

  const cardsSettled = phase !== 'counting';
  const canAdvance = phase === 'settled';
  const showFeed = phase === 'feeding' && !isLast;

  const announcer =
    !cardsSettled
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
    cardsSettled &&
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
      leftSel={leftSel}
      rightSel={rightSel}
      leftShown={leftShown}
      rightShown={rightShown}
      leftTarget={leftTarget}
      rightTarget={rightTarget}
      settled={cardsSettled}
      feeding={showFeed}
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
  leftSel,
  rightSel,
  leftShown,
  rightShown,
  leftTarget,
  rightTarget,
  settled,
  feeding,
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
  leftSel: H2HRoundPublic['p1_selection'];
  rightSel: H2HRoundPublic['p2_selection'];
  leftShown: number;
  rightShown: number;
  leftTarget: number;
  rightTarget: number;
  settled: boolean;
  feeding: boolean;
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
            <span>{myName}</span>
            <strong>{myTotal}</strong>
          </div>
          <div className={`h2h-sd__total h2h-sd__total--opp${feeding ? ' is-feeding' : ''}`}>
            <span>{oppName}</span>
            <strong>{oppTotal}</strong>
          </div>
        </header>

        <p className="h2h-sd__pos">{position}</p>

        <div className={`h2h-sd__match${settled ? ' is-settled' : ''}`}>
          <ShowdownCard
            side="left"
            you
            selection={leftSel}
            value={leftShown}
            target={leftTarget}
            settled={settled}
            feeding={feeding}
            highlight={settled && winnerSide === 'left'}
            dimmed={settled && winnerSide === 'right'}
          />
          <ShowdownCard
            side="right"
            you={false}
            selection={rightSel}
            value={rightShown}
            target={rightTarget}
            settled={settled}
            feeding={feeding}
            highlight={settled && winnerSide === 'right'}
            dimmed={settled && winnerSide === 'left'}
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
            key={position}
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
  highlight,
  dimmed,
}: {
  side: 'left' | 'right';
  you: boolean;
  selection: H2HRoundPublic['p1_selection'];
  value: number;
  target: number;
  settled: boolean;
  feeding: boolean;
  highlight: boolean;
  dimmed: boolean;
}) {
  const colors = selection ? getTeamColors(selection.teamId) : { primary: '#10202b' };
  const ink = contrastOnPrimary(colors.primary);

  return (
    <div
      className={`h2h-sd__card-wrap h2h-sd__card-wrap--${side}${you ? ' is-you' : ''}${
        highlight ? ' is-gold' : ''
      }${dimmed ? ' is-dimmed' : ''}${feeding ? ' is-feeding' : ''}`}
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
        <em className="h2h-sd__card-value" style={{ color: ink }}>
          {formatCountUpDollars(value, target, settled)}
        </em>
      </div>
    </div>
  );
}
