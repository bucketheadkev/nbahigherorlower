'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  listValidSpinPairs,
  type DecadeEra,
  type SpinPair,
} from '@/lib/tradeup/billionDollar';
import {
  hapticCancel,
  hapticTap,
  hapticTicketPrint,
  hapticWheelStart,
  hapticWheelStop,
  hapticWheelTick,
} from '@/lib/tradeup/haptics';
import {
  playGameSound,
  preloadTicketPrintSound,
  playTicketReleaseSound,
  playWheelStopSound,
  playWheelTickSound,
  startTicketSpinHum,
  stopTicketSpinHum,
} from '@/lib/tradeup/gameAudio';
import { getTeamColors } from '@/lib/tradeup/teamColors';
import type { TeamInfo } from '@/lib/tradeup/types';

type MachinePhase = 'idle' | 'printing' | 'done' | 'clearing';
type PrintKind = 'both' | 'team' | 'era';
export type TicketRerollKind = 'team' | 'era';

interface TicketDispenserProps {
  locked: SpinPair | null;
  printing: boolean;
  canRerollTeam: boolean;
  canRerollEra: boolean;
  reduceMotion?: boolean;
  onPrint: () => void;
  onResult: (pair: SpinPair) => void;
  onReroll: (kind: TicketRerollKind) => void;
}

const DUAL_SCROLL_MS = 1550;
const FINAL_PULL_MS = 320;
const PARTIAL_SCROLL_MS = 980;
const PARTIAL_PULL_MS = 180;
const PRINT_TOTAL_MS = DUAL_SCROLL_MS + FINAL_PULL_MS;
const REEL_ITEM_H_FALLBACK = 52;

/**
 * Thermal feed curve (bottom-slot emergence).
 * Peak ~0.72 so most of the ticket stays inside the chamber while printing,
 * then overshoot slightly and settle to 1.0 when rollers finish.
 */
function physicalFeedProgress(elapsedMs: number, totalMs: number): number {
  const t = clamp01(elapsedMs / totalMs);
  if (t < 0.72) {
    // Roller push with tiny friction stutter (speed variation)
    const u = easeOutCubic(t / 0.72);
    const stutter = 1 + Math.sin(t * Math.PI * 7.5) * 0.012;
    return Math.min(0.74, u * 0.72 * stutter);
  }
  if (t < 0.88) {
    const u = easeOutCubic((t - 0.72) / 0.16);
    return 0.72 + (1.04 - 0.72) * u;
  }
  const u = easeOutCubic((t - 0.88) / 0.12);
  return 1.04 + (1 - 1.04) * u;
}

function paperWobble(elapsedMs: number, feed: number): number {
  const energy = Math.sin(clamp01(feed) * Math.PI);
  return Math.sin(elapsedMs * 0.031) * 0.85 * energy;
}

function paperFlex(elapsedMs: number, feed: number): number {
  const energy = Math.sin(clamp01(feed) * Math.PI);
  return Math.sin(elapsedMs * 0.019 + 0.7) * 0.65 * energy;
}

function measureReelItemH(el: HTMLElement | null): number {
  if (!el) return REEL_ITEM_H_FALLBACK;
  const raw = getComputedStyle(el).getPropertyValue('--reel-h').trim();
  const px = Number.parseFloat(raw);
  return Number.isFinite(px) && px > 0 ? px : REEL_ITEM_H_FALLBACK;
}

function setStripOffset(el: HTMLElement | null, offsetItems: number, itemH: number): void {
  if (!el) return;
  el.style.transform = `translate3d(0, ${-offsetItems * itemH}px, 0)`;
}

/** Smooth decelerating curve — continuous, no late snaps. */
function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

/** Start after React has committed the strip DOM. */
function afterStripPaint(runId: number, runIdRef: { current: number }, fn: () => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (runId !== runIdRef.current) return;
      fn();
    });
  });
}

