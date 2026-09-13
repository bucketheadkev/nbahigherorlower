'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BILLION_GOAL,
  formatDollarsExact,
  getDollarValue,
  type ValuedPlayer,
} from '@/lib/tradeup/billionDollar';
import { playFinalTotalSettleSound, stopFinalTotalSettleSound } from '@/lib/tradeup/gameAudio';
import {
  captureRunShareCard,
  shareRunResultImage,
} from '@/lib/tradeup/shareRunResult';
import {
  hapticCancel,
  hapticHeavy,
  hapticPlayerReveal,
  hapticSuccess,
  hapticTap,
  hapticValueComplete,
  hapticWarning,
} from '@/lib/tradeup/haptics';
import { BillionCelebration } from './BillionCelebration';
import {
  cancelFrame,
  easeOutCubic,
  scheduleFrame,
} from '@/lib/tradeup/perf/rafClock';
import { LINEUP_POSITIONS, POSITION_LABELS } from '@/lib/tradeup/startingLineup';
import { contrastOnPrimary, getTeamColors } from '@/lib/tradeup/teamColors';

type RevealStage = 'ready' | 'reading' | 'adding' | 'results';

interface ValueRevealMachineProps {
  roster: ValuedPlayer[];
  reduceMotion?: boolean;
  autoStart?: boolean;
  onComplete: (payload: { teamValue: number }) => void;
  onExit: () => void;
  onPlayAgain: () => void;
}

function playerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

function firstName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts[0] ?? name;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function projectedTotal(fedValues: number[]): number {
  if (fedValues.length === 0) return 0;
  const avg = fedValues.reduce((a, b) => a + b, 0) / fedValues.length;
  return Math.round(avg * 5);
}

/**
 * Value Chamber — reads each rostered player PG→C (2s reading + 2s green add).
 * No ticket feed animation. Results on a clean white roster page.
 */
