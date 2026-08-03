'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  listValidSpinPairs,
  type DecadeEra,
  type SpinPair,
} from '@/lib/tradeup/billionDollar';
import { DECADE_ERAS } from '@/lib/tradeup/decadeRosters';
import { hapticCancel, hapticTap, hapticTicketPrint } from '@/lib/tradeup/haptics';
import {
  playGameSound,
  preloadTicketPrintSound,
  playTicketReleaseSound,
  startTicketSpinHum,
  stopTicketSpinHum,
} from '@/lib/tradeup/gameAudio';
import { contrastOnPrimary, getTeamColors } from '@/lib/tradeup/teamColors';
import type { TeamInfo } from '@/lib/tradeup/types';
import {
  HorizontalNameReel,
  type NameReelItem,
} from './HorizontalNameReel';

type MachinePhase = 'idle' | 'printing' | 'done' | 'clearing';
type PrintKind = 'both' | 'team' | 'era';
export type TicketRerollKind = 'team' | 'era';

interface TicketDispenserProps {
  locked: SpinPair | null;
  printing: boolean;
  canRerollTeam: boolean;
  canRerollEra: boolean;
  reduceMotion?: boolean;
  selectedPlayerName?: string | null;
  onPrint: () => void;
  onResult: (pair: SpinPair) => void;
  onReroll: (kind: TicketRerollKind) => void;
}

const SPIN_MS = 2150;

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

/** Equal chance per franchise, then equal chance among that team's valid eras. */
function pickFairResult(pairs: SpinPair[]): SpinPair {
  const teams = uniqueTeams(pairs);
  if (teams.length === 0) return pairs[0]!;
  const team = teams[Math.floor(Math.random() * teams.length)]!;
  const eras = erasForTeam(pairs, team.id);
  const era =
    eras.length > 0
      ? eras[Math.floor(Math.random() * eras.length)]!
      : pairs.find((p) => p.team.id === team.id)?.era ?? '2020s';
  return { team, era };
}

