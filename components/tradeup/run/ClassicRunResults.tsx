'use client';

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import {
  BILLION_GOAL,
  formatDollarsExact,
  getDollarValueForSlot,
  type ValuedPlayer,
} from '@/lib/tradeup/billionDollar';
import {
  playFinalTotalSettleSound,
  playResultsRowSound,
  playResultsSuspenseSound,
  playResultsVictorySound,
  stopFinalTotalSettleSound,
  warmResultsRevealSounds,
} from '@/lib/tradeup/gameAudio';
import { formatCash } from '@/lib/tradeup/bank';
import { hapticHeavy, hapticLight, hapticSuccess, hapticTap, hapticWarning } from '@/lib/tradeup/haptics';
import { holdInterruptions } from '@/lib/tradeup/interruptions';
import { cancelFrame, easeOutCubic, scheduleFrame } from '@/lib/tradeup/perf/rafClock';
import { rolloverFor } from '@/lib/tradeup/rollover';
import { captureRunShareCard, shareRunResultImage } from '@/lib/tradeup/shareRunResult';
import { LINEUP_POSITIONS } from '@/lib/tradeup/startingLineup';
import { contrastOnPrimary, getTeamColors } from '@/lib/tradeup/teamColors';
import type { Position } from '@/lib/tradeup/types';
import { useXpProfile } from '@/hooks/useXpProfile';
import { calculateClassicRunRewards } from '@/lib/tradeup/xp/config';
import { XpProgressBar } from '../xp/XpProgressBar';
import { WinCelebration } from './WinCelebration';

type SeatedPlayer = ValuedPlayer & { seatedSlot?: Position };

/*
 * Timeline (ms from mount; the arena has already faded to black). The spotlight flickers on,
 * then the rows light up PG → C, each adding its value to the total. The fifth only waits a
 * beat when the four-player total is exactly $790M.
 */
const T_TOTAL_IN = 320;
const ROW_GAP_MS = 350;
const T_ROW_FIRST = 450;
/** Even cadence for all five when there is no $790M suspense beat. */
const T_ROWS_EVEN = [0, 1, 2, 3, 4].map((i) => T_ROW_FIRST + i * ROW_GAP_MS);
/** Suspense cadence: same first four, then a held beat before C. */
const T_ROWS_SUSPENSE = [450, 800, 1150, 1500, 2450];
const STEP_COUNT_MS = 340;
const LAST_COUNT_MS = 880;
const T_ACTIONS_AFTER_FINAL = 260;
/** Only this four-player total unlocks the fifth-row hesitation. */
const FIFTH_SUSPENSE_AT = 790_000_000;

interface Props {
  roster: SeatedPlayer[];
  reduceMotion?: boolean;
  /** The total has finished counting (achievements, run record). */
  onTotalSettled: (payload: { teamValue: number }) => void;
  /** The run is complete (verification, personal best, outcome). */
  onComplete: (payload: { teamValue: number }) => void;
  /** Begin trivia (eligible $1B+) or build another. */
  onPlayAgain: () => void;
  /** Skip trivia and start a new run (eligible $1B+ only). */
  onSkipTrivia?: () => void;
  /** Leave results and return home. */
  onExit?: () => void;
}

interface Row {
  pos: Position;
  name: string;
  value: number;
  primary: string;
  hi: string;
  lo: string;
  accent: string;
  glow: string;
  ink: string;
}