function uniqueTeams(pairs: SpinPair[]): TeamInfo[] {
  const seen = new Set<string>();
  const out: TeamInfo[] = [];
  for (const p of pairs) {
    if (seen.has(p.team.id)) continue;
    seen.add(p.team.id);
    out.push(p.team);
  }
  return out;
}

function erasForTeam(pairs: SpinPair[], teamId: string): DecadeEra[] {
  const seen = new Set<string>();
  const out: DecadeEra[] = [];
  for (const p of pairs) {
    if (p.team.id !== teamId || seen.has(p.era)) continue;
    seen.add(p.era);
    out.push(p.era);
  }
  return out;
}

function teamsForEra(pairs: SpinPair[], era: DecadeEra): TeamInfo[] {
  const seen = new Set<string>();
  const out: TeamInfo[] = [];
  for (const p of pairs) {
    if (p.era !== era || seen.has(p.team.id)) continue;
    seen.add(p.team.id);
    out.push(p.team);
  }
  return out;
}

function shuffleCopy<T>(arr: T[]): T[] {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
}

function pickResult(pairs: SpinPair[]): SpinPair {
  return pairs[Math.floor(Math.random() * pairs.length)]!;
}

/** Hard guarantee: reroll never returns the same team (team) or era (era). */
function pickRerollPair(
  pairs: SpinPair[],
  locked: SpinPair,
  kind: TicketRerollKind,
): SpinPair {
  if (kind === 'team') {
    const sameEra = teamsForEra(pairs, locked.era).filter(
      (t) => t.id !== locked.team.id,
    );
    if (sameEra.length > 0) {
      return {
        team: sameEra[Math.floor(Math.random() * sameEra.length)]!,
        era: locked.era,
      };
    }
    // No other franchise in this era — keep era only if we can swap team elsewhere.
    const otherTeams = uniqueTeams(pairs).filter((t) => t.id !== locked.team.id);
    if (otherTeams.length > 0) {
      const team = otherTeams[Math.floor(Math.random() * otherTeams.length)]!;
      const eras = erasForTeam(pairs, team.id);
      const era =
        eras.find((e) => e === locked.era) ??
        eras[Math.floor(Math.random() * eras.length)] ??
        locked.era;
      return { team, era };
    }
    return locked;
  }

  const otherEras = erasForTeam(pairs, locked.team.id).filter(
    (e) => e !== locked.era,
  );
  if (otherEras.length > 0) {
    return {
      team: locked.team,
      era: otherEras[Math.floor(Math.random() * otherEras.length)]!,
    };
  }
  // No other decade for this franchise — swap to another team+era.
  const fallback = pairs.filter(
    (p) => p.team.id !== locked.team.id || p.era !== locked.era,
  );
  if (fallback.length > 0) {
    return fallback[Math.floor(Math.random() * fallback.length)]!;
  }
  return locked;
}

function teamLine(team: TeamInfo): string {
  return team.fullName || `${team.city} ${team.name}`;
}

/**
 * Build a slot strip that ALWAYS ends on `winner`.
 * The old index-based builder could land on the wrong item when findIndex failed,
 * which caused the last-second team/era swap.
 */
function buildWinnerStrip<T>(
  pool: T[],
  winner: T,
  loops: number,
  keyOf: (v: T) => string,
): T[] {
  const winnerKey = keyOf(winner);
  const base = pool.some((v) => keyOf(v) === winnerKey) ? pool : [...pool, winner];
  const cycle = shuffleCopy(base.length > 0 ? base : [winner]);
  const strip: T[] = [];
  for (let i = 0; i < Math.max(4, loops); i += 1) {
    strip.push(...shuffleCopy(cycle));
  }
  // Keep a beat of motion into the true winner (never already sitting on it).
  const last = strip[strip.length - 1];
  if (last && keyOf(last) === winnerKey) {
    const decoy = cycle.find((v) => keyOf(v) !== winnerKey);
    if (decoy) strip.push(decoy);
  }
  strip.push(winner);
  return strip;
}

