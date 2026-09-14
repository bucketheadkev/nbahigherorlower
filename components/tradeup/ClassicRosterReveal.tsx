'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  BILLION_GOAL,
  formatDollarsExact,
  getDollarValue,
  type ValuedPlayer,
} from '@/lib/tradeup/billionDollar';
import { resultPhrase } from '@/lib/tradeup/resultPhrase';
import {
  playFinalTotalSettleSound,
  stopFinalTotalSettleSound,
  warmFinalTotalSettleSound,
} from '@/lib/tradeup/gameAudio';
import {
  captureRunShareCard,
  shareRunResultImage,
} from '@/lib/tradeup/shareRunResult';
import {
  hapticHeavy,
  hapticSuccess,
  hapticTap,
  hapticWarning,
} from '@/lib/tradeup/haptics';
import {
  cancelFrame,
  easeOutCubic,
  scheduleFrame,
} from '@/lib/tradeup/perf/rafClock';
import { LINEUP_POSITIONS, POSITION_LABELS } from '@/lib/tradeup/startingLineup';
import type { Position } from '@/lib/tradeup/types';
import { useLocale } from '@/hooks/useLocale';
import { contrastOnPrimary, getTeamColors } from '@/lib/tradeup/teamColors';
import { BillionCelebration } from './BillionCelebration';

type SeatedRevealPlayer = ValuedPlayer & { seatedSlot?: Position };

const ES_POSITION_LABELS: Record<Position, string> = {
  PG: 'Base',
  SG: 'Escolta',
  SF: 'Alero',
  PF: 'Ala-pívot',
  C: 'Pívot',
};

function playerInSlot(roster: SeatedRevealPlayer[], slot: Position): SeatedRevealPlayer | undefined {
  return roster.find((player) => player.seatedSlot === slot);
}

interface ClassicRosterRevealProps {
  roster: SeatedRevealPlayer[];
  reduceMotion?: boolean;
  onComplete: (payload: { teamValue: number }) => void;
  /** Fires the moment the final total finishes counting up. */
  onTotalSettled?: (payload: { teamValue: number }) => void;
  onPlayAgain: () => void;
  /**
   * `solo` — Build Another + Share (Classic Run).
   * `continue` — single continue CTA for 1v1 after valuation.
   * `none` — auto-advance shortly after the five land (no buttons).
   */
  actions?: 'solo' | 'continue' | 'none';
  continueLabel?: string;
  onContinue?: () => void;
  /** Optional eyebrow above the hero heading (e.g. YOUR FIVE). */
  eyebrow?: string | null;
}

type Phase =
  | 'enter'
  | 'analyze'
  | 'finalize'
  | 'reveal'
  | 'roster'
  | 'done';

/** Visual track ceiling — sits above typical max roster (~$1.125B). */
const TRACK_MAX = 1_250_000_000;

function formatCompactMillions(value: number): string {
  return `$${(value / 1_000_000).toFixed(1)}M`;
}

/** Ease-in-out for a financial processor feel (fast middle, soft ends). */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function animateNumber(
  from: number,
  to: number,
  ms: number,
  onFrame: (value: number) => void,
  onDone?: () => void,
  ease: (t: number) => number = easeOutCubic,
): number {
  if (ms <= 0) {
    onFrame(to);
    onDone?.();
    return 0;
  }
  const start = performance.now();
  let raf = 0;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    onFrame(Math.round(from + (to - from) * ease(t)));
    if (t < 1) {
      raf = scheduleFrame(step);
    } else {
      onDone?.();
    }
  };
  raf = scheduleFrame(step);
  return raf;
}

/**
 * Automatic post-draft valuation reveal — hands-free after the 5th pick.
 * Presentation polish only; valuation math unchanged.
 */