function hexToHsl(hex: string): [number, number, number] {
  const raw = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 : max === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h * 3600) / 10} ${Math.round(Math.min(1, s) * 1000) / 10}% ${Math.round(Math.min(1, l) * 1000) / 10}%)`;
}

/** Gloss shades of a team primary that keep its saturation (a white mix would wash it out). */
function shades(primary: string): { hi: string; lo: string } {
  const [h, s, l] = hexToHsl(primary);
  const lift = Math.min(0.12, Math.max(0.08, l * 0.3 + 0.03));
  return { hi: hsl(h, s * 1.1, Math.min(0.6, l + lift)), lo: hsl(h, s, l * 0.4) };
}

/** A brighter version of the team's alternate color for its glow; neutrals glow silver or white. */
function brightAccent(accent: string): string {
  const [h, s, l] = hexToHsl(accent);
  if (s < 0.12) return l < 0.5 ? '#cfd8e6' : '#ffffff';
  return hsl(h, Math.max(s, 0.78), Math.max(l, 0.64));
}

function millions(value: number): string {
  return `$${Math.round(value / 1_000_000).toLocaleString('en-US')}M`;
}

/** The team's secondary color travelling around the border: a soft dash on the row's own outline. */
const BorderGlow = memo(function BorderGlow({ index }: { index: number }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number; r: number; sw: number } | null>(null);
  useLayoutEffect(() => {
    const svg = ref.current;
    const row = svg?.parentElement;
    if (!svg || !row) return;
    const measure = () => {
      const cs = getComputedStyle(row);
      const border = parseFloat(cs.borderTopWidth) || 2;
      setBox({
        w: row.offsetWidth,
        h: row.offsetHeight,
        r: parseFloat(cs.borderTopLeftRadius) || 12,
        sw: border,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, []);
  const d = useMemo(() => {
    if (!box) return '';
    const i = box.sw / 2;
    const { w, h } = box;
    const r = Math.max(0, box.r - i);
    return `M${i + r} ${i}H${w - i - r}A${r} ${r} 0 0 1 ${w - i} ${i + r}V${h - i - r}A${r} ${r} 0 0 1 ${w - i - r} ${h - i}H${i + r}A${r} ${r} 0 0 1 ${i} ${h - i - r}V${i + r}A${r} ${r} 0 0 1 ${i + r} ${i}Z`;
  }, [box]);
  return (
    <svg
      ref={ref}
      className="cr-row__glow"
      width={box?.w ?? 0}
      height={box?.h ?? 0}
      viewBox={box ? `0 0 ${box.w} ${box.h}` : undefined}
      style={{ animationDelay: `${-index * 1.7}s` } as CSSProperties}
      aria-hidden
    >
      {box ? (
        <>
          <path className="cr-row__glow-l1" d={d} pathLength={100} strokeWidth={box.sw * 5} />
          <path className="cr-row__glow-l2" d={d} pathLength={100} strokeWidth={box.sw * 3.2} />
          <path className="cr-row__glow-l3" d={d} pathLength={100} strokeWidth={box.sw * 1.9} />
          <path className="cr-row__glow-core" d={d} pathLength={100} strokeWidth={box.sw * 1.05} />
        </>
      ) : null}
    </svg>
  );
});

/** The full name on one line; the type shrinks (real font size, so it stays sharp) only if needed. */
function FitName({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    const fit = () => {
      el.style.fontSize = '';
      const base = parseFloat(getComputedStyle(el).fontSize) || 16;
      const over = el.scrollWidth / Math.max(1, box.clientWidth);
      if (over > 1) el.style.fontSize = `${Math.floor((base / over) * 10) / 10}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [text]);
  return (
    <span ref={ref} className="cr-row__name-text">
      {text}
    </span>
  );
}

/**
 * Classic results: the arena goes dark, a spotlight flickers on, the five rows light up in their
 * final places PG → C while the team total counts up, and the screen settles on the approved
 * layout (design/classic-results-reference.png). Tap anywhere during the reveal to finish it.
 */
