'use client';

import { AnimatePresence, motion } from 'framer-motion';
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
  formatDollars,
  formatDollarsExact,
  getDollarValue,
  type ValuedPlayer,
} from '@/lib/tradeup/billionDollar';
import { playGameSound } from '@/lib/tradeup/gameAudio';
import {
  hapticCancel,
  hapticHeavy,
  hapticSuccess,
  hapticTicketInsert,
  hapticValueComplete,
} from '@/lib/tradeup/haptics';
import { LINEUP_POSITIONS, POSITION_LABELS } from '@/lib/tradeup/startingLineup';
import { getTeamColors } from '@/lib/tradeup/teamColors';
import type { Position } from '@/lib/tradeup/types';
import {
  WORLD_POOL_SIZE,
  formatWorldRank,
} from '@/lib/tradeup/worldLeaderboard';

type RevealStage =
  | 'ready'
  | 'inserting'
  | 'reading'
  | 'projecting'
  | 'calculating'
  | 'counting'
  | 'complete';

type TicketPhase = 'hidden' | 'ready' | 'inserting' | 'gone';

interface ValueRevealMachineProps {
  roster: ValuedPlayer[];
  reduceMotion?: boolean;
  personalBest?: number;
  isNewPersonalBest?: boolean;
  worldRank?: number;
  /** Start automatic sequential feed on mount (default after fifth player). */
  autoStart?: boolean;
  onComplete: (payload: { teamValue: number }) => {
    personalBest?: number;
    isNewPersonalBest?: boolean;
    worldRank?: number;
  };
  onExit: () => void;
  onPlayAgain: () => void;
}

function playerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Fast rise early, soft landing near the end. */
function easeOutExpo(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

function animateFeedIn(
  from: number,
  to: number,
  ms: number,
  onFrame: (feed: number) => void,
  reduceMotion: boolean,
): Promise<void> {
  return new Promise((resolve) => {
    if (reduceMotion || ms < 40) {
      onFrame(to);
      resolve();
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      onFrame(from + (to - from) * easeInOutCubic(t));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

function projectedTotal(fedValues: number[]): number {
  if (fedValues.length === 0) return 0;
  const avg = fedValues.reduce((a, b) => a + b, 0) / fedValues.length;
  return Math.round(avg * 5);
}

/**
 * Assay Vault — feed tickets, show ON PACE FOR projections, then final count-up.
 * Never reveals per-player dollar values during the feed sequence.
 */
export function ValueRevealMachine({
  roster,
  reduceMotion = false,
  personalBest = 0,
  isNewPersonalBest = false,
  worldRank = 0,
  autoStart = false,
  onComplete,
  onExit,
  onPlayAgain,
}: ValueRevealMachineProps) {
  const byId = useMemo(() => new Map(roster.map((p) => [p.id, p])), [roster]);

  const slotPlayers = useMemo(() => {
    const map = new Map<Position, ValuedPlayer>();
    LINEUP_POSITIONS.forEach((pos, i) => {
      const p = roster[i];
      if (p) map.set(pos, p);
    });
    return map;
  }, [roster]);

  const teamValue = useMemo(
    () => roster.reduce((sum, p) => sum + getDollarValue(p), 0),
    [roster],
  );
  const isBillion = teamValue >= BILLION_GOAL;
  const shortfall = Math.max(0, BILLION_GOAL - teamValue);

  const [fedIds, setFedIds] = useState<Set<string>>(() => new Set());
  const [stage, setStage] = useState<RevealStage>('ready');
  const [projected, setProjected] = useState(0);
  const [displayFinal, setDisplayFinal] = useState(0);
  const [activePlayer, setActivePlayer] = useState<ValuedPlayer | null>(null);
  const [activeSlot, setActiveSlot] = useState<Position | null>(null);
  const [ticketPhase, setTicketPhase] = useState<TicketPhase>('hidden');
  const [ticketQuick, setTicketQuick] = useState(false);
  const [insertFeed, setInsertFeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showSuccessBurst, setShowSuccessBurst] = useState(false);
  const [resultReady, setResultReady] = useState(false);

  const busyRef = useRef(false);
  const projectedRef = useRef(0);
  const finalRef = useRef(0);
  const completedRef = useRef(false);
  const autoStartedRef = useRef(false);
  const shareCardRef = useRef<HTMLDivElement | null>(null);
  const projRafRef = useRef(0);
  const countRafRef = useRef(0);

  const remaining = useMemo(
    () => roster.filter((p) => !fedIds.has(p.id)),
    [roster, fedIds],
  );

  const [resultMeta, setResultMeta] = useState({
    personalBest,
    isNewPersonalBest,
    worldRank,
  });

  useEffect(
    () => () => {
      cancelAnimationFrame(projRafRef.current);
      cancelAnimationFrame(countRafRef.current);
      hapticCancel();
    },
    [],
  );

  const animateProjectedTo = useCallback(
    (target: number, ms: number) =>
      new Promise<void>((resolve) => {
        cancelAnimationFrame(projRafRef.current);
        if (reduceMotion || ms < 60) {
          projectedRef.current = target;
          setProjected(target);
          resolve();
          return;
        }
        const start = projectedRef.current;
        const t0 = performance.now();
        let lastPaint = 0;
        const step = (now: number) => {
          const t = Math.min(1, (now - t0) / ms);
          const next = Math.round(start + (target - start) * easeInOutCubic(t));
          projectedRef.current = next;
          // Throttle React paints ~30fps for iPhone smoothness
          if (now - lastPaint >= 32 || t >= 1) {
            lastPaint = now;
            setProjected(next);
          }
          if (t < 1) {
            projRafRef.current = requestAnimationFrame(step);
          } else {
            setProjected(target);
            resolve();
          }
        };
        projRafRef.current = requestAnimationFrame(step);
      }),
    [reduceMotion],
  );

  const animateFinalCount = useCallback(
    (target: number, ms: number) =>
      new Promise<void>((resolve) => {
        cancelAnimationFrame(countRafRef.current);
        finalRef.current = 0;
        setDisplayFinal(0);
        if (reduceMotion || ms < 80) {
          finalRef.current = target;
          setDisplayFinal(target);
          resolve();
          return;
        }
        const t0 = performance.now();
        let lastPaint = 0;
        const step = (now: number) => {
          const t = Math.min(1, (now - t0) / ms);
          // Accelerate early, decelerate into the exact final
          const eased = easeOutExpo(t);
          const next =
            t >= 1 ? target : Math.round(target * eased);
          finalRef.current = next;
          if (now - lastPaint >= 32 || t >= 1) {
            lastPaint = now;
            setDisplayFinal(next);
          }
          if (t < 1) {
            countRafRef.current = requestAnimationFrame(step);
          } else {
            setDisplayFinal(target);
            resolve();
          }
        };
        countRafRef.current = requestAnimationFrame(step);
      }),
    [reduceMotion],
  );

  const runInsertCycle = useCallback(
    async (
      player: ValuedPlayer,
      slot: Position | null,
      alreadyFed: Set<string>,
      quick: boolean,
    ) => {
      const nextFed = new Set(alreadyFed);
      nextFed.add(player.id);
      const fedValues = [...nextFed].map((id) => {
        const p = byId.get(id);
        return p ? getDollarValue(p) : 0;
      });
      const nextProjection = projectedTotal(fedValues);

      setActivePlayer(player);
      setActiveSlot(slot);
      setTicketQuick(quick);
      setStage('inserting');
      setInsertFeed(1);
      setTicketPhase('ready');

      const presentMs = reduceMotion ? 40 : quick ? 280 : 420;
      const insertMs = reduceMotion ? 90 : quick ? 720 : 900;
      const readMs = reduceMotion ? 50 : quick ? 180 : 260;
      const projMs = reduceMotion ? 80 : quick ? 360 : 480;
      const holdMs = reduceMotion ? 40 : quick ? 200 : 280;

      await wait(presentMs);
      setTicketPhase('inserting');
      hapticTicketInsert();
      playGameSound('slot_place');

      await animateFeedIn(1, 0, insertMs, setInsertFeed, reduceMotion);
      setTicketPhase('gone');

      setStage('reading');
      await wait(readMs);

      setActivePlayer(null);
      setActiveSlot(null);
      setTicketPhase('hidden');
      setInsertFeed(1);
      setFedIds(new Set(nextFed));

      setStage('projecting');
      playGameSound('reveal_standard');
      await animateProjectedTo(nextProjection, projMs);
      await wait(holdMs);

      return nextFed;
    },
    [animateProjectedTo, byId, reduceMotion],
  );

  const finishLineup = useCallback(async () => {
    // Remove projection → calculating
    setStage('calculating');
    playGameSound('match_calc');
    hapticHeavy();
    await wait(reduceMotion ? 160 : 560);
    hapticHeavy();
    await wait(reduceMotion ? 60 : 220);

    // Count from $0 → true total
    setStage('counting');
    playGameSound('reveal_standard');
    const countMs = reduceMotion ? 180 : 1800;
    await animateFinalCount(teamValue, countMs);

    // Land exactly, then result
    finalRef.current = teamValue;
    setDisplayFinal(teamValue);
    hapticValueComplete();

    if (!completedRef.current) {
      completedRef.current = true;
      const meta = onComplete({ teamValue }) ?? {};
      setResultMeta({
        personalBest: meta.personalBest ?? personalBest,
        isNewPersonalBest: meta.isNewPersonalBest ?? false,
        worldRank: meta.worldRank ?? worldRank,
      });
    }

    await wait(reduceMotion ? 60 : 220);
    setStage('complete');
    setResultReady(true);

    if (teamValue >= BILLION_GOAL) {
      playGameSound('perfect_sweep');
      hapticSuccess();
      setShowSuccessBurst(true);
      if (!reduceMotion) {
        window.setTimeout(() => setShowSuccessBurst(false), 3200);
      } else {
        setShowSuccessBurst(false);
      }
    } else {
      playGameSound('defeat');
      hapticHeavy();
    }
  }, [
    animateFinalCount,
    onComplete,
    personalBest,
    reduceMotion,
    teamValue,
    worldRank,
  ]);

  const feedPlayer = useCallback(
    async (player: ValuedPlayer, slot: Position) => {
      if (busyRef.current || fedIds.has(player.id) || stage === 'complete') return;
      busyRef.current = true;
      setBusy(true);
      const nextFed = await runInsertCycle(player, slot, fedIds, false);
      if (nextFed.size >= roster.length) {
        await finishLineup();
        busyRef.current = false;
        setBusy(false);
        return;
      }
      setStage('ready');
      busyRef.current = false;
      setBusy(false);
    },
    [fedIds, finishLineup, roster.length, runInsertCycle, stage],
  );

  const feedAll = useCallback(async () => {
    if (busyRef.current || stage === 'complete') return;
    const queue = LINEUP_POSITIONS.map((pos) => ({
      pos,
      player: slotPlayers.get(pos),
    })).filter(
      (row): row is { pos: Position; player: ValuedPlayer } =>
        Boolean(row.player) && !fedIds.has(row.player!.id),
    );
    if (queue.length === 0) return;

    busyRef.current = true;
    setBusy(true);
    let running = new Set(fedIds);
    for (const { pos, player } of queue) {
      running = await runInsertCycle(player, pos, running, true);
    }
    await finishLineup();
    busyRef.current = false;
    setBusy(false);
  }, [fedIds, finishLineup, runInsertCycle, slotPlayers, stage]);

  // Auto-start evaluation once after fifth-player transition
  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return;
    if (roster.length < 5) return;
    autoStartedRef.current = true;
    const t = window.setTimeout(() => {
      void feedAll();
    }, reduceMotion ? 80 : 280);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [autoStart]);

  const handleShareX = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    const text = `I just drafted a ${formatDollarsExact(teamValue)} NBA roster on Trade Up — a billion-dollar board.`;
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    try {
      const node = shareCardRef.current;
      let blob: Blob | null = null;
      if (node) {
        try {
          const { toBlob } = await import('html-to-image');
          blob = await toBlob(node, {
            pixelRatio: 2,
            cacheBust: true,
            backgroundColor: '#06070b',
          });
        } catch {
          blob = null;
        }
      }
      if (blob) {
        const file = new File([blob], 'trade-up-billion.png', { type: 'image/png' });
        if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text, title: 'Trade Up' });
          setSharing(false);
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'trade-up-billion.png';
        a.click();
        URL.revokeObjectURL(url);
      }
      window.open(intent, '_blank', 'noopener,noreferrer');
    } catch {
      window.open(intent, '_blank', 'noopener,noreferrer');
    } finally {
      setSharing(false);
    }
  }, [sharing, teamValue]);

  const machineBusy =
    stage === 'inserting' ||
    stage === 'reading' ||
    stage === 'projecting' ||
    stage === 'calculating' ||
    stage === 'counting';
  const isComplete = stage === 'complete';

  const screenLabel =
    stage === 'ready' && fedIds.size === 0
      ? 'AWAITING TICKETS'
      : stage === 'inserting' || stage === 'reading'
        ? 'READING TICKET…'
        : stage === 'projecting' || (stage === 'ready' && fedIds.size > 0)
          ? 'ON PACE FOR'
          : stage === 'calculating'
            ? 'CALCULATING…'
            : stage === 'counting'
              ? 'TEAM VALUE'
              : isBillion
                ? '$1 BILLION REACHED'
                : 'THRESHOLD NOT REACHED';

  const showPace =
    !isComplete &&
    stage !== 'calculating' &&
    stage !== 'counting' &&
    (projected > 0 || fedIds.size > 0);

  return (
    <motion.div
      className={`value-vault value-vault--neo${isComplete ? ' is-complete' : ''}${
        isBillion && isComplete ? ' is-billion' : ''
      }${!isBillion && isComplete ? ' is-fail' : ''}${
        stage === 'calculating' || stage === 'counting' ? ' is-finalizing' : ''
      }`}
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0.12 : 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <AnimatePresence>
        {showSuccessBurst ? (
          <motion.div
            className="value-vault__billion-drama"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            aria-live="assertive"
          >
            <div className="value-vault__billion-confetti" aria-hidden>
              {Array.from({ length: 28 }, (_, i) => (
                <span key={i} className={`value-vault__billion-bit bit-${i % 7}`} />
              ))}
            </div>
            <motion.div
              className="value-vault__billion-burst"
              aria-hidden
              initial={{ scale: 0.35, opacity: 0 }}
              animate={{ scale: [0.35, 1.45, 1.1], opacity: [0, 1, 0.4] }}
              transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
            />
            <motion.div
              className="value-vault__billion-ring"
              aria-hidden
              initial={{ scale: 0.2, opacity: 0 }}
              animate={{ scale: [0.2, 1.9], opacity: [0, 0.9, 0] }}
              transition={{ duration: 2.1, ease: 'easeOut' }}
            />
            <motion.p
              className="value-vault__billion-kicker"
              initial={{ y: 28, opacity: 0, letterSpacing: '0.45em' }}
              animate={{ y: 0, opacity: 1, letterSpacing: '0.22em' }}
              transition={{ delay: 0.08, duration: 0.55 }}
            >
              DYNASTY UNLOCKED
            </motion.p>
            <motion.h2
              className="value-vault__billion-title"
              initial={{ scale: 0.55, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ delay: 0.18, type: 'spring', stiffness: 140, damping: 12 }}
            >
              $1 BILLION
            </motion.h2>
            <motion.p
              className="value-vault__billion-sub"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.42, duration: 0.5 }}
            >
              {formatDollarsExact(teamValue)} · Board cleared
            </motion.p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!isComplete ? (
        <div className="value-vault__intro">
          <p className="value-vault__eyebrow">Value Chamber</p>
          <h2 className="value-vault__title">Feed Your Tickets</h2>
          <p className="value-vault__hint">
            {autoStart
              ? 'Evaluating your five tickets automatically…'
              : 'Feed one at a time — or feed all five.'}
          </p>
        </div>
      ) : (
        <div className="value-vault__intro value-vault__intro--result">
          <p className="value-vault__eyebrow">
            {isBillion ? 'Threshold cleared' : 'Assay complete'}
          </p>
          <h2 className="value-vault__title">
            {isBillion ? '$1 Billion Reached' : 'Threshold Not Reached'}
          </h2>
        </div>
      )}

      <div
        className={`neo-booth neo-booth--vault value-vault__press${
          machineBusy ? ' is-printing is-calculating' : ''
        }${isComplete ? ' is-reveal is-complete' : ''}${
          !machineBusy && !isComplete ? ' is-idle' : ''
        }${!isBillion && isComplete ? ' is-rejected' : ''}`}
      >
        <div className="neo-booth__chassis" aria-hidden>
          <span className="neo-booth__rivet neo-booth__rivet--tl" />
          <span className="neo-booth__rivet neo-booth__rivet--tr" />
          <span className="neo-booth__rivet neo-booth__rivet--bl" />
          <span className="neo-booth__rivet neo-booth__rivet--br" />
          <span className="neo-booth__trim neo-booth__trim--top" />
          <span className="neo-booth__trim neo-booth__trim--bot" />
          <span className="neo-booth__lamp neo-booth__lamp--l" />
          <span className="neo-booth__lamp neo-booth__lamp--r" />
        </div>

        <div className="neo-booth__glass">
          <div className="neo-booth__marquee" aria-live="polite">
            <span className="neo-booth__brand">TRADE UP</span>
            <span className="neo-booth__status">
              {isComplete
                ? isBillion
                  ? 'CLEARED'
                  : 'REJECTED'
                : machineBusy
                  ? stage === 'calculating' || stage === 'counting'
                    ? 'ASSAY'
                    : 'READING'
                  : 'READY'}
            </span>
            <span
              className={`neo-booth__pulse${
                machineBusy ? ' is-printing' : !isComplete ? ' is-idle' : ''
              }`}
              aria-hidden
            />
          </div>

          <div className="neo-booth__chamber value-vault__cavity value-vault__cavity--ipad">
            <div
              className={`value-vault__led value-vault__led--ipad${
                showPace ? ' is-pace' : ''
              }${
                stage === 'counting' || (isComplete && isBillion)
                  ? ' is-total is-billion'
                  : ''
              }${isComplete && !isBillion ? ' is-fail' : ''}${
                stage === 'calculating' ? ' is-calc' : ''
              }${
                stage === 'inserting' || stage === 'reading' ? ' is-reading' : ''
              }`}
            >
              <div className="value-vault__led-glass" aria-hidden />
              <div className="value-vault__led-sheen" aria-hidden />

              <p className="value-vault__led-status">{screenLabel}</p>

              <div className="value-vault__led-body">
                {stage === 'calculating' ? (
                  <p className="value-vault__led-calc">CALCULATING…</p>
                ) : stage === 'counting' ? (
                  <p className="value-vault__led-total is-counting is-final">
                    {formatDollarsExact(displayFinal)}
                  </p>
                ) : isComplete ? (
                  <p
                    className={`value-vault__led-total is-final${
                      isBillion ? '' : ' is-dim'
                    }`}
                  >
                    {formatDollarsExact(teamValue)}
                  </p>
                ) : showPace ? (
                  <div className="value-vault__pace">
                    <span className="value-vault__pace-kicker">ON PACE FOR</span>
                    <strong className="value-vault__pace-value">
                      {formatDollarsExact(projected)}
                    </strong>
                  </div>
                ) : stage === 'inserting' || stage === 'reading' ? (
                  <p className="value-vault__led-reading">READING TICKET…</p>
                ) : (
                  <p className="value-vault__led-dash">— — —</p>
                )}
              </div>

              {!isComplete ? (
                <p className="value-vault__led-goal">
                  GOAL {formatDollars(BILLION_GOAL)}
                </p>
              ) : isBillion ? (
                <p className="value-vault__led-goal">Threshold reached</p>
              ) : (
                <p className="value-vault__led-goal value-vault__led-goal--short">
                  You fell {formatDollarsExact(shortfall)} short of $1 billion
                </p>
              )}
            </div>

            {!isComplete ? (
              <div
                className={`neo-booth__mouth value-vault__mouth-slot${
                  ticketPhase === 'inserting' ? ' is-feeding' : ''
                }`}
              >
                <span className="value-vault__mouth-lip" aria-hidden />
                {activePlayer &&
                ticketPhase !== 'hidden' &&
                ticketPhase !== 'gone' ? (
                  <div
                    className={`value-vault__mouth-ticket is-${ticketPhase}${
                      ticketQuick ? ' is-quick' : ''
                    }`}
                    style={
                      {
                        '--feed': insertFeed,
                      } as CSSProperties
                    }
                  >
                    <em>{playerInitials(activePlayer.name)}</em>
                    <strong>{activePlayer.name.split(' ').slice(-1)[0]}</strong>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="neo-booth__mouth" aria-hidden>
                <span />
              </div>
            )}
          </div>
        </div>
      </div>

      {isComplete && resultReady ? (
        <>
          <div
            ref={shareCardRef}
            className={`value-vault__result-card${
              isBillion ? ' is-success' : ' is-fail'
            }`}
            aria-label="Roster result"
          >
            {isBillion ? (
              <div className="value-vault__threshold value-vault__threshold--ok">
                <span>$1 BILLION REACHED</span>
                <strong>{formatDollarsExact(teamValue)}</strong>
              </div>
            ) : (
              <div className="value-vault__threshold value-vault__threshold--fail">
                <span>THRESHOLD NOT REACHED</span>
                <strong>{formatDollarsExact(teamValue)}</strong>
                <p className="value-vault__shortfall">
                  You fell{' '}
                  <em>{formatDollarsExact(shortfall)}</em> short of $1 billion.
                </p>
              </div>
            )}

            {resultMeta.worldRank > 0 ? (
              <p className="value-vault__rank">
                World rank {formatWorldRank(resultMeta.worldRank)} of{' '}
                {WORLD_POOL_SIZE.toLocaleString('en-US')}
              </p>
            ) : null}

            {resultMeta.isNewPersonalBest ? (
              <p className="value-vault__pb-banner">New personal best</p>
            ) : resultMeta.personalBest > 0 ? (
              <p className="value-vault__pb">
                Personal best{' '}
                {formatDollarsExact(Math.max(resultMeta.personalBest, teamValue))}
              </p>
            ) : null}

            <ul className="value-vault__result-five" aria-label="Your five">
              {LINEUP_POSITIONS.map((pos, index) => {
                const player = roster[index];
                return (
                  <li key={pos}>
                    <span>{pos}</span>
                    <strong>{player?.name ?? '—'}</strong>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="value-vault__actions value-vault__actions--end">
            {isBillion ? (
              <button
                type="button"
                className="value-vault__share"
                onClick={() => void handleShareX()}
                disabled={sharing}
              >
                {sharing ? 'Preparing…' : 'Share to X'}
              </button>
            ) : null}
            <button
              type="button"
              className="value-vault__build-another"
              onClick={onPlayAgain}
            >
              Build Another
            </button>
            <button type="button" className="value-vault__home" onClick={onExit}>
              Home
            </button>
          </div>
        </>
      ) : (
        <>
          <aside className="value-vault__awaiting" aria-label="Awaiting tickets">
            <div className="value-vault__five-head">
              <div>
                <p className="value-vault__five-title">Awaiting tickets</p>
                <p className="value-vault__five-sub">
                  {autoStart && busy
                    ? 'Feeding into the machine…'
                    : 'Your five ready for evaluation'}
                </p>
              </div>
              <span className="value-vault__five-count">
                {fedIds.size}/{roster.length}
              </span>
            </div>
            <div className="value-vault__awaiting-grid">
              {LINEUP_POSITIONS.map((slot) => {
                const player = slotPlayers.get(slot);
                if (!player) return null;
                const fed = fedIds.has(player.id);
                const colors = getTeamColors(player.teamId);
                const active =
                  activePlayer?.id === player.id &&
                  (stage === 'inserting' || stage === 'reading');
                return (
                  <button
                    key={slot}
                    type="button"
                    className={`value-vault__await-card${fed ? ' is-fed' : ''}${
                      active ? ' is-active' : ''
                    }`}
                    disabled={fed || busy || autoStart}
                    onClick={() => void feedPlayer(player, slot)}
                    aria-label={
                      fed
                        ? `${player.name} already fed`
                        : `Feed ${player.name} (${POSITION_LABELS[slot]})`
                    }
                  >
                    <span
                      className="value-vault__await-mark"
                      style={{
                        backgroundColor: colors.primary,
                        color: '#ffffff',
                      }}
                    >
                      {playerInitials(player.name)}
                    </span>
                    <span className="value-vault__await-copy">
                      <span className="value-vault__await-pos">
                        {POSITION_LABELS[slot]}
                      </span>
                      <strong className="value-vault__await-name">
                        {player.name}
                      </strong>
                      <em className="value-vault__await-meta">
                        {player.teamId}
                        {'era' in player && (player as { era?: string }).era
                          ? ` · ${(player as { era?: string }).era}`
                          : ''}
                      </em>
                    </span>
                    {fed ? (
                      <span className="value-vault__fed-tag">Fed</span>
                    ) : active ? (
                      <span className="value-vault__feed-chip">Reading</span>
                    ) : (
                      <span className="value-vault__feed-chip">Ready</span>
                    )}
                  </button>
                );
              })}
            </div>
          </aside>

          {!autoStart ? (
            <div className="value-vault__actions">
              <button
                type="button"
                className="value-vault__feed-all"
                disabled={busy || remaining.length === 0}
                onClick={() => void feedAll()}
              >
                <span className="value-vault__feed-all-kicker">Bulk insert</span>
                <span className="value-vault__feed-all-label">
                  Feed All ({remaining.length})
                </span>
              </button>
            </div>
          ) : null}
        </>
      )}
    </motion.div>
  );
}