/**
 * Arcade ticket dispenser — print minigame, then compact ticket + player draft.
 * Reroll team or era independently (not both at once).
 */
export function TicketDispenser({
  locked,
  printing,
  canRerollTeam,
  canRerollEra,
  reduceMotion = false,
  onPrint,
  onResult,
  onReroll,
}: TicketDispenserProps) {
  const allPairs = useMemo(() => listValidSpinPairs(), []);
  const [phase, setPhase] = useState<MachinePhase>(locked ? 'done' : 'idle');
  const [printKind, setPrintKind] = useState<PrintKind>('both');
  const [feed, setFeed] = useState(locked ? 1 : 0);
  const [displayTeam, setDisplayTeam] = useState<TeamInfo | null>(locked?.team ?? null);
  const [displayEra, setDisplayEra] = useState<DecadeEra | null>(locked?.era ?? null);
  const [teamLocked, setTeamLocked] = useState(Boolean(locked));
  const [eraLocked, setEraLocked] = useState(Boolean(locked));
  const [teamReel, setTeamReel] = useState<TeamInfo[]>([]);
  const [eraReel, setEraReel] = useState<DecadeEra[]>([]);
  const [finalPull, setFinalPull] = useState(false);
  const [status, setStatus] = useState(
    locked
      ? `${locked.team.fullName} · ${locked.era}`
      : 'Press Print Ticket for a franchise & decade',
  );

  const rafRef = useRef(0);
  const sfxRef = useRef(0);
  const runIdRef = useRef(0);
  const ticketRef = useRef<HTMLDivElement | null>(null);
  const teamStripRef = useRef<HTMLDivElement | null>(null);
  const eraStripRef = useRef<HTMLDivElement | null>(null);

  const cleanupRun = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (sfxRef.current) window.clearInterval(sfxRef.current);
    sfxRef.current = 0;
    // Printer/wheel loops are stopped in lockWheel / finishPrint / unmount only.
    // Stopping here would kill gesture-started audio before afterStripPaint.
    hapticCancel();
  }, []);

  useEffect(
    () => () => {
      cleanupRun();
      stopTicketSpinHum();
    },
    [cleanupRun],
  );

  // Preload printer MP3 early so the first Print tap can play immediately on iOS.
  useEffect(() => {
    preloadTicketPrintSound();
  }, []);

  // Sync external lock (next pick reset → idle machine).
  useEffect(() => {
    if (locked && phase === 'done') {
      setDisplayTeam(locked.team);
      setDisplayEra(locked.era);
      setTeamLocked(true);
      setEraLocked(true);
      setFeed(1);
      setStatus(`${locked.team.fullName} · ${locked.era}`);
    }
    if (!locked && !printing && phase !== 'printing' && phase !== 'clearing') {
      if (phase === 'idle') return;
      setPhase('idle');
      setFeed(0);
      setDisplayTeam(null);
      setDisplayEra(null);
      setTeamLocked(false);
      setEraLocked(false);
      setFinalPull(false);
      setTeamReel([]);
      setEraReel([]);
      setPrintKind('both');
      setStatus('Press Print Ticket for a franchise & decade');
    }
  }, [locked, phase, printing]);

  const finishPrint = useCallback(
    (pair: SpinPair) => {
      stopTicketSpinHum();
      cleanupRun();
      setFeed(1);
      if (ticketRef.current) {
        ticketRef.current.style.setProperty('--feed', '1');
      }
      setDisplayTeam(pair.team);
      setDisplayEra(pair.era);
      setTeamLocked(true);
      setEraLocked(true);
      setFinalPull(true);
      setPhase('done');
      setPrintKind('both');
      setTeamReel([]);
      setEraReel([]);
      setStatus(`${pair.team.fullName} · ${pair.era}`);
      window.setTimeout(() => setFinalPull(false), 280);
      window.setTimeout(() => onResult(pair), 120);
    },
    [cleanupRun, onResult],
  );

  const beginWheel = useCallback(() => {
    // Audio is started from handlePrint / handleReroll (user-gesture).
    // Keep a sync restart here for reduce-motion / mid-sequence paths.
    startTicketSpinHum();
    hapticTicketPrint();
    hapticWheelStart();
  }, []);

  const lockWheel = useCallback(() => {
    stopTicketSpinHum();
    playWheelStopSound();
    playTicketReleaseSound();
    hapticWheelStop();
  }, []);

  const runFullPrint = useCallback(
    (pair: SpinPair) => {
      cleanupRun();
      const runId = ++runIdRef.current;
      setPrintKind('both');

      const teams = uniqueTeams(allPairs);
      const eras = erasForTeam(allPairs, pair.team.id);
      const teamStrip = buildWinnerStrip(
        teams,
        pair.team,
        7 + Math.floor(Math.random() * 3),
        (t) => t.id,
      );
      const eraStrip = buildWinnerStrip(
        eras,
        pair.era,
        7 + Math.floor(Math.random() * 3),
        (e) => e,
      );
      const teamEnd = Math.max(0, teamStrip.length - 1);
      const eraEnd = Math.max(0, eraStrip.length - 1);

      setTeamReel(teamStrip);
      setEraReel(eraStrip);
      setDisplayTeam(pair.team);
      setDisplayEra(pair.era);
      setTeamLocked(false);
      setEraLocked(false);
      setFeed(0);
      setFinalPull(false);
      setPhase('printing');
      setStatus('Printing ticket…');

      if (reduceMotion) {
        beginWheel();
        setFeed(1);
        setTeamLocked(true);
        setEraLocked(true);
        lockWheel();
        window.setTimeout(() => finishPrint(pair), 280);
        return;
      }

      beginWheel();

      // Franchise + decade spin together and land together.
      afterStripPaint(runId, runIdRef, () => {
        const reelH = measureReelItemH(
          teamStripRef.current?.parentElement ?? teamStripRef.current,
        );
        setStripOffset(teamStripRef.current, 0, reelH);
        setStripOffset(eraStripRef.current, 0, reelH);
        ticketRef.current?.style.setProperty('--feed', '0');

        const t0 = performance.now();
        let parked = false;
        let pullSet = false;

        const step = (now: number) => {
          if (runId !== runIdRef.current) return;
          const elapsed = now - t0;

          const feedT = physicalFeedProgress(elapsed, PRINT_TOTAL_MS);
          const wobble = paperWobble(elapsed, Math.min(1, feedT));
          const flex = paperFlex(elapsed, Math.min(1, feedT));
          ticketRef.current?.style.setProperty('--feed', String(feedT));
          ticketRef.current?.style.setProperty('--wobble', String(wobble));
          ticketRef.current?.style.setProperty('--flex', String(flex));

          if (elapsed < DUAL_SCROLL_MS) {
            const t = easeOutCubic(elapsed / DUAL_SCROLL_MS);
            const teamOff = t * teamEnd;
            setStripOffset(teamStripRef.current, teamOff, reelH);
            setStripOffset(eraStripRef.current, t * eraEnd, reelH);
            hapticWheelTick(teamOff);
            playWheelTickSound();
          } else if (elapsed < PRINT_TOTAL_MS) {
            if (!parked) {
              parked = true;
              setStripOffset(teamStripRef.current, teamEnd, reelH);
              setStripOffset(eraStripRef.current, eraEnd, reelH);
              teamStripRef.current?.parentElement?.classList.add('is-locked');
              teamStripRef.current?.parentElement?.classList.remove('is-spinning');
              eraStripRef.current?.parentElement?.classList.add('is-locked');
              eraStripRef.current?.parentElement?.classList.remove('is-spinning');
              lockWheel();
            }
            if (!pullSet) {
              pullSet = true;
              ticketRef.current?.classList.add('is-yank');
            }
          } else {
            ticketRef.current?.style.setProperty('--feed', '1');
            ticketRef.current?.style.setProperty('--wobble', '0');
            ticketRef.current?.style.setProperty('--flex', '0');
            setTeamLocked(true);
            setEraLocked(true);
            setFeed(1);
            finishPrint(pair);
            return;
          }
          rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
      });
    },
    [allPairs, cleanupRun, finishPrint, lockWheel, reduceMotion, beginWheel],
  );

  const runPartialPrint = useCallback(
    (kind: TicketRerollKind, pair: SpinPair) => {
      cleanupRun();
      const runId = ++runIdRef.current;
      setPrintKind(kind);
      setFeed(1);
      setFinalPull(false);
      setPhase('printing');
      setStatus(kind === 'team' ? 'Rerolling team…' : 'Rerolling era…');
      ticketRef.current?.style.setProperty('--feed', '1');

      if (kind === 'team') {
        const teams = teamsForEra(allPairs, pair.era);
        const teamStrip = buildWinnerStrip(
          teams,
          pair.team,
          6 + Math.floor(Math.random() * 3),
          (t) => t.id,
        );
        const teamEnd = Math.max(0, teamStrip.length - 1);
        setTeamReel(teamStrip);
        setEraReel([]);
        setDisplayTeam(pair.team);
        setDisplayEra(pair.era);
        setTeamLocked(false);
        setEraLocked(true);

        afterStripPaint(runId, runIdRef, () => {
          const reelH = measureReelItemH(teamStripRef.current?.parentElement ?? teamStripRef.current);
          setStripOffset(teamStripRef.current, 0, reelH);

          if (reduceMotion) {
            beginWheel();
            setTeamLocked(true);
            lockWheel();
            window.setTimeout(() => finishPrint(pair), 280);
            return;
          }

          beginWheel();
          const t0 = performance.now();
          const total = PARTIAL_SCROLL_MS + PARTIAL_PULL_MS;
          let pullSet = false;
          const step = (now: number) => {
            if (runId !== runIdRef.current) return;
            const elapsed = now - t0;
            if (elapsed < PARTIAL_SCROLL_MS) {
              const t = easeOutCubic(elapsed / PARTIAL_SCROLL_MS);
              const teamOff = t * teamEnd;
              setStripOffset(teamStripRef.current, teamOff, reelH);
              hapticWheelTick(teamOff);
              playWheelTickSound();
            } else if (elapsed < total) {
              setStripOffset(teamStripRef.current, teamEnd, reelH);
              if (!pullSet) {
                pullSet = true;
                teamStripRef.current?.parentElement?.classList.add('is-locked');
                teamStripRef.current?.parentElement?.classList.remove('is-spinning');
                ticketRef.current?.classList.add('is-yank');
                lockWheel();
              }
            } else {
              setTeamLocked(true);
              finishPrint(pair);
              return;
            }
            rafRef.current = requestAnimationFrame(step);
          };
          rafRef.current = requestAnimationFrame(step);
        });
        return;
      }

      const eras = erasForTeam(allPairs, pair.team.id);
      const eraStrip = buildWinnerStrip(
        eras,
        pair.era,
        6 + Math.floor(Math.random() * 3),
        (e) => e,
      );
      const eraEnd = Math.max(0, eraStrip.length - 1);
      setEraReel(eraStrip);
      setTeamReel([]);
      setDisplayTeam(pair.team);
      setDisplayEra(pair.era);
      setTeamLocked(true);
      setEraLocked(false);

      afterStripPaint(runId, runIdRef, () => {
        const reelH = measureReelItemH(eraStripRef.current?.parentElement ?? eraStripRef.current);
        setStripOffset(eraStripRef.current, 0, reelH);

        if (reduceMotion) {
          beginWheel();
          setEraLocked(true);
          lockWheel();
          window.setTimeout(() => finishPrint(pair), 280);
          return;
        }

        beginWheel();
        const t0 = performance.now();
        const total = PARTIAL_SCROLL_MS + PARTIAL_PULL_MS;
        let pullSet = false;
        const step = (now: number) => {
          if (runId !== runIdRef.current) return;
          const elapsed = now - t0;
          if (elapsed < PARTIAL_SCROLL_MS) {
            const t = easeOutCubic(elapsed / PARTIAL_SCROLL_MS);
            const eraOff = t * eraEnd;
            setStripOffset(eraStripRef.current, eraOff, reelH);
            hapticWheelTick(eraOff);
            playWheelTickSound();
          } else if (elapsed < total) {
            setStripOffset(eraStripRef.current, eraEnd, reelH);
            if (!pullSet) {
              pullSet = true;
              eraStripRef.current?.parentElement?.classList.add('is-locked');
              eraStripRef.current?.parentElement?.classList.remove('is-spinning');
              ticketRef.current?.classList.add('is-yank');
              lockWheel();
            }
          } else {
            setEraLocked(true);
            finishPrint(pair);
            return;
          }
          rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
      });
    },
    [allPairs, cleanupRun, finishPrint, lockWheel, reduceMotion, beginWheel],
  );

  const handlePrint = useCallback(() => {
    if (printing || phase === 'printing' || phase === 'clearing' || locked) return;
    // Confirm + printer loops in the same user-gesture stack (required on iOS).
    playGameSound('ui_confirm');
    startTicketSpinHum();
    hapticTap();
    const pair = pickResult(allPairs);
    onPrint();
    runFullPrint(pair);
  }, [allPairs, locked, onPrint, phase, printing, runFullPrint]);

  const handleReroll = useCallback(
    (kind: TicketRerollKind) => {
      if (phase !== 'done' || !locked || printing) return;
      if (kind === 'team' && !canRerollTeam) return;
      if (kind === 'era' && !canRerollEra) return;
      playGameSound('ui_secondary');
      hapticTap();

      const current: SpinPair = {
        team: displayTeam ?? locked.team,
        era: displayEra ?? locked.era,
      };
      const next = pickRerollPair(allPairs, current, kind);
      if (
        (kind === 'team' && next.team.id === current.team.id) ||
        (kind === 'era' && next.era === current.era)
      ) {
        setStatus(
          kind === 'team'
            ? 'No other franchise available for this era.'
            : 'No other era available for this franchise.',
        );
        return;
      }

      // Start printer audio in the same user-gesture stack as the reroll tap.
      startTicketSpinHum();
      hapticTap();
      onReroll(kind);
      runPartialPrint(kind, next);
    },
    [
      allPairs,
      canRerollEra,
      canRerollTeam,
      displayEra,
      displayTeam,
      locked,
      onReroll,
      phase,
      printing,
      runPartialPrint,
    ],
  );

  const isCompact = phase === 'done' && Boolean(locked) && !printing;
  const showPrint = phase === 'idle' && !locked && !printing;
  const showBusy = phase === 'printing' || phase === 'clearing';
  const showRerolls = isCompact && (canRerollTeam || canRerollEra);
  const itemH = isCompact ? 40 : REEL_ITEM_H_FALLBACK;
  const reelStyle = { '--reel-h': isCompact ? `${itemH}px` : 'var(--ticket-reel-h)' } as CSSProperties;
  const activeTeam = displayTeam;
  const teamBg = activeTeam ? getTeamColors(activeTeam.id).primary : undefined;
  // Keep strip DOM mounted for the whole print — swapping to static text mid-spin caused hitching.
  const showTeamStrip = teamReel.length > 0;
  const showEraStrip = eraReel.length > 0;
  const spinningTeam = phase === 'printing' && showTeamStrip && !teamLocked;
  const spinningEra = phase === 'printing' && showEraStrip && !eraLocked;
  const glassStatus =
    phase === 'printing'
      ? 'PRINTING TICKET'
      : isCompact
        ? 'TICKET PRINTED'
        : 'READY';

  return (
    <section
      className={`ticket-disp ticket-disp--product${isCompact ? ' is-compact' : ''}${
        phase === 'printing' ? ' is-live' : ''
      }`}
      aria-label="Draft ticket press"
    >
      {!isCompact ? (
        <div className="ticket-disp__header">
          <p className="ticket-disp__eyebrow">Draft Press</p>
          <h2 className="ticket-disp__title">
            {displayTeam && teamLocked ? displayTeam.fullName : 'Print a draft ticket'}
          </h2>
          {displayEra && eraLocked ? (
            <p className="ticket-disp__era">{displayEra}</p>
          ) : (
            <p className="ticket-disp__hint">{status}</p>
          )}
        </div>
      ) : null}

      <div
        className={`ticket-disp__machine ticket-disp__machine--product${
          phase === 'printing' ? ' is-printing' : ''
        }${finalPull ? ' is-pull' : ''}${isCompact ? ' is-compact' : ''}${
          phase === 'idle' ? ' is-idle' : ''
        }${isCompact ? ' is-complete' : ''}`}
      >
        {/* Layer 1 — outer brushed aluminum shell */}
        <div className="press-shell" aria-hidden>
          <span className="press-shell__metal" />
          <span className="press-shell__chamfer press-shell__chamfer--l" />
          <span className="press-shell__chamfer press-shell__chamfer--r" />
          <span className="press-shell__ledge" />
          <span className="press-shell__led press-shell__led--l" />
          <span className="press-shell__led press-shell__led--r" />
          <span className="press-shell__base" />
        </div>

        {/* Layer 2 — inset black glass face */}
        <div className="press-face">
          {/* Layer 3 — recessed status display */}
          <div className="press-display" aria-live="polite">
            <span className="press-display__brand">TRADE UP</span>
            <span className="press-display__status">{glassStatus}</span>
            <span
              className={`press-display__bar${
                phase === 'printing' ? ' is-printing' : phase === 'idle' ? ' is-idle' : ''
              }`}
              aria-hidden
            >
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
          </div>

          {/* Layer 4 — deep printing chamber */}
          <div className="press-chamber">
            <div
              className={`press-rollers${phase === 'printing' ? ' is-spinning' : ''}`}
              aria-hidden
            >
              <span />
              <span />
              <span />
            </div>

            {/* Layer 5 — bay where ticket lives (clipped) */}
            <div className="press-bay ticket-disp__aperture">
              <div
                ref={ticketRef}
                className={`ticket-disp__ticket press-ticket${finalPull ? ' is-yank' : ''}`}
                style={
                  {
                    '--feed': feed,
                    '--wobble': 0,
                    '--flex': 0,
                  } as CSSProperties
                }
              >
                <div className="ticket-disp__ticket-inner press-ticket__inner">
                  <div className="ticket-disp__serration" aria-hidden />
                  {!isCompact ? (
                    <>
                      <div className="ticket-disp__perf" aria-hidden />
                      <div className="ticket-disp__stub-row">
                        <p className="ticket-disp__stub">Draft Certificate</p>
                        <span className="ticket-disp__stub-mark">TU</span>
                      </div>
                    </>
                  ) : null}

                  <div className="ticket-disp__field">
                    <span className="ticket-disp__label">Franchise</span>
                    <div
                      className={`ticket-disp__reel ticket-disp__reel--team${
                        teamLocked ? ' is-locked' : ''
                      }${spinningTeam ? ' is-spinning' : ''}`}
                      style={
                        {
                          ...reelStyle,
                          ...(teamBg && !showTeamStrip
                            ? {
                                backgroundColor: teamBg,
                                color: '#ffffff',
                              }
                            : null),
                        } as CSSProperties
                      }
                    >
                      {showTeamStrip ? (
                        <div ref={teamStripRef} className="ticket-disp__strip">
                          {teamReel.map((t, i) => {
                            const colors = getTeamColors(t.id);
                            return (
                              <div
                                key={`${t.id}-${i}`}
                                className="ticket-disp__strip-item ticket-disp__strip-item--team"
                                style={{
                                  backgroundColor: colors.primary,
                                  color: '#ffffff',
                                }}
                              >
                                <strong>{teamLine(t)}</strong>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <strong>{activeTeam ? teamLine(activeTeam) : '—'}</strong>
                      )}
                    </div>
                  </div>

                  <div className="ticket-disp__field">
                    <span className="ticket-disp__label">Decade</span>
                    <div
                      className={`ticket-disp__reel ticket-disp__reel--era${
                        eraLocked ? ' is-locked' : ''
                      }${spinningEra ? ' is-spinning' : ''}`}
                      style={reelStyle}
                    >
                      {showEraStrip ? (
                        <div ref={eraStripRef} className="ticket-disp__strip">
                          {eraReel.map((e, i) => (
                            <div key={`${e}-${i}`} className="ticket-disp__strip-item">
                              <strong>{e}</strong>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <strong>{displayEra ?? '—'}</strong>
                      )}
                    </div>
                  </div>

                  {!isCompact ? (
                    <>
                      <div className="ticket-disp__barcode" aria-hidden>
                        {Array.from({ length: 28 }, (_, i) => (
                          <i
                            key={i}
                            style={{
                              width: `${2 + ((i * 7) % 4)}px`,
                              opacity: 0.55 + ((i * 13) % 40) / 100,
                            }}
                          />
                        ))}
                      </div>
                      <p className="ticket-disp__serial">
                        {displayTeam && displayEra
                          ? `${displayTeam.id} · ${displayEra.replace(/\D/g, '')}`
                          : '— · —'}
                      </p>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Layer 6 — deep ticket throat / exit */}
            <div className="press-slot" aria-hidden>
              <span className="press-slot__glow" />
              <span className="press-slot__lip" />
              <span className="press-slot__throat" />
            </div>
          </div>

          {/* Layer 7 — output tray */}
          <div className="press-tray" aria-hidden />
        </div>
      </div>

      <div className="ticket-disp__actions">
        {showPrint ? (
          <button type="button" className="ticket-disp__print" onClick={handlePrint}>
            <span className="ticket-disp__print-pulse" aria-hidden />
            <span className="ticket-disp__print-kicker">Press to deal</span>
            <span className="ticket-disp__print-label">Print Ticket</span>
          </button>
        ) : null}

        {showBusy ? (
          <button type="button" className="ticket-disp__print is-busy" disabled>
            <span className="ticket-disp__print-kicker">Working</span>
            <span className="ticket-disp__print-label">
              {printKind === 'team'
                ? 'Rerolling team…'
                : printKind === 'era'
                  ? 'Rerolling era…'
                  : 'Printing…'}
            </span>
          </button>
        ) : null}

        {showRerolls ? (
          <div className="ticket-disp__reroll-row">
            <button
              type="button"
              className="ticket-disp__reroll ticket-disp__reroll--team"
              disabled={!canRerollTeam}
              onClick={() => handleReroll('team')}
            >
              <span className="ticket-disp__reroll-kicker">
                {canRerollTeam ? '1 left' : 'Used'}
              </span>
              <span className="ticket-disp__reroll-label">Reroll Team</span>
            </button>
            <button
              type="button"
              className="ticket-disp__reroll ticket-disp__reroll--era"
              disabled={!canRerollEra}
              onClick={() => handleReroll('era')}
            >
              <span className="ticket-disp__reroll-kicker">
                {canRerollEra ? '1 left' : 'Used'}
              </span>
              <span className="ticket-disp__reroll-label">Reroll Era</span>
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
