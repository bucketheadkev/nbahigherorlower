'use client';

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  listValidSpinPairs,
  type DecadeEra,
  type SpinPair,
} from '@/lib/tradeup/billionDollar';
import { hapticLight, hapticMedium } from '@/lib/tradeup/haptics';
import {
  playWheelStopSound,
  startWheelSpinSound,
  stopWheelSpinSound,
} from '@/lib/tradeup/gameAudio';
import type { TeamInfo } from '@/lib/tradeup/types';
import { contrastOnPrimary, getTeamColors } from '@/lib/tradeup/teamColors';
import { SpinReel, buildSpinStrip, stripFromLabels, type SpinStripItem } from './SpinReel';
import { useLocale } from '@/hooks/useLocale';

export type TicketRerollKind = 'team' | 'era';

type BoardMode = 'idle' | 'spinning' | 'landed';

interface BallionTicketMachineProps {
  locked: SpinPair | null;
  printing: boolean;
  canRerollTeam: boolean;
  canRerollEra: boolean;
  reduceMotion?: boolean;
  selectedPlayerName?: string | null;
  autoReroll?: TicketRerollKind | null;
  rerollFrom?: SpinPair | null;
  /** Held axis during a one-sided reroll (engine keeps the other value). */
  holdTeam?: TeamInfo | null;
  holdEra?: DecadeEra | null;
  /** Classic mode: show GOAL: $1,000,000,000 above TEAM/ERA. */
  showGoal?: boolean;
  onAutoRerollConsumed?: () => void;
  onPrint: () => void;
  onResult: (pair: SpinPair) => void;
  onReroll: (kind: TicketRerollKind) => void;
}

const TEAM_ITEM_H = 84;
const ERA_ITEM_H = 56;
/** Strip length scaled with duration so cruise velocity stays the same. */
const TEAM_STRIP_LEN = 60;
const ERA_STRIP_LEN = 46;
/** 0.5s shorter than prior 3.0s / 3.4s timings. */
const TEAM_SPIN_MS = 2500;
const ERA_SPIN_MS = 2900;
const TEAM_SPIN_MS_REDUCED = 80;
const ERA_SPIN_MS_REDUCED = 80;

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
    // Prefer teams that can keep the same era so the era reel stays truthful.
    const allTeams = uniqueTeams(pairs).filter((t) => t.id !== locked.team.id);
    const sameEraPool = allTeams.filter((t) =>
      erasForTeam(pairs, t.id).includes(locked.era),
    );
    const pool = sameEraPool.length > 0 ? sameEraPool : allTeams;
    if (pool.length === 0) return locked;
    const team = pool[Math.floor(Math.random() * pool.length)]!;
    const eras = erasForTeam(pairs, team.id);
    const era = eras.includes(locked.era)
      ? locked.era
      : (eras[Math.floor(Math.random() * eras.length)] ?? locked.era);
    return { team, era };
  }

  const otherEras = erasForTeam(pairs, locked.team.id).filter(
    (e) => e !== locked.era,
  );
  if (otherEras.length === 0) return locked;
  const era = otherEras[Math.floor(Math.random() * otherEras.length)]!;
  return { team: locked.team, era };
}

function teamLabel(team: TeamInfo): string {
  return team.fullName.toUpperCase();
}

function buildTeamColorStrip(
  teams: TeamInfo[],
  winner: TeamInfo,
  length: number,
): SpinStripItem[] {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const ids = buildSpinStrip(
    teams.map((t) => t.id),
    winner.id,
    length,
  );
  return ids.map((id) => {
    const team = byId.get(id) ?? winner;
    const colors = getTeamColors(team.id);
    return {
      label: teamLabel(team),
      background: colors.primary,
      color: contrastOnPrimary(colors.primary),
    };
  });
}

/**
 * Full-screen TEAM + ERA roll board — CSS-transform reels, one ROLL tap.
 */
