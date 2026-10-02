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
  eraShortLabel,
  listValidSpinPairs,
  type DecadeEra,
  type SpinPair,
} from '@/lib/tradeup/billionDollar';
import { DECADE_ERAS } from '@/lib/tradeup/decadeRosters';
import { hapticLight, hapticMedium } from '@/lib/tradeup/haptics';
import {
  WHEEL_SPIN_DURATION_MS,
  startWheelSpinSound,
} from '@/lib/tradeup/gameAudio';
import type { TeamInfo } from '@/lib/tradeup/types';
import { contrastOnPrimary, getTeamColors } from '@/lib/tradeup/teamColors';
import { publishSpinHandoff, type SpinBoxSnapshot } from '@/lib/tradeup/spinHandoff';
import { BarrelReel, REEL_NUDGE_CHANCE } from './BarrelReel';
import { buildSpinStrip, type SpinStripItem } from './SpinReel';
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
  /** Optional custom goal copy (e.g. 1v1). Overrides $1B amount/tagline when set. */
  goalCopy?: string | null;
  /** Lineup complete / analyzing — ROLL must not fire. */
  rollLocked?: boolean;
  onAutoRerollConsumed?: () => void;
  onPrint: () => void;
  onResult: (pair: SpinPair) => void;
  onReroll: (kind: TicketRerollKind) => void;
}

const TEAM_ITEM_H = 78;
const ERA_ITEM_H = 54;
/** Same tile count so both reels travel the same distance at the same speed. */
export const TEAM_STRIP_LEN = 42;
export const ERA_STRIP_LEN = TEAM_STRIP_LEN;
/** Cards kept after the winner so the stopped reel still shows neighbors. */
const REEL_TAIL = 2;

/**
 * Era reel walks 1960s → 2020s and wraps. The landing card is `winner`.
 * Extra cards after it continue the same cycle so a peek never jumps decades.
 */
export function buildChronologicalEraStrip(
  winner: DecadeEra,
  length: number,
  tail = 0,
): SpinStripItem[] {
  const order = DECADE_ERAS;
  const winAt = Math.max(0, order.indexOf(winner));
  const body = Math.max(2, length);
  const total = body + Math.max(0, tail);
  const labels: string[] = [];
  for (let i = 0; i < total; i += 1) {
    const delta = i - (body - 1);
    const idx = (winAt + delta + order.length * 64) % order.length;
    labels.push(eraShortLabel(order[idx]!));
  }
  return labels.map((label) => ({ label }));
}

function appendReelTail(items: SpinStripItem[], choices: SpinStripItem[]): SpinStripItem[] {
  if (items.length === 0 || choices.length === 0) return items;
  const winner = items[items.length - 1]!;
  const others = choices.filter((item) => item.label !== winner.label);
  const source = others.length > 0 ? others : choices;
  const tail: SpinStripItem[] = [];
  let previous = winner.label;
  let guard = 0;
  while (tail.length < REEL_TAIL && guard < 24) {
    guard += 1;
    const pick = source[Math.floor(Math.random() * source.length)]!;
    if (pick.label === previous && source.length > 1) continue;
    tail.push(pick);
    previous = pick.label;
  }
  return [...items, ...tail];
}
/** Shared with spin SFX — initial roll and every Team/Era reroll. */
const TEAM_SPIN_MS = WHEEL_SPIN_DURATION_MS;
const ERA_SPIN_MS = WHEEL_SPIN_DURATION_MS;
const TEAM_SPIN_MS_REDUCED = 80;
const ERA_SPIN_MS_REDUCED = 80;

export function uniqueTeams(pairs: SpinPair[]): TeamInfo[] {
  const seen = new Set<string>();
  const out: TeamInfo[] = [];
  for (const p of pairs) {
    if (seen.has(p.team.id)) continue;
    seen.add(p.team.id);
    out.push(p.team);
  }
  return out;
}