export function ValueRevealMachine({
  roster,
  reduceMotion = false,
  autoStart = false,
  onComplete,
  onExit,
  onPlayAgain,
}: ValueRevealMachineProps) {
  const teamValue = useMemo(
    () => roster.reduce((sum, p) => sum + getDollarValue(p), 0),
    [roster],
  );
  const isBillion = teamValue >= BILLION_GOAL;
  const shortfall = Math.max(0, BILLION_GOAL - teamValue);

  const [stage, setStage] = useState<RevealStage>('ready');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [processed, setProcessed] = useState(0);
  const [projected, setProjected] = useState(0);
  const [addFlash, setAddFlash] = useState<number | null>(null);

  const busyRef = useRef(false);
  const skipRef = useRef(false);
  const totalRef = useRef(0);
  const completedRef = useRef(false);
  const autoStartedRef = useRef(false);
  const countRafRef = useRef(0);
  const totalElRef = useRef<HTMLParagraphElement | null>(null);
  const paceElRef = useRef<HTMLSpanElement | null>(null);
  const addElRef = useRef<HTMLParagraphElement | null>(null);

  const activePlayer = activeIndex >= 0 ? roster[activeIndex] ?? null : null;
  const activeSlot =
    activeIndex >= 0 ? LINEUP_POSITIONS[activeIndex] ?? null : null;

  const paintTotal = useCallback((n: number) => {
    totalRef.current = n;
    if (totalElRef.current) {
      totalElRef.current.textContent = formatDollarsExact(n);
    }
  }, []);

  const paintPace = useCallback((n: number) => {
    if (paceElRef.current) {
      paceElRef.current.textContent = formatDollarsExact(n);
    }
  }, []);

  useEffect(
    () => () => {
      cancelFrame(countRafRef.current);
      stopFinalTotalSettleSound();
      hapticCancel();
    },
    [],
  );

  useEffect(() => {
    paintTotal(0);
    paintPace(0);
  }, [paintPace, paintTotal]);

  const animateTotalTo = useCallback(
    (from: number, to: number, ms: number) =>
      new Promise<void>((resolve) => {
        cancelFrame(countRafRef.current);
        if (skipRef.current || reduceMotion || ms < 60) {
          paintTotal(to);
          resolve();
          return;
        }
        const t0 = performance.now();
        const step = (now: number) => {
          if (skipRef.current) {
            paintTotal(to);
            resolve();
            return;
          }
          const t = Math.min(1, (now - t0) / ms);
          paintTotal(Math.round(from + (to - from) * easeOutCubic(t)));
          if (t < 1) {
            countRafRef.current = scheduleFrame(step);
            return;
          }
          paintTotal(to);
          resolve();
        };
        countRafRef.current = scheduleFrame(step);
      }),
    [paintTotal, reduceMotion],
  );

  const finishToResults = useCallback(() => {
    paintTotal(teamValue);
    setActiveIndex(-1);
    setProcessed(LINEUP_POSITIONS.length);
    setAddFlash(null);
    setProjected(teamValue);
    paintPace(teamValue);
    setStage('results');
    busyRef.current = false;

    if (!completedRef.current) {
      completedRef.current = true;
      onComplete({ teamValue });
      // Once — when the final combined total has finished counting / settles.
      playFinalTotalSettleSound();
      if (isBillion) {
        void hapticHeavy();
        window.setTimeout(() => {
          hapticSuccess();
        }, 420);
      } else {
        hapticWarning();
      }
    }
  }, [isBillion, onComplete, paintPace, paintTotal, teamValue]);

  const runPlayerCycle = useCallback(
    async (index: number, runningTotal: number, fedValues: number[]) => {
      if (skipRef.current) {
        return { total: runningTotal, fed: fedValues };
      }
      const player = roster[index];
      if (!player) return { total: runningTotal, fed: fedValues };

      const value = getDollarValue(player);
      const readMs = reduceMotion ? 80 : 2000;
      const addMs = reduceMotion ? 100 : 2000;

      setActiveIndex(index);
      setAddFlash(null);
      setStage('reading');
      paintTotal(runningTotal);
      hapticPlayerReveal();

      await wait(readMs);
      if (skipRef.current) {
        return { total: runningTotal, fed: fedValues };
      }

      setStage('adding');
      setAddFlash(value);
      const nextFed = [...fedValues, value];
      const pace = projectedTotal(nextFed);
      // Pace updates the instant +value appears — don't wait for total count-up.
      setProjected(pace);
      paintPace(pace);
      const nextTotal = runningTotal + value;
      await animateTotalTo(runningTotal, nextTotal, addMs);
      if (skipRef.current) {
        return { total: nextTotal, fed: nextFed };
      }
      hapticValueComplete();

      setProcessed(index + 1);
      setAddFlash(null);
      return { total: nextTotal, fed: nextFed };
    },
    [animateTotalTo, paintPace, paintTotal, reduceMotion, roster],
  );

  const runAll = useCallback(async () => {
    if (busyRef.current || skipRef.current) return;
    busyRef.current = true;
    let total = 0;
    let fed: number[] = [];
    paintTotal(0);
    paintPace(0);

    for (let i = 0; i < LINEUP_POSITIONS.length; i += 1) {
      if (skipRef.current) return;
      if (!roster[i]) continue;
      const result = await runPlayerCycle(i, total, fed);
      if (skipRef.current) return;
      total = result.total;
      fed = result.fed;
    }

    if (skipRef.current) return;
    finishToResults();
  }, [finishToResults, paintPace, paintTotal, roster, runPlayerCycle]);

  const handleSkipToResult = useCallback(() => {
    if (skipRef.current || completedRef.current || stage === 'results') return;
    skipRef.current = true;
    cancelFrame(countRafRef.current);
    hapticTap();
    finishToResults();
  }, [finishToResults, stage]);

  const runAllRef = useRef(runAll);
  runAllRef.current = runAll;

  // Start once when the chamber mounts with a full roster.
  // Do not depend on runAll identity — that was cancelling the start timer.
  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return;
    if (roster.length < 5) return;
    const t = window.setTimeout(() => {
      if (autoStartedRef.current) return;
      autoStartedRef.current = true;
      void runAllRef.current();
    }, reduceMotion ? 60 : 280);
    return () => window.clearTimeout(t);
  }, [autoStart, reduceMotion, roster.length]);

  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const shareCardRef = useRef<HTMLDivElement | null>(null);

  const handleShareX = useCallback(async () => {
    if (sharing) return;
    const node = shareCardRef.current;
    if (!node) {
      setShareError('Could not capture results');
      return;
    }

    setSharing(true);
    setShareError(null);
    hapticTap();
    try {
      const blob = await captureRunShareCard(node);
      if (!blob) {
        setShareError('Could not capture results');
        return;
      }
      const result = await shareRunResultImage(blob);
      if (result.ok === false && !result.cancelled) {
        setShareError(result.message);
      }
    } finally {
      setSharing(false);
    }
  }, [sharing]);

  if (stage === 'results') {
    return (
      <div
        className={`billion-result-page billion-result-page--arena${
          isBillion ? ' is-success' : ''
        }`}
        aria-label="Final roster"
      >
        {isBillion ? <BillionCelebration /> : null}
        <div className="billion-result-page__card">
          <div ref={shareCardRef} className="billion-result-page__share-shot">
            <p className="billion-result-page__kicker">FINAL ROSTER</p>
            <p className="billion-result-page__total">
              {formatDollarsExact(teamValue)}
            </p>
            <p
              className={`billion-result-page__short${
                isBillion ? ' is-reached' : ' is-short'
              }`}
            >
              {isBillion
                ? '$1 BILLION REACHED'
                : `${formatDollarsExact(shortfall)} SHORT`}
            </p>
            <p className="billion-result-page__share-brand">1B RUN</p>

            <ul className="billion-result-page__list">
              {LINEUP_POSITIONS.map((pos, index) => {
                const player = roster[index];
                const colors = player
                  ? getTeamColors(player.teamId)
                  : { primary: '#10202b' };
                const ink = contrastOnPrimary(colors.primary);
                const value = player ? getDollarValue(player) : 0;
                return (
                  <li
                    key={pos}
                    style={{
                      background: colors.primary,
                      color: ink,
                    }}
                  >
                    <span style={{ color: ink, opacity: 0.78 }}>{pos}</span>
                    <strong style={{ color: ink }}>{player?.name ?? '—'}</strong>
                    <em style={{ color: ink }}>{formatDollarsExact(value)}</em>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="billion-result-page__actions">
          <button
            type="button"
            className="billion-result-page__again"
            onPointerDown={() => {
              hapticTap();
              onPlayAgain();
            }}
          >
            Build Another
          </button>
          <button
            type="button"
            className="billion-result-page__share"
            onClick={() => {
              void handleShareX();
            }}
            disabled={sharing}
          >
            <svg
              className="billion-result-page__share-icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <circle cx="18" cy="5" r="3" fill="currentColor" />
              <circle cx="6" cy="12" r="3" fill="currentColor" />
              <circle cx="18" cy="19" r="3" fill="currentColor" />
              <path
                d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span>{sharing ? 'Preparing…' : 'Share'}</span>
          </button>
          {shareError ? (
            <p className="billion-result-page__share-error" role="alert">
              {shareError}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  const statusLabel =
    stage === 'ready'
      ? 'READY'
      : stage === 'reading' && activePlayer
        ? `Reading ${firstName(activePlayer.name)}`
        : stage === 'adding'
          ? 'ADDING VALUE'
          : 'LIVE';

  return (
    <div
      className={`value-vault value-vault--fullscreen value-vault--classic${
        stage === 'reading' || stage === 'adding' ? ' is-processing' : ''
      }`}
    >
      <p className="value-vault__led-status value-vault__led-status--fs">{statusLabel}</p>

      <div className="value-vault__led-body value-vault__led-body--fs">
        {activePlayer && activeSlot ? (
          <div className="value-vault__id-card">
            <em>{POSITION_LABELS[activeSlot] ?? activeSlot}</em>
            <strong>{activePlayer.name}</strong>
          </div>
        ) : null}

        <p
          ref={totalElRef}
          className={`value-vault__led-total is-green${
            stage === 'adding' ? ' is-counting' : ''
          }`}
        >
          {formatDollarsExact(totalRef.current)}
        </p>

        {addFlash != null ? (
          <p ref={addElRef} className="value-vault__add-flash is-green-add">
            +{formatDollarsExact(addFlash)}
          </p>
        ) : null}
      </div>

      <p
        className={`value-vault__led-pace value-vault__led-pace--fs${
          projected >= BILLION_GOAL ? ' is-on-track' : ' is-off-track'
        }`}
      >
        ON PACE{' '}
        <span ref={paceElRef}>{formatDollarsExact(projected)}</span>
      </p>

      <div className="value-vault__roster-dock" aria-label="Your five">
        {LINEUP_POSITIONS.map((slot, index) => {
          const player = roster[index];
          if (!player) return null;
          const colors = getTeamColors(player.teamId);
          const done = index < processed;
          const active = index === activeIndex;
          return (
            <div
              key={slot}
              className={`value-vault__roster-dock-item${done ? ' is-done' : ''}${
                active ? ' is-active' : ''
              }`}
            >
              <span
                className="value-vault__roster-dock-circle"
                style={{
                  backgroundColor: colors.primary,
                  color: contrastOnPrimary(colors.primary),
                  borderColor: colors.primary,
                }}
              >
                {playerInitials(player.name)}
              </span>
              <span className="value-vault__roster-dock-pos">{slot}</span>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="value-vault__skip"
        onPointerDown={(e) => {
          e.preventDefault();
          handleSkipToResult();
        }}
      >
        Skip to result
      </button>
    </div>
  );
}