export const BallionTicketMachine = memo(function BallionTicketMachine({
  locked: _locked,
  printing: _printing,
  canRerollTeam: _canRerollTeam,
  canRerollEra: _canRerollEra,
  reduceMotion = false,
  autoReroll = null,
  rerollFrom = null,
  holdTeam = null,
  holdEra = null,
  showGoal = false,
  onAutoRerollConsumed,
  onPrint,
  onResult,
  onReroll: _onReroll,
}: BallionTicketMachineProps) {
  const { t } = useLocale();
  const allPairs = useMemo(() => listValidSpinPairs(), []);
  const teams = useMemo(() => uniqueTeams(allPairs), [allPairs]);

  const [mode, setMode] = useState<BoardMode>('idle');
  const [result, setResult] = useState<SpinPair | null>(null);
  const [teamStrip, setTeamStrip] = useState<SpinStripItem[]>([]);
  const [eraStrip, setEraStrip] = useState<SpinStripItem[]>([]);
  const [teamSpinId, setTeamSpinId] = useState(0);
  const [eraSpinId, setEraSpinId] = useState(0);
  const [spinTeam, setSpinTeam] = useState(false);
  const [spinEra, setSpinEra] = useState(false);
  const [teamLanded, setTeamLanded] = useState(false);

  const reportedRef = useRef(false);
  const teamDoneRef = useRef(true);
  const eraDoneRef = useRef(true);
  const pendingRef = useRef<SpinPair | null>(null);
  const autoDoneRef = useRef(false);
  const busyRef = useRef(false);
  const finishTimerRef = useRef(0);

  const teamMs = reduceMotion ? TEAM_SPIN_MS_REDUCED : TEAM_SPIN_MS;
  const eraMs = reduceMotion ? ERA_SPIN_MS_REDUCED : ERA_SPIN_MS;

  const tryFinish = useCallback(() => {
    if (!teamDoneRef.current || !eraDoneRef.current) return;
    const pair = pendingRef.current;
    if (!pair || reportedRef.current) return;
    reportedRef.current = true;
    busyRef.current = false;
    stopWheelSpinSound();
    if (!reduceMotion) playWheelStopSound();
    setMode('landed');
    setResult(pair);
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
    // Brief beat so the lock reads, then hand off to pick UI.
    finishTimerRef.current = window.setTimeout(
      () => onResult(pair),
      reduceMotion ? 40 : 180,
    );
  }, [onResult, reduceMotion]);

  useEffect(() => {
    return () => {
      if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
      stopWheelSpinSound();
    };
  }, []);

  const beginSpin = useCallback(
    (pair: SpinPair, axes: { team: boolean; era: boolean }) => {
      reportedRef.current = false;
      busyRef.current = true;
      pendingRef.current = pair;
      setResult(pair);
      setMode('spinning');
      setTeamLanded(false);

      if (!reduceMotion && (axes.team || axes.era)) {
        startWheelSpinSound(teamMs + eraMs + 180);
      }

      if (axes.team) {
        const strip = buildTeamColorStrip(teams, pair.team, TEAM_STRIP_LEN);
        setTeamStrip(strip);
        setSpinTeam(true);
        teamDoneRef.current = false;
        setTeamSpinId((n) => n + 1);
      } else {
        setTeamStrip([]);
        setSpinTeam(false);
        teamDoneRef.current = true;
        setTeamLanded(true);
      }

      if (axes.era) {
        const eraPool = erasForTeam(allPairs, pair.team.id);
        const labels =
          eraPool.length > 0
            ? eraPool
            : (['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'] as DecadeEra[]);
        setEraStrip(stripFromLabels(buildSpinStrip(labels, pair.era, ERA_STRIP_LEN)));
        setSpinEra(true);
        eraDoneRef.current = false;
        setEraSpinId((n) => n + 1);
      } else {
        setEraStrip([]);
        setSpinEra(false);
        eraDoneRef.current = true;
      }
    },
    [allPairs, reduceMotion, teams],
  );

  const handleRoll = useCallback(() => {
    if (busyRef.current || mode === 'spinning') return;
    // Instant feedback before any heavier work.
    hapticLight();
    busyRef.current = true;
    const pair = pickFairResult(allPairs);
    onPrint();
    beginSpin(pair, { team: true, era: true });
  }, [allPairs, beginSpin, mode, onPrint]);

  // One-sided auto-reroll from pick screen.
  useEffect(() => {
    if (!autoReroll || autoDoneRef.current) return;
    const baseline = rerollFrom;
    if (!baseline) {
      onAutoRerollConsumed?.();
      return;
    }
    autoDoneRef.current = true;
    const next = pickRerollPair(allPairs, baseline, autoReroll);
    onAutoRerollConsumed?.();
    hapticLight();
    if (autoReroll === 'team') {
      beginSpin(next, { team: true, era: false });
    } else {
      beginSpin(next, { team: false, era: true });
    }
  }, [allPairs, autoReroll, beginSpin, onAutoRerollConsumed, rerollFrom]);

  const onTeamLocked = useCallback(() => {
    teamDoneRef.current = true;
    setTeamLanded(true);
    hapticMedium();
    tryFinish();
  }, [tryFinish]);

  const onEraLocked = useCallback(() => {
    eraDoneRef.current = true;
    hapticLight();
    tryFinish();
  }, [tryFinish]);

  const displayTeam =
    result?.team ??
    holdTeam ??
    (mode === 'idle' ? null : null);
  const displayEra =
    result?.era ??
    holdEra ??
    null;

  const teamColors = displayTeam
    ? getTeamColors(displayTeam.id)
    : null;
  const teamInk = teamColors
    ? contrastOnPrimary(teamColors.primary)
    : undefined;
  const teamFill =
    teamLanded && teamColors && (mode === 'spinning' || mode === 'landed')
      ? teamColors.primary
      : undefined;

  const busy = mode === 'spinning';
  const teamPanelStyle =
    teamFill && teamInk
      ? ({
          ['--team-accent' as string]: teamFill,
          ['--team-ink' as string]: teamInk,
        } as CSSProperties)
      : undefined;

  return (
    <div className={`ter${showGoal ? ' ter--goal' : ''}`} aria-label="Team and era roll">
      {showGoal ? (
        <div className="ter__goal-block">
          <p className="ter__goal" aria-label="Goal one billion dollars">
            <span className="ter__goal-label">{t('game.goal')}</span>{' '}
            <span className="ter__goal-amount">$1,000,000,000</span>
          </p>
        </div>
      ) : null}

      <div className="ter__stage">
        <div
          className={`ter__panel ter__panel--team${teamFill ? ' is-filled' : ''}${
            !displayTeam && !spinTeam ? ' is-empty' : ''
          }`}
          style={teamPanelStyle}
        >
          <p className="ter__kicker">{t('game.team')}</p>
          <div className="ter__viewport">
            <SpinReel
              strip={spinTeam ? teamStrip : []}
              spinId={spinTeam ? teamSpinId : 0}
              itemHeight={TEAM_ITEM_H}
              durationMs={teamMs}
              reduceMotion={reduceMotion}
              display={displayTeam ? teamLabel(displayTeam) : '—'}
              className="spin-reel--team"
              displayStyle={
                teamFill && teamInk
                  ? { color: teamInk, background: teamFill }
                  : undefined
              }
              onLocked={spinTeam ? onTeamLocked : undefined}
            />
          </div>
        </div>

        <div
          className={`ter__panel ter__panel--era${displayEra || spinEra ? '' : ' is-empty'}`}
        >
          <p className="ter__kicker">{t('game.era')}</p>
          <div className="ter__viewport">
            <SpinReel
              strip={spinEra ? eraStrip : []}
              spinId={spinEra ? eraSpinId : 0}
              itemHeight={ERA_ITEM_H}
              durationMs={eraMs}
              reduceMotion={reduceMotion}
              display={displayEra ?? '—'}
              className="spin-reel--era"
              onLocked={spinEra ? onEraLocked : undefined}
            />
          </div>
        </div>

        {mode === 'idle' && !autoReroll ? (
          <button
            type="button"
            className="ter__roll"
            disabled={busy}
            onPointerDown={(e) => {
              e.preventDefault();
              handleRoll();
            }}
          >
            {t('game.roll')}
          </button>
        ) : (
          <div className="ter__roll ter__roll--placeholder" aria-hidden>
            {t('game.roll')}
          </div>
        )}
      </div>
    </div>
  );
});

/** @deprecated Name kept for BillionTradeEngine imports. */
export const TicketDispenser = BallionTicketMachine;
