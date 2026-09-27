'use client';

import { memo, useLayoutEffect, useRef, useState } from 'react';
import {
  eraShortLabel,
  listValidSpinPairs,
  type DecadeEra,
  type EraOfferPlayer,
  type SpinPair,
} from '@/lib/tradeup/billionDollar';
import { playerFitsSlot } from '@/lib/tradeup/alternatePositions';
import { WHEEL_SPIN_DURATION_MS } from '@/lib/tradeup/gameAudio';
import { hapticMedium } from '@/lib/tradeup/haptics';
import {
  consumeSpinHandoff,
  peekSpinHandoff,
  type SpinBoxSnapshot,
} from '@/lib/tradeup/spinHandoff';
import { contrastOnPrimary, getTeamColors } from '@/lib/tradeup/teamColors';
import type { Position, TeamInfo } from '@/lib/tradeup/types';
import {
  buildTeamColorStrip,
  ERA_STRIP_LEN,
  erasForTeam,
  pickRerollPair,
  TEAM_STRIP_LEN,
  uniqueTeams,
  type TicketRerollKind,
} from './BallionTicketMachine';
import { BarrelReel, REEL_NUDGE_CHANCE } from './BarrelReel';
import { buildSpinStrip, stripFromLabels, type SpinStripItem } from './SpinReel';

interface FranchisePickScreenProps {
  team: TeamInfo;
  era: DecadeEra;
  offers: EraOfferPlayer[];
  openPositions: Position[];
  selectedId: string | null;
  selectedName?: string | null;
  canRerollTeam: boolean;
  canRerollEra: boolean;
  /** Blocks select/reroll during slam, placement, or handoff. */
  interactionLocked?: boolean;
  /** Spin one header box in place. The other result stays put. */
  rerolling?: TicketRerollKind | null;
  reduceMotion?: boolean;
  hint: string;
  onSelect: (player: EraOfferPlayer) => void;
  onReroll: (kind: TicketRerollKind) => void;
  onRerollSettled?: (pair: SpinPair) => void;
}

const TAP_SLOP_PX = 18;
const FLIGHT_MS = 460;
const RESULT_H = 56;

const ERA_BG = '#152a4d';
const ERA_INK = 'rgba(236, 244, 255, 0.94)';

function teamFill(primary: string): string {
  return `linear-gradient(180deg, ${primary} 0%, color-mix(in srgb, ${primary} 72%, #041018) 100%)`;
}

function flyBox(el: HTMLElement, from: SpinBoxSnapshot) {
  const to = el.getBoundingClientRect();
  if (to.width < 8 || to.height < 8) return null;
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  el.style.transition = 'none';
  el.style.width = `${from.width}px`;
  el.style.height = `${from.height}px`;
  el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  return () => {
    el.style.transition = `transform ${FLIGHT_MS}ms cubic-bezier(0.22, 0.78, 0.2, 1), width ${FLIGHT_MS}ms cubic-bezier(0.22, 0.78, 0.2, 1), height ${FLIGHT_MS}ms cubic-bezier(0.22, 0.78, 0.2, 1)`;
    el.style.width = `${to.width}px`;
    el.style.height = `${to.height}px`;
    el.style.transform = 'translate3d(0, 0, 0)';
  };
}

function clearFlight(el: HTMLElement) {
  el.style.transition = '';
  el.style.transform = '';
  el.style.width = '';
  el.style.height = '';
}

/**
 * Post-reveal player selection — team/era header + player rows.
 */
