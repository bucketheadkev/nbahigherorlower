'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  listValidSpinPairs,
  type DecadeEra,
  type SpinPair,
} from '@/lib/tradeup/billionDollar';
import { playGameSound } from '@/lib/tradeup/gameAudio';
import { getAudioSettings } from '@/lib/tradeup/audioSettings';
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

const TEAM_SCROLL_MS = 1600;
const ERA_SCROLL_MS = 1400;
const FINAL_PULL_MS = 380;
const PARTIAL_SCROLL_MS = 1700;
const PARTIAL_PULL_MS = 280;
const PRINT_TOTAL_MS = TEAM_SCROLL_MS + ERA_SCROLL_MS + FINAL_PULL_MS;

function easeOutQuint(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 5);
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

function pickDifferent<T>(pool: T[], current: T, key: (v: T) => string): T {
  if (pool.length <= 1) return pool[0] ?? current;
  const others = pool.filter((v) => key(v) !== key(current));
  const list = others.length > 0 ? others : pool;
  return list[Math.floor(Math.random() * list.length)]!;
}

function teamLine(team: TeamInfo): string {
  return team.fullName || `${team.city} ${team.name}`;
}

function contrastInk(hex: string): string {
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return '#ffffff';
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#0c0a09' : '#ffffff';
}

function buildStrip<T>(items: T[], winnerIdx: number, loops: number): T[] {
  const strip: T[] = [];
  for (let i = 0; i < loops; i += 1) strip.push(...items);
  strip.push(...items.slice(0, winnerIdx + 1));
  return strip;
}

function vibratePrint(pulses = 36): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  const { hapticsEnabled, sfxMuted } = getAudioSettings();
  if (!hapticsEnabled || sfxMuted) return;
  try {
    const pulse: number[] = [];
    for (let i = 0; i < pulses; i += 1) pulse.push(18, 32);
    navigator.vibrate(pulse);
  } catch {
    /* unsupported */
  }
}