function pickRerollPair(
  pairs: SpinPair[],
  locked: SpinPair,
  kind: TicketRerollKind,
): SpinPair {
  if (kind === 'team') {
    const pool = uniqueTeams(pairs).filter((t) => t.id !== locked.team.id);
    if (pool.length === 0) return locked;
    const team = pool[Math.floor(Math.random() * pool.length)]!;
    const eras = erasForTeam(pairs, team.id);
    const era =
      eras.find((e) => e === locked.era) ??
      eras[Math.floor(Math.random() * eras.length)] ??
      locked.era;
    return { team, era };
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
  const fallback = pairs.filter(
    (p) => p.team.id !== locked.team.id || p.era !== locked.era,
  );
  return fallback[Math.floor(Math.random() * fallback.length)] ?? locked;
}

function teamLine(team: TeamInfo): string {
  return team.fullName || `${team.city} ${team.name}`;
}

function makeTeamItems(teams: TeamInfo[]): NameReelItem[] {
  return teams.map((team) => {
    const colors = getTeamColors(team.id);
    return {
      id: team.id,
      label: teamLine(team),
      background: colors.primary,
      color: contrastOnPrimary(colors.primary),
    };
  });
}

function makeDecadeItems(primary: string): NameReelItem[] {
  const fg = contrastOnPrimary(primary);
  return DECADE_ERAS.map((era) => ({
    id: era,
    label: era,
    background: primary,
    color: fg,
  }));
}

/**
 * Franchise booth — dual name reels only (no ticket printer animation).
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
  const teams = useMemo(() => uniqueTeams(allPairs), [allPairs]);
  const teamItems = useMemo(() => makeTeamItems(teams), [teams]);

  const [phase, setPhase] = useState<MachinePhase>(locked ? 'done' : 'idle');
  const [printKind, setPrintKind] = useState<PrintKind>('both');
  const [displayTeam, setDisplayTeam] = useState<TeamInfo | null>(
    locked?.team ?? null,
  );
  const [displayEra, setDisplayEra] = useState<DecadeEra | null>(
    locked?.era ?? null,
  );
  const [teamSpinning, setTeamSpinning] = useState(false);
  const [decadeSpinning, setDecadeSpinning] = useState(false);
  const [teamToken, setTeamToken] = useState(0);
  const [decadeToken, setDecadeToken] = useState(0);
  const [teamTargetId, setTeamTargetId] = useState<string | null>(
    locked?.team.id ?? null,
  );
  const [decadeTargetId, setDecadeTargetId] = useState<string | null>(
    locked?.era ?? null,
  );
  const [status, setStatus] = useState(
    locked
      ? `${locked.team.fullName} · ${locked.era}`
      : 'Tap SPIN for a franchise & decade',
  );

  const [decadeColorTeamId, setDecadeColorTeamId] = useState<string | null>(
    locked?.team.id ?? null,
  );

  const pendingPairRef = useRef<SpinPair | null>(null);
  const teamDoneRef = useRef(true);
  const eraDoneRef = useRef(true);
  const finishingRef = useRef(false);
  const armedRef = useRef(false);

  // Decade reel color only reveals the landed team — never the still-spinning target
  const decadePrimary =
    decadeColorTeamId != null
      ? getTeamColors(decadeColorTeamId).primary
      : '#1e293b';
  const decadeItems = useMemo(
    () => makeDecadeItems(decadePrimary),
    [decadePrimary],
  );

  useEffect(
    () => () => {
      hapticCancel();
      stopTicketSpinHum();
    },
    [],
  );

  useEffect(() => {
    preloadTicketPrintSound();
  }, []);

  useEffect(() => {
    if (locked && phase === 'done') {
      setDisplayTeam(locked.team);
      setDisplayEra(locked.era);
      setTeamTargetId(locked.team.id);
      setDecadeTargetId(locked.era);
      setDecadeColorTeamId(locked.team.id);
      setStatus(`${locked.team.fullName} · ${locked.era}`);
    }
    if (!locked && !printing && phase !== 'printing' && phase !== 'clearing') {
      if (phase === 'idle') return;
      setPhase('idle');
      setDisplayTeam(null);
      setDisplayEra(null);
      setPrintKind('both');
      setTeamSpinning(false);
      setDecadeSpinning(false);
      setTeamTargetId(null);
      setDecadeTargetId(null);
      setDecadeColorTeamId(null);
      finishingRef.current = false;
      armedRef.current = false;
      setStatus('Tap SPIN for a franchise & decade');
    }
  }, [locked, phase, printing]);

  const finishPrint = useCallback(
    (pair: SpinPair) => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      stopTicketSpinHum();
      setDisplayTeam(pair.team);
      setDisplayEra(pair.era);
      setPhase('done');
      setPrintKind('both');
      setTeamTargetId(pair.team.id);
      setDecadeTargetId(pair.era);
      setDecadeColorTeamId(pair.team.id);
      setTeamSpinning(false);
      setDecadeSpinning(false);
      setStatus(`${pair.team.fullName} · ${pair.era}`);
      onResult(pair);
      armedRef.current = false;
      finishingRef.current = false;
    },
    [onResult],
  );

  const tryFinishPair = useCallback(() => {
    const pair = pendingPairRef.current;
    if (!pair) return;
    if (!teamDoneRef.current || !eraDoneRef.current) return;
    pendingPairRef.current = null;
    setTeamSpinning(false);
    setDecadeSpinning(false);
    playTicketReleaseSound();
    finishPrint(pair);
  }, [finishPrint]);

  const handleTeamComplete = useCallback(() => {
    teamDoneRef.current = true;
    setTeamSpinning(false);
    // Reveal decade color only after the team reel has landed
    const pair = pendingPairRef.current;
    if (pair) setDecadeColorTeamId(pair.team.id);
    else if (teamTargetId) setDecadeColorTeamId(teamTargetId);
    tryFinishPair();
  }, [teamTargetId, tryFinishPair]);

  const handleDecadeComplete = useCallback(() => {
    eraDoneRef.current = true;
    setDecadeSpinning(false);
    tryFinishPair();
  }, [tryFinishPair]);

  const runFullPrint = useCallback(
    (pair: SpinPair) => {
      finishingRef.current = false;
      setPrintKind('both');
      pendingPairRef.current = pair;
      teamDoneRef.current = false;
      eraDoneRef.current = false;

      setDisplayTeam(pair.team);
      setDisplayEra(pair.era);
      setPhase('printing');
      setStatus('Spinning…');
      setTeamTargetId(pair.team.id);
      setDecadeTargetId(pair.era);
      // Keep decade color on previous / neutral until team reel lands
      setTeamSpinning(true);
      setDecadeSpinning(true);
      setTeamToken((n) => n + 1);
      setDecadeToken((n) => n + 1);
      hapticTicketPrint();

      if (reduceMotion) {
        teamDoneRef.current = true;
        eraDoneRef.current = true;
        setDecadeColorTeamId(pair.team.id);
        finishPrint(pair);
      }
    },
    [finishPrint, reduceMotion],
  );

  const runPartialPrint = useCallback(
    (kind: TicketRerollKind, pair: SpinPair) => {
      finishingRef.current = false;
      setPrintKind(kind);
      setPhase('printing');
      setStatus(kind === 'team' ? 'Rerolling team…' : 'Rerolling era…');
      pendingPairRef.current = pair;
      setDisplayTeam(pair.team);
      setDisplayEra(pair.era);
      setTeamTargetId(pair.team.id);
      setDecadeTargetId(pair.era);

      if (kind === 'team') {
        teamDoneRef.current = false;
        eraDoneRef.current = true;
        // Hold decade color on the previously revealed team until spin lands
        setTeamSpinning(true);
        setDecadeSpinning(false);
        setTeamToken((n) => n + 1);
        if (reduceMotion) {
          teamDoneRef.current = true;
          setDecadeColorTeamId(pair.team.id);
          finishPrint(pair);
        }
        return;
      }

      teamDoneRef.current = true;
      eraDoneRef.current = false;
      setTeamSpinning(false);
      setDecadeSpinning(true);
      setDecadeToken((n) => n + 1);
      startTicketSpinHum();
      if (reduceMotion) {
        eraDoneRef.current = true;
        stopTicketSpinHum();
        finishPrint(pair);
      }
    },
    [finishPrint, reduceMotion],
  );

  /** pointerdown = true zero-latency response on touch */
  const handleSpinPointer = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      if (armedRef.current) return;
      if (printing || phase === 'printing' || phase === 'clearing' || locked) return;
      armedRef.current = true;
      playGameSound('ui_confirm');
      startTicketSpinHum();
      hapticTap();
      const pair = pickFairResult(allPairs);
      onPrint();
      runFullPrint(pair);
    },
    [allPairs, locked, onPrint, phase, printing, runFullPrint],
  );

  const handleRerollPointer = useCallback(
    (kind: TicketRerollKind) => (e: ReactPointerEvent) => {
      e.preventDefault();
      if (armedRef.current) return;
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

      armedRef.current = true;
      startTicketSpinHum();
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
  const showSpin = phase === 'idle' && !locked && !printing;
  const showBusy = phase === 'printing' || phase === 'clearing';
  const showRerolls = isCompact && (canRerollTeam || canRerollEra);
  const glassStatus =
    phase === 'printing' ? 'SPINNING' : isCompact ? 'LOCKED' : 'READY';

  const headline =
    displayTeam && displayEra && !teamSpinning && !decadeSpinning
      ? `${displayEra} ${displayTeam.name}`
      : null;

  return (
    <section
      className={`ticket-disp ticket-disp--neo ticket-disp--reels-only${
        isCompact ? ' is-compact' : ''
      }${phase === 'printing' ? ' is-live' : ''}`}
      aria-label="Franchise spinner"
    >
      {!isCompact ? (
        <div className="ticket-disp__header ticket-disp__header--neo">
          <p className="ticket-disp__eyebrow">Franchise Booth</p>
          <h2 className="ticket-disp__title">
            {headline ?? 'Spin a franchise & decade'}
          </h2>
          <p className="ticket-disp__hint">{status}</p>
        </div>
      ) : null}

      <div
        className={`neo-booth neo-booth--reels${
          phase === 'printing' ? ' is-printing' : ''
        }${isCompact ? ' is-compact is-complete' : ''}${
          phase === 'idle' ? ' is-idle' : ''
        }`}
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
            <span className="neo-booth__status">{glassStatus}</span>
            <span
              className={`neo-booth__pulse${
                phase === 'printing'
                  ? ' is-printing'
                  : phase === 'idle'
                    ? ' is-idle'
                    : ''
              }`}
              aria-hidden
            />
          </div>

          <div className="neo-booth__chamber neo-booth__chamber--stacked neo-booth__chamber--focal">
            <p className="hn-reel-label">TEAM</p>
            <HorizontalNameReel
              items={teamItems}
              targetId={teamTargetId}
              spinToken={teamToken}
              spinning={teamSpinning}
              reduceMotion={reduceMotion}
              durationMs={SPIN_MS}
              compact={isCompact}
              variant="team"
              ownAudio
              onSpinComplete={handleTeamComplete}
            />

            <p className="hn-reel-label">DECADE</p>
            <HorizontalNameReel
              items={decadeItems}
              targetId={decadeTargetId}
              spinToken={decadeToken}
              spinning={decadeSpinning}
              reduceMotion={reduceMotion}
              durationMs={SPIN_MS}
              compact={isCompact}
              variant="decade"
              ownAudio={printKind === 'era'}
              onSpinComplete={handleDecadeComplete}
            />
          </div>
        </div>
      </div>

      <div className="ticket-disp__actions">
        {showSpin ? (
          <button
            type="button"
            className="neo-booth__spin"
            onPointerDown={handleSpinPointer}
          >
            <span className="neo-booth__spin-ring" aria-hidden />
            <span className="neo-booth__spin-label">SPIN</span>
          </button>
        ) : null}

        {showBusy ? (
          <button type="button" className="neo-booth__spin is-busy" disabled>
            <span className="neo-booth__spin-label">…</span>
          </button>
        ) : null}

        {showRerolls ? (
          <div className="neo-booth__rerolls">
            <button
              type="button"
              className="neo-booth__reroll"
              disabled={!canRerollTeam}
              onPointerDown={handleRerollPointer('team')}
            >
              <span className="neo-booth__reroll-kicker">
                {canRerollTeam ? '1 left' : 'Used'}
              </span>
              <span className="neo-booth__reroll-label">Reroll Team</span>
            </button>
            <button
              type="button"
              className="neo-booth__reroll"
              disabled={!canRerollEra}
              onPointerDown={handleRerollPointer('era')}
            >
              <span className="neo-booth__reroll-kicker">
                {canRerollEra ? '1 left' : 'Used'}
              </span>
              <span className="neo-booth__reroll-label">Reroll Era</span>
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