export const FranchisePickScreen = memo(function FranchisePickScreen({
  team,
  era,
  offers,
  openPositions,
  selectedId,
  canRerollTeam,
  canRerollEra,
  interactionLocked = false,
  rerolling = null,
  reduceMotion = false,
  hint,
  onSelect,
  onReroll,
  onRerollSettled,
}: FranchisePickScreenProps) {
  const colors = getTeamColors(team.id);
  const posInk = contrastOnPrimary(colors.primary);
  const teamRerollOpen = canRerollTeam && !interactionLocked && !rerolling;
  const eraRerollOpen = canRerollEra && !interactionLocked && !rerolling;
  const pointerStartRef = useRef<{
    id: number;
    x: number;
    y: number;
    playerId: string;
  } | null>(null);
  const teamRef = useRef<HTMLDivElement | null>(null);
  const eraRef = useRef<HTMLDivElement | null>(null);
  const plannedRef = useRef<SpinPair | null>(null);
  const spinKeyRef = useRef('');
  const [arriving, setArriving] = useState(() => peekSpinHandoff() != null);
  const [spinId, setSpinId] = useState(0);
  const [spinStrip, setSpinStrip] = useState<SpinStripItem[]>([]);
  const [freshAxis, setFreshAxis] = useState<TicketRerollKind | null>(null);
  const [nudgeSettle, setNudgeSettle] = useState(false);

  useLayoutEffect(() => {
    if (reduceMotion) {
      consumeSpinHandoff();
      setArriving(false);
      return;
    }
    const handoff = peekSpinHandoff();
    if (!handoff) {
      setArriving(false);
      return;
    }
    let cancelled = false;
    let frame = 0;
    let done = 0;
    let attempts = 0;
    const nodes: HTMLElement[] = [];

    const begin = () => {
      if (cancelled) return;
      attempts += 1;
      const starts: Array<() => void> = [];
      nodes.length = 0;
      const plan = (el: HTMLElement | null, from: SpinBoxSnapshot | null) => {
        if (!el || !from) return true;
        const start = flyBox(el, from);
        if (!start) return false;
        starts.push(start);
        nodes.push(el);
        return true;
      };
      const ready =
        plan(teamRef.current, handoff.team) && plan(eraRef.current, handoff.era);
      if (!ready) {
        nodes.forEach(clearFlight);
        if (attempts < 5) frame = window.requestAnimationFrame(begin);
        else {
          consumeSpinHandoff();
          setArriving(false);
        }
        return;
      }
      consumeSpinHandoff();
      frame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        starts.forEach((start) => start());
        done = window.setTimeout(() => {
          if (cancelled) return;
          nodes.forEach(clearFlight);
          setArriving(false);
        }, FLIGHT_MS + 50);
      });
    };

    begin();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(done);
      nodes.forEach(clearFlight);
    };
  }, [reduceMotion]);

  useLayoutEffect(() => {
    if (!rerolling) {
      spinKeyRef.current = '';
      return;
    }
    const key = `${rerolling}:${team.id}:${era}`;
    if (spinKeyRef.current === key) return;
    spinKeyRef.current = key;
    const pairs = listValidSpinPairs();
    const next = pickRerollPair(pairs, { team, era }, rerolling);
    plannedRef.current = next;
    if (rerolling === 'team') {
      setSpinStrip(buildTeamColorStrip(uniqueTeams(pairs), next.team, TEAM_STRIP_LEN));
    } else {
      const pool = erasForTeam(pairs, next.team.id);
      const labels =
        pool.length > 0
          ? pool
          : (['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'] as DecadeEra[]);
      setSpinStrip(
        stripFromLabels(buildSpinStrip(labels, next.era, ERA_STRIP_LEN)).map((item) => ({
          label: eraShortLabel(item.label as DecadeEra),
        })),
      );
    }
    setFreshAxis(null);
    setNudgeSettle(Math.random() < REEL_NUDGE_CHANCE);
    setSpinId((n) => n + 1);
  }, [era, rerolling, team]);

  const onReelLocked = () => {
    const pair = plannedRef.current;
    if (!pair || !rerolling) return;
    setFreshAxis(rerolling);
    window.setTimeout(() => setFreshAxis(null), 340);
    onRerollSettled?.(pair);
  };

  const teamSpinning = rerolling === 'team' && spinId > 0;
  const eraSpinning = rerolling === 'era' && spinId > 0;

  return (
    <section
      className={`franchise-pick${arriving ? ' is-arriving' : ''}${
        rerolling ? ' is-rerolling' : ''
      }`}
      aria-label="Player selection"
      aria-busy={Boolean(rerolling) || undefined}
    >
      <div className="franchise-pick__head">
        <div
          ref={teamRef}
          className={`franchise-pick__result franchise-pick__result--team${
            teamSpinning ? ' is-spinning' : ''
          }${freshAxis === 'team' ? ' is-fresh' : ''}`}
          style={{ background: teamFill(colors.primary), color: posInk }}
        >
          {teamSpinning ? (
            <BarrelReel
              strip={spinStrip}
              spinId={spinId}
              itemHeight={RESULT_H}
              durationMs={reduceMotion ? 80 : WHEEL_SPIN_DURATION_MS}
              reduceMotion={reduceMotion}
              variant="team"
              columns={1}
              nudgeSettle={nudgeSettle}
              onLocked={onReelLocked}
            />
          ) : (
            <span className="franchise-pick__result-label">{team.name.toUpperCase()}</span>
          )}
        </div>
        <div
          ref={eraRef}
          className={`franchise-pick__result franchise-pick__result--era${
            eraSpinning ? ' is-spinning' : ''
          }${freshAxis === 'era' ? ' is-fresh' : ''}`}
          style={{ background: ERA_BG, color: ERA_INK }}
        >
          {eraSpinning ? (
            <BarrelReel
              strip={spinStrip}
              spinId={spinId}
              itemHeight={RESULT_H}
              durationMs={reduceMotion ? 80 : WHEEL_SPIN_DURATION_MS}
              reduceMotion={reduceMotion}
              variant="era"
              columns={1}
              nudgeSettle={nudgeSettle}
              onLocked={onReelLocked}
            />
          ) : (
            <span className="franchise-pick__result-label">{eraShortLabel(era)}</span>
          )}
        </div>
        <button
          type="button"
          className={`franchise-pick__reroll${canRerollTeam ? '' : ' is-used'}`}
          disabled={!teamRerollOpen}
          onPointerDown={(e) => {
            e.preventDefault();
            if (!teamRerollOpen) return;
            hapticMedium();
            onReroll('team');
          }}
        >
          <em>{canRerollTeam ? '1 left' : 'Used'}</em>
          <strong>Reroll Team</strong>
        </button>
        <button
          type="button"
          className={`franchise-pick__reroll${canRerollEra ? '' : ' is-used'}`}
          disabled={!eraRerollOpen}
          onPointerDown={(e) => {
            e.preventDefault();
            if (!eraRerollOpen) return;
            hapticMedium();
            onReroll('era');
          }}
        >
          <em>{canRerollEra ? '1 left' : 'Used'}</em>
          <strong>Reroll Era</strong>
        </button>
      </div>

      <p className="franchise-pick__hint">{hint}</p>

      <ul className="franchise-pick__list" aria-label="Available players">
        {offers.map((player) => {
          const selected = selectedId === player.id;
          const ineligible = !openPositions.some((pos) => playerFitsSlot(player, pos));
          return (
            <li key={player.id}>
              <button
                type="button"
                className={`franchise-pick__row${selected ? ' is-selected' : ''}${
                  ineligible ? ' is-disabled' : ''
                }`}
                data-draft-player-id={player.id}
                disabled={ineligible}
                aria-disabled={ineligible || interactionLocked || undefined}
                onPointerDown={(e) => {
                  if (ineligible || e.button !== 0) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  pointerStartRef.current = {
                    id: e.pointerId,
                    x: e.clientX,
                    y: e.clientY,
                    playerId: player.id,
                  };
                  e.currentTarget.classList.add('is-pressed');
                }}
                onPointerMove={(e) => {
                  const start = pointerStartRef.current;
                  if (!start || start.id !== e.pointerId || start.playerId !== player.id) return;
                  if (
                    Math.abs(e.clientX - start.x) > TAP_SLOP_PX ||
                    Math.abs(e.clientY - start.y) > TAP_SLOP_PX
                  ) {
                    pointerStartRef.current = { ...start, playerId: '' };
                    e.currentTarget.classList.remove('is-pressed');
                  }
                }}
                onPointerCancel={(e) => {
                  e.currentTarget.classList.remove('is-pressed');
                  pointerStartRef.current = null;
                }}
                onPointerUp={(e) => {
                  e.currentTarget.classList.remove('is-pressed');
                  const start = pointerStartRef.current;
                  pointerStartRef.current = null;
                  if (ineligible || interactionLocked || !start) return;
                  if (start.id !== e.pointerId || start.playerId !== player.id) return;
                  onSelect(player);
                }}
              >
                <span
                  className="franchise-pick__pos"
                  style={{
                    background: colors.primary,
                    color: posInk,
                  }}
                >
                  {player.primaryPosition}
                </span>
                <span className="franchise-pick__meta">
                  <strong>{player.name}</strong>
                  <em className="franchise-pick__stats">
                    {Number.isFinite(player.eraStats?.ppg)
                      ? `${player.eraStats.ppg.toFixed(1)} PTS`
                      : '— PTS'}
                    {' · '}
                    {Number.isFinite(player.eraStats?.rpg)
                      ? `${player.eraStats.rpg.toFixed(1)} REB`
                      : '— REB'}
                    {' · '}
                    {Number.isFinite(player.eraStats?.apg)
                      ? `${player.eraStats.apg.toFixed(1)} AST`
                      : '— AST'}
                  </em>
                </span>
                <span className={`franchise-pick__check${selected ? ' is-on' : ''}`} aria-hidden>
                  {selected ? '✓' : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
});