function stopVibrate(): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(0);
  } catch {
    /* unsupported */
  }
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
  const [teamOffset, setTeamOffset] = useState(0);
  const [eraOffset, setEraOffset] = useState(0);
  const [finalPull, setFinalPull] = useState(false);
  const [status, setStatus] = useState(
    locked
      ? `${locked.team.fullName} · ${locked.era}`
      : 'Press Print Ticket for a franchise & decade',
  );

  const rafRef = useRef(0);
  const sfxRef = useRef(0);
  const runIdRef = useRef(0);

  const cleanupRun = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (sfxRef.current) window.clearInterval(sfxRef.current);
    sfxRef.current = 0;
    stopVibrate();
  }, []);

  useEffect(() => () => cleanupRun(), [cleanupRun]);

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
      cleanupRun();
      setFeed(1);
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
      playGameSound('ticket_ding');
      window.setTimeout(() => setFinalPull(false), 280);
      window.setTimeout(() => onResult(pair), 120);
    },
    [cleanupRun, onResult],
  );

  const startSfx = useCallback((pulses: number) => {
    vibratePrint(pulses);
    playGameSound('ticket_print');
    sfxRef.current = window.setInterval(() => {
      playGameSound('ticket_print');
    }, 95);
  }, []);

  const runFullPrint = useCallback(
    (pair: SpinPair) => {
      cleanupRun();
      const runId = ++runIdRef.current;
      setPrintKind('both');

      const teams = shuffleCopy(uniqueTeams(allPairs));
      const eras = shuffleCopy(erasForTeam(allPairs, pair.team.id));
      const teamIdx = Math.max(0, teams.findIndex((t) => t.id === pair.team.id));
      const eraIdx = Math.max(0, eras.findIndex((e) => e === pair.era));
      const teamStrip = buildStrip(teams, teamIdx, 10 + Math.floor(Math.random() * 5));
      const eraStrip = buildStrip(eras, eraIdx, 8 + Math.floor(Math.random() * 4));

      setTeamReel(teamStrip);
      setEraReel(eraStrip);
      setTeamOffset(0);
      setEraOffset(0);
      setDisplayTeam(teamStrip[0] ?? pair.team);
      setDisplayEra(null);
      setTeamLocked(false);
      setEraLocked(false);
      setFeed(0);
      setFinalPull(false);
      setPhase('printing');
      setStatus('Printing ticket…');

      if (reduceMotion) {
        setFeed(1);
        setDisplayTeam(pair.team);
        setDisplayEra(pair.era);
        setTeamLocked(true);
        setEraLocked(true);
        window.setTimeout(() => finishPrint(pair), 280);
        return;
      }

      startSfx(36);
      const t0 = performance.now();
      const teamEnd = Math.max(0, teamStrip.length - 1);
      const eraEnd = Math.max(0, eraStrip.length - 1);

      const step = (now: number) => {
        if (runId !== runIdRef.current) return;
        const elapsed = now - t0;
        setFeed(easeOutQuint(Math.min(1, elapsed / (PRINT_TOTAL_MS * 0.92))));

        if (elapsed < TEAM_SCROLL_MS) {
          const idx = Math.round(easeOutQuint(elapsed / TEAM_SCROLL_MS) * teamEnd);
          setTeamOffset(idx);
          setDisplayTeam(teamStrip[idx] ?? pair.team);
          setTeamLocked(false);
          setEraLocked(false);
        } else if (elapsed < TEAM_SCROLL_MS + ERA_SCROLL_MS) {
          setTeamOffset(teamEnd);
          setDisplayTeam(pair.team);
          setTeamLocked(true);
          const eraElapsed = elapsed - TEAM_SCROLL_MS;
          const idx = Math.round(easeOutQuint(eraElapsed / ERA_SCROLL_MS) * eraEnd);
          setEraOffset(idx);
          setDisplayEra(eraStrip[idx] ?? pair.era);
          setEraLocked(false);
        } else if (elapsed < PRINT_TOTAL_MS) {
          setTeamOffset(teamEnd);
          setEraOffset(eraEnd);
          setDisplayTeam(pair.team);
          setDisplayEra(pair.era);
          setTeamLocked(true);
          setEraLocked(true);
          setFinalPull(true);
          setFeed(1);
        } else {
          finishPrint(pair);
          return;
        }
        rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [allPairs, cleanupRun, finishPrint, reduceMotion, startSfx],
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

      if (kind === 'team') {
        const teams = shuffleCopy(teamsForEra(allPairs, pair.era));
        const teamIdx = Math.max(0, teams.findIndex((t) => t.id === pair.team.id));
        const teamStrip = buildStrip(teams, teamIdx, 9 + Math.floor(Math.random() * 4));
        setTeamReel(teamStrip);
        setEraReel([]);
        setTeamOffset(0);
        setDisplayTeam(teamStrip[0] ?? pair.team);
        setDisplayEra(pair.era);
        setTeamLocked(false);
        setEraLocked(true);

        if (reduceMotion) {
          setDisplayTeam(pair.team);
          setTeamLocked(true);
          window.setTimeout(() => finishPrint(pair), 280);
          return;
        }

        startSfx(22);
        const t0 = performance.now();
        const teamEnd = Math.max(0, teamStrip.length - 1);
        const total = PARTIAL_SCROLL_MS + PARTIAL_PULL_MS;
        const step = (now: number) => {
          if (runId !== runIdRef.current) return;
          const elapsed = now - t0;
          if (elapsed < PARTIAL_SCROLL_MS) {
            const idx = Math.round(easeOutQuint(elapsed / PARTIAL_SCROLL_MS) * teamEnd);
            setTeamOffset(idx);
            setDisplayTeam(teamStrip[idx] ?? pair.team);
            setTeamLocked(false);
          } else if (elapsed < total) {
            setTeamOffset(teamEnd);
            setDisplayTeam(pair.team);
            setTeamLocked(true);
            setFinalPull(true);
          } else {
            finishPrint(pair);
            return;
          }
          rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      const eras = shuffleCopy(erasForTeam(allPairs, pair.team.id));
      const eraIdx = Math.max(0, eras.findIndex((e) => e === pair.era));
      const eraStrip = buildStrip(eras, eraIdx, 8 + Math.floor(Math.random() * 4));
      setEraReel(eraStrip);
      setTeamReel([]);
      setEraOffset(0);
      setDisplayTeam(pair.team);
      setDisplayEra(eraStrip[0] ?? pair.era);
      setTeamLocked(true);
      setEraLocked(false);

      if (reduceMotion) {
        setDisplayEra(pair.era);
        setEraLocked(true);
        window.setTimeout(() => finishPrint(pair), 280);
        return;
      }

      startSfx(22);
      const t0 = performance.now();
      const eraEnd = Math.max(0, eraStrip.length - 1);
      const total = PARTIAL_SCROLL_MS + PARTIAL_PULL_MS;
      const step = (now: number) => {
        if (runId !== runIdRef.current) return;
        const elapsed = now - t0;
        if (elapsed < PARTIAL_SCROLL_MS) {
          const idx = Math.round(easeOutQuint(elapsed / PARTIAL_SCROLL_MS) * eraEnd);
          setEraOffset(idx);
          setDisplayEra(eraStrip[idx] ?? pair.era);
          setEraLocked(false);
        } else if (elapsed < total) {
          setEraOffset(eraEnd);
          setDisplayEra(pair.era);
          setEraLocked(true);
          setFinalPull(true);
        } else {
          finishPrint(pair);
          return;
        }
        rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [allPairs, cleanupRun, finishPrint, reduceMotion, startSfx],
  );

  const handlePrint = useCallback(() => {
    if (printing || phase === 'printing' || phase === 'clearing' || locked) return;
    const pair = pickResult(allPairs);
    onPrint();
    runFullPrint(pair);
  }, [allPairs, locked, onPrint, phase, printing, runFullPrint]);

  const handleReroll = useCallback(
    (kind: TicketRerollKind) => {
      if (phase !== 'done' || !locked || printing) return;
      if (kind === 'team' && !canRerollTeam) return;
      if (kind === 'era' && !canRerollEra) return;

      let next: SpinPair;
      if (kind === 'team') {
        const pool = teamsForEra(allPairs, locked.era);
        const team = pickDifferent(pool, locked.team, (t) => t.id);
        next = { team, era: locked.era };
      } else {
        const pool = erasForTeam(allPairs, locked.team.id);
        const era = pickDifferent(pool, locked.era, (e) => e);
        next = { team: locked.team, era };
      }

      playGameSound('ticket_tear');
      onReroll(kind);
      runPartialPrint(kind, next);
    },
    [
      allPairs,
      canRerollEra,
      canRerollTeam,
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
  const itemH = isCompact ? 40 : 52;
  const activeTeam = displayTeam;
  const teamBg = activeTeam ? getTeamColors(activeTeam.id).primary : undefined;
  const teamInk = teamBg ? contrastInk(teamBg) : undefined;
  const spinningTeam =
    phase === 'printing' && (printKind === 'both' || printKind === 'team') && !teamLocked;
  const spinningEra =
    phase === 'printing' &&
    ((printKind === 'both' && teamLocked && !eraLocked) ||
      (printKind === 'era' && !eraLocked));

  return (
    <section
      className={`ticket-disp${isCompact ? ' is-compact' : ''}${
        phase === 'printing' ? ' is-live' : ''
      }`}
      aria-label="Arcade ticket dispenser"
    >
      {!isCompact ? (
        <div className="ticket-disp__header">
          <p className="ticket-disp__eyebrow">Arcade redemption</p>
          <h2 className="ticket-disp__title">
            {displayTeam && teamLocked ? displayTeam.fullName : 'Ticket Dispenser'}
          </h2>
          {displayEra && eraLocked ? (
            <p className="ticket-disp__era">{displayEra}</p>
          ) : (
            <p className="ticket-disp__hint">{status}</p>
          )}
        </div>
      ) : null}

      <div
        className={`ticket-disp__machine${phase === 'printing' ? ' is-printing' : ''}${
          finalPull ? ' is-pull' : ''
        }${isCompact ? ' is-compact' : ''}`}
      >
        {!isCompact ? (
          <>
            <div className="ticket-disp__chrome ticket-disp__chrome--top" aria-hidden />
            <div className="ticket-disp__leds" aria-hidden>
              {Array.from({ length: 8 }, (_, i) => (
                <span
                  key={i}
                  className="ticket-disp__led"
                  style={{ animationDelay: `${i * 0.08}s` }}
                />
              ))}
            </div>
          </>
        ) : null}

        <div className="ticket-disp__marquee">
          <span>NBA TRADE UP</span>
          <span className="ticket-disp__marquee-dot" />
          <span>PRINT · TEAM · ERA</span>
        </div>

        {!isCompact ? (
          <div className="ticket-disp__window" aria-hidden>
            <div className="ticket-disp__rollers">
              <span className="ticket-disp__roller" />
              <span className="ticket-disp__roller" />
              <span className="ticket-disp__roller" />
            </div>
          </div>
        ) : null}

        <div className="ticket-disp__slot">
          {!isCompact ? <div className="ticket-disp__slot-lip" /> : null}
          <div className="ticket-disp__aperture">
            <div
              className={`ticket-disp__ticket${finalPull ? ' is-yank' : ''}`}
              style={
                {
                  '--feed': feed,
                  opacity: feed <= 0.02 && phase === 'printing' && printKind === 'both' ? 0 : 1,
                } as CSSProperties
              }
            >
              <div className="ticket-disp__ticket-inner">
                {!isCompact ? (
                  <>
                    <div className="ticket-disp__perf" aria-hidden />
                    <p className="ticket-disp__stub">OFFICIAL DRAFT TICKET</p>
                  </>
                ) : null}

                <div className="ticket-disp__field">
                  <span className="ticket-disp__label">Team</span>
                  <div
                    className={`ticket-disp__reel ticket-disp__reel--team${
                      teamLocked ? ' is-locked' : ''
                    }${spinningTeam ? ' is-spinning' : ''}`}
                    style={
                      teamBg
                        ? ({
                            backgroundColor: teamBg,
                            color: teamInk,
                          } as CSSProperties)
                        : undefined
                    }
                  >
                    {teamReel.length > 0 && spinningTeam ? (
                      <div
                        className="ticket-disp__strip"
                        style={{ transform: `translateY(${-teamOffset * itemH}px)` }}
                      >
                        {teamReel.map((t, i) => {
                          const colors = getTeamColors(t.id);
                          return (
                            <div
                              key={`${t.id}-${i}`}
                              className="ticket-disp__strip-item ticket-disp__strip-item--team"
                              style={{
                                height: itemH,
                                backgroundColor: colors.primary,
                                color: contrastInk(colors.primary),
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
                  <span className="ticket-disp__label">Era</span>
                  <div
                    className={`ticket-disp__reel ticket-disp__reel--era${
                      eraLocked ? ' is-locked' : ''
                    }${spinningEra ? ' is-spinning' : ''}`}
                  >
                    {eraReel.length > 0 && spinningEra ? (
                      <div
                        className="ticket-disp__strip"
                        style={{ transform: `translateY(${-eraOffset * itemH}px)` }}
                      >
                        {eraReel.map((e, i) => (
                          <div
                            key={`${e}-${i}`}
                            className="ticket-disp__strip-item"
                            style={{ height: itemH }}
                          >
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
                        ? `${displayTeam.id}-${displayEra.replace(/\D/g, '')}`
                        : '———-——'}
                    </p>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {!isCompact ? (
          <div className="ticket-disp__chrome ticket-disp__chrome--bottom" aria-hidden />
        ) : null}
      </div>

      <div className="ticket-disp__actions">
        {showPrint ? (
          <button type="button" className="ticket-disp__print" onClick={handlePrint}>
            Print Ticket
          </button>
        ) : null}

        {showBusy ? (
          <button type="button" className="ticket-disp__print is-busy" disabled>
            {printKind === 'team'
              ? 'Rerolling team…'
              : printKind === 'era'
                ? 'Rerolling era…'
                : 'Printing…'}
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
              Reroll Team{canRerollTeam ? '' : ' · used'}
            </button>
            <button
              type="button"
              className="ticket-disp__reroll ticket-disp__reroll--era"
              disabled={!canRerollEra}
              onClick={() => handleReroll('era')}
            >
              Reroll Era{canRerollEra ? '' : ' · used'}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