export function erasForTeam(pairs: SpinPair[], teamId: string): DecadeEra[] {
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

export function pickRerollPair(
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
  return team.name.toUpperCase();
}

function snapshotReelCard(reelSelector: string): SpinBoxSnapshot | null {
  const reel = document.querySelector(reelSelector);
  const card = reel?.querySelector('.barrel-card.is-winner, .barrel-card.is-hold');
  if (!(card instanceof HTMLElement)) return null;
  const rect = card.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function buildTeamColorStrip(
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
  goalCopy = null,
  rollLocked = false,
  onAutoRerollConsumed,
  onPrint,
  onResult,
  onReroll: _onReroll,
}: BallionTicketMachineProps) {
  const { t } = useLocale();
  const customGoal = Boolean(goalCopy && goalCopy.trim());
  const showGoalBlock = showGoal || customGoal;
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
  const [nudgeSettle, setNudgeSettle] = useState(false);

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
    // Spin sample is rate-fitted to WHEEL_SPIN_DURATION_MS — let it finish with
    // the reels (no extra lock chime / abrupt cut).
    setMode('landed');
    setResult(pair);
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
    // Hold the landed labels, then hand their boxes to the selection header.
    finishTimerRef.current = window.setTimeout(
      () => {
        publishSpinHandoff({
          team: snapshotReelCard('.barrel-reel--team'),
          era: snapshotReelCard('.barrel-reel--era'),
        });
        onResult(pair);
      },
      reduceMotion ? 40 : 280,
    );
  }, [onResult, reduceMotion]);

  useEffect(() => {
    return () => {
      if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
      // Do NOT stopWheelSpinSound here. Reroll arms the sample in the parent
      // tap, then this machine mounts (and Strict Mode remounts). Unmount stop
      // was silencing almost every reroll. The sample self-ends on its timer;
      // a new spin / leave path stops via startWheelSpinSound / stopTicketSpinHum.
    };
  }, []);

  const beginSpin = useCallback(
    (pair: SpinPair, axes: { team: boolean; era: boolean }, opts?: { playSound?: boolean }) => {
      reportedRef.current = false;
      busyRef.current = true;
      pendingRef.current = pair;
      setNudgeSettle(Math.random() < REEL_NUDGE_CHANCE);
      setResult(pair);
      setMode('spinning');
      setTeamLanded(false);

      // Rerolls already arm the sample in the tap handler — don't restart it.
      // Sound is independent of reduced-motion visuals.
      if ((axes.team || axes.era) && opts?.playSound !== false) {
        startWheelSpinSound(WHEEL_SPIN_DURATION_MS);
      }

      if (axes.team) {
        const strip = buildTeamColorStrip(teams, pair.team, TEAM_STRIP_LEN);
        const pool = buildTeamColorStrip(teams, pair.team, teams.length);
        setTeamStrip(appendReelTail(strip, pool));
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
        setEraStrip(buildChronologicalEraStrip(pair.era, ERA_STRIP_LEN, REEL_TAIL));
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
    if (rollLocked || busyRef.current || mode === 'spinning') return;
    hapticLight();
    busyRef.current = true;
    // Unlock + arm spin audio in this tap (WKWebView userActivation is unreliable).
    // Audio is not gated by reduced-motion — only reel timing is.
    startWheelSpinSound(WHEEL_SPIN_DURATION_MS);
    const pair = pickFairResult(allPairs);
    onPrint();
    beginSpin(pair, { team: true, era: true }, { playSound: false });
  }, [allPairs, beginSpin, mode, onPrint, rollLocked]);

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
    // Sound already started in the reroll tap (iOS gesture).
    if (autoReroll === 'team') {
      beginSpin(next, { team: true, era: false }, { playSound: false });
    } else {
      beginSpin(next, { team: false, era: true }, { playSound: false });
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

  const verticalPair = showGoal && !goalCopy;
  const boxHeight = verticalPair ? TEAM_ITEM_H : undefined;
  const busy = mode === 'spinning';
  const teamPanelStyle =
    teamFill && teamInk
      ? ({
          ['--team-accent' as string]: teamFill,
          ['--team-ink' as string]: teamInk,
        } as CSSProperties)
      : undefined;

  return (
    <div
      className={`ter ter--spin-top${showGoalBlock ? ' ter--goal' : ''}${
        customGoal ? ' ter--h2h-goal' : ''
      }`}
      aria-label="Team and era roll"
    >
      {showGoalBlock ? (
        <div className="ter__goal-block">
          {customGoal ? (
            <>
              <p className="ter__goal-label">{t('game.goal')}</p>
              <p className="ter__goal-h2h" aria-label={goalCopy!}>
                {goalCopy}
              </p>
            </>
          ) : (
            <>
              <p className="ter__goal-label">{t('game.goal')}</p>
              <p className="ter__goal-amount" aria-label="Goal one billion dollars">
                $1,000,000,000
              </p>
              <p className="ter__tagline">
                <span className="ter__tagline-rule" aria-hidden />
                <span className="ter__tagline-text">{t('game.tagline')}</span>
                <span className="ter__tagline-rule" aria-hidden />
              </p>
            </>
          )}
        </div>
      ) : null}

      <div className={`ter__stage barrel-shell is-open${mode === 'landed' ? ' is-locked' : ''}`}>
        <div
          className={`barrel-window${verticalPair ? ' barrel-window--pair' : ''}`}
          style={teamPanelStyle}
        >
          <BarrelReel
            strip={spinTeam ? teamStrip : []}
            spinId={spinTeam ? teamSpinId : 0}
            itemHeight={boxHeight ?? TEAM_ITEM_H}
            durationMs={teamMs}
            reduceMotion={reduceMotion}
            variant="team"
            axis={verticalPair ? 'y' : 'x'}
            columns={verticalPair ? 1 : undefined}
            readyLabel="TEAM"
            holdLabel={!spinTeam && displayTeam ? teamLabel(displayTeam) : null}
            holdStyle={
              teamFill && teamInk
                ? {
                    background: `linear-gradient(180deg, ${teamFill} 0%, color-mix(in srgb, ${teamFill} 72%, #041018) 100%)`,
                    color: teamInk,
                  }
                : undefined
            }
            celebrate={mode === 'landed'}
            landIndex={teamStrip.length > TEAM_STRIP_LEN ? TEAM_STRIP_LEN - 1 : undefined}
            nudgeSettle={nudgeSettle}
            onLocked={spinTeam ? onTeamLocked : undefined}
          />
          <BarrelReel
            strip={spinEra ? eraStrip : []}
            spinId={spinEra ? eraSpinId : 0}
            itemHeight={boxHeight ?? ERA_ITEM_H}
            durationMs={eraMs}
            reduceMotion={reduceMotion}
            variant="era"
            axis={verticalPair ? 'y' : 'x'}
            columns={verticalPair ? 1 : undefined}
            readyLabel="ERA"
            holdLabel={!spinEra && displayEra ? eraShortLabel(displayEra) : null}
            celebrate={mode === 'landed'}
            landIndex={eraStrip.length > ERA_STRIP_LEN ? ERA_STRIP_LEN - 1 : undefined}
            nudgeSettle={nudgeSettle}
            onLocked={spinEra ? onEraLocked : undefined}
          />
        </div>

        {mode === 'idle' && !autoReroll && !rollLocked ? (
          <button
            type="button"
            className="ter__roll"
            disabled={busy}
            onPointerDown={(e) => {
              e.preventDefault();
              handleRoll();
            }}
          >
            <span className="ter__roll-sheen" aria-hidden />
            <span className="ter__roll-label">{t('game.roll')}</span>
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
