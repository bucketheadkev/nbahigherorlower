'use client';

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { type PerfToggles } from '@/lib/tradeup/perf/perfConfig';
import {
  PERF_DECADES,
  PERF_TEAMS,
  formatPerfDollars,
  pickPerfResult,
  type PerfSpinResult,
} from '@/lib/tradeup/perf/perfTestData';
import {
  playPerfSound,
  stopPerfSpinLoop,
} from '@/lib/tradeup/perf/perfAudio';
import {
  perfHapticInsert,
  perfHapticLand,
  perfHapticPrint,
  perfHapticSpinStart,
  perfHapticTap,
} from '@/lib/tradeup/perf/perfHaptics';
import { setPerfActiveAnims } from '@/lib/tradeup/perf/perfMetrics';
import { PerfReel, type PerfReelHandle } from './PerfReel';

type Phase = 'ready' | 'spinning' | 'ticket' | 'insert' | 'result';

interface PerfMachineProps {
  toggles: PerfToggles;
  onRestart: () => void;
  onExit: () => void;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
}

/**
 * Single-screen performance loop:
 * Spin → team + decade reels → ticket print → insert → result → restart
 */
export const PerfMachine = memo(function PerfMachine({
  toggles,
  onRestart,
  onExit,
}: PerfMachineProps) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [result, setResult] = useState<PerfSpinResult | null>(null);
  const [pressed, setPressed] = useState(false);

  const teamReelRef = useRef<PerfReelHandle | null>(null);
  const decadeReelRef = useRef<PerfReelHandle | null>(null);
  const ticketRef = useRef<HTMLDivElement | null>(null);
  const insertRef = useRef<HTMLDivElement | null>(null);
  const busyRef = useRef(false);
  const rafRef = useRef(0);
  const togglesRef = useRef(toggles);
  togglesRef.current = toggles;

  const teamItems = useMemo(
    () =>
      PERF_TEAMS.map((t) => ({
        id: t.id,
        label: t.name,
        background: t.primary,
        color: t.ink,
      })),
    [],
  );

  const decadeItems = useMemo(
    () =>
      PERF_DECADES.map((d) => ({
        id: d,
        label: d,
        background: '#1e293b',
        color: '#f8fafc',
      })),
    [],
  );

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      stopPerfSpinLoop();
      setPerfActiveAnims(0);
    },
    [],
  );

  const animateTransform = useCallback(
    (
      el: HTMLElement,
      fromY: number,
      toY: number,
      fromOp: number,
      toOp: number,
      ms: number,
    ) =>
      new Promise<void>((resolve) => {
        if (!togglesRef.current.ticketAnim || ms < 40) {
          el.style.transform = `translate3d(-50%, ${toY}%, 0)`;
          el.style.opacity = String(toOp);
          resolve();
          return;
        }
        el.style.willChange = 'transform, opacity';
        const t0 = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - t0) / ms);
          const e = easeOutCubic(t);
          const y = fromY + (toY - fromY) * e;
          const op = fromOp + (toOp - fromOp) * e;
          el.style.transform = `translate3d(-50%, ${y}%, 0)`;
          el.style.opacity = String(op);
          if (t < 1) {
            rafRef.current = requestAnimationFrame(step);
            return;
          }
          el.style.willChange = 'auto';
          resolve();
        };
        rafRef.current = requestAnimationFrame(step);
      }),
    [],
  );

  const runLoop = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPressed(true);

    // 1) Pick result FIRST — synchronous, before any animation
    const picked = pickPerfResult();
    setResult(picked);
    setPhase('spinning');
    setPerfActiveAnims(2);

    playPerfSound('confirm');
    playPerfSound('spin');
    perfHapticTap();
    perfHapticSpinStart();

    const spinMs = togglesRef.current.spinnerAnim ? 1100 : 0;
    await Promise.all([
      teamReelRef.current?.spinTo(picked.team.id, spinMs) ?? Promise.resolve(),
      decadeReelRef.current?.spinTo(picked.decade, spinMs) ?? Promise.resolve(),
    ]);

    stopPerfSpinLoop();
    playPerfSound('land');
    perfHapticLand();
    setPerfActiveAnims(1);

    // 2) Ticket print (transform only)
    setPhase('ticket');
    const ticket = ticketRef.current;
    if (ticket) {
      ticket.style.transform = 'translate3d(-50%, -120%, 0)';
      ticket.style.opacity = '0';
      playPerfSound('print');
      perfHapticPrint();
      await animateTransform(ticket, -120, 0, 0, 1, togglesRef.current.ticketAnim ? 520 : 0);
    }

    // Brief hold so ticket is readable
    await new Promise((r) => setTimeout(r, togglesRef.current.ticketAnim ? 280 : 40));

    // 3) Insert into feeder slot (rises up into slot)
    setPhase('insert');
    const insert = insertRef.current;
    if (insert && ticket) {
      ticket.style.opacity = '0';
      insert.style.transform = 'translate3d(-50%, 120%, 0)';
      insert.style.opacity = '1';
      playPerfSound('insert');
      perfHapticInsert();
      await animateTransform(insert, 120, 0, 1, 0, togglesRef.current.ticketAnim ? 640 : 0);
    }

    setPerfActiveAnims(0);
    playPerfSound('result');
    setPhase('result');
    setPressed(false);
    busyRef.current = false;
  }, [animateTransform]);

  const onSpinPointer = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      if (phase !== 'ready' || busyRef.current) return;
      void runLoop();
    },
    [phase, runLoop],
  );

  const onRestartPointer = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      if (busyRef.current) return;
      playPerfSound('tap');
      perfHapticTap();
      // Reset ticket DOM without React churn
      if (ticketRef.current) {
        ticketRef.current.style.transform = 'translate3d(-50%, -120%, 0)';
        ticketRef.current.style.opacity = '0';
      }
      if (insertRef.current) {
        insertRef.current.style.transform = 'translate3d(-50%, 120%, 0)';
        insertRef.current.style.opacity = '0';
      }
      setResult(null);
      setPhase('ready');
      onRestart();
    },
    [onRestart],
  );

  return (
    <div className="perf-shell">
      <header className="perf-top">
        <button type="button" className="perf-back" onPointerDown={(e) => { e.preventDefault(); onExit(); }}>
          ← Home
        </button>
        <strong className="perf-brand">PERF TEST</strong>
        <span className="perf-phase">{phase}</span>
      </header>

      <div className="perf-machine">
        <p className="perf-label">TEAM</p>
        <PerfReel
          ref={teamReelRef}
          items={teamItems}
          reps={4}
          enabled={toggles.spinnerAnim}
        />
        <p className="perf-label">DECADE</p>
        <PerfReel
          ref={decadeReelRef}
          items={decadeItems}
          reps={4}
          enabled={toggles.spinnerAnim}
        />

        <div className="perf-printer">
          <div
            ref={ticketRef}
            className="perf-ticket"
            style={{ transform: 'translate3d(-50%, -120%, 0)', opacity: 0 }}
          >
            {result ? (
              <>
                <span className="perf-ticket__era">{result.decade}</span>
                <strong className="perf-ticket__team">{result.team.name}</strong>
                <em className="perf-ticket__player">
                  {result.player.name} · {result.player.pos}
                </em>
                <b className="perf-ticket__val">
                  {formatPerfDollars(result.player.value)}
                </b>
              </>
            ) : (
              <span className="perf-ticket__placeholder">Ticket</span>
            )}
          </div>
          <div className="perf-slot">
            <div
              ref={insertRef}
              className="perf-insert-card"
              style={{ transform: 'translate3d(-50%, 120%, 0)', opacity: 0 }}
            >
              {result ? <span>{result.player.name}</span> : null}
            </div>
          </div>
        </div>
      </div>

      {phase === 'ready' || phase === 'spinning' ? (
        <button
          type="button"
          className={`perf-spin${pressed || phase === 'spinning' ? ' is-pressed' : ''}`}
          disabled={phase !== 'ready'}
          onPointerDown={onSpinPointer}
        >
          <span>SPIN</span>
        </button>
      ) : null}

      {phase === 'result' && result ? (
        <div className="perf-result">
          <p className="perf-result__kicker">RESULT</p>
          <h2 className="perf-result__value">
            {formatPerfDollars(result.player.value)}
          </h2>
          <p className="perf-result__meta">
            {result.team.name} · {result.decade} · {result.player.name}
          </p>
          <button
            type="button"
            className="perf-restart"
            onPointerDown={onRestartPointer}
          >
            RESTART
          </button>
        </div>
      ) : null}
    </div>
  );
});