export function ClassicRunResults({
  roster,
  reduceMotion = false,
  onTotalSettled,
  onComplete,
  onPlayAgain,
  onSkipTrivia,
  onExit,
}: Props) {
  const rows = useMemo<Row[]>(
    () =>
      LINEUP_POSITIONS.flatMap((pos) => {
        const player = roster.find((p) => p.seatedSlot === pos);
        if (!player) return [];
        const colors = getTeamColors(player.teamId);
        return [
          {
            pos,
            name: player.name.trim(),
            value: getDollarValueForSlot(player, pos),
            primary: colors.primary,
            accent: colors.accent,
            glow: brightAccent(colors.accent),
            ink: contrastOnPrimary(colors.primary),
            ...shades(colors.primary),
          },
        ];
      }),
    [roster],
  );
  const teamValue = useMemo(() => rows.reduce((sum, row) => sum + row.value, 0), [rows]);
  const isBillion = teamValue >= BILLION_GOAL;
  const fourPlayerTotal = useMemo(
    () => rows.slice(0, 4).reduce((sum, row) => sum + row.value, 0),
    [rows],
  );
  /** Fifth-row hesitation only when the first four land on exactly $790M. */
  const holdFifth = Math.round(fourPlayerTotal) === FIFTH_SUSPENSE_AT;
  const rowTimes = holdFifth ? T_ROWS_SUSPENSE : T_ROWS_EVEN;
  const rollover = rolloverFor(teamValue);
  const xpBreakdown = calculateClassicRunRewards(teamValue);
  /** Trivia BEGIN only when the run banks rollover above $1B. */
  const showTrivia = isBillion && rollover > 0;
  const { progress } = useXpProfile();

  const [shown, setShown] = useState(0);
  const [display, setDisplay] = useState(0);
  const [totalIn, setTotalIn] = useState(false);
  const [final, setFinal] = useState(false);
  const [done, setDone] = useState(false);
  const [skipped, setSkipped] = useState(false);
  /** The held beat before the fifth player. */
  const [suspense, setSuspense] = useState(false);
  /** Crossing $1B: money, confetti and a short shake. */
  const [party, setParty] = useState(false);
  const [shaking, setShaking] = useState(false);
  /** Buttons take taps a beat after they appear, so the tap that skips can't also press one. */
  const [live, setLive] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<number[]>([]);
  const raf = useRef(0);
  const displayRef = useRef(0);
  const finishedRef = useRef(false);
  const stopRiser = useRef<(() => void) | null>(null);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const countTo = useCallback((to: number, ms: number, onDone?: () => void) => {
    cancelFrame(raf.current);
    const from = displayRef.current;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const v = Math.round(from + (to - from) * easeOutCubic(t));
      displayRef.current = v;
      setDisplay(v);
      if (t < 1) raf.current = scheduleFrame(step);
      else onDone?.();
    };
    raf.current = scheduleFrame(step);
  }, []);

  /** The total is final: sound, haptics and the run callbacks, exactly once. */
  const settle = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    displayRef.current = teamValue;
    setDisplay(teamValue);
    setFinal(true);
    if (isBillion) {
      playResultsVictorySound();
      hapticHeavy();
      later(() => hapticSuccess(), 380);
      setParty(true);
      if (!reduceMotion) {
        setShaking(true);
        later(() => setShaking(false), 420);
      }
    } else {
      playFinalTotalSettleSound();
      hapticWarning();
    }
    onTotalSettled({ teamValue });
    onComplete({ teamValue });
  }, [isBillion, later, onComplete, onTotalSettled, reduceMotion, teamValue]);

  // Keep hub XP / earnings from covering Build Another while results are up.
  useEffect(() => holdInterruptions(), []);

  useEffect(() => {
    warmResultsRevealSounds();
    if (reduceMotion) {
      setTotalIn(true);
      setShown(rows.length);
      settle();
      setDone(true);
      return;
    }
    later(() => setTotalIn(true), T_TOTAL_IN);
    let running = 0;
    const times = rowTimes;
    const suspenseAt =
      holdFifth && rows.length >= 5
        ? (times[3] ?? T_ROW_FIRST + 3 * ROW_GAP_MS) + STEP_COUNT_MS + 40
        : null;
    rows.forEach((row, index) => {
      later(() => {
        setShown(index + 1);
        playResultsRowSound(index);
        hapticLight();
        running += row.value;
        const last = index === rows.length - 1;
        countTo(running, last ? LAST_COUNT_MS : STEP_COUNT_MS, last ? settle : undefined);
        if (holdFifth && suspenseAt != null && index === rows.length - 2) {
          const fifthAt = times[rows.length - 1] ?? suspenseAt;
          const holdMs = Math.max(0, fifthAt - suspenseAt);
          later(() => {
            setSuspense(true);
            stopRiser.current = playResultsSuspenseSound(holdMs);
          }, Math.max(0, suspenseAt - (times[index] ?? 0)));
        }
        if (last) {
          stopRiser.current?.();
          stopRiser.current = null;
          setSuspense(false);
          later(() => setDone(true), LAST_COUNT_MS + T_ACTIONS_AFTER_FINAL);
        }
      }, times[index] ?? times[times.length - 1]!);
    });
    const pending = timers.current;
    return () => {
      pending.forEach((id) => window.clearTimeout(id));
      cancelFrame(raf.current);
      stopRiser.current?.();
      stopFinalTotalSettleSound();
    };
    // The reveal runs once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => setLive(true), 350);
    return () => window.clearTimeout(id);
  }, [done]);

  /** Tap anywhere during the reveal: straight to the finished screen. */
  const skip = useCallback(() => {
    if (done) return;
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    cancelFrame(raf.current);
    stopRiser.current?.();
    stopRiser.current = null;
    setSkipped(true);
    setSuspense(false);
    setTotalIn(true);
    setShown(rows.length);
    settle();
    setDone(true);
  }, [done, rows.length, settle]);

  const handleShare = useCallback(async () => {
    const node = rootRef.current;
    if (sharing || !node) return;
    setSharing(true);
    setShareError(null);
    hapticTap();
    try {
      const blob = await captureRunShareCard(node, {
        pixelRatio: Math.min(3, Math.max(2, window.devicePixelRatio || 2)),
        backgroundColor: '#03060d',
        exclude: (el) =>
          el.classList.contains('cr__actions') ||
          el.classList.contains('cr__fx') ||
          el.classList.contains('cr__party') ||
          el.classList.contains('cr__home'),
      });
      if (!blob) {
        setShareError('Could not capture results');
        return;
      }
      const result = await shareRunResultImage(blob);
      if (result.ok === false && !result.cancelled) setShareError(result.message);
    } finally {
      setSharing(false);
    }
  }, [sharing]);

  // On <body>: the game shell is a containing block that would size a fixed screen to nothing.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={rootRef}
      className={`cr${skipped || reduceMotion ? ' is-skipped' : ''}${suspense ? ' is-suspense' : ''}${final ? ' is-final' : ''}${
        final && isBillion ? ' is-billion' : ''
      }${done ? ' is-done' : ''}${live ? ' is-live' : ''}${shaking ? ' is-shaking' : ''} is-run-rewards${
        showTrivia ? ' is-trivia-rewards' : ''
      }`}
      onPointerDown={done ? undefined : skip}
      aria-label="Run results"
    >
      <div className="cr__world">
        <div className="cr__bg" aria-hidden />
        {/* Between the arena and the content: the money pours behind the total and the names. */}
        {party ? <WinCelebration reduceMotion={reduceMotion} onDone={() => setParty(false)} /> : null}
        <div className="cr__stage">
          {onExit && done ? (
            <button
              type="button"
              className="cr__home"
              aria-label="Back to home"
              onClick={(e) => {
                e.stopPropagation();
                hapticTap();
                onExit();
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M15.2 4.8 8 12l7.2 7.2" />
              </svg>
              <span>Home</span>
            </button>
          ) : null}
          <p className="cr__title">1B RUN APP</p>
          <p className={`cr__total${totalIn ? ' is-in' : ''}`} aria-live="polite">
            <span className="cr__total-num" data-text={formatDollarsExact(display)}>
              {formatDollarsExact(display)}
            </span>
          </p>
          <ol className="cr__rows">
            {rows.map((row, index) => (
              <li
                key={row.pos}
                className={`cr-row${index < shown ? ' is-in' : ''}${index === rows.length - 1 ? ' is-last' : ''}`}
                style={
                  {
                    '--p': row.primary,
                    '--p-hi': row.hi,
                    '--p-lo': row.lo,
                    '--a': row.accent,
                    '--a-glow': row.glow,
                    '--ink': row.ink,
                  } as CSSProperties
                }
                aria-hidden={index >= shown || undefined}
              >
                <span className="cr-row__sweep" aria-hidden />
                <span className="cr-row__pos">{row.pos}</span>
                <span className="cr-row__div" aria-hidden />
                <span className="cr-row__name">
                  <FitName text={row.name} />
                </span>
                <span className="cr-row__val">{millions(row.value)}</span>
                <BorderGlow index={index} />
              </li>
            ))}
          </ol>
          <div className="cr__actions">
            <div className="cr-rewards">
              <div className="cr-rewards__xp">
                <XpProgressBar
                  progress={progress}
                  levelLabel="LVL"
                  gainedXp={done ? xpBreakdown.total : null}
                  compact
                  className="cr-rewards__meter"
                />
                {done && xpBreakdown.coins > 0 ? (
                  <p className="cr-rewards__coins-plain">+{xpBreakdown.coins} coins</p>
                ) : null}
              </div>

              {rollover > 0 ? (
                <p className="cr-rewards__rollover">
                  Bank rollover <strong>+{formatCash(rollover)}</strong>
                </p>
              ) : null}

              {showTrivia ? (
                <div className="cr-rewards__trivia-note">
                  <button
                    type="button"
                    className="cr-rewards__begin"
                    onClick={() => {
                      hapticTap();
                      onPlayAgain();
                    }}
                  >
                    START TRIVIA RUN
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                className="cr__again cr__again--inline"
                onClick={() => {
                  hapticTap();
                  if (showTrivia && onSkipTrivia) onSkipTrivia();
                  else onPlayAgain();
                }}
              >
                BUILD ANOTHER
              </button>

              <button
                type="button"
                className="cr__share cr__share--inline"
                onClick={() => void handleShare()}
                disabled={sharing}
              >
                <svg className="cr__share-icon" viewBox="0 0 24 24" aria-hidden>
                  <path d="M12 14V2.8M7.6 7 12 2.6 16.4 7M8.6 9.8H6.2A2.2 2.2 0 0 0 4 12v7.3a2.2 2.2 0 0 0 2.2 2.2h11.6a2.2 2.2 0 0 0 2.2-2.2V12a2.2 2.2 0 0 0-2.2-2.2h-2.4" />
                </svg>
                <span>{sharing ? 'PREPARING…' : 'SHARE'}</span>
              </button>

              {shareError ? (
                <p className="cr__share-error" role="alert">
                  {shareError}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <div className="cr__fx" aria-hidden>
        <span className="cr__spot" />
        <span className="cr__dark" />
      </div>
    </div>,
    document.body,
  );
}