export function ClassicRosterReveal({
  roster,
  reduceMotion = false,
  onComplete,
  onTotalSettled,
  onPlayAgain,
  actions = 'solo',
  continueLabel = 'Continue',
  onContinue,
  eyebrow = null,
}: ClassicRosterRevealProps) {
  const { locale } = useLocale();
  const teamValue = useMemo(
    () => roster.reduce((sum, p) => sum + getDollarValue(p), 0),
    [roster],
  );
  const isBillion = teamValue >= BILLION_GOAL;
  const delta = teamValue - BILLION_GOAL;
  const phrase = resultPhrase(teamValue);
  const goalPct = (BILLION_GOAL / TRACK_MAX) * 100;

  const [phase, setPhase] = useState<Phase>('enter');
  const [entered, setEntered] = useState(false);
  const [analyzeExiting, setAnalyzeExiting] = useState(false);
  const [checkedCount, setCheckedCount] = useState(0);
  const [displayTotal, setDisplayTotal] = useState(0);
  const [totalSettling, setTotalSettling] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [showPhrase, setShowPhrase] = useState(false);
  const [rosterCount, setRosterCount] = useState(0);
  const [pulseIndex, setPulseIndex] = useState<number | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const completedRef = useRef(false);
  const settleSoundPlayedRef = useRef(false);
  const displayRef = useRef(0);
  const countRafRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const shareCardRef = useRef<HTMLDivElement | null>(null);
  const aliveRef = useRef(true);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const later = useCallback(
    (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        if (!aliveRef.current) return;
        fn();
      }, reduceMotion ? Math.min(ms, 40) : ms);
      timersRef.current.push(id);
      return id;
    },
    [reduceMotion],
  );

  const finishRunOnce = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete({ teamValue });
    // Cash-register SFX fires when the total settles (finalize), not here.
    if (isBillion) {
      void hapticHeavy();
      later(() => hapticSuccess(), 420);
    } else {
      hapticWarning();
    }
  }, [isBillion, later, onComplete, teamValue]);

  useEffect(() => {
    warmFinalTotalSettleSound();
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      clearTimers();
      cancelFrame(countRafRef.current);
      stopFinalTotalSettleSound();
    };
  }, [clearTimers]);

  // enter → analyze
  useEffect(() => {
    if (phase !== 'enter') return;
    later(() => setEntered(true), 16);
    later(() => setPhase('analyze'), reduceMotion ? 40 : 200);
  }, [later, phase, reduceMotion]);

  // analyze PG→C, then fade group out
  useEffect(() => {
    if (phase !== 'analyze') return;
    const stepMs = reduceMotion ? 30 : 180;
    let i = 0;
    const tick = () => {
      i += 1;
      setCheckedCount(i);
      if (i < 5) {
        later(tick, stepMs);
      } else {
        later(() => {
          setAnalyzeExiting(true);
          later(() => setPhase('finalize'), reduceMotion ? 40 : 180);
        }, reduceMotion ? 40 : 150);
      }
    };
    later(tick, stepMs);
  }, [later, phase, reduceMotion]);

  // finalize count → settle → reveal
  useEffect(() => {
    if (phase !== 'finalize') return;
    cancelFrame(countRafRef.current);
    displayRef.current = 0;
    setDisplayTotal(0);
    setTotalSettling(false);
    const countMs = reduceMotion ? 80 : 900;
    countRafRef.current = animateNumber(
      0,
      teamValue,
      countMs,
      (v) => {
        displayRef.current = v;
        setDisplayTotal(v);
      },
      () => {
        if (!aliveRef.current) return;
        setDisplayTotal(teamValue);
        displayRef.current = teamValue;
        setTotalSettling(true);
        // Once — the moment the final total finishes counting and settles.
        if (!settleSoundPlayedRef.current) {
          settleSoundPlayedRef.current = true;
          playFinalTotalSettleSound();
          onTotalSettled?.({ teamValue });
        }
        later(() => setPhase('reveal'), reduceMotion ? 40 : 220);
      },
      easeInOutCubic,
    );
  }, [later, onTotalSettled, phase, reduceMotion, teamValue]);

  // reveal: compare + track + phrase, then roster
  useEffect(() => {
    if (phase !== 'reveal') return;
    setDisplayTotal(teamValue);
    displayRef.current = teamValue;
    later(() => setShowCompare(true), reduceMotion ? 20 : 80);
    later(() => {
      if (isBillion) setCelebrate(true);
      finishRunOnce();
    }, reduceMotion ? 60 : 420);
    later(() => setShowPhrase(true), reduceMotion ? 80 : 520);
    later(() => setPhase('roster'), reduceMotion ? 100 : 620);
  }, [finishRunOnce, isBillion, later, phase, reduceMotion, teamValue]);

  // roster stagger + value pulse
  useEffect(() => {
    if (phase !== 'roster') return;
    const stepMs = reduceMotion ? 20 : 115;
    let i = 0;
    const tick = () => {
      i += 1;
      setRosterCount(i);
      setPulseIndex(i - 1);
      later(() => {
        setPulseIndex((current) => (current === i - 1 ? null : current));
      }, reduceMotion ? 40 : 220);
      if (i < 5) {
        later(tick, stepMs);
      } else {
        later(() => setPhase('done'), reduceMotion ? 40 : 160);
      }
    };
    later(tick, stepMs);
  }, [later, phase, reduceMotion]);

  // 1v1 embedded: auto-advance after FINAL FIVE lands
  useEffect(() => {
    if (phase !== 'done' || actions !== 'none' || !onContinue) return;
    later(() => onContinue(), reduceMotion ? 80 : 900);
  }, [actions, later, onContinue, phase, reduceMotion]);

  const handleShare = useCallback(async () => {
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

  const heading =
    phase === 'analyze'
      ? 'ANALYZING FIVE'
      : phase === 'finalize'
        ? 'FINALIZING VALUE'
        : 'FINAL VALUE';

  const showHeroTotal = phase !== 'analyze' && phase !== 'enter';
  const showActions = phase === 'done' && actions !== 'none';
  const showFive = phase === 'roster' || phase === 'done';
  const liveTrackPct = Math.min(
    100,
    Math.max(0, (displayTotal / TRACK_MAX) * 100),
  );

  return (
    <div
      className={`classic-val${entered ? ' is-entered' : ''}${
        isBillion ? ' is-billion' : ''
      }${phase === 'analyze' ? ' is-analyzing' : ''}`}
      aria-label="Roster valuation"
    >
      {celebrate ? (
        <BillionCelebration
          durationMs={teamValue >= 1_100_000_000 ? 2600 : 2000}
        />
      ) : null}

      <div ref={shareCardRef} className="classic-val__shot">
        <div className="classic-val__hero">
          {eyebrow ? <p className="classic-val__eyebrow">{eyebrow}</p> : null}
          <p className="classic-val__heading">{heading}</p>

          {phase === 'analyze' ? (
            <ul
              className={`classic-val__analyze${
                analyzeExiting ? ' is-exiting' : ''
              }`}
              aria-label="Analyzing positions"
            >
              {LINEUP_POSITIONS.map((pos, index) => {
                const done = index < checkedCount;
                const player = playerInSlot(roster, pos);
                const label =
                  locale === 'es' ? ES_POSITION_LABELS[pos] : POSITION_LABELS[pos];
                return (
                  <li
                    key={pos}
                    className={`classic-val__analyze-row${
                      done ? ' is-done' : ''
                    }`}
                  >
                    <span className="classic-val__analyze-pos">{label}</span>
                    <span className="classic-val__analyze-dash" aria-hidden>
                      —
                    </span>
                    <strong className="classic-val__analyze-name" aria-hidden={!done}>
                      {player?.name ?? '—'}
                    </strong>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {showHeroTotal ? (
            <p
              className={`classic-val__total${
                totalSettling ? ' is-settling' : ''
              }`}
              aria-live="polite"
            >
              {formatDollarsExact(displayTotal)}
            </p>
          ) : null}

          {showHeroTotal ? (
            <p className="classic-val__goal">1B Run</p>
          ) : null}

          {showHeroTotal ? (
            <div className="classic-val__track is-live" aria-hidden>
              <span className="classic-val__track-rail" />
              <span
                className="classic-val__track-fill"
                style={{ width: `${liveTrackPct}%` }}
              />
              <span
                className="classic-val__track-goal"
                style={{ left: `${goalPct}%` }}
              />
              <span
                className="classic-val__track-run"
                style={{ left: `${liveTrackPct}%` }}
              />
              <span className="classic-val__track-min">$0</span>
              <span
                className="classic-val__track-goal-label"
                style={{ left: `${goalPct}%` }}
              >
                $1B
              </span>
            </div>
          ) : null}

          {showCompare ? (
            <div className="classic-val__compare is-in">
              <p
                className={`classic-val__delta${
                  isBillion ? ' is-over' : ' is-under'
                }`}
              >
                {isBillion ? '+' : '−'}
                {formatDollarsExact(Math.abs(delta))}
              </p>
              <p className="classic-val__delta-label">
                {isBillion ? 'ABOVE $1 BILLION' : 'TO $1 BILLION'}
              </p>
            </div>
          ) : null}

          {showPhrase ? (
            <p className="classic-val__phrase is-in">{phrase}</p>
          ) : null}
        </div>

        {showFive ? (
          <div className="classic-val__five">
            <p className="classic-val__five-heading">FINAL FIVE</p>
            <ul className="classic-val__five-list">
              {LINEUP_POSITIONS.map((pos, index) => {
                const player = roster[index];
                if (!player || index >= rosterCount) {
                  return (
                    <li
                      key={pos}
                      className="classic-val__five-row is-placeholder"
                      aria-hidden
                    />
                  );
                }
                const value = getDollarValue(player);
                const accent = getTeamColors(player.teamId).primary;
                const ink = contrastOnPrimary(accent);
                return (
                  <li
                    key={pos}
                    className={`classic-val__five-row is-in${
                      pulseIndex === index ? ' is-pulse' : ''
                    }`}
                    style={
                      {
                        ['--row-accent' as string]: accent,
                        ['--row-ink' as string]: ink,
                        backgroundColor: accent,
                        color: ink,
                      } as CSSProperties
                    }
                  >
                    <span className="classic-val__five-pos">{pos}</span>
                    <strong className="classic-val__five-name">
                      {player.name}
                    </strong>
                    <em className="classic-val__five-value">
                      {formatCompactMillions(value)}
                    </em>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>

      {showActions && actions === 'continue' ? (
        <div className="classic-val__actions">
          <button
            type="button"
            className="billion-result-page__again"
            onPointerDown={() => {
              hapticTap();
              onContinue?.();
            }}
          >
            {continueLabel}
          </button>
        </div>
      ) : null}

      {showActions && actions === 'solo' ? (
        <div className="classic-val__actions">
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
              void handleShare();
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
      ) : null}
    </div>
  );
}
